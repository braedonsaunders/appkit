// Faithfully extracted from the production notification cockpit's shared
// schedule module. It intentionally has no React, database, or framework
// dependency so the same validation runs in clients and persistence adapters.

export const DEFAULT_SCAN_CRON = '0 6 * * *'

export type SchedulePreset = 'hourly' | 'every_6h' | 'twice_daily' | 'daily' | 'weekly' | 'custom'

export const SCHEDULE_PRESETS: readonly { value: SchedulePreset; label: string }[] = [
  { value: 'hourly', label: 'Every hour' },
  { value: 'every_6h', label: 'Every 6 hours' },
  { value: 'twice_daily', label: 'Twice a day' },
  { value: 'daily', label: 'Once a day' },
  { value: 'weekly', label: 'Once a week' },
  { value: 'custom', label: 'Custom (cron)' },
]

export const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
] as const

const clampHour = (hour: number) => Math.min(23, Math.max(0, Math.round(Number.isFinite(hour) ? hour : 6)))
const clampWeekday = (weekday: number) => Math.min(6, Math.max(0, Math.round(Number.isFinite(weekday) ? weekday : 1)))

/** Compile a friendly preset selection into the source runtime's five-field cron grammar. */
export function compileCron(preset: SchedulePreset, hour: number, weekday: number, custom: string): string {
  const normalizedHour = clampHour(hour)
  switch (preset) {
    case 'hourly': return '0 * * * *'
    case 'every_6h': return '0 */6 * * *'
    case 'twice_daily': return `0 ${normalizedHour},${(normalizedHour + 12) % 24} * * *`
    case 'daily': return `0 ${normalizedHour} * * *`
    case 'weekly': return `0 ${normalizedHour} * * ${clampWeekday(weekday)}`
    case 'custom': return custom.trim() || DEFAULT_SCAN_CRON
  }
}

/** Best-effort decompile a stored cron back into the production cockpit controls. */
export function decompileCron(cron: string): { preset: SchedulePreset; hour: number; weekday: number; custom: string } {
  const value = (cron || DEFAULT_SCAN_CRON).trim()
  const base = { hour: 6, weekday: 1, custom: value }
  if (value === '0 * * * *') return { ...base, preset: 'hourly' }
  if (value === '0 */6 * * *') return { ...base, preset: 'every_6h' }
  let match: RegExpExecArray | null
  if ((match = /^0 (\d{1,2}),(\d{1,2}) \* \* \*$/.exec(value))) {
    const first = Number(match[1])
    const second = Number(match[2])
    if ((first + 12) % 24 === second % 24) return { ...base, preset: 'twice_daily', hour: first }
  }
  if ((match = /^0 (\d{1,2}) \* \* \*$/.exec(value))) return { ...base, preset: 'daily', hour: Number(match[1]) }
  if ((match = /^0 (\d{1,2}) \* \* ([0-6])$/.exec(value))) return { ...base, preset: 'weekly', hour: Number(match[1]), weekday: Number(match[2]) }
  return { ...base, preset: 'custom' }
}

/** Validate the exact cron subset accepted by the production worker parser. */
export function isValidCron(expression: string): boolean {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const bounds: readonly [number, number][] = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 6]]
  return parts.every((part, index) => {
    const [minimum, maximum] = bounds[index]!
    return part.split(',').every((token) => {
      if (token === '*') return true
      const step = /^(\*|\d+)\/(\d+)$/.exec(token)
      if (step) return Number(step[2]) > 0
      const number = Number(token)
      return Number.isInteger(number) && number >= minimum && number <= maximum
    })
  })
}

export function isValidTimezone(timezone: string): boolean {
  if (!timezone) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return true
  } catch {
    return false
  }
}
