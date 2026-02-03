interface DotPatternProps {
  opacity?: string
  size?: number
}

export default function DotPattern({ opacity = '0.035', size = 24 }: DotPatternProps) {
  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: parseFloat(opacity),
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.4) 1px, transparent 0)',
        backgroundSize: `${size}px ${size}px`,
      }}
    />
  )
}
