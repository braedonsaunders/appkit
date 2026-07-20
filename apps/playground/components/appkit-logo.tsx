import { cn } from '@appkit/ui'

/**
 * The appkit mark: a stroke-drawn rounded container with a spark rising out of
 * it — "a kit that ships". Every stroke carries pathLength=1 so one dasharray
 * rule draws any shape; `.appkit-logo-draw` (globals.css) plays the draw-in
 * once, staggered per stroke via --ld, and respects prefers-reduced-motion.
 */
export function AppkitMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="appkit"
      className={cn('text-primary', className)}
    >
      {/* Container — an open box (kit) drawn as one stroke. */}
      <path
        d="M6 13 v11 a3 3 0 0 0 3 3 h14 a3 3 0 0 0 3 -3 v-11"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="appkit-logo-draw"
        style={{ ['--ld' as string]: '0ms' }}
      />
      {/* Spark — a bolt rising out of the box. */}
      <path
        d="M17.5 4 L12 15 h4.4 L14.5 22.5 L20.5 12 h-4.6 L17.5 4 Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className="appkit-logo-draw"
        style={{ ['--ld' as string]: '250ms' }}
      />
    </svg>
  )
}

export function AppkitLogo({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <AppkitMark size={size} />
      <span className="appkit-word-in text-[1.05rem] font-semibold tracking-tight text-fg">
        app<span className="text-primary">kit</span>
      </span>
    </span>
  )
}
