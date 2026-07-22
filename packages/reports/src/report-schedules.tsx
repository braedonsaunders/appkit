'use client'

import * as React from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, Download, Loader2, Pause, Play, Plus, Search, Trash2, X, Zap } from 'lucide-react'
import { Badge, Button, Input, Label, SearchSelect, Select, Textarea, cn } from '@appkit/ui'
import { parseReportScheduleForm, type ParsedReportScheduleForm } from './schedule-form'
import { REPORT_SCHEDULE_LIMITS } from './schedule-policy'
import { describeReportSchedule, reportScheduleRecipientCount } from './schedule'
import type { ReportSchedule } from './types'

export type ReportScheduleDefinitionOption = {
  id: string
  name: string
  category?: string | null
  kind?: 'built_in' | 'custom'
  description?: string | null
}

export type ReportScheduleMemberOption = { userId: string; name: string; email: string }

export type ReportScheduleRun = {
  id: string
  scheduleId: string
  trigger: 'manual' | 'scheduled' | string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | string
  error?: string | null
  rowCount?: number | null
  startedAt: string | Date
  finishedAt?: string | Date | null
  artifact?: { filename: string; sizeBytes: number; contentType: string; createdAt: string | Date; href?: string } | null
}

export type ReportScheduleFormProps = {
  definitions: ReportScheduleDefinitionOption[]
  members: ReportScheduleMemberOption[]
  initial?: Partial<ReportSchedule>
  defaultTimezone?: string
  submitLabel?: string
  busy?: boolean
  onSubmit: (value: ParsedReportScheduleForm) => void | Promise<void>
  onCancel?: () => void
  extraFooter?: React.ReactNode
  className?: string
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TIMEZONES = ['UTC', 'America/Toronto', 'America/Vancouver', 'America/Edmonton', 'America/Winnipeg', 'America/Halifax', 'America/St_Johns', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney']

/**
 * Complete create/edit schedule form extracted from the production reporting
 * surface. It posts through the same bounded parser as server adapters and
 * retains member recipients, external emails, nth-weekday cadence, date bounds,
 * delivery copy, days-window filtering, and advanced JSON filters.
 */
export function ReportScheduleForm({ definitions, members, initial, defaultTimezone = 'UTC', submitLabel = 'Save schedule', busy = false, onSubmit, onCancel, extraFooter, className }: ReportScheduleFormProps) {
  const timezoneListId = React.useId()
  const [definitionId, setDefinitionId] = React.useState(initial?.definitionId ?? definitions[0]?.id ?? '')
  const definition = definitions.find((item) => item.id === definitionId)
  const [name, setName] = React.useState(initial?.name ?? '')
  const [cadence, setCadence] = React.useState<ReportSchedule['cadence']>(initial?.cadence ?? 'weekly')
  const [monthlyMode, setMonthlyMode] = React.useState<'day' | 'weekday'>(initial?.weekOfMonth ? 'weekday' : 'day')
  const [selectedUsers, setSelectedUsers] = React.useState(() => new Set(initial?.recipientUserIds ?? []))
  const initialFilters = initial?.filters ?? {}
  const [days, setDays] = React.useState(() => typeof initialFilters.days === 'number' ? String(initialFilters.days) : '')
  const [advanced, setAdvanced] = React.useState(() => {
    const { days: _, ...rest } = initialFilters
    return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)

  const { filtersJson, advancedError } = React.useMemo(() => {
    let filters: Record<string, unknown> = {}
    let error: string | null = null
    if (advanced.trim()) {
      try {
        const parsed: unknown = JSON.parse(advanced)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) filters = parsed as Record<string, unknown>
        else error = 'Advanced filters must be a JSON object.'
      } catch (cause) {
        error = `Invalid JSON: ${cause instanceof Error ? cause.message : String(cause)}`
      }
    }
    const numericDays = Number(days)
    if (days.trim() && Number.isFinite(numericDays) && numericDays > 0) filters = { ...filters, days: numericDays }
    return { filtersJson: JSON.stringify(filters), advancedError: error }
  }, [advanced, days])

  function toggleUser(userId: string) {
    setSelectedUsers((current) => {
      const next = new Set(current)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitError(null)
    setSubmitting(true)
    try {
      const value = parseReportScheduleForm(new FormData(event.currentTarget), { defaultTimezone: initial?.timezone ?? defaultTimezone })
      await onSubmit(value)
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : 'The schedule could not be saved.')
    } finally {
      setSubmitting(false)
    }
  }

  return <form onSubmit={(event) => void submit(event)} className={cn('space-y-5', className)}>
    <input type="hidden" name="recipientUserIds" value={[...selectedUsers].join(',')} />
    <input type="hidden" name="filters" value={filtersJson} />

    <Field label="Report" required>
      <SearchSelect value={definitionId} onChange={setDefinitionId} options={definitions.map((item) => ({ value: item.id, label: item.name, hint: item.kind === 'custom' ? 'Custom' : undefined, group: item.category ?? undefined }))} ariaLabel="Report" />
      {definition?.description ? <p className="text-xs text-fg-muted">{definition.description}</p> : null}
      <input type="hidden" name="definitionId" value={definitionId} />
    </Field>
    <Field label="Schedule name" required><Input name="name" required maxLength={REPORT_SCHEDULE_LIMITS.nameChars} value={name} onChange={(event) => setName(event.target.value)} placeholder={definition ? `${definition.name} — ${cadence}` : 'Schedule name'} /></Field>

    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">Cadence</legend>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Frequency"><Select name="cadence" value={cadence} onChange={(event) => setCadence(event.target.value as ReportSchedule['cadence'])}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></Select></Field>
        <Field label="Repeat every"><div className="flex items-center gap-2"><Input name="repeatEvery" type="number" min={1} max={999} required defaultValue={initial?.repeatEvery ?? 1} className="w-20" /><span className="text-xs text-fg-muted">{cadence === 'daily' ? 'days' : cadence === 'weekly' ? 'weeks' : 'months'}</span></div></Field>
        {cadence === 'weekly' ? <Field label="Day of week"><Select name="dayOfWeek" defaultValue={String(initial?.dayOfWeek ?? 1)}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</Select></Field> : null}
        {cadence === 'monthly' ? <Field label="Monthly pattern"><Select name="monthlyMode" value={monthlyMode} onChange={(event) => setMonthlyMode(event.target.value as typeof monthlyMode)}><option value="day">Day of month</option><option value="weekday">Weekday of month</option></Select></Field> : null}
        {cadence === 'monthly' && monthlyMode === 'day' ? <Field label="Day of month"><Input name="dayOfMonth" type="number" min={1} max={31} defaultValue={initial?.dayOfMonth ?? 1} /></Field> : null}
        {cadence === 'monthly' && monthlyMode === 'weekday' ? <><Field label="Week"><Select name="weekOfMonth" defaultValue={String(initial?.weekOfMonth ?? 1)}><option value="1">First</option><option value="2">Second</option><option value="3">Third</option><option value="4">Fourth</option><option value="5">Last</option></Select></Field><Field label="Weekday"><Select name="dayOfWeek" defaultValue={String(initial?.dayOfWeek ?? 1)}>{WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}</Select></Field></> : null}
        <Field label="Time"><div className="flex items-center gap-1"><Input name="hour" type="number" min={0} max={23} required defaultValue={initial?.hour ?? 7} className="w-20" aria-label="Hour" /><span className="text-fg-subtle">:</span><Input name="minute" type="number" min={0} max={59} required defaultValue={initial?.minute ?? 0} className="w-20" aria-label="Minute" /></div></Field>
        <Field label="Timezone"><Input name="timezone" required maxLength={REPORT_SCHEDULE_LIMITS.timezoneChars} defaultValue={initial?.timezone ?? defaultTimezone} list={timezoneListId} /><datalist id={timezoneListId}>{TIMEZONES.map((timezone) => <option key={timezone} value={timezone} />)}</datalist></Field>
        <Field label="Starts on"><Input name="startsOn" type="date" defaultValue={typeof initial?.startsOn === 'string' ? initial.startsOn : ''} /></Field>
        <Field label="Ends on"><Input name="endsOn" type="date" defaultValue={typeof initial?.endsOn === 'string' ? initial.endsOn : ''} /></Field>
      </div>
    </fieldset>

    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">Recipients</legend>
      <div className="space-y-2">
        <Label>Members</Label>
        {selectedUsers.size ? <div className="flex flex-wrap gap-1.5">{[...selectedUsers].map((userId) => { const member = members.find((item) => item.userId === userId); return <span key={userId} className="inline-flex items-center gap-1 rounded-full border border-primary/25 bg-primary-subtle py-0.5 pr-1 pl-2.5 text-xs text-primary"><span>{member?.name ?? userId}</span><button type="button" onClick={() => toggleUser(userId)} aria-label={`Remove ${member?.name ?? 'recipient'}`} className="rounded-full p-0.5 hover:bg-surface-hover"><X size={12} /></button></span> })}</div> : null}
        <SearchSelect value="" onChange={(userId) => userId && toggleUser(userId)} options={members.filter((member) => !selectedUsers.has(member.userId)).map((member) => ({ value: member.userId, label: member.name, hint: member.email }))} placeholder="Add a member" searchPlaceholder="Search members" sheetTitle="Add recipient" ariaLabel="Add member recipient" className="max-w-sm" />
      </div>
      <div className="mt-3 space-y-1.5"><Label>Additional email addresses</Label><Textarea name="recipientEmails" rows={2} maxLength={REPORT_SCHEDULE_LIMITS.recipientEmailListChars} defaultValue={(initial?.recipientEmails ?? []).join(', ')} placeholder="finance@example.com, operations@example.com" /><p className="text-xs text-fg-subtle">Separate email addresses with commas or new lines.</p></div>
    </fieldset>

    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">Email</legend>
      <div className="space-y-3"><Field label="Subject"><Input name="emailSubject" maxLength={REPORT_SCHEDULE_LIMITS.emailSubjectChars} defaultValue={initial?.emailSubject ?? ''} placeholder="Optional custom subject" /></Field><Field label="Message"><Textarea name="emailMessage" rows={4} maxLength={REPORT_SCHEDULE_LIMITS.emailMessageChars} defaultValue={initial?.emailMessage ?? ''} placeholder="Optional message above the report attachment" /></Field></div>
    </fieldset>

    <fieldset className="rounded-lg border border-border p-3">
      <legend className="px-1 text-xs font-semibold tracking-wide text-fg-muted uppercase">Report filters</legend>
      <div className="flex flex-wrap items-end gap-3"><Field label="Rolling days"><Input type="number" min={1} max={365} value={days} onChange={(event) => setDays(event.target.value)} placeholder="30" className="w-36" /></Field><p className="pb-2 text-xs text-fg-subtle">Leave blank to use the report definition without a rolling window.</p></div>
      <details className="mt-2"><summary className="cursor-pointer text-xs text-fg-muted hover:text-primary">Advanced JSON filters</summary><Textarea rows={4} maxLength={REPORT_SCHEDULE_LIMITS.filtersChars} value={advanced} onChange={(event) => setAdvanced(event.target.value)} placeholder={'{\n  "status": "active"\n}'} className="mt-2 font-mono text-xs" />{advancedError ? <p className="mt-1 text-xs text-danger">{advancedError}</p> : null}</details>
    </fieldset>

    {submitError ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-3 py-2 text-sm text-danger">{submitError}</div> : null}
    <div className="flex items-center justify-between gap-3"><div>{extraFooter}</div><div className="flex items-center gap-2">{onCancel ? <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button> : null}<Button type="submit" disabled={busy || submitting || Boolean(advancedError)}>{busy || submitting ? <Loader2 className="size-4 animate-spin" /> : null}{submitLabel}</Button></div></div>
  </form>
}

export type ReportScheduleListProps = {
  schedules: ReportSchedule[]
  definitions?: ReportScheduleDefinitionOption[]
  query?: string
  status?: 'all' | 'active' | 'paused'
  total?: number
  page?: number
  perPage?: number
  canManage?: boolean
  onQueryChange?: (query: string) => void
  onStatusChange?: (status: 'all' | 'active' | 'paused') => void
  onPageChange?: (page: number) => void
  onCreate?: () => void
  onOpen?: (schedule: ReportSchedule) => void
  onToggle?: (schedule: ReportSchedule) => void | Promise<void>
  onRun?: (schedule: ReportSchedule) => void | Promise<void>
  onDelete?: (schedule: ReportSchedule) => void | Promise<void>
}

/** Searchable, filterable, paged production schedule register. */
export function ReportScheduleList({ schedules, definitions = [], query = '', status = 'all', total = schedules.length, page = 1, perPage = 25, canManage = true, onQueryChange, onStatusChange, onPageChange, onCreate, onOpen, onToggle, onRun, onDelete }: ReportScheduleListProps) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-52 flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" /><Input type="search" value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder="Search schedules" className="pl-8" /></div><Select value={status} onChange={(event) => onStatusChange?.(event.target.value as typeof status)} className="w-36"><option value="all">All schedules</option><option value="active">Active</option><option value="paused">Paused</option></Select>{canManage && onCreate ? <Button type="button" onClick={onCreate}><Plus size={14} />New schedule</Button> : null}</div>
    {schedules.length === 0 ? <div className="grid min-h-48 place-items-center rounded-lg border border-dashed border-border bg-surface p-6 text-center"><div><CalendarClock className="mx-auto mb-2 size-7 text-fg-subtle" /><h3 className="text-sm font-semibold text-fg">No schedules found</h3><p className="mt-1 text-sm text-fg-muted">Create recurring delivery for any saved report.</p></div></div> : <div className="app-scroll overflow-x-auto rounded-lg border border-border bg-surface"><table className="w-full min-w-[58rem] text-sm"><thead className="bg-bg-subtle text-left text-xs text-fg-muted"><tr><th className="px-3 py-2 font-medium">Schedule</th><th className="px-3 py-2 font-medium">Report</th><th className="px-3 py-2 font-medium">Cadence</th><th className="px-3 py-2 font-medium">Recipients</th><th className="px-3 py-2 font-medium">Next run</th><th className="px-3 py-2 font-medium">Last run</th><th className="px-3 py-2 font-medium">Status</th><th className="w-36 px-3 py-2" /></tr></thead><tbody>{schedules.map((schedule) => { const definition = definitions.find((item) => item.id === schedule.definitionId); return <tr key={schedule.id} className="border-t border-border-subtle"><td className="px-3 py-2">{onOpen ? <button type="button" onClick={() => onOpen(schedule)} className="text-left font-medium text-fg hover:text-primary hover:underline">{schedule.name}</button> : <span className="font-medium text-fg">{schedule.name}</span>}</td><td className="px-3 py-2 text-fg-muted">{definition?.name ?? schedule.definitionId}</td><td className="px-3 py-2 text-fg-muted">{describeReportSchedule(schedule)}</td><td className="px-3 py-2 text-fg-muted">{reportScheduleRecipientCount(schedule) || '—'}</td><td className="px-3 py-2 text-fg-muted">{formatDate(schedule.nextRunAt)}</td><td className="px-3 py-2 text-fg-muted">{formatDate(schedule.lastRunAt)}</td><td className="px-3 py-2"><Badge variant={schedule.active ? 'success' : 'secondary'}>{schedule.active ? 'Active' : 'Paused'}</Badge></td><td className="px-3 py-2"><div className="flex justify-end gap-1">{canManage && onRun ? <IconButton label="Run now" onClick={() => void onRun(schedule)}><Zap size={14} /></IconButton> : null}{canManage && onToggle ? <IconButton label={schedule.active ? 'Pause' : 'Resume'} onClick={() => void onToggle(schedule)}>{schedule.active ? <Pause size={14} /> : <Play size={14} />}</IconButton> : null}{canManage && onDelete ? <IconButton label="Delete" danger onClick={() => void onDelete(schedule)}><Trash2 size={14} /></IconButton> : null}</div></td></tr> })}</tbody></table></div>}
    {total > perPage ? <div className="flex items-center justify-between text-xs text-fg-muted"><span>{total} schedules</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}><ChevronLeft size={14} />Previous</Button><span>Page {page} of {pages}</span><Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange?.(page + 1)}>Next<ChevronRight size={14} /></Button></div></div> : null}
  </div>
}

export type ReportRunHistoryProps = {
  runs: ReportScheduleRun[]
  total?: number
  page?: number
  perPage?: number
  query?: string
  status?: 'all' | 'queued' | 'running' | 'succeeded' | 'failed'
  onQueryChange?: (query: string) => void
  onStatusChange?: (status: NonNullable<ReportRunHistoryProps['status']>) => void
  onPageChange?: (page: number) => void
  onOpen?: (run: ReportScheduleRun) => void
  renderArtifactLink?: (run: ReportScheduleRun, content: React.ReactNode) => React.ReactNode
}

/** Paged production run history with status/error/artifact fidelity. */
export function ReportRunHistory({ runs, total = runs.length, page = 1, perPage = 25, query = '', status = 'all', onQueryChange, onStatusChange, onPageChange, onOpen, renderArtifactLink }: ReportRunHistoryProps) {
  const pages = Math.max(1, Math.ceil(total / perPage))
  return <div className="space-y-3"><div className="flex flex-wrap items-center gap-2"><div className="relative min-w-52 flex-1 sm:max-w-xs"><Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" /><Input type="search" value={query} onChange={(event) => onQueryChange?.(event.target.value)} placeholder="Search runs" className="pl-8" /></div><Select value={status} onChange={(event) => onStatusChange?.(event.target.value as NonNullable<ReportRunHistoryProps['status']>)} className="w-36"><option value="all">All statuses</option><option value="queued">Queued</option><option value="running">Running</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option></Select></div>
    {runs.length === 0 ? <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-fg-muted">No report runs found.</div> : <div className="app-scroll overflow-x-auto rounded-lg border border-border bg-surface"><table className="w-full min-w-[46rem] text-sm"><thead className="bg-bg-subtle text-left text-xs text-fg-muted"><tr><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Trigger</th><th className="px-3 py-2 font-medium">Rows</th><th className="px-3 py-2 font-medium">Started</th><th className="px-3 py-2 font-medium">Finished</th><th className="px-3 py-2 font-medium">Duration</th><th className="px-3 py-2 font-medium">Output</th></tr></thead><tbody>{runs.map((run) => { const status = <span className="inline-flex items-center gap-2"><RunStatus status={run.status} />{run.error ? <span className="max-w-48 truncate text-xs text-danger" title={run.error}>{run.error}</span> : null}</span>; return <tr key={run.id} className="border-t border-border-subtle"><td className="px-3 py-2">{onOpen ? <button type="button" onClick={() => onOpen(run)} className="hover:underline">{status}</button> : status}</td><td className="px-3 py-2 text-fg-muted">{humanize(run.trigger)}</td><td className="px-3 py-2 tabular-nums text-fg-muted">{run.rowCount ?? '—'}</td><td className="px-3 py-2 text-fg-muted">{formatDate(run.startedAt)}</td><td className="px-3 py-2 text-fg-muted">{formatDate(run.finishedAt)}</td><td className="px-3 py-2 tabular-nums text-fg-muted">{duration(run)}</td><td className="px-3 py-2">{run.artifact ? renderArtifactLink?.(run, <span className="inline-flex items-center gap-1 text-primary hover:underline"><Download size={13} />{run.artifact.filename}</span>) ?? (run.artifact.href ? <a href={run.artifact.href} className="inline-flex items-center gap-1 text-primary hover:underline"><Download size={13} />{run.artifact.filename}</a> : run.artifact.filename) : '—'}</td></tr> })}</tbody></table></div>}
    {total > perPage ? <div className="flex items-center justify-between text-xs text-fg-muted"><span>{total} runs</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange?.(page - 1)}><ChevronLeft size={14} />Previous</Button><span>Page {page} of {pages}</span><Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange?.(page + 1)}>Next<ChevronRight size={14} /></Button></div></div> : null}
  </div>
}

export function ReportRunDetail({ run, schedule, definitionName, onDownload }: { run: ReportScheduleRun; schedule: ReportSchedule; definitionName?: string; onDownload?: (run: ReportScheduleRun) => void }) {
  return <div className="space-y-4">{run.status === 'failed' && run.error ? <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle p-3"><h3 className="text-sm font-semibold text-danger">Report run failed</h3><pre className="mt-2 text-xs whitespace-pre-wrap text-danger">{run.error}</pre></div> : null}<section className="rounded-lg border border-border bg-surface p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-fg">Run details</h3><RunStatus status={run.status} /></div><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Started">{formatDate(run.startedAt)}</Detail><Detail label="Finished">{formatDate(run.finishedAt)}</Detail><Detail label="Duration">{duration(run)}</Detail><Detail label="Rows">{run.rowCount ?? '—'}</Detail><Detail label="Schedule">{schedule.name}</Detail><Detail label="Report">{definitionName ?? schedule.definitionId}</Detail><Detail label="Cadence">{describeReportSchedule(schedule)}</Detail><Detail label="Trigger">{humanize(run.trigger)}</Detail></dl></section>{run.artifact ? <section className="rounded-lg border border-border bg-surface p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-fg">Generated document</h3>{onDownload ? <Button type="button" size="sm" onClick={() => onDownload(run)}><Download size={14} />Download</Button> : run.artifact.href ? <Button asChild size="sm"><a href={run.artifact.href}><Download size={14} />Download</a></Button> : null}</div><dl className="grid gap-3 text-sm sm:grid-cols-2"><Detail label="Filename"><span className="font-mono text-xs">{run.artifact.filename}</span></Detail><Detail label="Size">{Math.round(run.artifact.sizeBytes / 1024)} KB</Detail><Detail label="Content type">{run.artifact.contentType}</Detail><Detail label="Created">{formatDate(run.artifact.createdAt)}</Detail></dl></section> : <section className="rounded-lg border border-border bg-surface p-4"><h3 className="text-sm font-semibold text-fg">Generated document</h3><p className="mt-2 text-sm text-fg-muted">{run.status === 'failed' ? 'No document was generated because the run failed.' : run.status === 'succeeded' ? 'The run completed without a stored artifact.' : 'The document will be available after the run completes.'}</p></section>}</div>
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) { return <div className="space-y-1.5"><Label>{label}{required ? <span className="text-danger"> *</span> : null}</Label>{children}</div> }
function IconButton({ label, danger = false, onClick, children }: { label: string; danger?: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} aria-label={label} title={label} className={cn('grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg', danger && 'hover:bg-danger-subtle hover:text-danger')}>{children}</button> }
function RunStatus({ status }: { status: string }) { const variant = status === 'succeeded' ? 'success' : status === 'running' ? 'warning' : status === 'failed' ? 'destructive' : 'secondary'; return <Badge variant={variant}>{humanize(status)}</Badge> }
function Detail({ label, children }: { label: string; children: React.ReactNode }) { return <div><dt className="text-xs tracking-wide text-fg-muted uppercase">{label}</dt><dd className="mt-0.5 text-fg">{children}</dd></div> }
function humanize(value: string): string { return value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase()) }
function formatDate(value: string | Date | null | undefined): string { if (!value) return '—'; const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) }
function duration(run: ReportScheduleRun): string { if (!run.finishedAt) return '—'; const start = new Date(run.startedAt).getTime(), end = new Date(run.finishedAt).getTime(); if (!Number.isFinite(start) || !Number.isFinite(end)) return '—'; const seconds = Math.max(0, Math.round((end - start) / 1000)); return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s` }
