export function useTelegram() {
  const tg = (window as any).Telegram?.WebApp

  return {
    tg,
    isTelegram: !!tg?.initData,
    initData: tg?.initData || '',
    user: tg?.initDataUnsafe?.user,
    ready: () => tg?.ready(),
    expand: () => tg?.expand(),
  }
}
