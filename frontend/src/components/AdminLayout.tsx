import { NavLink, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'

interface AdminLayoutProps {
  children: ReactNode
  title: string
  breadcrumbs?: { label: string; to?: string }[]
}

export default function AdminLayout({ children, title, breadcrumbs }: AdminLayoutProps) {
  const navigate = useNavigate()

  const handleLogout = () => {
    localStorage.removeItem('admin_access_token')
    localStorage.removeItem('admin_refresh_token')
    navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-primary-600 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-4">
              <span className="font-bold text-lg tracking-tight">MathExam</span>
              <span className="text-white/30">|</span>
              <span className="text-sm text-white/70">Admin</span>
            </div>
            <div className="flex items-center gap-6">
              <nav className="hidden sm:flex items-center gap-1">
                <NavLink
                  to="/admin/dashboard"
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`
                  }
                >
                  Boshqaruv paneli
                </NavLink>
                <NavLink
                  to="/admin/exams/create"
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`
                  }
                >
                  Imtihon yaratish
                </NavLink>
              </nav>
              <button
                onClick={handleLogout}
                className="text-sm text-white/70 hover:text-white transition-colors"
              >
                Chiqish
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Breadcrumbs + Title */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <nav className="flex items-center gap-1.5 text-sm text-slate-500 mb-1">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-slate-300">/</span>}
                  {crumb.to ? (
                    <NavLink to={crumb.to} className="hover:text-accent-600 transition-colors">
                      {crumb.label}
                    </NavLink>
                  ) : (
                    <span className="text-slate-700">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        </div>
      </div>

      {/* Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  )
}
