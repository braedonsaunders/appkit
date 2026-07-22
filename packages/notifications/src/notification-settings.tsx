'use client'

// Faithfully generalized from the production tenant notification cockpit. The
// application supplies its category catalogue, recipients, transport status,
// persistence, and optional detection-schedule terminology; AppKit retains the
// complete routing-policy and per-category authoring behavior.

import * as React from 'react'
import { Plus, X } from 'lucide-react'
import { Button, Label, SearchSelect, Select, UiLink, cn, toast } from '@appkit/ui'
import type {
  NotificationCategorySetting,
  NotificationConfigurationAdapter,
  NotificationConfigurationInput,
  NotificationEscalationStep,
  NotificationPolicyInput,
  NotificationRecipientOption,
  NotificationRoleOption,
  NotificationRoutingCategory,
} from './configuration'
import type { NotificationChannel } from './index'
import { compileCron, decompileCron, isValidCron, SCHEDULE_PRESETS, WEEKDAYS, type SchedulePreset } from './schedule'

export type NotificationChannelAvailability = 'ready' | 'disabled' | 'unconfigured'

export type NotificationSettingsCopy = {
  deliveryStatus: string
  ready: string
  disabledByPlatform: string
  notConfigured: string
  routingPolicy: string
  routingPolicyDescription: string
  digestDelivery: string
  digestOff: string
  digestDaily: string
  digestWeekly: string
  digestHour: string
  digestImmediateHint: string
  quietHours: string
  quietHoursUtc: string
  quietHoursOff: string
  schedule: string
  scheduleDescription: string
  scheduleEnabled: string
  scheduleDisabled: string
  scheduleAt: string
  scheduleTimezone: string
  invalidCron: string
  roles: string
  people: string
  groups: string
  channels: string
  escalation: string
  noRoles: string
  noEscalation: string
  noRecipients: string
  categoryDisabled: string
  addPerson: string
  searchPeople: string
  selectPeople: string
  addGroup: string
  searchGroups: string
  selectGroups: string
  noGroups: string
  after: string
  daysOverdue: string
  removeEscalation: string
  addEscalation: string
  inAppLocked: string
  removeRecipient: (label: string) => string
  enableCategory: (label: string) => string
  saved: string
  unsaved: string
  saving: string
  save: string
  saveError: string
}

const DEFAULT_COPY: NotificationSettingsCopy = {
  deliveryStatus: 'Delivery status', ready: 'ready', disabledByPlatform: 'disabled by platform', notConfigured: 'not set up',
  routingPolicy: 'Routing policy', routingPolicyDescription: 'Control digest delivery, quiet hours, and the schedule used by automatic notification scans.',
  digestDelivery: 'Digest delivery', digestOff: 'Off — send immediately', digestDaily: 'Daily summary', digestWeekly: 'Weekly summary', digestHour: 'at UTC hour', digestImmediateHint: 'Non-critical messages are sent as they occur.',
  quietHours: 'Quiet hours', quietHoursUtc: 'UTC', quietHoursOff: 'Non-critical delivery is not suppressed by time.',
  schedule: 'Automatic scan schedule', scheduleDescription: 'Choose when the application evaluates scheduled notification conditions.', scheduleEnabled: 'Enabled', scheduleDisabled: 'Paused', scheduleAt: 'at', scheduleTimezone: 'timezone', invalidCron: 'Enter a valid five-part cron expression (for example, 0 6 * * *).',
  roles: 'Roles', people: 'People', groups: 'People groups', channels: 'Channels', escalation: 'Escalation', noRoles: 'No roles are available.', noEscalation: 'No escalation steps.', noRecipients: 'Choose at least one role, person, or group.', categoryDisabled: 'Automatic notifications are disabled for this category.',
  addPerson: 'Add a person…', searchPeople: 'Search people…', selectPeople: 'Select people', addGroup: 'Add a group…', searchGroups: 'Search groups…', selectGroups: 'Select groups', noGroups: 'No groups are available.',
  after: 'After', daysOverdue: 'days overdue', removeEscalation: 'Remove escalation', addEscalation: 'Add escalation', inAppLocked: 'always on', removeRecipient: (label) => `Remove ${label}`, enableCategory: (label) => `Enable ${label}`,
  saved: 'All changes saved', unsaved: 'Unsaved changes', saving: 'Saving…', save: 'Save changes', saveError: 'Notification settings could not be saved.',
}

type CategoryConfigMap = Record<string, Omit<NotificationCategorySetting, 'category'>>

const CHANNELS: readonly { key: NotificationChannel; label: string; locked?: boolean }[] = [
  { key: 'in_app', label: 'In-app', locked: true },
  { key: 'email', label: 'Email' },
  { key: 'push', label: 'Push' },
  { key: 'sms', label: 'SMS' },
]

const chipBase = 'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default'
const chipOn = 'border-primary bg-primary-subtle text-primary'
const chipOff = 'border-border text-fg-muted hover:bg-surface-hover hover:text-fg'
const numberInput = 'h-7 w-16 rounded-md border border-border bg-surface px-2 text-center text-sm text-fg outline-none focus:border-primary focus:ring-2 focus:ring-ring/20'

export type NotificationSettingsProps = {
  categories: NotificationRoutingCategory[]
  roles: NotificationRoleOption[]
  members: NotificationRecipientOption[]
  groups: NotificationRecipientOption[]
  initial: Record<string, Omit<NotificationCategorySetting, 'category'>>
  policy: NotificationPolicyInput
  adapter: NotificationConfigurationAdapter
  channelAvailability?: Partial<Record<NotificationChannel, NotificationChannelAvailability>>
  channelSettingsHrefs?: Partial<Record<NotificationChannel, string>>
  showScanSchedule?: boolean
  copy?: Partial<NotificationSettingsCopy>
  className?: string
  onSaved?: (value: NotificationConfigurationInput) => void
}

export function NotificationSettings({
  categories, roles, members, groups, initial, policy, adapter, channelAvailability = {}, channelSettingsHrefs = {},
  showScanSchedule = true, copy: copyOverride, className, onSaved,
}: NotificationSettingsProps) {
  const copy = { ...DEFAULT_COPY, ...copyOverride }
  const availability: Record<NotificationChannel, NotificationChannelAvailability> = {
    in_app: 'ready', email: channelAvailability.email ?? 'unconfigured', push: channelAvailability.push ?? 'ready', sms: channelAvailability.sms ?? 'unconfigured',
  }
  const seed = React.useMemo<CategoryConfigMap>(() => Object.fromEntries(categories.map((category) => [category.key, initial[category.key] ?? {
    enabled: true,
    roleKeys: [...category.defaultRoles],
    userIds: [],
    groupIds: [],
    channels: category.defaultChannels ? [...category.defaultChannels] : ['in_app', 'email'],
    escalation: [],
  }])), [categories, initial])
  const [config, setConfig] = React.useState<CategoryConfigMap>(seed)
  const [currentPolicy, setCurrentPolicy] = React.useState(policy)
  const [baseline, setBaseline] = React.useState(() => serialize(seed, policy))
  const [pending, startTransition] = React.useTransition()
  const [schedule, setSchedule] = React.useState(() => decompileCron(policy.scanCron))
  const dirty = serialize(config, currentPolicy) !== baseline
  const timezones = React.useMemo(() => supportedTimezones(), [])

  const patchCategory = (key: string, next: Partial<CategoryConfigMap[string]>) => setConfig((previous) => ({ ...previous, [key]: { ...previous[key]!, ...next } }))
  const patchPolicy = (next: Partial<NotificationPolicyInput>) => setCurrentPolicy((previous) => ({ ...previous, ...next }))
  const updateSchedule = (next: Partial<ReturnType<typeof decompileCron>>) => {
    const merged = { ...schedule, ...next }
    setSchedule(merged)
    patchPolicy({ scanCron: compileCron(merged.preset, merged.hour, merged.weekday, merged.custom) })
  }
  const save = () => {
    const input: NotificationConfigurationInput = {
      settings: categories.map((category) => ({ category: category.key, ...config[category.key]! })),
      policy: currentPolicy,
    }
    startTransition(async () => {
      try {
        await adapter.save(input)
        setBaseline(serialize(config, currentPolicy))
        onSaved?.(input)
        toast.success(copy.saved)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.saveError)
      }
    })
  }

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border bg-bg-subtle px-3 py-2 text-xs">
        <span className="font-medium text-fg-muted">{copy.deliveryStatus}</span>
        {CHANNELS.map((channel) => <ChannelStatus key={channel.key} label={channel.label} status={availability[channel.key]} href={channelSettingsHrefs[channel.key]} copy={copy} />)}
      </div>

      <section className="rounded-xl border border-border bg-surface shadow-sm">
        <header className="border-b border-border-subtle px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">{copy.routingPolicy}</h3>
          <p className="mt-0.5 text-xs text-fg-muted">{copy.routingPolicyDescription}</p>
        </header>
        <div className="space-y-4 px-4 py-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{copy.digestDelivery}</Label>
              <Select value={currentPolicy.digestMode} onChange={(event) => patchPolicy({ digestMode: event.target.value as NotificationPolicyInput['digestMode'] })}>
                <option value="off">{copy.digestOff}</option><option value="daily">{copy.digestDaily}</option><option value="weekly">{copy.digestWeekly}</option>
              </Select>
              {currentPolicy.digestMode !== 'off' ? <div className="flex items-center gap-2 text-xs text-fg-muted"><span>{copy.digestHour}</span><input type="number" min={0} max={23} value={currentPolicy.digestHourUtc} onChange={(event) => patchPolicy({ digestHourUtc: Number(event.target.value) || 0 })} className={numberInput} /></div> : <p className="text-xs text-fg-subtle">{copy.digestImmediateHint}</p>}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between"><Label>{copy.quietHours}</Label><Toggle checked={Boolean(currentPolicy.quietHours)} onChange={(enabled) => patchPolicy({ quietHours: enabled ? { start: 22, end: 6 } : null })} label={copy.quietHours} /></div>
              {currentPolicy.quietHours ? <div className="flex items-center gap-2 text-xs text-fg-muted"><input type="number" min={0} max={23} value={currentPolicy.quietHours.start} onChange={(event) => patchPolicy({ quietHours: { start: Number(event.target.value) || 0, end: currentPolicy.quietHours!.end } })} className={numberInput} /><span>→</span><input type="number" min={0} max={23} value={currentPolicy.quietHours.end} onChange={(event) => patchPolicy({ quietHours: { start: currentPolicy.quietHours!.start, end: Number(event.target.value) || 0 } })} className={numberInput} /><span>{copy.quietHoursUtc}</span></div> : <p className="text-xs text-fg-subtle">{copy.quietHoursOff}</p>}
            </div>
          </div>
          {showScanSchedule ? <ScheduleEditor policy={currentPolicy} schedule={schedule} timezones={timezones} copy={copy} onPolicy={patchPolicy} onSchedule={updateSchedule} /> : null}
        </div>
      </section>

      {categories.map((category) => {
        const value = config[category.key]!
        const noRecipients = value.roleKeys.length === 0 && value.userIds.length === 0 && value.groupIds.length === 0
        return <section key={category.key} className="rounded-xl border border-border bg-surface shadow-sm">
          <header className="flex items-start justify-between gap-3 p-4"><div className="min-w-0"><h3 className="text-sm font-semibold text-fg">{category.label}</h3><p className="mt-0.5 text-xs text-fg-muted">{category.description}</p></div><Toggle checked={value.enabled} onChange={(enabled) => patchCategory(category.key, { enabled })} label={copy.enableCategory(category.label)} /></header>
          {value.enabled ? <div className="space-y-4 border-t border-border-subtle px-4 py-4">
            <Field label={copy.roles}><RoleChips roles={roles} value={value.roleKeys} onChange={(roleKeys) => patchCategory(category.key, { roleKeys })} empty={copy.noRoles} /></Field>
            <Field label={copy.people}><RecipientPicker options={members} value={value.userIds} onChange={(userIds) => patchCategory(category.key, { userIds })} placeholder={copy.addPerson} searchPlaceholder={copy.searchPeople} sheetTitle={copy.selectPeople} copy={copy} /></Field>
            <Field label={copy.groups}><RecipientPicker options={groups} value={value.groupIds} onChange={(groupIds) => patchCategory(category.key, { groupIds })} placeholder={copy.addGroup} searchPlaceholder={copy.searchGroups} sheetTitle={copy.selectGroups} emptyHint={copy.noGroups} copy={copy} /></Field>
            <Field label={copy.channels}><ChannelChips value={value.channels} onChange={(channels) => patchCategory(category.key, { channels })} availability={availability} copy={copy} /></Field>
            <Field label={copy.escalation}><EscalationEditor roles={roles} value={value.escalation} onChange={(escalation) => patchCategory(category.key, { escalation })} copy={copy} /></Field>
            {noRecipients ? <p className="text-xs text-warning">{copy.noRecipients}</p> : null}
          </div> : <div className="border-t border-border-subtle px-4 py-3 text-xs text-fg-subtle">{copy.categoryDisabled}</div>}
        </section>
      })}

      <div className="sticky bottom-0 z-10 -mx-1 flex items-center justify-between gap-3 border-t border-border bg-surface/90 px-1 py-3 backdrop-blur">
        <p className="text-xs text-fg-muted">{dirty ? copy.unsaved : copy.saved}</p>
        <Button onClick={save} disabled={pending || !dirty}>{pending ? copy.saving : copy.save}</Button>
      </div>
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-primary' : 'bg-border-strong')}><span className={cn('absolute left-0.5 top-0.5 size-5 rounded-full bg-surface shadow-sm transition-transform', checked && 'translate-x-5')} /></button>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}</Label>{children}</div> }

function RoleChips({ roles, value, onChange, empty }: { roles: NotificationRoleOption[]; value: string[]; onChange: (next: string[]) => void; empty: string }) {
  if (!roles.length) return <p className="text-xs text-fg-subtle">{empty}</p>
  return <div className="flex flex-wrap gap-1.5">{roles.map((role) => { const active = value.includes(role.key); return <button key={role.key} type="button" aria-pressed={active} onClick={() => onChange(active ? value.filter((key) => key !== role.key) : [...value, role.key])} className={cn(chipBase, active ? chipOn : chipOff)}>{role.name}</button> })}</div>
}

function ChannelChips({ value, onChange, availability, copy }: { value: NotificationChannel[]; onChange: (next: NotificationChannel[]) => void; availability: Record<NotificationChannel, NotificationChannelAvailability>; copy: NotificationSettingsCopy }) {
  return <div className="flex flex-wrap gap-1.5">{CHANNELS.map((channel) => { const active = channel.locked || value.includes(channel.key); const status = availability[channel.key]; return <button key={channel.key} type="button" disabled={channel.locked} aria-pressed={active} title={status === 'ready' ? undefined : `${channel.label} ${status === 'disabled' ? copy.disabledByPlatform : copy.notConfigured}`} onClick={() => channel.locked ? undefined : onChange(active ? value.filter((key) => key !== channel.key) : [...value, channel.key])} className={cn(chipBase, active ? chipOn : chipOff, status !== 'ready' && 'border-warning text-warning')}>{channel.label}{channel.locked ? ` · ${copy.inAppLocked}` : status !== 'ready' ? ` · ${status === 'disabled' ? copy.disabledByPlatform : copy.notConfigured}` : ''}</button> })}</div>
}

function ChannelStatus({ label, status, href, copy }: { label: string; status: NotificationChannelAvailability; href?: string; copy: NotificationSettingsCopy }) {
  const ready = status === 'ready'
  const content = <span className="inline-flex items-center gap-1.5"><span className={cn('size-1.5 rounded-full', ready ? 'bg-success' : 'bg-warning')} /><span className={ready ? 'text-fg-muted' : 'text-warning'}>{label}{ready ? '' : ` — ${status === 'disabled' ? copy.disabledByPlatform : copy.notConfigured}`}</span></span>
  return status === 'unconfigured' && href ? <UiLink href={href} className="hover:underline">{content}</UiLink> : content
}

function RecipientPicker({ options, value, onChange, placeholder, searchPlaceholder, sheetTitle, emptyHint, copy }: { options: NotificationRecipientOption[]; value: string[]; onChange: (next: string[]) => void; placeholder: string; searchPlaceholder: string; sheetTitle: string; emptyHint?: string; copy: NotificationSettingsCopy }) {
  const available = React.useMemo(() => options.filter((option) => !value.includes(option.value)), [options, value])
  const selected = value.map((id) => options.find((option) => option.value === id)).filter((option): option is NotificationRecipientOption => Boolean(option))
  if (!options.length && emptyHint) return <p className="text-xs text-fg-subtle">{emptyHint}</p>
  return <div className="space-y-2"><SearchSelect value="" onChange={(id) => id && onChange([...value, id])} options={available} placeholder={placeholder} searchPlaceholder={searchPlaceholder} sheetTitle={sheetTitle} />{selected.length ? <div className="flex flex-wrap gap-1.5">{selected.map((option) => <span key={option.value} className="inline-flex items-center gap-1 rounded-full bg-primary-subtle py-1 pl-2.5 pr-1 text-xs font-medium text-primary">{option.label}<button type="button" aria-label={copy.removeRecipient(option.label)} onClick={() => onChange(value.filter((id) => id !== option.value))} className="rounded-full p-0.5 hover:bg-primary/10"><X size={12} /></button></span>)}</div> : null}</div>
}

function EscalationEditor({ roles, value, onChange, copy }: { roles: NotificationRoleOption[]; value: NotificationEscalationStep[]; onChange: (next: NotificationEscalationStep[]) => void; copy: NotificationSettingsCopy }) {
  const patch = (index: number, next: Partial<NotificationEscalationStep>) => onChange(value.map((step, position) => position === index ? { ...step, ...next } : step))
  return <div className="space-y-2">{!value.length ? <p className="text-xs text-fg-subtle">{copy.noEscalation}</p> : null}{value.map((step, index) => <div key={index} className="rounded-lg border border-border p-2.5"><div className="flex items-center gap-2 text-xs text-fg-muted"><span>{copy.after}</span><input type="number" min={1} max={365} value={step.afterDays} onChange={(event) => patch(index, { afterDays: Number(event.target.value) || 1 })} className={numberInput} /><span>{copy.daysOverdue}</span><button type="button" aria-label={copy.removeEscalation} onClick={() => onChange(value.filter((_, position) => position !== index))} className="ml-auto rounded p-1 text-fg-subtle hover:bg-danger-subtle hover:text-danger"><X size={14} /></button></div><div className="mt-2"><RoleChips roles={roles} value={step.roleKeys} onChange={(roleKeys) => patch(index, { roleKeys })} empty={copy.noRoles} /></div></div>)}<button type="button" onClick={() => onChange([...value, { afterDays: 3, roleKeys: [] }])} className="inline-flex items-center gap-1 rounded-md px-1 py-1 text-xs font-medium text-primary hover:underline"><Plus size={13} />{copy.addEscalation}</button></div>
}

function ScheduleEditor({ policy, schedule, timezones, copy, onPolicy, onSchedule }: { policy: NotificationPolicyInput; schedule: ReturnType<typeof decompileCron>; timezones: string[]; copy: NotificationSettingsCopy; onPolicy: (next: Partial<NotificationPolicyInput>) => void; onSchedule: (next: Partial<ReturnType<typeof decompileCron>>) => void }) {
  return <div className="space-y-1.5 border-t border-border-subtle pt-4"><div className="flex items-center justify-between gap-3"><Label>{copy.schedule}</Label><div className="flex items-center gap-2"><span className="text-xs font-medium text-fg-muted">{policy.scanEnabled ? copy.scheduleEnabled : copy.scheduleDisabled}</span><Toggle checked={policy.scanEnabled} onChange={(scanEnabled) => onPolicy({ scanEnabled })} label={copy.schedule} /></div></div><p className="text-xs text-fg-muted">{copy.scheduleDescription}</p><div className={cn('flex flex-wrap items-center gap-2 pt-1', !policy.scanEnabled && 'pointer-events-none opacity-50')} aria-disabled={!policy.scanEnabled}><Select value={schedule.preset} onChange={(event) => onSchedule({ preset: event.target.value as SchedulePreset })} className="w-40" disabled={!policy.scanEnabled}>{SCHEDULE_PRESETS.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}</Select>{['daily', 'twice_daily', 'weekly'].includes(schedule.preset) ? <div className="flex items-center gap-1.5 text-xs text-fg-muted"><span>{copy.scheduleAt}</span><input type="number" min={0} max={23} value={schedule.hour} onChange={(event) => onSchedule({ hour: Number(event.target.value) || 0 })} className={numberInput} /><span>:00</span></div> : null}{schedule.preset === 'weekly' ? <Select value={String(schedule.weekday)} onChange={(event) => onSchedule({ weekday: Number(event.target.value) })} className="w-36">{WEEKDAYS.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}</Select> : null}{schedule.preset === 'custom' ? <input type="text" spellCheck={false} value={schedule.custom} onChange={(event) => onSchedule({ custom: event.target.value })} placeholder="0 6 * * *" className="h-7 w-40 rounded-md border border-border bg-surface px-2 font-mono text-sm text-fg outline-none focus:border-primary focus:ring-2 focus:ring-ring/20" /> : null}<span className="text-xs text-fg-subtle">{copy.scheduleTimezone}</span><Select value={policy.scanTimezone} onChange={(event) => onPolicy({ scanTimezone: event.target.value })} className="w-56">{timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}</Select></div>{schedule.preset === 'custom' && !isValidCron(schedule.custom) ? <p className="text-xs text-danger">{copy.invalidCron}</p> : null}</div>
}

function supportedTimezones(): string[] {
  try {
    const zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? []
    return ['UTC', ...zones.filter((timezone) => timezone !== 'UTC')]
  } catch { return ['UTC'] }
}

function serialize(config: CategoryConfigMap, policy: NotificationPolicyInput): string { return JSON.stringify({ config, policy }) }
