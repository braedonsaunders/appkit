'use client'

import { Checkbox, Label, SearchSelect, cn } from '@appkit/ui'
import type { RoleScope, ScopeOption, ScopeOptions } from './types'

type ScopeType = RoleScope['type']

const SCOPE_LABELS: Array<{ value: ScopeType; label: string; description: string }> = [
  { value: 'tenant', label: 'All records', description: 'Everything in this workspace.' },
  { value: 'sites', label: 'Selected sites', description: 'Records associated with selected sites.' },
  { value: 'team', label: 'Teams', description: 'Own records plus selected departments and groups.' },
  { value: 'people', label: 'Selected people', description: 'Own records plus selected people.' },
  { value: 'crews', label: 'Selected crews', description: 'Records associated with selected crews.' },
  { value: 'self', label: 'Own records', description: 'Only records owned or submitted by this member.' },
]

export function ScopePicker({
  value,
  onChange,
  options = {},
  name,
  disabled = false,
}: {
  value: RoleScope
  onChange?: (scope: RoleScope) => void
  options?: ScopeOptions
  name?: string
  disabled?: boolean
}) {
  const type = value.type

  function setType(next: ScopeType) {
    if (!onChange) return
    onChange(emptyScope(next))
  }

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-2 text-sm font-medium text-fg">Data scope</legend>
      {name ? <input type="hidden" name={`${name}.type`} value={type} /> : null}
      <div className="grid gap-2 sm:grid-cols-2">
        {SCOPE_LABELS.map((option) => (
          <label
            key={option.value}
            className={cn(
              'flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors',
              type === option.value ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-surface-hover',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name ? `${name}.kind` : undefined}
              value={option.value}
              checked={type === option.value}
              onChange={() => setType(option.value)}
              className="mt-0.5 accent-primary"
            />
            <span>
              <span className="block text-sm font-medium text-fg">{option.label}</span>
              <span className="mt-0.5 block text-xs text-fg-muted">{option.description}</span>
            </span>
          </label>
        ))}
      </div>
      <ScopeValues scope={value} onChange={onChange} options={options} name={name} disabled={disabled} />
    </fieldset>
  )
}

function ScopeValues({
  scope,
  onChange,
  options,
  name,
  disabled,
}: {
  scope: RoleScope
  onChange?: (scope: RoleScope) => void
  options: ScopeOptions
  name?: string
  disabled: boolean
}) {
  if (scope.type === 'tenant' || scope.type === 'self') return null
  if (scope.type === 'sites') {
    return <MultiPicker label="Sites" values={scope.siteIds} options={options.sites ?? []} name={name ? `${name}.siteIds` : undefined} disabled={disabled} onChange={(siteIds) => onChange?.({ type: 'sites', siteIds })} />
  }
  if (scope.type === 'people') {
    return <MultiPicker label="People" values={scope.personIds} options={options.people ?? []} name={name ? `${name}.personIds` : undefined} disabled={disabled} onChange={(personIds) => onChange?.({ type: 'people', personIds })} />
  }
  if (scope.type === 'crews') {
    return <MultiPicker label="Crews" values={scope.crewIds} options={options.crews ?? []} name={name ? `${name}.crewIds` : undefined} disabled={disabled} onChange={(crewIds) => onChange?.({ type: 'crews', crewIds })} />
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <MultiPicker label="Departments" values={scope.departmentIds} options={options.departments ?? []} name={name ? `${name}.departmentIds` : undefined} disabled={disabled} onChange={(departmentIds) => onChange?.({ ...scope, departmentIds })} />
      <MultiPicker label="Groups" values={scope.groupIds} options={options.groups ?? []} name={name ? `${name}.groupIds` : undefined} disabled={disabled} onChange={(groupIds) => onChange?.({ ...scope, groupIds })} />
    </div>
  )
}

function MultiPicker({
  label,
  values,
  options,
  onChange,
  name,
  disabled,
}: {
  label: string
  values: string[]
  options: ScopeOption[]
  onChange: (values: string[]) => void
  name?: string
  disabled: boolean
}) {
  const available = options.filter((option) => !values.includes(option.value))
  return (
    <div className="space-y-2 rounded-lg border border-border bg-bg-subtle p-3">
      <Label>{label}</Label>
      {values.map((value) => <input key={value} type="hidden" name={name} value={value} />)}
      <SearchSelect
        value=""
        onChange={(value) => value && onChange([...values, value])}
        options={available}
        placeholder={available.length > 0 ? `Add ${label.toLocaleLowerCase()}…` : `No more ${label.toLocaleLowerCase()}`}
        disabled={disabled || available.length === 0}
      />
      {values.length > 0 ? (
        <div className="space-y-1">
          {values.map((value) => {
            const option = options.find((candidate) => candidate.value === value)
            return (
              <label key={value} className="flex items-center gap-2 text-sm text-fg">
                <Checkbox checked onChange={() => onChange(values.filter((candidate) => candidate !== value))} disabled={disabled} />
                {option?.label ?? value}
              </label>
            )
          })}
        </div>
      ) : <p className="text-xs text-fg-subtle">No selection yet.</p>}
    </div>
  )
}

function emptyScope(type: ScopeType): RoleScope {
  if (type === 'tenant' || type === 'self') return { type }
  if (type === 'sites') return { type, siteIds: [] }
  if (type === 'people') return { type, personIds: [] }
  if (type === 'crews') return { type, crewIds: [] }
  return { type, departmentIds: [], groupIds: [] }
}
