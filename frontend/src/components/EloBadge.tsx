function eloColor(elo: number) {
  if (elo >= 1500) return 'bg-accent-50 text-accent-700 ring-accent-200/50'
  if (elo >= 1200) return 'bg-success-50 text-success-700 ring-success-200/50'
  if (elo >= 1000) return 'bg-warning-50 text-warning-700 ring-warning-200/50'
  return 'bg-danger-50 text-danger-600 ring-danger-200/50'
}

export default function EloBadge({ elo }: { elo: number }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-bold ring-1 ${eloColor(elo)}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
      {elo}
    </span>
  )
}
