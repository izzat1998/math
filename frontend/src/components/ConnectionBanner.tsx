import { useState, useEffect } from 'react'

export default function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-danger-500 text-white text-center py-2 text-sm font-medium animate-slide-down">
      Internet uzildi — taymer ishlayapti. Javoblar ulanish tiklanganda saqlanadi.
    </div>
  )
}
