export type ConditionalTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'primary'
export type ConditionalRule =
  | { type: 'threshold'; column: string; operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'between'; value: number; value2?: number; tone: ConditionalTone }
  | { type: 'scale'; column: string; min: number; max: number; lowTone: ConditionalTone; highTone: ConditionalTone }
  | { type: 'discrete'; column: string; values: Record<string, ConditionalTone> }

export type ConditionalStyle = { className?: string; background?: string }
const TONE_CLASS: Record<ConditionalTone, string> = {
  success: 'bg-success-subtle text-success', warning: 'bg-warning-subtle text-warning',
  danger: 'bg-danger-subtle text-danger', neutral: 'bg-bg-subtle text-fg-muted',
  info: 'bg-info-subtle text-info', primary: 'bg-primary-subtle text-primary',
}
const TONE_COLOR: Record<ConditionalTone, string> = {
  success: 'var(--color-success)', warning: 'var(--color-warning)', danger: 'var(--color-danger)',
  neutral: 'var(--color-fg-subtle)', info: 'var(--color-info)', primary: 'var(--color-primary)',
}

export function resolveConditionalStyle(value: unknown, column: string, rules: ConditionalRule[]): ConditionalStyle {
  for (const rule of rules) {
    if (rule.column !== column) continue
    if (rule.type === 'discrete') {
      const tone = rule.values[String(value)]
      if (tone) return { className: TONE_CLASS[tone] }
      continue
    }
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) continue
    if (rule.type === 'threshold') {
      const hit = rule.operator === 'gt' ? numeric > rule.value
        : rule.operator === 'gte' ? numeric >= rule.value
          : rule.operator === 'lt' ? numeric < rule.value
            : rule.operator === 'lte' ? numeric <= rule.value
              : rule.operator === 'eq' ? numeric === rule.value
                : numeric >= rule.value && numeric <= (rule.value2 ?? rule.value)
      if (hit) return { className: TONE_CLASS[rule.tone] }
      continue
    }
    const amount = rule.max === rule.min ? 0 : Math.max(0, Math.min(1, (numeric - rule.min) / (rule.max - rule.min)))
    return { background: `color-mix(in srgb, ${TONE_COLOR[rule.lowTone]} ${Math.round((1 - amount) * 18)}%, ${TONE_COLOR[rule.highTone]} ${Math.round(amount * 18)}%)` }
  }
  return {}
}

export function conditionalToneClass(tone: ConditionalTone): string { return TONE_CLASS[tone] }
