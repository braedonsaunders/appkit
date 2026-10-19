// The pre-paint theme script. Framework-neutral: no React and no browser
// globals at import time, so it is safe in Server Components, in
// `vite.config`/`next.config`, and in build scripts (`@braedonsaunders/appkit-ui/theme-script`).

import { resolveThemeOptions, type ThemeOptions } from './theme-options'

export type { ResolvedTheme, Theme, ThemeOptions } from './theme-options'

/**
 * Inline script body that applies the stored (or default) theme class to
 * `<html>` before first paint. Use it with a framework's pre-hydration script
 * facility (for example `next/script` with `strategy="beforeInteractive"`), or
 * inject it into a static `index.html` at build time (for example from a Vite
 * `transformIndexHtml` hook). `'system'` leaves both classes off so the
 * stylesheet's `prefers-color-scheme` defaults apply.
 */
export function getThemeScript(options: ThemeOptions = {}): string {
  const resolved = resolveThemeOptions(options)
  const json = (value: unknown) => JSON.stringify(value).replaceAll('<', '\\u003c')
  return `(function(){var t=${json(resolved.defaultTheme)};try{var s=localStorage.getItem(${json(resolved.storageKey)});if(s==='light'||s==='dark'||(${resolved.enableSystem}&&s==='system'))t=s}catch(_){}var d=document.documentElement;d.classList.toggle('dark',t==='dark');d.classList.toggle('light',t==='light')})()`
}
