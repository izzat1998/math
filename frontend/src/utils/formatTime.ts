export interface CountdownParts {
  h: string
  m: string
  s: string
}

export function formatCountdown(ms: number): CountdownParts {
  if (ms <= 0) return { h: '00', m: '00', s: '00' }

  const hours = Math.floor(ms / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1_000)

  return {
    h: String(hours).padStart(2, '0'),
    m: String(minutes).padStart(2, '0'),
    s: String(seconds).padStart(2, '0'),
  }
}

export function formatCountdownString(ms: number): string {
  const { h, m, s } = formatCountdown(ms)
  return `${h}:${m}:${s}`
}
