export const REPORT_SCHEDULE_LIMITS = {
  nameChars: 120, recipients: 50, recipientChars: 320,
  filtersChars: 24_000, filtersBytes: 32_000, filtersDepth: 8,
  filtersNodes: 1000, filterKeyChars: 100,
} as const

export function validateScheduleRecipients(recipients: string[]): string[] {
  if (recipients.length > REPORT_SCHEDULE_LIMITS.recipients) throw new Error('A report schedule has too many recipients')
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const normalized = recipients.map((recipient) => recipient.trim().toLowerCase())
  for (const recipient of normalized) {
    if (!recipient || recipient.length > REPORT_SCHEDULE_LIMITS.recipientChars || !email.test(recipient)) throw new Error(`Invalid report recipient "${recipient}"`)
  }
  return [...new Set(normalized)]
}

export function assertScheduleFilters(value: unknown): void {
  if (value === undefined || value === null) return
  if (typeof value !== 'object') throw new Error('Report filters must be an object')
  let encoded: string
  try { encoded = JSON.stringify(value) } catch { throw new Error('Report filters must be JSON serializable') }
  if (encoded.length > REPORT_SCHEDULE_LIMITS.filtersChars || new TextEncoder().encode(encoded).byteLength > REPORT_SCHEDULE_LIMITS.filtersBytes) throw new Error('Report filters are too large')
  let nodes = 0
  const stack: { value: unknown; depth: number }[] = [{ value, depth: 0 }]
  while (stack.length) {
    const current = stack.pop()!
    if (++nodes > REPORT_SCHEDULE_LIMITS.filtersNodes) throw new Error('Report filters contain too many values')
    if (current.depth > REPORT_SCHEDULE_LIMITS.filtersDepth) throw new Error('Report filters are nested too deeply')
    if (!current.value || typeof current.value !== 'object') continue
    for (const [key, entry] of Object.entries(current.value)) {
      if (key.length > REPORT_SCHEDULE_LIMITS.filterKeyChars || key === '__proto__' || key === 'constructor' || key === 'prototype') throw new Error('Report filters contain an invalid key')
      stack.push({ value: entry, depth: current.depth + 1 })
    }
  }
}
