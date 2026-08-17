'use client'

/**
 * Schedule administration: baselines, working calendars, and the resource
 * pool. These are the three things a plan is measured, sized, and staffed
 * against, and they are edited far less often than tasks — hence a dialog
 * rather than permanent chrome.
 */

import { useState } from 'react'
import { Plus, Star, Trash2 } from 'lucide-react'
import { Badge, Button, Checkbox, Dialog, Input, Label, Select, Tabs, cn } from '@braedonsaunders/ui'
import type {
  ScheduleBaseline,
  ScheduleBaselineKind,
  ScheduleCalendar,
  ScheduleResource,
  ScheduleResourceKind,
} from '../types'
import { useSchedulingLabels } from './context'

export interface ScheduleCalendarInput {
  name: string
  description?: string
  workingDays: Record<string, boolean>
  isDefault?: boolean
}

export interface ScheduleResourceInput {
  name: string
  role?: string
  kind: ScheduleResourceKind
  calendarId?: string | null
  defaultUnits: number
  capacityPerDay: number
  costRate?: number
}

export interface ScheduleBaselineInput {
  name: string
  description?: string
  kind: ScheduleBaselineKind
  isPrimary: boolean
}

export interface ScheduleManagementDialogProps {
  open: boolean
  onClose: () => void
  baselines: ScheduleBaseline[]
  calendars: ScheduleCalendar[]
  resources: ScheduleResource[]
  taskCount: number
  onCreateBaseline: (input: ScheduleBaselineInput) => Promise<boolean>
  onDeleteBaseline: (baselineId: string) => Promise<boolean>
  onCreateCalendar: (input: ScheduleCalendarInput) => Promise<boolean>
  onUpdateCalendar: (
    calendarId: string,
    patch: Partial<ScheduleCalendarInput>,
  ) => Promise<boolean>
  onDeleteCalendar: (calendarId: string) => Promise<boolean>
  onCreateResource: (input: ScheduleResourceInput) => Promise<boolean>
  onUpdateResource: (resourceId: string, patch: Partial<ScheduleResourceInput>) => Promise<boolean>
  onDeleteResource: (resourceId: string) => Promise<boolean>
}

/** Mon–Fri, the starting point every new calendar gets. */
const DEFAULT_WORKING_DAYS: Record<string, boolean> = {
  '0': false,
  '1': true,
  '2': true,
  '3': true,
  '4': true,
  '5': true,
  '6': false,
}
const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'] as const

export function ScheduleManagementDialog({
  open,
  onClose,
  baselines,
  calendars,
  resources,
  taskCount,
  onCreateBaseline,
  onDeleteBaseline,
  onCreateCalendar,
  onUpdateCalendar,
  onDeleteCalendar,
  onCreateResource,
  onUpdateResource,
  onDeleteResource,
}: ScheduleManagementDialogProps) {
  const labels = useSchedulingLabels()
  const [tab, setTab] = useState('baselines')

  const [baselineName, setBaselineName] = useState('')
  const [baselineIsPrimary, setBaselineIsPrimary] = useState(baselines.length === 0)

  const [calendarName, setCalendarName] = useState('')
  const [calendarDays, setCalendarDays] = useState<Record<string, boolean>>({
    ...DEFAULT_WORKING_DAYS,
  })

  const [resourceName, setResourceName] = useState('')
  const [resourceKind, setResourceKind] = useState<ScheduleResourceKind>('crew')
  const [resourceCapacity, setResourceCapacity] = useState('1')
  const [resourceCalendarId, setResourceCalendarId] = useState('')

  const weekdayLabel = (key: string) =>
    new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(
      // 2024-01-07 was a Sunday, so index 0..6 maps cleanly onto the week.
      new Date(2024, 0, 7 + Number(key), 12),
    )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      fullHeight
      closeLabel={labels.editor.cancel}
      title={labels.toolbar.manageSchedule}
      description={`${labels.format.taskCount(taskCount)} · ${calendars.length}C / ${resources.length}R`}
    >
      <div data-testid="schedule-management" className="contents">
        <div className="flex min-h-0 flex-1 flex-col px-6 pt-4 pb-6">
          <Tabs
            className="mb-4"
            value={tab}
            onValueChange={setTab}
            tabs={[
              { value: 'baselines', label: labels.toolbar.baseline },
              { value: 'calendars', label: labels.columns.calendar },
              { value: 'resources', label: labels.columns.resources },
            ]}
          />

          <div className="sched-scroll min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            {tab === 'baselines' ? (
              <>
                <List
                  empty={labels.menu.noBaselines}
                  items={baselines.map((baseline) => ({
                    id: baseline.id,
                    title: baseline.name,
                    subtitle: baseline.isPrimary ? labels.menu.primary : labels.menu.snapshot,
                    badge: baseline.isPrimary ? labels.menu.primary : undefined,
                    onDelete: () => void onDeleteBaseline(baseline.id),
                    deleteLabel: labels.editor.delete,
                  }))}
                />
                <Creator
                  title={labels.menu.saveBaseline}
                  disabled={!baselineName.trim()}
                  onCreate={async () => {
                    const created = await onCreateBaseline({
                      name: baselineName.trim(),
                      kind: baselineIsPrimary ? 'primary' : 'snapshot',
                      isPrimary: baselineIsPrimary,
                    })
                    if (created) setBaselineName('')
                  }}
                  createLabel={labels.menu.saveBaseline}
                >
                  <Input
                    value={baselineName}
                    onChange={(event) => setBaselineName(event.target.value)}
                    placeholder={labels.toolbar.baseline}
                    aria-label={labels.toolbar.baseline}
                  />
                  <label className="flex items-center gap-2 text-xs text-fg-muted">
                    <Checkbox
                      checked={baselineIsPrimary}
                      onChange={(event) => setBaselineIsPrimary(event.target.checked)}
                    />
                    {labels.menu.primary}
                  </label>
                </Creator>
              </>
            ) : null}

            {tab === 'calendars' ? (
              <>
                <div className="space-y-2">
                  {calendars.length === 0 ? (
                    <Empty>{labels.common.none}</Empty>
                  ) : (
                    calendars.map((calendar) => (
                      <div
                        key={calendar.id}
                        className="rounded-lg border border-border bg-surface px-3 py-3"
                      >
                        <div className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
                            {calendar.name}
                          </span>
                          {calendar.isDefault ? (
                            <Badge variant="secondary">{labels.menu.primary}</Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void onUpdateCalendar(calendar.id, { isDefault: true })}
                              aria-label={labels.menu.primary}
                              title={labels.menu.primary}
                              className="text-fg-subtle transition-colors hover:text-primary"
                            >
                              <Star className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => void onDeleteCalendar(calendar.id)}
                            aria-label={labels.editor.delete}
                            className="text-fg-subtle transition-colors hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {DAY_KEYS.map((day) => {
                            const working = calendar.workingDays?.[day] !== false
                            return (
                              <button
                                key={day}
                                type="button"
                                aria-pressed={working}
                                onClick={() =>
                                  void onUpdateCalendar(calendar.id, {
                                    workingDays: {
                                      ...DEFAULT_WORKING_DAYS,
                                      ...calendar.workingDays,
                                      [day]: !working,
                                    },
                                  })
                                }
                                className={cn(
                                  'rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                                  working
                                    ? 'bg-primary-subtle text-primary'
                                    : 'bg-bg-subtle text-fg-subtle',
                                )}
                              >
                                {weekdayLabel(day)}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Creator
                  title={labels.columns.calendar}
                  disabled={!calendarName.trim()}
                  onCreate={async () => {
                    const created = await onCreateCalendar({
                      name: calendarName.trim(),
                      workingDays: calendarDays,
                      isDefault: calendars.length === 0,
                    })
                    if (created) {
                      setCalendarName('')
                      setCalendarDays({ ...DEFAULT_WORKING_DAYS })
                    }
                  }}
                  createLabel={labels.columns.calendar}
                >
                  <Input
                    value={calendarName}
                    onChange={(event) => setCalendarName(event.target.value)}
                    placeholder={labels.columns.calendar}
                    aria-label={labels.columns.calendar}
                  />
                  <div className="flex flex-wrap gap-1">
                    {DAY_KEYS.map((day) => {
                      const working = calendarDays[day] !== false
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={working}
                          onClick={() => setCalendarDays((c) => ({ ...c, [day]: !working }))}
                          className={cn(
                            'rounded-md px-2 py-1 text-[10px] font-medium transition-colors',
                            working ? 'bg-primary-subtle text-primary' : 'bg-bg-subtle text-fg-subtle',
                          )}
                        >
                          {weekdayLabel(day)}
                        </button>
                      )
                    })}
                  </div>
                </Creator>
              </>
            ) : null}

            {tab === 'resources' ? (
              <>
                <div className="space-y-2">
                  {resources.length === 0 ? (
                    <Empty>{labels.common.none}</Empty>
                  ) : (
                    resources.map((resource) => (
                      <div
                        key={resource.id}
                        className="grid gap-2 rounded-lg border border-border bg-surface px-3 py-3 md:grid-cols-[minmax(0,1fr)_120px_92px_36px]"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-fg">{resource.name}</p>
                          <p className="text-[11px] text-fg-subtle">
                            {labels.resourceKind[resource.kind]}
                            {resource.role ? ` · ${resource.role}` : ''}
                          </p>
                        </div>
                        <Select
                          value={resource.calendarId ?? ''}
                          onChange={(event) =>
                            void onUpdateResource(resource.id, {
                              calendarId: event.target.value || null,
                            })
                          }
                          aria-label={labels.columns.calendar}
                        >
                          <option value="">{labels.editor.defaultCalendar}</option>
                          {calendars.map((calendar) => (
                            <option key={calendar.id} value={calendar.id}>
                              {calendar.name}
                            </option>
                          ))}
                        </Select>
                        <Input
                          type="number"
                          step="0.25"
                          value={String(resource.capacityPerDay)}
                          aria-label={labels.leveling.capacity}
                          onChange={(event) =>
                            void onUpdateResource(resource.id, {
                              capacityPerDay: Number.parseFloat(event.target.value || '1') || 1,
                            })
                          }
                        />
                        <button
                          type="button"
                          onClick={() => void onDeleteResource(resource.id)}
                          aria-label={labels.editor.delete}
                          className="text-fg-subtle transition-colors hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <Creator
                  title={labels.columns.resources}
                  disabled={!resourceName.trim()}
                  onCreate={async () => {
                    const capacity = Number.parseFloat(resourceCapacity || '1') || 1
                    const created = await onCreateResource({
                      name: resourceName.trim(),
                      kind: resourceKind,
                      calendarId: resourceCalendarId || null,
                      defaultUnits: 1,
                      capacityPerDay: capacity,
                    })
                    if (created) {
                      setResourceName('')
                      setResourceCapacity('1')
                    }
                  }}
                  createLabel={labels.columns.resources}
                >
                  <Input
                    value={resourceName}
                    onChange={(event) => setResourceName(event.target.value)}
                    placeholder={labels.columns.resources}
                    aria-label={labels.columns.resources}
                  />
                  <div className="grid gap-2 md:grid-cols-3">
                    <Select
                      value={resourceKind}
                      onChange={(event) => setResourceKind(event.target.value as ScheduleResourceKind)}
                      aria-label={labels.columns.resources}
                    >
                      {(Object.keys(labels.resourceKind) as ScheduleResourceKind[]).map((kind) => (
                        <option key={kind} value={kind}>
                          {labels.resourceKind[kind]}
                        </option>
                      ))}
                    </Select>
                    <Select
                      value={resourceCalendarId}
                      onChange={(event) => setResourceCalendarId(event.target.value)}
                      aria-label={labels.columns.calendar}
                    >
                      <option value="">{labels.editor.defaultCalendar}</option>
                      {calendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      step="0.25"
                      value={resourceCapacity}
                      aria-label={labels.leveling.capacity}
                      onChange={(event) => setResourceCapacity(event.target.value)}
                    />
                  </div>
                </Creator>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function List({
  items,
  empty,
}: {
  items: Array<{
    id: string
    title: string
    subtitle?: string
    badge?: string
    onDelete: () => void
    deleteLabel: string
  }>
  empty: string
}) {
  if (items.length === 0) return <Empty>{empty}</Empty>
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-fg">{item.title}</p>
            {item.subtitle ? <p className="text-[11px] text-fg-subtle">{item.subtitle}</p> : null}
          </div>
          {item.badge ? <Badge variant="secondary">{item.badge}</Badge> : null}
          <button
            type="button"
            onClick={item.onDelete}
            aria-label={item.deleteLabel}
            className="text-fg-subtle transition-colors hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function Creator({
  title,
  children,
  onCreate,
  createLabel,
  disabled,
}: {
  title: string
  children: React.ReactNode
  onCreate: () => void | Promise<void>
  createLabel: string
  disabled?: boolean
}) {
  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-4">
      <Label>{title}</Label>
      {children}
      <Button variant="secondary" size="sm" disabled={disabled} onClick={() => void onCreate()}>
        <Plus className="h-3.5 w-3.5" />
        {createLabel}
      </Button>
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-fg-subtle">{children}</p>
}
