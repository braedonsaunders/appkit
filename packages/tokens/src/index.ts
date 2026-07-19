/**
 * JS access to the design tokens — for consumers that can't read CSS variables:
 * chart libraries, <canvas>, PDF/email renderers, server-side image generation.
 *
 * The CSS in `tokens.css` is the source of truth for the *running app*; this
 * mirrors the same values for non-DOM contexts. Keep them in sync.
 */

export type ThemeMode = 'light' | 'dark'

/** Semantic token names, mode-independent. */
export type ColorToken =
  | 'bg'
  | 'bg-subtle'
  | 'surface'
  | 'surface-hover'
  | 'elevated'
  | 'overlay'
  | 'fg'
  | 'fg-muted'
  | 'fg-subtle'
  | 'border'
  | 'border-strong'
  | 'border-subtle'
  | 'primary'
  | 'primary-hover'
  | 'primary-active'
  | 'primary-fg'
  | 'primary-subtle'
  | 'danger'
  | 'danger-fg'
  | 'danger-subtle'
  | 'warning'
  | 'warning-fg'
  | 'warning-subtle'
  | 'success'
  | 'success-fg'
  | 'success-subtle'
  | 'info'
  | 'info-fg'
  | 'info-subtle'
  | 'ring'

/** sRGB channels as `[r, g, b]`, mirroring the CSS `--ch-*` triples. */
type Channels = readonly [number, number, number]

const light: Record<ColorToken, Channels> = {
  bg: [255, 255, 255],
  'bg-subtle': [248, 250, 252],
  surface: [255, 255, 255],
  'surface-hover': [248, 250, 252],
  elevated: [255, 255, 255],
  overlay: [15, 23, 42],
  fg: [15, 23, 42],
  'fg-muted': [100, 116, 139],
  'fg-subtle': [148, 163, 184],
  border: [226, 232, 240],
  'border-strong': [203, 213, 225],
  'border-subtle': [241, 245, 249],
  primary: [15, 118, 110],
  'primary-hover': [17, 94, 89],
  'primary-active': [19, 78, 74],
  'primary-fg': [255, 255, 255],
  'primary-subtle': [240, 253, 250],
  danger: [220, 38, 38],
  'danger-fg': [255, 255, 255],
  'danger-subtle': [254, 242, 242],
  warning: [217, 119, 6],
  'warning-fg': [255, 255, 255],
  'warning-subtle': [255, 251, 235],
  success: [22, 163, 74],
  'success-fg': [255, 255, 255],
  'success-subtle': [240, 253, 244],
  info: [37, 99, 235],
  'info-fg': [255, 255, 255],
  'info-subtle': [239, 246, 255],
  ring: [20, 184, 166],
}

const dark: Record<ColorToken, Channels> = {
  ...light,
  bg: [2, 6, 23],
  'bg-subtle': [15, 23, 42],
  surface: [15, 23, 42],
  'surface-hover': [30, 41, 59],
  elevated: [30, 41, 59],
  overlay: [2, 6, 23],
  fg: [241, 245, 249],
  'fg-muted': [148, 163, 184],
  'fg-subtle': [100, 116, 139],
  border: [51, 65, 85],
  'border-strong': [71, 85, 105],
  'border-subtle': [30, 41, 59],
  primary: [20, 184, 166],
  'primary-hover': [45, 212, 191],
  'primary-active': [94, 234, 212],
  'primary-fg': [4, 47, 46],
  'primary-subtle': [19, 78, 74],
  danger: [248, 113, 113],
  'danger-fg': [69, 10, 10],
  'danger-subtle': [60, 10, 10],
  warning: [251, 191, 36],
  'warning-fg': [66, 32, 6],
  'warning-subtle': [55, 28, 5],
  success: [74, 222, 128],
  'success-fg': [5, 46, 22],
  'success-subtle': [6, 40, 20],
  info: [96, 165, 250],
  'info-fg': [23, 37, 84],
  'info-subtle': [20, 33, 70],
  ring: [45, 212, 191],
}

export const palette: Record<ThemeMode, Record<ColorToken, Channels>> = {
  light,
  dark,
}

/** Resolve a semantic token to a CSS `rgb()` / `rgba()` string. */
export function color(token: ColorToken, mode: ThemeMode = 'light', alpha = 1): string {
  const [r, g, b] = palette[mode][token]
  return alpha >= 1 ? `rgb(${r} ${g} ${b})` : `rgb(${r} ${g} ${b} / ${alpha})`
}

/** Motion tokens — mirror of the CSS `--ease-*` / `--duration-*` values. */
export const motion = {
  ease: {
    out: 'cubic-bezier(0.22, 1, 0.36, 1)',
    inOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
  duration: {
    fast: 120,
    base: 180,
    slow: 320,
  },
} as const

export const radius = {
  sm: '0.375rem',
  md: '0.5rem',
  lg: '0.625rem',
  xl: '0.875rem',
} as const
