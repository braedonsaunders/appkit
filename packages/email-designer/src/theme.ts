import type { EmailDesignerTheme } from './types'

/**
 * A neutral slate/teal palette. Hosts override the parts they brand — usually
 * just `accent` — and inherit the rest.
 */
export const DEFAULT_EMAIL_DESIGNER_THEME: EmailDesignerTheme = {
  accent: '#0d9488',
  ink: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  background: '#f1f5f9',
  surface: '#ffffff',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  maxWidth: 640,
  radius: 6,
}

/** Merge a partial host theme over the defaults. */
export function resolveEmailDesignerTheme(
  theme?: Partial<EmailDesignerTheme>,
): EmailDesignerTheme {
  return theme ? { ...DEFAULT_EMAIL_DESIGNER_THEME, ...theme } : DEFAULT_EMAIL_DESIGNER_THEME
}

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

/**
 * Colors reach inline `style="…"` attributes, so anything that is not a plain
 * hex literal is refused rather than concatenated into markup.
 */
export function safeColor(value: string, fallback: string): string {
  return HEX.test(value.trim()) ? value.trim() : fallback
}
