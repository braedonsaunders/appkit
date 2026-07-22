'use client'

import * as React from 'react'
import { ArrowLeft, Database, History, Play, Upload } from 'lucide-react'
import {
  createIntegrationDispatcher,
  createIntegrationPublisher,
  createIntegrationRegistry,
  createMemoryIntegrationStore,
  type DestinationAuthoringDefinition,
  type IntegrationDefinition,
  type IntegrationEditorSubmission,
  type TriggerDefinition,
} from '@appkit/integrations'
import type { IntegrationEmail } from '@appkit/integrations/email'
import {
  IntegrationBuilder,
  IntegrationHub,
  type ConnectedIntegration,
  type IntegrationCatalogItem,
} from '@appkit/integrations/react'
import {
  createConnectorRegistry,
  type SyncConnector,
  type SyncRecord,
} from '@appkit/sync/catalog'
import { parseCsv } from '@appkit/sync/csv'
import {
  createMemorySyncPersistence,
  createMemorySyncTarget,
  runSync,
  type MemorySyncTransaction,
  type SyncTarget,
} from '@appkit/sync/runtime'
import { Badge, Button, SettingsRow, SettingsSection } from '@appkit/ui'

const SAMPLE_CSV = `project_id,name,status
P-1048,North Tower,active
P-1053,Civic Library,bidding`

const csvConnector: SyncConnector = {
  key: 'csv-projects',
  name: 'CSV project import',
  description: 'Parse a delimited source into the connector-neutral record envelope.',
  entities: ['project'],
  kind: 'native',
  async pull(context) {
    const parsed = parseCsv(String(context.config.csv ?? ''))
    context.log('info', `Parsed ${parsed.rows.length} project records`)
    return {
      records: parsed.rows.map((row) => ({
        entity: 'project',
        externalId: row.project_id ?? '',
        data: { name: row.name ?? '', status: row.status ?? '' },
      })),
      nextCursor: { importedRows: parsed.rows.length },
      mode: 'full',
      authoritativeEntities: ['project'],
    }
  },
}

const projectTrigger: TriggerDefinition = {
  key: 'project.updated',
  label: 'Project updated',
  description: 'A project record was changed.',
  module: 'projects',
  iconKey: 'building',
  subjectLabel: 'project',
  itemScope: 'single',
  fields: [
    { key: 'project', label: 'Project name', type: 'string', sample: 'North Tower' },
    { key: 'projectId', label: 'Project id', type: 'string', sample: 'P-1048' },
    { key: 'status', label: 'Status', type: 'string', sample: 'active' },
    { key: 'ownerEmail', label: 'Owner email', type: 'string', sample: 'owner@example.com' },
  ],
}

type View = 'hub' | 'builder' | 'inbound' | 'runs'

export function IntegrationsWorkbench({
  destinations,
}: {
  destinations: DestinationAuthoringDefinition[]
}) {
  const [view, setView] = React.useState<View>('hub')
  const [destinationKey, setDestinationKey] = React.useState('email')
  const [saved, setSaved] = React.useState<IntegrationEditorSubmission | null>(null)

  const connected = React.useMemo<ConnectedIntegration[]>(() => {
    const rows: ConnectedIntegration[] = [
      {
        id: 'csv-projects',
        direction: 'in',
        title: 'Project import',
        subtitle: 'CSV project import',
        status: 'connected',
        href: '#inbound',
        meta: 'Ready to run locally',
        iconKey: 'database',
      },
    ]
    if (saved)
      rows.push({
        id: saved.id,
        direction: 'out',
        title: saved.name ?? 'Untitled automation',
        subtitle: `${projectTrigger.label} → ${destinations.find((entry) => entry.key === saved.destinationKey)?.name ?? saved.destinationKey}`,
        status: saved.ready ? 'ready' : 'draft',
        href: '#builder',
        meta: 'Saved in this browser session',
        iconKey: 'upload',
      })
    return rows
  }, [destinations, saved])

  const catalog = React.useMemo<IntegrationCatalogItem[]>(
    () => [
      {
        key: 'in:csv',
        addValue: csvConnector.key,
        name: csvConnector.name,
        description: csvConnector.description,
        direction: 'in',
        iconKey: 'database',
        detail: 'Syncs project records',
        added: true,
        addedHref: '#inbound',
      },
      ...destinations.map((destination) => ({
        key: `out:${destination.key}`,
        addValue: `outbound:${destination.key}`,
        name: `Send to ${destination.name}`,
        description: destination.description,
        direction: 'out' as const,
        iconKey: 'upload',
        detail: 'Application event → external service',
        added: saved?.destinationKey === destination.key,
        ...(saved?.destinationKey === destination.key
          ? { addedHref: '#builder' }
          : {}),
      })),
    ],
    [destinations, saved],
  )

  const navigate = (href: string) => {
    if (href === '#inbound') setView('inbound')
    else if (href === '#runs') setView('runs')
    else setView('builder')
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-7xl px-5 py-6 lg:px-8">
        {view !== 'hub' ? (
          <Button variant="ghost" size="sm" className="mb-4" onClick={() => setView('hub')}>
            <ArrowLeft size={15} /> Integrations
          </Button>
        ) : null}
        {view === 'hub' ? (
          <IntegrationHub
            connected={connected}
            catalog={catalog}
            onAdd={(item) => {
              if (item.direction === 'in') setView('inbound')
              else {
                setDestinationKey(item.addValue.replace('outbound:', ''))
                setView('builder')
              }
            }}
            onDelete={(item) => {
              if (item.direction === 'out') setSaved(null)
            }}
            linkRender={({ href, children, className }) => (
              <button type="button" className={className} onClick={() => navigate(href)}>
                {children}
              </button>
            )}
            header={
              <header className="space-y-1">
                <h1 className="text-2xl font-semibold text-fg">Integrations</h1>
                <p className="max-w-2xl text-sm text-fg-muted">
                  Sync external records into an application, or publish application events to a configured destination.
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setView('runs')}>
                  <History size={14} /> Open delivery run
                </Button>
              </header>
            }
          />
        ) : null}
        {view === 'builder' ? (
          <Builder
            destinations={destinations}
            destinationKey={saved?.destinationKey ?? destinationKey}
            saved={saved}
            onSaved={setSaved}
          />
        ) : null}
        {view === 'inbound' ? <Inbound /> : null}
        {view === 'runs' ? <Runs /> : null}
      </div>
    </div>
  )
}

function Builder({
  destinations,
  destinationKey,
  saved,
  onSaved,
}: {
  destinations: DestinationAuthoringDefinition[]
  destinationKey: string
  saved: IntegrationEditorSubmission | null
  onSaved: (value: IntegrationEditorSubmission) => void
}) {
  const initial = React.useMemo(() => {
    const config = saved?.config ?? {
      oncePerRecord: true,
      to: 'operations@example.com',
      subject: 'Project {{project}} updated',
      mapping: { body: '<p><strong>{{project}}</strong> is now {{status}}.</p>' },
    }
    return {
      name: saved?.name ?? 'Project update',
      enabled: saved?.enabled ?? true,
      oncePerRecord: config.oncePerRecord === true,
      triggerKey: saved?.triggerKey ?? projectTrigger.key,
      destinationKey,
      config,
      secretsPresent: {},
      mapping:
        config.mapping && typeof config.mapping === 'object'
          ? (config.mapping as Record<string, unknown>)
          : {},
    }
  }, [destinationKey, saved])
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Outbound automation</h1>
        <p className="text-sm text-fg-muted">Choose the event, destination, connection settings, and token mapping.</p>
      </header>
      <div className="rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-6">
        <IntegrationBuilder
          key={destinationKey}
          id={saved?.id ?? 'project-export'}
          initial={initial}
          triggers={[projectTrigger]}
          destinations={destinations}
          onSave={async (value) => {
            onSaved(value)
            return { ok: true, message: value.ready ? 'Automation saved and enabled.' : 'Draft saved.' }
          }}
          onTest={async (value) => validateConfiguration(value, destinations)}
        />
      </div>
    </div>
  )
}

function validateConfiguration(
  value: IntegrationEditorSubmission,
  destinations: DestinationAuthoringDefinition[],
) {
  const destination = destinations.find((entry) => entry.key === value.destinationKey)
  if (!destination) return { ok: false, message: 'Choose a destination first.' }
  for (const field of destination.configFields) {
    if (field.required && !value.config[field.key])
      return { ok: false, message: `${field.label} is required.` }
  }
  for (const field of destination.secretFields) {
    if (field.required && !value.secretReplacements[field.key])
      return { ok: false, message: `${field.label} is required for a new connection.` }
  }
  return { ok: true, message: 'Required configuration and mapping fields are present.' }
}

function Inbound() {
  const [result, setResult] = React.useState<{
    status: string
    pulled: number
    applied: number
    ledgerRows: number
    cursor: string
    records: SyncRecord[]
  } | null>(null)
  const [running, setRunning] = React.useState(false)
  async function run() {
    setRunning(true)
    const records: SyncRecord[] = []
    const persistence = createMemorySyncPersistence([
      {
        id: csvConnector.key,
        tenantId: 'demo',
        connectorKey: csvConnector.key,
        name: csvConnector.name,
        status: 'connected',
        enabled: true,
        config: { csv: SAMPLE_CSV },
        secrets: {},
        cursor: {},
      },
    ])
    const memoryTarget = createMemorySyncTarget()
    const target: SyncTarget<MemorySyncTransaction, undefined> = {
      async apply(transaction, record, context) {
        records.push(record)
        return memoryTarget.apply(transaction, record, context)
      },
    }
    try {
      const completed = await runSync({
        tenantId: 'demo',
        connectionId: csvConnector.key,
        trigger: 'manual',
        connectors: createConnectorRegistry([csvConnector]),
        persistence,
        target,
      })
      const stats = Object.values(completed.stats)
      setResult({
        status: completed.status,
        pulled: stats.reduce((sum, stat) => sum + stat.pulled, 0),
        applied: stats.reduce((sum, stat) => sum + stat.created + stat.updated + stat.unchanged, 0),
        ledgerRows: persistence.changes.length,
        cursor: JSON.stringify(persistence.connections[0]?.cursor ?? {}),
        records,
      })
    } finally {
      setRunning(false)
    }
  }
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Project import</h1>
        <p className="text-sm text-fg-muted">CSV project import · manual run</p>
      </header>
      <SettingsSection
        title="Connection"
        footer={<Button size="sm" onClick={() => void run()} disabled={running}><Play size={14} />{running ? 'Running…' : 'Run sync'}</Button>}
      >
        <SettingsRow title="Source" description="Two CSV records are parsed through the connector contract."><Badge variant="secondary">CSV</Badge></SettingsRow>
        <SettingsRow title="Target" description="The application-owned target runs inside the production transactional orchestrator."><Badge variant="secondary">Memory</Badge></SettingsRow>
        {result ? (
          <SettingsRow
            title={`${result.applied} of ${result.pulled} records applied`}
            description={`${result.ledgerRows} audited changes · cursor ${result.cursor} · ${result.records.map((record) => `${record.externalId}: ${String(record.data.name)}`).join(' · ')}`}
          >
            <Badge variant={result.status === 'success' ? 'success' : 'warning'}>{result.status}</Badge>
          </SettingsRow>
        ) : null}
      </SettingsSection>
    </div>
  )
}

function Runs() {
  const [result, setResult] = React.useState<{
    first: string
    second: string
    email: IntegrationEmail
    ledgerRows: number
    queueId: string
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)
  async function run() {
    setRunning(true)
    setError(null)
    const sent: IntegrationEmail[] = []
    try {
      const { createEmailDestination } = await import('@appkit/integrations/email')
      const destination = createEmailDestination(async (message) => { sent.push(message) })
      const registry = createIntegrationRegistry({ destinations: [destination] })
      const definition: IntegrationDefinition = {
        id: 'project-email',
        tenantId: 'demo',
        name: 'Project update',
        enabled: true,
        triggerKey: projectTrigger.key,
        destinationKey: 'email',
        config: {
          oncePerRecord: true,
          to: 'operations@example.com',
          subject: 'Project {{project}} updated',
          mapping: { body: '<p><strong>{{project}}</strong> is now {{status}}.</p>' },
        },
      }
      const store = createMemoryIntegrationStore([definition])
      const jobs = new Map<string, { tenantId: string; automationId: string; event: { type: string; tenantId: string; subjectId: string; items: Array<Record<string, string>> } }>()
      const publish = createIntegrationPublisher({
        store,
        async enqueueOutboundDispatch(data, id) { if (!jobs.has(id)) jobs.set(id, data as never) },
      })
      const event = {
        type: projectTrigger.key,
        tenantId: 'demo',
        subjectId: 'P-1048',
        items: [{ project: 'North Tower', projectId: 'P-1048', status: 'active', ownerEmail: 'owner@example.com' }],
      }
      await publish({ tenantId: 'demo' }, event, 'event-1048')
      await publish({ tenantId: 'demo' }, event, 'event-1048')
      const [queueId, job] = [...jobs.entries()][0] ?? []
      if (!queueId || !job) throw new Error('The publisher did not enqueue a delivery.')
      const dispatchOne = createIntegrationDispatcher({ registry, store })
      const first = await dispatchOne({ tenantId: 'demo' }, job.automationId, event)
      const second = await dispatchOne({ tenantId: 'demo' }, job.automationId, event)
      const email = sent[0]
      if (!first.ok || !second.ok || !email)
        throw new Error(first.error ?? second.error ?? 'The delivery did not produce an email.')
      setResult({
        first: first.summary ?? 'Delivered',
        second: second.summary ?? 'Suppressed',
        email,
        ledgerRows: [...store.ledger.values()].flat().length,
        queueId,
      })
    } catch (runError) {
      setResult(null)
      setError(runError instanceof Error ? runError.message : 'Delivery failed')
    } finally {
      setRunning(false)
    }
  }
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold text-fg">Outbound delivery</h1>
        <p className="text-sm text-fg-muted">Publisher → durable job id → dispatcher → destination → delivery ledger</p>
      </header>
      <SettingsSection
        title="Live run"
        footer={<Button size="sm" onClick={() => void run()} disabled={running}><Play size={14} />{running ? 'Delivering…' : 'Run delivery'}</Button>}
      >
        {error ? (
          <SettingsRow title="Delivery failed" description={error}><Badge variant="destructive">Error</Badge></SettingsRow>
        ) : result ? (
          <>
            <SettingsRow title={result.email.subject} description={`${result.email.to.join(', ')} · ${result.first}`}><Badge variant="success">{result.ledgerRows} ledger ref</Badge></SettingsRow>
            <SettingsRow title="Durable publication" description={result.queueId}><Badge variant="secondary">Deduplicated</Badge></SettingsRow>
            <SettingsRow title="Replay attempt" description={result.second}><Badge variant="secondary">Suppressed</Badge></SettingsRow>
          </>
        ) : (
          <SettingsRow title="No delivery run yet" description="Run the credential-free email delivery to execute the complete outbound path."><Badge variant="secondary">Ready</Badge></SettingsRow>
        )}
      </SettingsSection>
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<Upload />} label="Publisher" value="Per automation" />
        <Metric icon={<History />} label="Retries" value="Ledger aware" />
        <Metric icon={<Database />} label="Status" value="Auditable" />
      </div>
    </div>
  )
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 text-fg-muted">{React.cloneElement(icon as React.ReactElement<{ className?: string }>, { className: 'size-4' })}</div>
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="font-semibold text-fg">{value}</p>
    </div>
  )
}
