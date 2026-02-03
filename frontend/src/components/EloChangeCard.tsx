import type { EloChange } from '../api/types'

export default function EloChangeCard({ elo }: { elo: EloChange }) {
  const isPositive = elo.elo_delta >= 0

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/60 p-4 mb-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isPositive ? 'bg-success-50 text-success-600' : 'bg-danger-50 text-danger-500'
          }`}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">Reyting</p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-400 font-medium">{elo.elo_before}</span>
              <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
              <span className="text-lg font-extrabold text-slate-800">{elo.elo_after}</span>
            </div>
          </div>
        </div>

        <div className={`px-3 py-1.5 rounded-xl text-sm font-extrabold ${
          isPositive
            ? 'bg-success-50 text-success-600 ring-1 ring-success-200/50'
            : 'bg-danger-50 text-danger-500 ring-1 ring-danger-200/50'
        }`}>
          {isPositive ? '+' : ''}{elo.elo_delta}
        </div>
      </div>
    </div>
  )
}
