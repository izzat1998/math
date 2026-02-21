import api from './client'

export interface QueueItem {
  sessionId: string
  questionNumber: number
  subPart: string | null
  answer: string
  timestamp: number
}

const STORAGE_KEY = 'answer_queue'
let queue: QueueItem[] = []
let listeners: Array<(count: number) => void> = []
let isFlushing = false

/** Generate a dedup key for a queue item */
function dedupKey(item: Pick<QueueItem, 'sessionId' | 'questionNumber' | 'subPart'>): string {
  return `${item.sessionId}:${item.questionNumber}:${item.subPart ?? ''}`
}

/** Notify all subscribers of queue size change */
function notifyListeners(): void {
  const count = queue.length
  for (const cb of listeners) {
    cb(count)
  }
}

/** Persist queue to localStorage (best-effort) */
function persistToStorage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  } catch {
    // localStorage quota exceeded or unavailable — queue still lives in memory
  }
}

/** Load queue from localStorage on module init */
function loadFromStorage(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        queue = parsed as QueueItem[]
      }
    }
  } catch {
    // Corrupt data — start fresh
    queue = []
  }
}

// Initialize from storage on module load
loadFromStorage()

/**
 * Add a failed answer save to the queue.
 * Deduplicates by sessionId + questionNumber + subPart (latest answer wins).
 */
export function enqueue(item: Omit<QueueItem, 'timestamp'>): void {
  const timestamped: QueueItem = { ...item, timestamp: Date.now() }
  const key = dedupKey(timestamped)
  const existingIndex = queue.findIndex((q) => dedupKey(q) === key)
  if (existingIndex !== -1) {
    queue[existingIndex] = timestamped
  } else {
    queue.push(timestamped)
  }
  persistToStorage()
  notifyListeners()
}

/**
 * Replay all queued items via POST. Remove successful ones, keep failed ones.
 * Guarded against concurrent execution.
 */
export async function flush(): Promise<void> {
  if (isFlushing || queue.length === 0) return
  isFlushing = true

  try {
    // Snapshot the current queue items to process
    const items = [...queue]
    const succeeded = new Set<string>()

    await Promise.allSettled(
      items.map(async (item) => {
        try {
          await api.post(`/sessions/${item.sessionId}/answers/`, {
            question_number: item.questionNumber,
            sub_part: item.subPart,
            answer: item.answer,
          })
          succeeded.add(dedupKey(item))
        } catch {
          // Keep this item in the queue for the next flush
        }
      })
    )

    if (succeeded.size > 0) {
      // Remove succeeded items; keep any that failed or were added during flush
      queue = queue.filter((q) => !succeeded.has(dedupKey(q)))
      persistToStorage()
      notifyListeners()
    }
  } finally {
    isFlushing = false
  }
}

/** Returns the number of items currently in the queue */
export function getPendingCount(): number {
  return queue.length
}

/**
 * Subscribe to queue size changes. Returns an unsubscribe function.
 */
export function onQueueChange(callback: (count: number) => void): () => void {
  listeners.push(callback)
  return () => {
    listeners = listeners.filter((cb) => cb !== callback)
  }
}

/**
 * Remove all queued items for a specific session (called after successful submit).
 */
export function clearQueue(sessionId: string): void {
  const before = queue.length
  queue = queue.filter((item) => item.sessionId !== sessionId)
  if (queue.length !== before) {
    persistToStorage()
    notifyListeners()
  }
}
