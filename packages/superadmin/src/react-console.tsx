'use client'

import * as React from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
  DetailHeader,
  Input,
  Label,
  PageContainer,
  PageHeader,
  Popover,
  RecordList,
  SearchSelect,
  SettingsRow,
  SettingsSection,
  Switch,
  UiLink,
  cn,
  type RecordColumn,
} from '@braedonsaunders/appkit-ui'
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Database,
  Grid2x2,
  KeyRound,
  Mail,
  MessageSquare,
  Plus,
  ScrollText,
  Shield,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { PlatformHubTile } from './nav'
import type { SuperadminActionResult } from './types'

const ICONS: Record<string, LucideIcon> = {
  grid: Grid2x2,
  building: Building2,
  plus: Plus,
  users: Users,
  mail: Mail,
  message: MessageSquare,
  sparkles: Sparkles,
  'circle-dot': CircleDot,
  scroll: ScrollText,
  database: Database,
  shield: Shield,
  key: KeyRound,
  'chevron-right': ChevronRight,
}

function Icon({ iconKey, size = 18 }: { iconKey: string; size?: number }) {
  const Glyph = ICONS[iconKey] ?? Shield
  return <Glyph size={size} />
}

export type PlatformHubProps = {
  title?: string
  description?: string
  tiles: PlatformHubTile[]
  notice?: React.ReactNode
  actions?: React.ReactNode
}

/** Operator overview: the Beacon tile grid, tokenized through AdminHub amber. */
export function PlatformHub({
  title = 'Platform',
  description = 'Deployment-wide tools that sit above every workspace.',
  tiles,
  notice,
  actions,
}: PlatformHubProps) {
  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader title={title} description={description} actions={actions} />
        {notice}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {tiles.map((tile) => (
            <UiLink
              key={tile.id}
              href={tile.href}
              title={tile.description}
              className="group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-sm transition-all hover:border-warning/40 hover:shadow-md"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-warning-subtle text-warning ring-1 ring-warning/15">
                <Icon iconKey={tile.iconKey} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="truncate text-sm font-semibold text-fg">{tile.title}</h3>
                  {tile.detail ? <Badge variant="outline">{tile.detail}</Badge> : null}
                </div>
                <p className="truncate text-xs text-fg-muted">
                  {tile.stat ? `${tile.description} · ${tile.stat}` : tile.description}
                </p>
              </div>
            </UiLink>
          ))}
        </div>
      </div>
    </PageContainer>
  )
}

export type PlatformMenuProps = {
  pathname: string
  platformHref?: string
  tenantHref?: string
  platformLabel?: string
  tenantLabel?: string
  platformDescription?: string
  tenantDescription?: string
  switchLabel?: string
  basePath?: string
}

/** Header workspace switch: tenant application ↔ operator console. */
export function PlatformMenu({
  pathname,
  platformHref = '/platform',
  tenantHref = '/',
  platformLabel = 'Platform',
  tenantLabel = 'Workspace',
  platformDescription = 'Deployment-wide operator tools',
  tenantDescription = 'Modules for the current workspace',
  switchLabel = 'Switch workspace',
  basePath = '/platform',
}: PlatformMenuProps) {
  const [open, setOpen] = React.useState(false)
  const onPlatform = pathname === basePath || pathname.startsWith(`${basePath}/`)
  const options = [
    {
      key: 'tenant',
      href: tenantHref,
      label: tenantLabel,
      description: tenantDescription,
      icon: <Building2 size={15} />,
      active: !onPlatform,
    },
    {
      key: 'platform',
      href: platformHref,
      label: platformLabel,
      description: platformDescription,
      icon: <Shield size={15} />,
      active: onPlatform,
    },
  ]
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="start"
      className="w-64"
      trigger={
        <button
          type="button"
          aria-label={switchLabel}
          aria-expanded={open}
          aria-haspopup="menu"
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm font-medium transition-colors',
            onPlatform
              ? 'border-warning bg-warning-subtle text-warning'
              : 'border-warning/40 bg-warning-subtle/70 text-warning hover:bg-warning-subtle',
          )}
        >
          <Shield size={14} className="shrink-0" />
          <span className="hidden sm:inline">{platformLabel}</span>
          <ChevronDown size={14} className="shrink-0 opacity-70" />
        </button>
      }
    >
      <div className="border-b border-border px-3 py-2 text-xs tracking-wide text-fg-subtle uppercase">
        {switchLabel}
      </div>
      <ul className="py-1" role="menu">
        {options.map((option) => (
          <li key={option.key}>
            <UiLink
              href={option.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-2.5 px-3 py-2 text-sm hover:bg-surface-hover"
            >
              <span className="flex items-start gap-2.5">
                <span className="mt-0.5 text-fg-muted">{option.icon}</span>
                <span className="flex flex-col">
                  <span className="font-medium text-fg">{option.label}</span>
                  <span className="text-xs text-fg-muted">{option.description}</span>
                </span>
              </span>
              {option.active ? <Check size={14} className="mt-0.5 shrink-0 text-warning" /> : null}
            </UiLink>
          </li>
        ))}
      </ul>
    </Popover>
  )
}

export type PolicyMode = 'tenant_optional' | 'global_only' | 'disabled'

export type ProviderFieldSpec = {
  key: string
  kind: 'text' | 'number' | 'boolean' | 'select'
  label: string
  placeholder?: string
  required?: boolean
  options?: { value: string; label: string }[]
  help?: string
}

export type ProviderSpec = {
  value: string
  label: string
  hasSecret?: boolean
  secretLabel?: string
  keyHint?: string
  secretRequired?: boolean
  fields?: ProviderFieldSpec[]
  docsHint?: string
  requiresBaseUrl?: boolean
}

export type ProviderSettingsKind = 'email' | 'sms' | 'ai' | 'custom'

export type ProviderSettingsValues = {
  enabled: boolean
  mode?: PolicyMode
  provider: string
  secret: string
  fields: Record<string, string | boolean>
  fromName?: string
  fromEmail?: string
  replyTo?: string
  fromNumber?: string
  baseUrl?: string
  modelFast?: string
  modelSmart?: string
}

export type ProviderSettingsFormProps = {
  kind: ProviderSettingsKind
  scope: 'platform' | 'tenant'
  specs: ProviderSpec[]
  initial: {
    enabled: boolean
    provider: string
    hasKey: boolean
    mode?: PolicyMode
    fromName?: string
    fromEmail?: string
    replyTo?: string
    fromNumber?: string
    baseUrl?: string
    modelFast?: string
    modelSmart?: string
    fields?: Record<string, string | boolean>
  }
  title?: string
  description?: string
  submitLabel?: string
  onSubmit: (values: ProviderSettingsValues) => Promise<SuperadminActionResult>
  test?: React.ReactNode
  onClear?: () => Promise<SuperadminActionResult>
  clearLabel?: string
}

const POLICY_OPTIONS: { value: PolicyMode; label: string; help: string }[] = [
  {
    value: 'tenant_optional',
    label: 'Workspaces choose their own (recommended)',
    help: 'Each workspace may configure its own provider. Workspaces with none fall back to this platform default.',
  },
  {
    value: 'global_only',
    label: 'Force the platform default for all workspaces',
    help: 'Every workspace uses this platform default. Per-workspace provider settings are ignored.',
  },
  {
    value: 'disabled',
    label: 'Disable delivery (kill switch)',
    help: 'Nothing is sent for any workspace. Queued messages are logged as suppressed.',
  },
]

export function ProviderSettingsForm({
  kind,
  scope,
  specs,
  initial,
  title,
  description,
  submitLabel,
  onSubmit,
  test,
  onClear,
  clearLabel = 'Remove key',
}: ProviderSettingsFormProps) {
  const [enabled, setEnabled] = React.useState(initial.enabled)
  const [mode, setMode] = React.useState<PolicyMode>(initial.mode ?? 'tenant_optional')
  const [provider, setProvider] = React.useState(initial.provider)
  const [secret, setSecret] = React.useState('')
  const [fromName, setFromName] = React.useState(initial.fromName ?? '')
  const [fromEmail, setFromEmail] = React.useState(initial.fromEmail ?? '')
  const [replyTo, setReplyTo] = React.useState(initial.replyTo ?? '')
  const [fromNumber, setFromNumber] = React.useState(initial.fromNumber ?? '')
  const [baseUrl, setBaseUrl] = React.useState(initial.baseUrl ?? '')
  const [modelFast, setModelFast] = React.useState(initial.modelFast ?? '')
  const [modelSmart, setModelSmart] = React.useState(initial.modelSmart ?? '')
  const [fields, setFields] = React.useState<Record<string, string | boolean>>(initial.fields ?? {})
  const [notice, setNotice] = React.useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  const [busy, startBusy] = React.useTransition()
  const spec = specs.find((item) => item.value === provider) ?? specs[0]
  const platformLive = scope === 'platform' && mode !== 'disabled'
  const requiresComplete = scope === 'platform' ? platformLive : enabled

  async function save() {
    if (!spec) return
    setNotice(null)
    const result = await onSubmit({
      enabled: scope === 'platform' ? mode !== 'disabled' : enabled,
      mode: scope === 'platform' ? mode : undefined,
      provider: spec.value,
      secret,
      fields,
      fromName,
      fromEmail,
      replyTo,
      fromNumber,
      baseUrl,
      modelFast,
      modelSmart,
    })
    setNotice({
      tone: result.ok ? 'success' : 'error',
      message: result.message ?? (result.ok ? 'Settings saved.' : 'Could not save settings.'),
    })
    if (result.ok) setSecret('')
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl space-y-4">
        <DetailHeader
          back={{ href: '/platform', label: 'Back to platform' }}
          title={title ?? (scope === 'platform' ? 'Platform default — all workspaces' : 'Workspace provider')}
          subtitle={description}
        />
        {notice ? (
          <div
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              notice.tone === 'error'
                ? 'border-danger/30 bg-danger-subtle text-danger'
                : 'border-success/30 bg-success-subtle text-success',
            )}
          >
            {notice.message}
          </div>
        ) : null}
        <SettingsSection
          title={title ?? 'Provider'}
          description={description}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              {onClear && initial.hasKey ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    startBusy(async () => {
                      const result = await onClear()
                      setNotice({
                        tone: result.ok ? 'success' : 'error',
                        message: result.message ?? (result.ok ? 'Key removed.' : 'Could not remove key.'),
                      })
                    })
                  }
                >
                  {clearLabel}
                </Button>
              ) : null}
              <Button type="button" disabled={busy || !spec} onClick={() => startBusy(() => save())}>
                {submitLabel ?? (scope === 'platform' ? 'Save platform settings' : 'Save settings')}
              </Button>
            </div>
          }
        >
          {scope === 'tenant' ? (
            <SettingsRow title="Enabled" description="Turn this provider on for the current workspace.">
              <Switch checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            </SettingsRow>
          ) : (
            <SettingsRow title="Policy" description={POLICY_OPTIONS.find((option) => option.value === mode)?.help} stacked>
              <SearchSelect
                value={mode}
                onChange={(value) => setMode(value as PolicyMode)}
                options={POLICY_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
                sheetTitle="Policy"
                ariaLabel="Policy"
              />
            </SettingsRow>
          )}
          <SettingsRow title="Provider" description={spec?.docsHint} stacked>
            <SearchSelect
              value={provider}
              onChange={setProvider}
              options={specs.map((item) => ({ value: item.value, label: item.label }))}
              sheetTitle="Provider"
              ariaLabel="Provider"
            />
          </SettingsRow>
          {kind === 'email' ? (
            <>
              <SettingsRow title="From name" stacked>
                <Input value={fromName} onChange={(event) => setFromName(event.target.value)} maxLength={128} />
              </SettingsRow>
              <SettingsRow title="From email" stacked>
                <Input
                  type="email"
                  value={fromEmail}
                  onChange={(event) => setFromEmail(event.target.value)}
                  required={requiresComplete}
                  maxLength={254}
                />
              </SettingsRow>
              <SettingsRow title="Reply-to" description="Optional" stacked>
                <Input type="email" value={replyTo} onChange={(event) => setReplyTo(event.target.value)} maxLength={254} />
              </SettingsRow>
            </>
          ) : null}
          {kind === 'sms' ? (
            <SettingsRow title="From number / sender ID" stacked>
              <Input value={fromNumber} onChange={(event) => setFromNumber(event.target.value)} placeholder="+15551234567" />
            </SettingsRow>
          ) : null}
          {kind === 'ai' ? (
            <>
              {spec?.requiresBaseUrl || spec?.value === 'custom' ? (
                <SettingsRow title="Base URL" stacked>
                  <Input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" />
                </SettingsRow>
              ) : null}
              <SettingsRow title="Fast model" stacked>
                <Input value={modelFast} onChange={(event) => setModelFast(event.target.value)} />
              </SettingsRow>
              <SettingsRow title="Smart model" stacked>
                <Input value={modelSmart} onChange={(event) => setModelSmart(event.target.value)} />
              </SettingsRow>
            </>
          ) : null}
          {spec?.hasSecret !== false ? (
            <SettingsRow
              title={spec?.secretLabel ?? 'API key'}
              description={
                initial.hasKey && provider === initial.provider
                  ? 'Saved — type to replace.'
                  : spec?.keyHint
              }
              stacked
            >
              <Input
                type="password"
                autoComplete="off"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                placeholder={initial.hasKey && provider === initial.provider ? '••••••••••••' : spec?.keyHint}
                required={Boolean(requiresComplete && spec?.secretRequired && !(initial.hasKey && provider === initial.provider))}
              />
            </SettingsRow>
          ) : null}
          {(spec?.fields ?? []).map((field) =>
            field.kind === 'boolean' ? (
              <SettingsRow key={field.key} title={field.label} description={field.help}>
                <Checkbox
                  checked={Boolean(fields[field.key])}
                  onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.checked }))}
                />
              </SettingsRow>
            ) : field.kind === 'select' ? (
              <SettingsRow key={field.key} title={field.label} description={field.help} stacked>
                <SearchSelect
                  value={String(fields[field.key] ?? field.options?.[0]?.value ?? '')}
                  onChange={(value) => setFields((current) => ({ ...current, [field.key]: value }))}
                  options={(field.options ?? []).map((option) => ({ value: option.value, label: option.label }))}
                  sheetTitle={field.label}
                />
              </SettingsRow>
            ) : (
              <SettingsRow key={field.key} title={field.label} description={field.help} stacked>
                <Input
                  type={field.kind === 'number' ? 'number' : 'text'}
                  value={String(fields[field.key] ?? '')}
                  onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))}
                  placeholder={field.placeholder}
                  required={requiresComplete && Boolean(field.required)}
                />
              </SettingsRow>
            ),
          )}
        </SettingsSection>
        {test}
      </div>
    </PageContainer>
  )
}

export type DeliveryLogRecord = {
  id: string
  createdAt: Date
  tenantName?: string | null
  recipient: string
  subject?: string | null
  bodyPreview?: string | null
  category?: string | null
  status: string
  provider?: string | null
  errorMessage?: string | null
  href?: string
}

export type DeliveryLogAdminProps = {
  kind: 'email' | 'sms'
  rows: DeliveryLogRecord[]
  title?: string
  description?: string
  statuses?: string[]
}

const STATUS_VARIANT: Record<string, 'success' | 'destructive' | 'warning' | 'secondary' | 'outline'> = {
  sent: 'success',
  queued: 'outline',
  failed: 'destructive',
  bounced: 'destructive',
  suppressed: 'warning',
  skipped: 'secondary',
  uncertain: 'warning',
  opened: 'success',
}

export function DeliveryLogAdmin({
  kind,
  rows,
  title,
  description,
  statuses,
}: DeliveryLogAdminProps) {
  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState('all')
  const statusValues = statuses ?? [...new Set(rows.map((row) => row.status))]
  const filtered = rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return true
    return [row.recipient, row.subject, row.bodyPreview, row.tenantName, row.category, row.provider]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase().includes(needle))
  })
  const columns = React.useMemo<RecordColumn<DeliveryLogRecord>[]>(
    () => [
      {
        key: 'createdAt',
        label: 'When',
        render: (row) => (
          <span className="whitespace-nowrap text-fg-muted">
            {row.createdAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </span>
        ),
      },
      {
        key: 'recipient',
        label: 'Recipient',
        render: (row) => <span className="text-fg">{row.recipient}</span>,
      },
      {
        key: kind === 'email' ? 'subject' : 'bodyPreview',
        label: kind === 'email' ? 'Subject' : 'Body',
        render: (row) => (
          <div>
            <div className="truncate text-fg">{kind === 'email' ? row.subject || '—' : row.bodyPreview || '—'}</div>
            {row.category ? <div className="text-xs text-fg-muted">{row.category}</div> : null}
          </div>
        ),
      },
      {
        key: 'status',
        label: 'Status',
        render: (row) => <Badge variant={STATUS_VARIANT[row.status] ?? 'secondary'}>{row.status}</Badge>,
      },
      {
        key: 'tenantName',
        label: 'Workspace',
        render: (row) => <span className="text-fg-muted">{row.tenantName ?? 'platform'}</span>,
      },
    ],
    [kind],
  )

  return (
    <PageContainer>
      <div className="flex min-h-0 flex-1 flex-col gap-5">
        <DetailHeader
          back={{ href: '/platform', label: 'Back to platform' }}
          title={title ?? (kind === 'email' ? 'Email log' : 'SMS log')}
          subtitle={description ?? 'Delivery evidence across every workspace.'}
        />
        <RecordList
          columns={columns}
          rows={filtered}
          getRowId={(row) => row.id}
          search={{ value: query, onChange: setQuery, placeholder: 'Search recipient, subject, workspace…' }}
          filters={
            <div className="flex max-w-full overflow-x-auto rounded-lg border border-border bg-surface p-1">
              {['all', ...statusValues].map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    status === value ? 'bg-primary-subtle text-primary' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
          }
          empty={{
            icon: <ScrollText />,
            title: kind === 'email' ? 'No email' : 'No SMS',
            description: 'Nothing has been dispatched yet.',
          }}
        />
      </div>
    </PageContainer>
  )
}

export type MaintenanceTableRow = {
  table: string
  label: string
  prettySize?: string
  rows?: number
  retentionDays: number | null
}

export type MaintenanceLastRun = {
  ok: boolean
  at: Date
  trigger: 'manual' | 'scheduled'
  durationMs: number
  perTable: {
    table: string
    deleted: number
    retentionDays: number | null
    analyzed?: boolean
    error?: string
  }[]
}

export type DatabaseMaintenanceAdminProps = {
  tables: MaintenanceTableRow[]
  lastRun?: MaintenanceLastRun | null
  title?: string
  description?: string
  onSave: (retention: Record<string, number | null>) => Promise<SuperadminActionResult>
  onRun?: () => Promise<SuperadminActionResult>
}

export function DatabaseMaintenanceAdmin({
  tables,
  lastRun,
  title = 'Database maintenance',
  description = 'Retention windows and planner upkeep for high-volume tables.',
  onSave,
  onRun,
}: DatabaseMaintenanceAdminProps) {
  const [retention, setRetention] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(tables.map((table) => [table.table, table.retentionDays == null ? '' : String(table.retentionDays)])),
  )
  const [notice, setNotice] = React.useState<{ tone: 'error' | 'success'; message: string } | null>(null)
  const [busy, startBusy] = React.useTransition()

  return (
    <PageContainer>
      <div className="mx-auto max-w-3xl space-y-4">
        <DetailHeader back={{ href: '/platform', label: 'Back to platform' }} title={title} subtitle={description} />
        {notice ? (
          <div
            role={notice.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'rounded-lg border px-4 py-3 text-sm',
              notice.tone === 'error'
                ? 'border-danger/30 bg-danger-subtle text-danger'
                : 'border-success/30 bg-success-subtle text-success',
            )}
          >
            {notice.message}
          </div>
        ) : null}
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-sm font-semibold text-fg">Retention windows</h2>
              <p className="mt-0.5 text-xs text-fg-muted">Blank or 0 keeps the table forever.</p>
            </div>
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium text-fg-subtle">
                    <th className="px-3 py-2 font-medium">Table</th>
                    <th className="px-3 py-2 text-right font-medium">Size</th>
                    <th className="px-3 py-2 text-right font-medium">Rows</th>
                    <th className="px-3 py-2 font-medium">Retention (days)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tables.map((table) => (
                    <tr key={table.table}>
                      <td className="px-3 py-2">
                        <div className="font-medium text-fg">{table.label}</div>
                        <div className="font-mono text-xs text-fg-subtle">{table.table}</div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg-muted">{table.prettySize ?? '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                        {table.rows == null ? '—' : table.rows.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="h-9 w-36"
                          value={retention[table.table] ?? ''}
                          onChange={(event) =>
                            setRetention((current) => ({ ...current, [table.table]: event.target.value }))
                          }
                          placeholder="Keep forever"
                          aria-label={`Retention for ${table.label}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2">
              {onRun ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    startBusy(async () => {
                      const result = await onRun()
                      setNotice({
                        tone: result.ok ? 'success' : 'error',
                        message: result.message ?? (result.ok ? 'Maintenance queued.' : 'Could not run maintenance.'),
                      })
                    })
                  }
                >
                  Run maintenance now
                </Button>
              ) : null}
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  startBusy(async () => {
                    const values = Object.fromEntries(
                      tables.map((table) => {
                        const raw = retention[table.table]?.trim() ?? ''
                        if (!raw) return [table.table, null]
                        const days = Number(raw)
                        return [table.table, days > 0 ? days : null]
                      }),
                    )
                    const result = await onSave(values)
                    setNotice({
                      tone: result.ok ? 'success' : 'error',
                      message: result.message ?? (result.ok ? 'Retention saved.' : 'Could not save retention.'),
                    })
                  })
                }
              >
                Save retention
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center gap-2">
              <Database size={15} className="text-fg-muted" />
              <h2 className="text-sm font-semibold text-fg">Last run</h2>
            </div>
            {lastRun ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
                      lastRun.ok ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger',
                    )}
                  >
                    {lastRun.ok ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
                    {lastRun.ok ? 'Succeeded' : 'Failed'}
                  </span>
                  <span className="text-fg-muted">
                    {lastRun.at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                  <span className="text-fg-subtle">
                    {lastRun.trigger === 'manual' ? 'Manual' : 'Scheduled'} · {(lastRun.durationMs / 1000).toFixed(1)}s
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-bg-subtle text-left text-xs font-medium text-fg-subtle">
                        <th className="px-3 py-2 font-medium">Table</th>
                        <th className="px-3 py-2 text-right font-medium">Deleted</th>
                        <th className="px-3 py-2 text-right font-medium">Retention</th>
                        <th className="px-3 py-2 font-medium">Planner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lastRun.perTable.map((row) => (
                        <tr key={row.table}>
                          <td className="px-3 py-2 text-fg">
                            {tables.find((table) => table.table === row.table)?.label ?? row.table}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                            {row.deleted.toLocaleString()}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-fg-muted">
                            {row.retentionDays == null ? 'Forever' : `${row.retentionDays} days`}
                          </td>
                          <td className="px-3 py-2 text-xs text-fg-muted">
                            {row.error ?? (row.analyzed ? 'Analyzed' : '—')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-sm text-fg-muted">Maintenance has not run yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

export type CreateTenantPageProps = {
  onCreate: (input: { name: string; slug: string }) => Promise<SuperadminActionResult>
  title?: string
  description?: string
  extraFields?: React.ReactNode
  cancelHref?: string
}

export function CreateTenantPage({
  onCreate,
  title = 'New tenant',
  description = 'Creates a new workspace. It starts empty — add members from the tenant list.',
  extraFields,
  cancelHref = '/platform/tenants',
}: CreateTenantPageProps) {
  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [slugTouched, setSlugTouched] = React.useState(false)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [busy, startBusy] = React.useTransition()
  const valid = name.trim().length > 0 && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug)

  function suggestSlug(value: string): string {
    return value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 63)
  }

  return (
    <PageContainer>
      <div className="mx-auto max-w-2xl space-y-5">
        <PageHeader title={title} description={description} back={{ href: cancelHref, label: 'Back to tenants' }} />
        {notice ? (
          <div role="alert" className="rounded-lg border border-danger/30 bg-danger-subtle px-4 py-3 text-sm text-danger">
            {notice}
          </div>
        ) : null}
        <Card>
          <CardContent className="space-y-5 pt-6">
            <div className="space-y-2">
              <Label htmlFor="platform-create-tenant-name">Name</Label>
              <Input
                id="platform-create-tenant-name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  if (!slugTouched) setSlug(suggestSlug(event.target.value))
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="platform-create-tenant-slug">Slug</Label>
              <Input
                id="platform-create-tenant-slug"
                value={slug}
                onChange={(event) => {
                  setSlugTouched(true)
                  setSlug(event.target.value.toLocaleLowerCase())
                }}
                placeholder="lowercase-and-hyphens"
              />
              <p className="text-xs text-fg-muted">
                Permanent identifier — lowercase letters, digits, and hyphens.
              </p>
            </div>
            {extraFields}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => { window.location.href = cancelHref }}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={!valid || busy}
                onClick={() =>
                  startBusy(async () => {
                    setNotice(null)
                    const result = await onCreate({ name: name.trim(), slug })
                    if (!result.ok) setNotice(result.message)
                  })
                }
              >
                Create tenant
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  )
}

export { ICONS as PLATFORM_ICONS }
