'use client'

import * as React from 'react'

/**
 * A requestAnimationFrame loop that pauses when the tab is hidden or the
 * caller says the scene is off-screen, and hands the callback a clamped
 * delta so a long pause never teleports characters.
 */
export function useSceneAnimationFrame(
  callback: (deltaMs: number) => void,
  active: boolean,
): void {
  const callbackRef = React.useRef(callback)
  React.useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  React.useEffect(() => {
    if (!active || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let frame = 0
    let last = 0
    let hidden = document.hidden

    const onVisibility = () => {
      hidden = document.hidden
      last = 0
    }
    document.addEventListener('visibilitychange', onVisibility)

    const tick = (time: number) => {
      frame = window.requestAnimationFrame(tick)
      if (hidden) return
      if (last === 0) {
        last = time
        return
      }
      const delta = Math.min(64, time - last)
      last = time
      callbackRef.current(delta)
    }
    frame = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])
}
