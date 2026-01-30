interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
  fullScreen?: boolean
}

const sizeMap = {
  sm: 'w-5 h-5 border-2',
  md: 'w-8 h-8 border-[3px]',
  lg: 'w-12 h-12 border-4',
}

export default function LoadingSpinner({ size = 'md', label, fullScreen }: LoadingSpinnerProps) {
  const spinner = (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`${sizeMap[size]} rounded-full border-slate-200 border-t-accent-500 animate-spin-slow`}
      />
      {label && <p className="text-sm text-slate-500 font-medium">{label}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        {spinner}
      </div>
    )
  }

  return spinner
}
