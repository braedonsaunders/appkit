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

/** Measured size of an element, kept current across resizes. */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { width: number; height: number }] {
  const ref = React.useRef<T>(null)
  const [size, setSize] = React.useState({ width: 0, height: 0 })
  React.useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect
      if (rect) setSize({ width: rect.width, height: rect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}
