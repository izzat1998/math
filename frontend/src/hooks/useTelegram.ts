import { useCallback, useEffect, useRef } from 'react'

// ── Telegram WebApp type definitions ──

interface TelegramMainButton {
  text: string
  color: string
  textColor: string
  isVisible: boolean
  isActive: boolean
  isProgressVisible: boolean
  setText: (text: string) => void
  onClick: (cb: () => void) => void
  offClick: (cb: () => void) => void
  show: () => void
  hide: () => void
  enable: () => void
  disable: () => void
  showProgress: (leaveActive?: boolean) => void
  hideProgress: () => void
  setParams: (params: { text?: string; color?: string; text_color?: string; is_active?: boolean; is_visible?: boolean }) => void
}

interface TelegramBackButton {
  isVisible: boolean
  onClick: (cb: () => void) => void
  offClick: (cb: () => void) => void
  show: () => void
  hide: () => void
}

interface TelegramHapticFeedback {
  impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void
  notificationOccurred: (type: 'error' | 'success' | 'warning') => void
  selectionChanged: () => void
}

interface TelegramCloudStorage {
  setItem: (key: string, value: string, cb?: (error: string | null, stored: boolean) => void) => void
  getItem: (key: string, cb: (error: string | null, value: string) => void) => void
  getItems: (keys: string[], cb: (error: string | null, values: Record<string, string>) => void) => void
  removeItem: (key: string, cb?: (error: string | null, removed: boolean) => void) => void
  getKeys: (cb: (error: string | null, keys: string[]) => void) => void
}

interface TelegramPopupParams {
  title?: string
  message: string
  buttons?: Array<{ id?: string; type?: 'default' | 'ok' | 'close' | 'cancel' | 'destructive'; text?: string }>
}

interface TelegramThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
}

export interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string } }
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: TelegramThemeParams
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  MainButton: TelegramMainButton
  BackButton: TelegramBackButton
  HapticFeedback: TelegramHapticFeedback
  CloudStorage: TelegramCloudStorage
  ready: () => void
  expand: () => void
  close: () => void
  setHeaderColor: (color: 'bg_color' | 'secondary_bg_color' | string) => void
  setBackgroundColor: (color: 'bg_color' | 'secondary_bg_color' | string) => void
  showPopup: (params: TelegramPopupParams, cb?: (buttonId: string) => void) => void
  showAlert: (message: string, cb?: () => void) => void
  showConfirm: (message: string, cb: (confirmed: boolean) => void) => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

// ── Hook ──

export interface UseTelegramReturn {
  tg: TelegramWebApp | undefined
  isTelegram: boolean
  initData: string
  user: TelegramWebApp['initDataUnsafe']['user']
  ready: () => void
  expand: () => void
  // MainButton
  showMainButton: (text: string, onClick: () => void) => void
  hideMainButton: () => void
  setMainButtonLoading: (loading: boolean) => void
  // BackButton
  showBackButton: (onClick: () => void) => void
  hideBackButton: () => void
  // HapticFeedback
  hapticImpact: (style?: 'light' | 'medium' | 'heavy') => void
  hapticNotification: (type: 'success' | 'warning' | 'error') => void
  hapticSelection: () => void
  // Appearance
  setHeaderColor: (color: string) => void
  setBackgroundColor: (color: string) => void
  // Dialogs
  showPopup: (params: TelegramPopupParams) => Promise<string>
  showAlert: (message: string) => Promise<void>
  showConfirm: (message: string) => Promise<boolean>
  // CloudStorage
  cloudSet: (key: string, value: string) => Promise<void>
  cloudGet: (key: string) => Promise<string>
  cloudRemove: (key: string) => Promise<void>
  // Theme
  themeParams: TelegramThemeParams
}

export function useTelegram(): UseTelegramReturn {
  const tg = window.Telegram?.WebApp
  const mainButtonCbRef = useRef<(() => void) | null>(null)
  const backButtonCbRef = useRef<(() => void) | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tg && mainButtonCbRef.current) {
        tg.MainButton.offClick(mainButtonCbRef.current)
        tg.MainButton.hide()
      }
      if (tg && backButtonCbRef.current) {
        tg.BackButton.offClick(backButtonCbRef.current)
        tg.BackButton.hide()
      }
    }
  }, [tg])

  const showMainButton = useCallback((text: string, onClick: () => void) => {
    if (!tg) return
    if (mainButtonCbRef.current) tg.MainButton.offClick(mainButtonCbRef.current)
    mainButtonCbRef.current = onClick
    tg.MainButton.setText(text)
    tg.MainButton.onClick(onClick)
    tg.MainButton.show()
  }, [tg])

  const hideMainButton = useCallback(() => {
    if (!tg) return
    if (mainButtonCbRef.current) tg.MainButton.offClick(mainButtonCbRef.current)
    mainButtonCbRef.current = null
    tg.MainButton.hide()
  }, [tg])

  const setMainButtonLoading = useCallback((loading: boolean) => {
    if (!tg) return
    if (loading) tg.MainButton.showProgress(true)
    else tg.MainButton.hideProgress()
  }, [tg])

  const showBackButton = useCallback((onClick: () => void) => {
    if (!tg) return
    if (backButtonCbRef.current) tg.BackButton.offClick(backButtonCbRef.current)
    backButtonCbRef.current = onClick
    tg.BackButton.onClick(onClick)
    tg.BackButton.show()
  }, [tg])

  const hideBackButton = useCallback(() => {
    if (!tg) return
    if (backButtonCbRef.current) tg.BackButton.offClick(backButtonCbRef.current)
    backButtonCbRef.current = null
    tg.BackButton.hide()
  }, [tg])

  const hapticImpact = useCallback((style: 'light' | 'medium' | 'heavy' = 'light') => {
    tg?.HapticFeedback?.impactOccurred(style)
  }, [tg])

  const hapticNotification = useCallback((type: 'success' | 'warning' | 'error') => {
    tg?.HapticFeedback?.notificationOccurred(type)
  }, [tg])

  const hapticSelection = useCallback(() => {
    tg?.HapticFeedback?.selectionChanged()
  }, [tg])

  const setHeaderColor = useCallback((color: string) => {
    tg?.setHeaderColor?.(color)
  }, [tg])

  const setBackgroundColor = useCallback((color: string) => {
    tg?.setBackgroundColor?.(color)
  }, [tg])

  const showPopup = useCallback((params: TelegramPopupParams): Promise<string> => {
    return new Promise((resolve) => {
      if (!tg) { resolve(''); return }
      tg.showPopup(params, (buttonId) => resolve(buttonId))
    })
  }, [tg])

  const showAlert = useCallback((message: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!tg) { resolve(); return }
      tg.showAlert(message, () => resolve())
    })
  }, [tg])

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!tg) { resolve(false); return }
      tg.showConfirm(message, (confirmed) => resolve(confirmed))
    })
  }, [tg])

  const cloudSet = useCallback((key: string, value: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!tg?.CloudStorage) { resolve(); return }
      tg.CloudStorage.setItem(key, value, (err) => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })
  }, [tg])

  const cloudGet = useCallback((key: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (!tg?.CloudStorage) { resolve(''); return }
      tg.CloudStorage.getItem(key, (err, value) => {
        if (err) reject(new Error(err))
        else resolve(value)
      })
    })
  }, [tg])

  const cloudRemove = useCallback((key: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!tg?.CloudStorage) { resolve(); return }
      tg.CloudStorage.removeItem(key, (err) => {
        if (err) reject(new Error(err))
        else resolve()
      })
    })
  }, [tg])

  const ready = useCallback(() => { tg?.ready() }, [tg])
  const expand = useCallback(() => { tg?.expand() }, [tg])

  return {
    tg,
    isTelegram: !!tg?.initData,
    initData: tg?.initData ?? '',
    user: tg?.initDataUnsafe?.user,
    ready,
    expand,
    showMainButton,
    hideMainButton,
    setMainButtonLoading,
    showBackButton,
    hideBackButton,
    hapticImpact,
    hapticNotification,
    hapticSelection,
    setHeaderColor,
    setBackgroundColor,
    showPopup,
    showAlert,
    showConfirm,
    cloudSet,
    cloudGet,
    cloudRemove,
    themeParams: tg?.themeParams ?? {},
  }
}
