import type { EloHistoryPoint } from '../api/types'

const W = 560
const H = 160
const PX = 36
const PY = 12
const PB = 20

export default function EloChart({ history }: { history: EloHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <div className="text-center text-sm text-slate-400 py-8">
        Grafik uchun kamida 2 ta imtihon kerak
      </div>
    )
  }

  const elos = history.map((h) => h.elo_after)
  const min = Math.min(...elos) - 20
  const max = Math.max(...elos) + 20
  const range = max - min || 1
  const plotW = W - PX * 2
  const plotH = H - PY - PB

  const pts = history.map((h, i) => ({
    x: PX + (i / (history.length - 1)) * plotW,
    y: PY + plotH - ((h.elo_after - min) / range) * plotH,
    elo: h.elo_after,
  }))

  const line = pts.map((p) => `${p.x},${p.y}`).join(' ')

  const ticks = Array.from({ length: 4 }, (_, i) => {
    const elo = Math.round(min + (range * i) / 3)
    const y = PY + plotH - (i / 3) * plotH
    return { elo, y }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 280 }}>
      {ticks.map((t) => (
        <g key={t.elo}>
          <line x1={PX} y1={t.y} x2={W - PX} y2={t.y} stroke="#e2e8f0" strokeWidth={0.5} />
          <text x={PX - 6} y={t.y + 3} textAnchor="end" fill="#94a3b8" fontSize={9} fontWeight={500}>
            {t.elo}
          </text>
        </g>
      ))}

      <polygon
        points={`${pts[0].x},${PY + plotH} ${line} ${pts[pts.length - 1].x},${PY + plotH}`}
        fill="url(#areaFill)"
      />

      <polyline
        points={line}
        fill="none"
        stroke="#06b6d4"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="white" stroke="#06b6d4" strokeWidth={1.5} />
      ))}

      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.12} />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
        </linearGradient>
      </defs>
    </svg>
  )
}
