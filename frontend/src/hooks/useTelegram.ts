interface TelegramWebApp {
  initData: string
  initDataUnsafe: { user?: { id: number; first_name: string; last_name?: string } }
  ready: () => void
  expand: () => void
}

interface TelegramHook {
  tg: TelegramWebApp | undefined
  isTelegram: boolean
  initData: string
  user: TelegramWebApp['initDataUnsafe']['user']
  ready: () => void
  expand: () => void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function useTelegram(): TelegramHook {
  const tg = window.Telegram?.WebApp

  return {
    tg,
    isTelegram: !!tg?.initData,
    initData: tg?.initData ?? '',
    user: tg?.initDataUnsafe?.user,
    ready: () => tg?.ready(),
    expand: () => tg?.expand(),
  }
}
