import { useState, useEffect } from 'react'

interface MobileDetect {
  isMobile: boolean
  isTablet: boolean
  isDesktop: boolean
  isTouchDevice: boolean
  viewportHeight: number
  keyboardVisible: boolean
}

const MOBILE_BREAKPOINT = 768
const TABLET_BREAKPOINT = 1024

function getIsTouchDevice(): boolean {
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0
}

export function useMobileDetect(): MobileDetect {
  const [state, setState] = useState<MobileDetect>(() => {
    const w = window.innerWidth
    const vh = window.visualViewport?.height ?? window.innerHeight
    return {
      isMobile: w < MOBILE_BREAKPOINT,
      isTablet: w >= MOBILE_BREAKPOINT && w < TABLET_BREAKPOINT,
      isDesktop: w >= TABLET_BREAKPOINT,
      isTouchDevice: getIsTouchDevice(),
      viewportHeight: vh,
      keyboardVisible: false,
    }
  })

  useEffect(() => {
    const vv = window.visualViewport
    const stableHeight = window.innerHeight

    function update() {
      const w = window.innerWidth
      const vh = vv?.height ?? window.innerHeight
      // Keyboard is likely visible if viewport shrunk by >150px
      const kbVisible = stableHeight - vh > 150

      setState({
        isMobile: w < MOBILE_BREAKPOINT,
        isTablet: w >= MOBILE_BREAKPOINT && w < TABLET_BREAKPOINT,
        isDesktop: w >= TABLET_BREAKPOINT,
        isTouchDevice: getIsTouchDevice(),
        viewportHeight: vh,
        keyboardVisible: kbVisible,
      })
    }

    window.addEventListener('resize', update)
    vv?.addEventListener('resize', update)

    return () => {
      window.removeEventListener('resize', update)
      vv?.removeEventListener('resize', update)
    }
  }, [])

  return state
}
