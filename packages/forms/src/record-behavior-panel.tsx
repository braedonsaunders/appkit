'use client'

import * as React from 'react'
import { Check } from 'lucide-react'
import { Button, Checkbox, Label, cn } from '@appkit/ui'
import type { RecordConfig } from './record-config'

type EditingMode = NonNullable<RecordConfig['editingMode']>
type LockTrigger = NonNullable<NonNullable<RecordConfig['locking']>['trigger']>

const EDITING_MODES: { value: EditingMode; title: string; description: string }[] = [
  {
    value: 'guided_fill',
    title: 'Guided fill',
    description: 'A step-by-step wizard ending in Submit. Best for one-off captures in the field.',
  },
  {
    value: 'inline_record',
    title: 'Inline record',
    description: 'A living record edited in place — every field autosaves as you type.',
  },
  {
    value: 'both',
    title: 'Both',
    description: 'An inline record that can also be completed through the guided wizard.',
  },
]

const LOCK_TRIGGERS: { value: LockTrigger; label: string }[] = [
  { value: 'manual', label: 'Manually, with a Lock button' },
  { value: 'on_finalize', label: 'When the record is finalised' },
  { value: 'on_signoff', label: 'When all sign-off steps are complete' },
]

export type RecordBehaviorPanelProps = {
  value?: RecordConfig
  roles?: { key: string; name: string }[]
  onChange: (config: RecordConfig) => void
  onSave?: (config: RecordConfig) => void | Promise<void>
  readOnly?: boolean
  className?: string
}

export function RecordBehaviorPanel({
  value,
  roles = [],
  onChange,
  onSave,
  readOnly = false,
  className,
}: RecordBehaviorPanelProps) {
  const [pending, startTransition] = React.useTransition()
  const config = value ?? {}
  const editingMode = config.editingMode ?? 'guided_fill'
  const locking = config.locking ?? {}
  const tabs = config.tabs ?? {}

  const patch = React.useCallback((next: Partial<RecordConfig>) => {
    onChange({ ...config, ...next })
  }, [config, onChange])

  const patchLocking = React.useCallback((next: Partial<NonNullable<RecordConfig['locking']>>) => {
    patch({ locking: { ...locking, ...next } })
  }, [locking, patch])

  const toggleRole = (
    key: 'lockRoles' | 'unlockRoles',
    role: string,
  ) => {
    const selected = new Set(locking[key] ?? [])
    if (selected.has(role)) selected.delete(role)
    else selected.add(role)
    patchLocking({ [key]: [...selected] })
  }

  return (
    <div className={cn('space-y-4', className)}>
      <p className="text-xs text-fg-muted">
        Choose how people edit records, when records lock, and which review tabs are available.
      </p>

      <section className="space-y-2">
        <Label className="text-xs">Editing mode</Label>
        <div className="space-y-2">
          {EDITING_MODES.map((mode) => {
            const active = editingMode === mode.value
            return (
              <button
                key={mode.value}
                type="button"
                disabled={readOnly}
                onClick={() => patch({ editingMode: mode.value })}
                aria-pressed={active}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  active ? 'border-primary bg-primary-subtle' : 'border-border hover:bg-surface-hover',
                )}
              >
                <span className={cn(
                  'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                  active ? 'border-primary bg-primary text-primary-fg' : 'border-border-strong',
                )}>
                  {active ? <Check size={11} /> : null}
                </span>
                <span>
                  <span className="block text-sm font-medium text-fg">{mode.title}</span>
                  <span className="block text-xs text-fg-muted">{mode.description}</span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-border p-3">
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={locking.enabled ?? false}
            disabled={readOnly}
            onChange={(event) => patchLocking({ enabled: event.currentTarget.checked })}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium text-fg">Allow record locking</span>
            <span className="block text-xs text-fg-muted">Locked records become read-only until an authorised person unlocks them.</span>
          </span>
        </label>

        {locking.enabled ? (
          <div className="space-y-3 border-t border-border-subtle pt-3">
            <div className="space-y-1">
              <Label className="text-xs">Lock trigger</Label>
              <div className="space-y-1">
                {LOCK_TRIGGERS.map((option) => (
                  <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover">
                    <input
                      type="radio"
                      name="record-lock-trigger"
                      checked={(locking.trigger ?? 'manual') === option.value}
                      disabled={readOnly}
                      onChange={() => patchLocking({ trigger: option.value })}
                    />
                    <span className="text-fg">{option.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <RoleMultiSelect
              label="Who can lock records"
              help="Leave empty to allow anyone with edit access. Administrators can always lock."
              roles={roles}
              selected={new Set(locking.lockRoles ?? [])}
              disabled={readOnly}
              onToggle={(key) => toggleRole('lockRoles', key)}
            />
            <RoleMultiSelect
              label="Who can unlock records"
              help="Leave empty to allow anyone with edit access. Administrators can always unlock."
              roles={roles}
              selected={new Set(locking.unlockRoles ?? [])}
              disabled={readOnly}
              onToggle={(key) => toggleRole('unlockRoles', key)}
            />

            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={locking.autoLockOnFinalize ?? false}
                disabled={readOnly}
                onChange={(event) => patchLocking({ autoLockOnFinalize: event.currentTarget.checked })}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium text-fg">Automatically lock final records</span>
                <span className="block text-xs text-fg-muted">Prevent further edits as soon as the record is finalised.</span>
              </span>
            </label>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-md border border-border p-3">
        <div className="space-y-0.5">
          <Label className="text-xs">Record tabs</Label>
          <p className="text-xs text-fg-muted">Choose the system tabs shown beside the record form.</p>
        </div>
        <TabToggle label="Review" help="Compliance scoring and sign-off." checked={tabs.review ?? false} disabled={readOnly} onChange={(review) => patch({ tabs: { ...tabs, review } })} />
        <TabToggle label="Comments" help="Let reviewers discuss a record." checked={tabs.comments ?? true} disabled={readOnly} onChange={(comments) => patch({ tabs: { ...tabs, comments } })} />
        <TabToggle label="Audit" help="Show the complete change history." checked={tabs.audit ?? true} disabled={readOnly} onChange={(audit) => patch({ tabs: { ...tabs, audit } })} />
      </section>

      {onSave ? (
        <Button
          type="button"
          disabled={pending || readOnly}
          className="w-full"
          onClick={() => startTransition(async () => onSave(config))}
        >
          {pending ? 'Saving…' : 'Save record behavior'}
        </Button>
      ) : null}
    </div>
  )
}

function TabToggle({ label, help, checked, disabled, onChange }: { label: string; help: string; checked: boolean; disabled: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <Checkbox checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} className="mt-0.5" />
      <span><span className="font-medium text-fg">{label}</span><span className="block text-xs text-fg-muted">{help}</span></span>
    </label>
  )
}

function RoleMultiSelect({ label, help, roles, selected, disabled, onToggle }: { label: string; help: string; roles: { key: string; name: string }[]; selected: Set<string>; disabled: boolean; onToggle: (key: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {roles.length === 0 ? <p className="text-xs text-fg-subtle">No roles are available.</p> : (
        <ul className="space-y-1">
          {roles.map((role) => (
            <li key={role.key}>
              <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-surface-hover">
                <Checkbox checked={selected.has(role.key)} disabled={disabled} onChange={() => onToggle(role.key)} />
                <span className="flex-1 text-fg">{role.name}</span><span className="text-[10px] text-fg-subtle">{role.key}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-fg-subtle">{help}</p>
    </div>
  )
}
