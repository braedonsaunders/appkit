'use client'

import * as React from 'react'
import type { AppShellNavigationMode } from './app-shell'

type NavigationModeContextValue = {
  mode: AppShellNavigationMode
  setMode: (mode: AppShellNavigationMode) => void
  mounted: boolean
}

const NavigationModeContext = React.createContext<NavigationModeContextValue | null>(null)

export function NavigationModeProvider({
  children,
  defaultMode = 'topbar',
  cookieName = 'appkit-navigation-mode',
  onChange,
}: {
  children: React.ReactNode
  defaultMode?: AppShellNavigationMode
  cookieName?: string
  onChange?: (mode: AppShellNavigationMode) => void | Promise<void>
}) {
  const [mode, setModeState] = React.useState<AppShellNavigationMode>(defaultMode)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    const stored = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith(`${encodeURIComponent(cookieName)}=`))
      ?.slice(encodeURIComponent(cookieName).length + 1)
    if (stored === 'topbar' || stored === 'sidebar') setModeState(stored)
    setMounted(true)
  }, [cookieName])

  const setMode = React.useCallback(
    (next: AppShellNavigationMode) => {
      setModeState(next)
      document.cookie = `${encodeURIComponent(cookieName)}=${next};path=/;max-age=31536000;samesite=lax`
      void onChange?.(next)
    },
    [cookieName, onChange],
  )

  return (
    <NavigationModeContext.Provider value={{ mode, setMode, mounted }}>
      {children}
    </NavigationModeContext.Provider>
  )
}

export function useNavigationMode(): NavigationModeContextValue {
  const context = React.useContext(NavigationModeContext)
  if (!context) throw new Error('useNavigationMode must be used within NavigationModeProvider')
  return context
}
