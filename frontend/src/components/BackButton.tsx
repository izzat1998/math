import { useNavigate } from 'react-router-dom'
import { ArrowLeftIcon } from './icons'

interface BackButtonProps {
  to?: string
  className?: string
  variant?: 'dark' | 'ghost'
}

export default function BackButton({ to = '/', className, variant = 'dark' }: BackButtonProps) {
  const navigate = useNavigate()

  const baseClass = 'w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform'
  const variantClass = variant === 'dark'
    ? 'bg-white/[0.08]'
    : 'bg-white/[0.06] border border-white/[0.06]'

  return (
    <button
      onClick={() => navigate(to)}
      className={`${baseClass} ${variantClass} ${className ?? ''}`}
    >
      <ArrowLeftIcon className="w-4 h-4 text-white/60" />
    </button>
  )
}
