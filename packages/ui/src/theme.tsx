'use client'

import * as React from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from './utils'

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
  theme: Theme
  resolvedTheme: ResolvedTheme
  setTheme: (theme: Theme) => void
  mounted: boolean
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null)
const unavailableThemes = new Map<string, Theme>()

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system'
}

export function ThemeProvider({
  children,
  storageKey = 'theme',
}: {
  children: React.ReactNode
  storageKey?: string
}) {
  const eventName = `appkit-theme-change:${storageKey}`
  const readTheme = React.useCallback((): Theme => {
    try {
      const stored = localStorage.getItem(storageKey)
      return isTheme(stored) ? stored : 'system'
    } catch {
      return unavailableThemes.get(storageKey) ?? 'system'
    }
  }, [storageKey])
  const subscribeTheme = React.useCallback(
    (onChange: () => void) => {
      window.addEventListener('storage', onChange)
      window.addEventListener(eventName, onChange)
      return () => {
        window.removeEventListener('storage', onChange)
        window.removeEventListener(eventName, onChange)
      }
    },
    [eventName],
  )
  const subscribeSystem = React.useCallback((onChange: () => void) => {
    const media = matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  const theme = React.useSyncExternalStore<Theme>(subscribeTheme, readTheme, () => 'system')
  const prefersDark = React.useSyncExternalStore(
    subscribeSystem,
    () => matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  )
  const [mounted, setMounted] = React.useState(false)
  const resolvedTheme: ResolvedTheme =
    theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme

  React.useEffect(() => setMounted(true), [])
  React.useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.classList.toggle('light', resolvedTheme === 'light')
  }, [resolvedTheme])

  const setTheme = React.useCallback(
    (next: Theme) => {
      try {
        if (next === 'system') localStorage.removeItem(storageKey)
        else localStorage.setItem(storageKey, next)
        unavailableThemes.delete(storageKey)
      } catch {
        unavailableThemes.set(storageKey, next)
      }
      window.dispatchEvent(new Event(eventName))
    },
    [eventName, storageKey],
  )

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}

const THEME_OPTIONS = [
  { value: 'light' as const, icon: Sun },
  { value: 'system' as const, icon: Monitor },
  { value: 'dark' as const, icon: Moon },
]

export type ThemeToggleLabels = {
  label: string
  light: string
  system: string
  dark: string
  current: (theme: string) => string
}

const DEFAULT_LABELS: ThemeToggleLabels = {
  label: 'Theme',
  light: 'Light',
  system: 'System',
  dark: 'Dark',
  current: (theme) => `Theme: ${theme}`,
}

export function ThemeToggle({
  collapsed = false,
  labels = DEFAULT_LABELS,
  className,
}: {
  collapsed?: boolean
  labels?: ThemeToggleLabels
  className?: string
}) {
  const { theme, setTheme, mounted } = useTheme()

  if (collapsed) {
    const active = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[1]!
    const Icon = active.icon
    const activeLabel = labels[active.value]
    const next: Theme = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        title={labels.current(activeLabel)}
        aria-label={labels.current(activeLabel)}
        className={cn(
          'grid size-9 place-items-center rounded-md text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg',
          className,
        )}
      >
        {mounted ? <Icon size={16} /> : <Monitor size={16} className="opacity-0" />}
      </button>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-label={labels.label}
      className={cn('flex items-center gap-0.5 rounded-lg border border-border bg-bg-subtle p-0.5', className)}
    >
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon
        const selected = mounted && theme === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(option.value)}
            title={labels[option.value]}
            className={cn(
              'inline-flex h-7 flex-1 items-center justify-center rounded-md transition-colors',
              selected ? 'bg-surface text-primary shadow-sm' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Icon size={15} />
          </button>
        )
      })}
    </div>
  )
}
