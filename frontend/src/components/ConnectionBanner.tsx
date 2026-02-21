import { useState, useEffect, useRef } from 'react'
import api from '../api/client'
import { flush } from '../api/answerQueue'

interface ConnectionBannerProps {
  pendingAnswers?: number
}

export default function ConnectionBanner({ pendingAnswers }: ConnectionBannerProps) {
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
        // On successful heartbeat, flush any queued answers
        flush()
      }).catch(() => {
        failCount.current += 1
        if (failCount.current >= 2) setApiReachable(false)
      })
    }
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [])

  // Offline or API unreachable — show danger banner
  if (!isOnline || !apiReachable) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-danger-500 text-white text-center py-2 text-sm font-medium animate-slide-down">
        {!isOnline
          ? 'Internet uzildi — taymer ishlayapti. Javoblar ulanish tiklanganda saqlanadi.'
          : 'Serverga ulanishda muammo — javoblar keyinroq saqlanadi.'}
      </div>
    )
  }

  // Online and API reachable, but there are pending answers in the queue
  if (pendingAnswers != null && pendingAnswers > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 z-50 bg-warning-500 text-white text-center py-2 text-sm font-medium animate-slide-down">
        {pendingAnswers} ta javob saqlanmagan — sinxronlash kutilmoqda...
      </div>
    )
  }

  return null
}
