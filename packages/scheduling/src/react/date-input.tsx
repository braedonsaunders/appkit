'use client'

/**
 * The one date control the scheduling surface renders.
 *
 * Every date the surface edits — task start, finish, constraint, deadline,
 * actuals, and the filter range — goes through `ScheduleDateInput`. By default
 * that is the browser's native date input, so a host can drop the surface in
 * and see it work. A host with its own date field (typed entry in the viewer's
 * locale, keyboard shortcuts, a house calendar) supplies it once through
 * `SchedulingProvider components={{ DateInput }}` and every date in the
 * surface uses it, without the package knowing how it is built.
 *
 * The contract is deliberately the native one in ISO form: the value is a
 * calendar date `yyyy-mm-dd` or '' for no date, and `onChange` reports the
 * same shape. A component that cannot read its text as a date reports ''
 * rather than a guess.
 */

import { Input } from '@braedonsaunders/appkit-ui'
import { useScheduleComponents, type ScheduleDateInputProps } from './context'

/** The default date control: the native date input, styled as an AppKit `Input`. */
export function NativeScheduleDateInput({ value, onChange, ...props }: ScheduleDateInputProps) {
  return <Input {...props} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
}

/** Renders the host's date control when one is supplied, else the native input. */
export function ScheduleDateInput(props: ScheduleDateInputProps) {
  const DateInput = useScheduleComponents().DateInput ?? NativeScheduleDateInput
  return <DateInput {...props} />
}
