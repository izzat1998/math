import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from '../components/LoadingSpinner'

export default function LoginPage() {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { loginWithGoogle, logout } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    logout()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleGoogleSuccess = async (credentialResponse: { credential?: string }) => {
    if (!credentialResponse.credential) return
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle(credentialResponse.credential)
      navigate('/')
    } catch {
      setError("Google orqali kirishda xatolik yuz berdi. Qaytadan urinib ko'ring.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen-dvh flex bg-noise">
      {/* Left panel — desktop only */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-800 via-primary-700 to-primary-900" />
        {/* Decorative grid */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        {/* Accent glow */}
        <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-accent-500/20 rounded-full blur-[100px]" />
        <div className="absolute -top-20 -right-20 w-60 h-60 bg-accent-400/10 rounded-full blur-[80px]" />

        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="mb-10">
            <div className="w-12 h-12 rounded-xl bg-accent-500/20 border border-accent-400/20 flex items-center justify-center mb-6">
              <span className="text-2xl font-bold text-accent-300">M</span>
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-3 leading-tight">
              Matematika<br />
              <span className="text-accent-400">Sinov Imtihoni</span>
            </h1>
            <p className="text-white/50 text-base leading-relaxed max-w-xs">
              Haqiqiy imtihon sharoitida mashq qiling. Vaqt chegarali, natijalar tezkor.
            </p>
          </div>

          <div className="space-y-3">
            {[
              { icon: '01', text: 'PDF varaqni ko\'ring' },
              { icon: '02', text: 'Javoblarni belgilang' },
              { icon: '03', text: 'Natijani darhol oling' },
            ].map((item) => (
              <div key={item.icon} className="flex items-center gap-4">
                <span className="font-mono text-xs text-accent-400/70 font-bold w-6">{item.icon}</span>
                <span className="text-sm text-white/40">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className="flex-1 flex items-center justify-center px-6 bg-white lg:bg-slate-50/50">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-10 animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/20">
              <span className="text-2xl font-extrabold text-white">M</span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
              Math Exam
            </h1>
            <p className="text-sm text-slate-400 mt-1.5 font-medium">Imtihonga tayyorlanish platformasi</p>
          </div>

          <div className="animate-slide-up">
            <div className="mb-8 text-center">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Kirish</h2>
              <p className="text-[13px] text-slate-400 mt-1.5 font-medium">Google hisobingiz orqali kiring</p>
            </div>

            {error && (
              <div className="mb-5 flex items-start gap-3 p-3.5 bg-danger-50 border border-danger-100 rounded-2xl animate-pop">
                <div className="w-5 h-5 rounded-full bg-danger-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-danger-500 text-xs font-bold">!</span>
                </div>
                <p className="text-[13px] text-danger-600 font-medium leading-relaxed">{error}</p>
              </div>
            )}

            {loading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner size="sm" />
              </div>
            ) : (
              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google orqali kirishda xatolik yuz berdi.")}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  width="320"
                />
              </div>
            )}
          </div>

          <div className="flex items-center justify-center gap-4 mt-8 text-[13px] text-slate-400 font-medium">
            <Link to="/leaderboard" className="hover:text-accent-600 transition-colors">
              Reyting jadvali
            </Link>
            <span className="text-slate-200">|</span>
            <Link to="/admin" className="hover:text-accent-600 transition-colors">
              Admin panel
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
