// Theme preference rules shared by `ThemeProvider` and `getThemeScript`, so the
// pre-paint class and the hydrated theme can never disagree.

export type Theme = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

/**
 * How an app's theme preference behaves. The provider and the pre-paint script
 * must receive the same options so the first paint matches the hydrated theme.
 *
 * - `storageKey` — the localStorage key holding an explicit choice.
 * - `defaultTheme` — the theme used until the user picks one (`'system'` when
 *   omitted). A dark-by-default app passes `'dark'`.
 * - `enableSystem: false` — a light/dark-only app: `'system'` is never offered
 *   or honoured, so `defaultTheme` must be `'light'` or `'dark'`.
 */
export type ThemeOptions = { storageKey?: string } & (
  | { enableSystem?: true; defaultTheme?: Theme }
  | { enableSystem: false; defaultTheme: ResolvedTheme }
)

export type ResolvedThemeOptions = {
  storageKey: string
  defaultTheme: Theme
  enableSystem: boolean
}

export function resolveThemeOptions(options: ThemeOptions = {}): ResolvedThemeOptions {
  const enableSystem = options.enableSystem !== false
  const requested = options.defaultTheme ?? 'system'
  return {
    storageKey: options.storageKey ?? 'theme',
    enableSystem,
    defaultTheme: !enableSystem && requested === 'system' ? 'light' : requested,
  }
}

/** The theme a stored value selects under these options (invalid or disallowed values fall back to the default). */
export function themeFromStorage(stored: string | null, options: ResolvedThemeOptions): Theme {
  if (stored === 'light' || stored === 'dark') return stored
  if (stored === 'system' && options.enableSystem) return stored
  return options.defaultTheme
}
