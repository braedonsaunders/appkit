/** ISO weekday: Monday = 1, Sunday = 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export type RecurrenceActivePeriod = {
  weekdays?: readonly Weekday[]
  /** Local HH:mm; start inclusive, end exclusive. End < start crosses midnight.
   * The weekday belongs to the date on which the window opens. */
  window?: { start: string; end: string }
}

type RecurrenceBase = {
  /** Named IANA zone (including UTC), never a numeric offset. */
  timeZone: string
  /** Filters occurrences; never shifts their cadence or interval anchor. */
  active?: RecurrenceActivePeriod
}

/** JSON-serializable schedule. All instant strings require Z or an offset.
 * Calendar gaps are skipped; folds use only the earlier instant. */
export type RecurrenceSchedule = RecurrenceBase & (
  | { kind: 'interval'; everyMs: number; anchor: string }
  | { kind: 'once'; at: string }
  | { kind: 'daily'; time: string }
  | { kind: 'weekly'; time: string; weekdays: readonly Weekday[] }
  | { kind: 'monthly'; time: string; dayOfMonth: number | 'last' }
)

/** Persisted next unconsumed occurrence. Null is terminal, not uninitialized. */
export type RecurrenceCursor = { nextAt: string | null }
export type MissedRunPolicy = 'skip' | 'coalesce'
export type RecurrenceAdvance = RecurrenceCursor & {
  /** At most one run; its original scheduled instant, not execution time. */
  dueAt: string | null
}

export type RecurrenceSearchOptions = {
  /** Work budget, not a time horizon. Exhaustion throws, never returns null. */
  maxCandidates?: number
}

export type LocalDateTimeInput = {
  /** Strict YYYY-MM-DDTHH:mm, typically a datetime-local input. */
  localDateTime: string
  timeZone: string
  /** Required UI decision for a repeated local time. Gaps always throw. */
  disambiguation: 'earlier' | 'later' | 'reject'
}
