'use client'

// Production category × channel preference matrix, extracted from the source
// route. Missing rows deliberately render enabled, matching dispatcher
// semantics; save submits the complete bounded matrix in one operation.

import * as React from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button, Checkbox, cn, toast } from '@appkit/ui'
import { NOTIFICATION_CHANNELS, type NotificationCatalog, type NotificationChannel, type NotificationPreference } from './index'

export type NotificationPreferencesAdapter = {
  save(preferences: NotificationPreference[]): Promise<void>
}

export type ProductionNotificationPreferencesCopy = {
  category: string
  channelLabels: Record<NotificationChannel, string>
  saved: string
  saveError: string
  defaultHint: string
  save: string
  saving: string
  cellLabel: (category: string, channel: string) => string
}

const DEFAULT_COPY: ProductionNotificationPreferencesCopy = {
  category: 'Category',
  channelLabels: { in_app: 'In-app', email: 'Email', push: 'Web push', sms: 'SMS' },
  saved: 'Notification preferences saved.',
  saveError: 'Notification preferences could not be saved.',
  defaultHint: 'New notification categories and channels are enabled by default.',
  save: 'Save preferences',
  saving: 'Saving…',
  cellLabel: (category, channel) => `${category}: ${channel}`,
}

export type ProductionNotificationPreferencesProps = {
  catalog: NotificationCatalog
  initial: NotificationPreference[]
  adapter: NotificationPreferencesAdapter
  channels?: NotificationChannel[]
  copy?: Partial<Omit<ProductionNotificationPreferencesCopy, 'channelLabels'>> & { channelLabels?: Partial<Record<NotificationChannel, string>> }
  className?: string
  onSaved?: (preferences: NotificationPreference[]) => void
}

export function ProductionNotificationPreferences({ catalog, initial, adapter, channels = [...NOTIFICATION_CHANNELS], copy: copyOverride, className, onSaved }: ProductionNotificationPreferencesProps) {
  const copy: ProductionNotificationPreferencesCopy = { ...DEFAULT_COPY, ...copyOverride, channelLabels: { ...DEFAULT_COPY.channelLabels, ...copyOverride?.channelLabels } }
  const initialMap = React.useMemo(() => new Map(initial.map((preference) => [`${preference.category}:${preference.channel}`, preference.enabled])), [initial])
  const [state, setState] = React.useState<Record<string, boolean>>(() => buildState(catalog, channels, initialMap))
  const [pending, startTransition] = React.useTransition()
  const toggle = (category: string, channel: NotificationChannel) => setState((current) => ({ ...current, [`${category}:${channel}`]: !(current[`${category}:${channel}`] ?? true) }))
  const save = () => {
    const preferences = catalog.categories.flatMap((category) => channels.map((channel) => ({ category: category.key, channel, enabled: state[`${category.key}:${channel}`] ?? true })))
    startTransition(async () => {
      try {
        await adapter.save(preferences)
        onSaved?.(preferences)
        toast.success(copy.saved)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : copy.saveError)
      }
    })
  }
  return <div className={cn('space-y-4', className)}>
    <div className="overflow-x-auto rounded-lg border border-border bg-surface shadow-sm">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="bg-bg-subtle text-left text-xs uppercase tracking-wider text-fg-muted"><tr><th className="px-4 py-3 font-medium">{copy.category}</th>{channels.map((channel) => <th key={channel} className="px-4 py-3 text-center font-medium">{copy.channelLabels[channel]}</th>)}</tr></thead>
        <tbody className="divide-y divide-border-subtle">{catalog.categories.map((category) => <tr key={category.key}><td className="px-4 py-3 align-top"><span className="block font-medium text-fg">{category.label}</span>{category.description ? <span className="block text-xs text-fg-muted">{category.description}</span> : null}</td>{channels.map((channel) => <td key={channel} className="px-4 py-3 text-center align-top"><span className="inline-flex items-center justify-center"><Checkbox aria-label={copy.cellLabel(category.label, copy.channelLabels[channel])} checked={state[`${category.key}:${channel}`] ?? true} onChange={() => toggle(category.key, channel)} /></span></td>)}</tr>)}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-3"><p className="text-xs text-fg-muted">{copy.defaultHint}</p><Button type="button" onClick={save} disabled={pending}>{pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{pending ? copy.saving : copy.save}</Button></div>
  </div>
}

function buildState(catalog: NotificationCatalog, channels: NotificationChannel[], initial: Map<string, boolean>): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const category of catalog.categories) for (const channel of channels) state[`${category.key}:${channel}`] = initial.get(`${category.key}:${channel}`) ?? true
  return state
}
