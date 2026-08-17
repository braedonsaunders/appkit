/**
 * The phase palette, as token references rather than colour literals.
 *
 * A phase without an explicit colour takes its hue from its index, so two
 * adjacent phases never collide and the same phase keeps its identity between
 * light and dark. Hosts restyle the whole schedule by redefining the
 * `--sched-phase-*` channels in `styles.css` — never by editing a component.
 */

export const PHASE_TOKEN_COUNT = 8

/** CSS `rgb()` expression for phase index `index` at optional `alpha`. */
export function phaseColor(index: number, alpha = 1) {
  const slot = (Math.abs(Math.trunc(index)) % PHASE_TOKEN_COUNT) + 1
  return alpha >= 1
    ? `rgb(var(--sched-phase-${slot}))`
    : `rgb(var(--sched-phase-${slot}) / ${alpha})`
}

/** Resolve a phase's colour: an explicit override wins over the palette. */
export function resolvePhaseColor(
  explicit: string | null | undefined,
  index: number,
  alpha = 1,
) {
  const trimmed = explicit?.trim()
  if (trimmed) return trimmed
  return phaseColor(index, alpha)
}

/** Semantic colours the timeline chrome draws with. */
export const scheduleColors = {
  critical: (alpha = 1) =>
    alpha >= 1 ? 'rgb(var(--sched-critical))' : `rgb(var(--sched-critical) / ${alpha})`,
  today: (alpha = 1) =>
    alpha >= 1 ? 'rgb(var(--sched-today))' : `rgb(var(--sched-today) / ${alpha})`,
  baseline: (alpha = 1) =>
    alpha >= 1 ? 'rgb(var(--sched-baseline))' : `rgb(var(--sched-baseline) / ${alpha})`,
  link: (alpha = 1) => (alpha >= 1 ? 'rgb(var(--sched-link))' : `rgb(var(--sched-link) / ${alpha})`),
  overload: (alpha = 1) =>
    alpha >= 1 ? 'rgb(var(--sched-overload))' : `rgb(var(--sched-overload) / ${alpha})`,
  progress: (alpha = 1) =>
    alpha >= 1 ? 'rgb(var(--sched-progress))' : `rgb(var(--sched-progress) / ${alpha})`,
} as const

/** Status → `@braedonsaunders/appkit-ui` Badge variant. Never colour alone: the badge also
 *  carries the status text, so the meaning survives for colour-blind readers. */
export const statusBadgeVariant = {
  not_started: 'secondary',
  in_progress: 'info',
  complete: 'success',
  on_hold: 'warning',
} as const
