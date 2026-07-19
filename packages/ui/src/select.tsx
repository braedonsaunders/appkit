'use client'

// Select is the app-wide select control — the real SearchSelect dropdown behind
// an options-based API. (openbooks additionally wraps a hidden native <select>
// for <option>-children + form semantics; expose SearchSelect directly for the
// generic case.)

import { SearchSelect, type SearchSelectProps, type SelectOption } from './search-select'

export type { SelectOption }
export type SelectProps = SearchSelectProps

export function Select(props: SelectProps) {
  return <SearchSelect {...props} />
}
