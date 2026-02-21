import { useState, useEffect, useRef } from 'react'
import api from '../api/client'

export default function ConnectionBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [apiReachable, setApiReachable] = useState(true)
  const failCount = useRef(0)

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

  // API-level heartbeat: ping every 30s, mark unreachable after 2 consecutive failures
  useEffect(() => {
    const check = () => {
      api.get('/upcoming-exam/').then(() => {
        failCount.current = 0
        setApiReachable(true)
      }).catch(() => {
        failCount.current += 1
        if (failCount.current >= 2) setApiReachable(false)
      })
    }
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [])

  if (isOnline && apiReachable) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-danger-500 text-white text-center py-2 text-sm font-medium animate-slide-down">
      {!isOnline
        ? 'Internet uzildi — taymer ishlayapti. Javoblar ulanish tiklanganda saqlanadi.'
        : 'Serverga ulanishda muammo — javoblar keyinroq saqlanadi.'}
    </div>
  )
}
