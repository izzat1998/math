import { useCallback, type RefObject } from 'react'

export function useCursorInsert(
  inputRefs: RefObject<Map<string, HTMLInputElement>>,
  answers: Record<string, string>,
  onAnswer: (questionNumber: number, subPart: string | null, answer: string) => void
) {
  return useCallback(
    (focusedKey: string, text: string) => {
      const el = inputRefs.current?.get(focusedKey)
      if (!el) return

      const start = el.selectionStart ?? el.value.length
      const end = el.selectionEnd ?? start
      const current = answers[focusedKey] || ''
      const next = current.slice(0, start) + text + current.slice(end)

      // Parse "36_a" → questionNumber=36, subPart="a"
      const [qStr, sub] = focusedKey.split('_')
      onAnswer(Number(qStr), sub ?? null, next)

      // Restore cursor after React re-render
      const cursorPos = start + text.length
      requestAnimationFrame(() => {
        el.setSelectionRange(cursorPos, cursorPos)
      })
    },
    [inputRefs, answers, onAnswer]
  )
}
