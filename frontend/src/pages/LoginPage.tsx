import { Link } from 'react-router-dom'

export default function LoginPage() {
  return (
    <div className="min-h-screen-dvh flex items-center justify-center bg-noise px-6">
      <div className="w-full max-w-sm text-center animate-fade-in">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary-500/20">
          <span className="text-2xl font-extrabold text-white">M</span>
        </div>

        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight mb-2">
          Matematika Sinov Imtihoni
        </h1>

        <p className="text-sm text-slate-400 font-medium mb-8">
          Bu ilova faqat Telegram Mini App orqali ishlaydi
        </p>

        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 mb-6">
          <p className="text-sm text-slate-600 leading-relaxed">
            Iltimos, ilovani Telegram orqali oching
          </p>
        </div>

        <div className="text-[13px] text-slate-400 font-medium">
          <Link to="/admin" className="hover:text-accent-600 transition-colors">
            Admin panel
          </Link>
        </div>
      </div>
    </div>
  )
}
