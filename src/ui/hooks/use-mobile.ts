import * as React from 'react'

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Synchronous initial value rather than `undefined` + an effect: on a narrow viewport
  // the first render otherwise shows the desktop sidebar (which is hidden below md), so
  // the UI briefly has no sidebar and the toggle shortcut targets the wrong state until
  // the effect runs. No SSR here, so matchMedia is safe in the initializer.
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () => window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches,
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return isMobile
}
