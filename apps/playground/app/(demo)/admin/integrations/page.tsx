'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Database,
  FileSpreadsheet,
  Globe,
  Mail,
  MessageSquare,
  Play,
} from 'lucide-react'
import {
  createMemoryIntegrationStore,
  dispatchIntegration,
  type IntegrationDefinition,
} from '@appkit/integrations'
import {
  createIntegrationRegistry,
} from '@appkit/integrations/catalog'
import type { IntegrationEmail } from '@appkit/integrations/email'
import { INTEGRATION_DESTINATION_CATALOG } from '@appkit/integrations/destination-catalog'
import {
  createConnectorRegistry,
  type SyncConnector,
} from '@appkit/sync/catalog'
import { createMemorySyncRunStore, parseCsv, runSync, type SyncRecord } from '@appkit/sync'
import {
  Badge,
  Button,
  SettingsRow,
  SettingsSection,
  SettingsShell,
  type LinkRender,
  type SettingsNavGroup,
} from '@appkit/ui'

const nextLink: LinkRender = ({ href, children, className }) => (
  <Link href={href} className={className}>
    {children}
  </Link>
)
const SAMPLE_CSV = `project_id,name,status
P-1048,North Tower,active
P-1053,Civic Library,bidding`

const csvDemoConnector: SyncConnector = {
  key: 'csv-projects',
  name: 'CSV project import',
  description: 'Parse a delimited source into the connector-neutral record envelope.',
  entities: ['project'],
  kind: 'native',
  async pull(context) {
    const parsed = parseCsv(String(context.config.csv ?? ''))
    const records: SyncRecord[] = parsed.rows.map((row) => ({
      entity: 'project',
      externalId: row.project_id ?? '',
      data: { name: row.name ?? '', status: row.status ?? '' },
    }))
    context.log('info', `Parsed ${records.length} project records`, { headers: parsed.headers })
    return { records, mode: 'full', authoritativeEntities: ['project'] }
  },
}

const CONNECTORS = createConnectorRegistry([csvDemoConnector]).summaries()
const DESTINATIONS = INTEGRATION_DESTINATION_CATALOG

const NAV: SettingsNavGroup[] = [
  {
    label: 'Connections',
    items: [
      { key: 'inbound', label: 'Inbound sync', icon: <ArrowDownToLine /> },
      {
        key: 'outbound',
        label: 'Outbound integrations',
        icon: <ArrowUpFromLine />,
      },
      { key: 'runs', label: 'Runs & delivery', icon: <History /> },
    ],
  },
]
const DESTINATION_ICONS: Record<string, React.ReactNode> = {
  http: <Globe />,
  slack: <MessageSquare />,
  sheets: <FileSpreadsheet />,
  email: <Mail />,
  sql: <Database />,
}

export default function IntegrationsPage() {
  const router = useRouter()
  const [active, setActive] = React.useState('inbound')
  React.useEffect(() => {
    const section = new URLSearchParams(window.location.search).get('s')
    if (section) setActive(section)
  }, [])
  return (
    <div className="h-full">
      <SettingsShell
        title="Integrations"
        description="Connect data sources and route application events to external services."
        back={{ href: '/admin', label: 'Administration' }}
        nav={NAV}
        activeKey={active}
        onSelect={(key) => {
          setActive(key)
          router.replace(`/admin/integrations?s=${key}`, { scroll: false })
        }}
        linkRender={nextLink}
      >
        {active === 'inbound' ? <Inbound /> : null}
        {active === 'outbound' ? <Outbound /> : null}
        {active === 'runs' ? <Runs /> : null}
      </SettingsShell>
    </div>
  )
}

function Inbound() {
  const [result, setResult] = React.useState<{ status: string; pulled: number; applied: number; records: SyncRecord[] } | null>(null)
  const [running, setRunning] = React.useState(false)

  async function runCsvDemo() {
    setRunning(true)
    const records: SyncRecord[] = []
    const store = createMemorySyncRunStore()
    try {
      const run = await runSync({
        tenantId: 'demo',
        connectionId: 'csv-projects',
        connector: csvDemoConnector,
        connectorContext: { config: { csv: SAMPLE_CSV }, secrets: {}, log: () => undefined },
        target: {
          async apply(record) {
            records.push(record)
            return { targetId: record.externalId, changed: true }
          },
        },
        store,
      })
      setResult({ status: run.status, pulled: run.pulled, applied: run.applied, records })
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <SettingsSection
        title="Data sources"
        description="Run the CSV connector through the real sync orchestrator and an in-memory application target."
        footer={<Button size="sm" onClick={() => void runCsvDemo()} disabled={running}><Play className="size-4" />{running ? 'Running…' : 'Run CSV sync'}</Button>}
      >
        {CONNECTORS.map((item) => (
          <SettingsRow
            key={item.key}
            title={
              <span className="flex items-center gap-2">
                <Database className="size-4 text-fg-muted" />
                {item.name}
              </span>
            }
            description={item.description}
          >
            <Badge variant="secondary">Connector</Badge>
          </SettingsRow>
        ))}
        {result ? (
          <SettingsRow
            title={`${result.applied} records applied`}
            description={result.records.map((record) => `${record.externalId}: ${String(record.data.name)}`).join(' · ')}
          >
            <Badge variant={result.status === 'completed' ? 'success' : 'warning'}>{result.status}</Badge>
          </SettingsRow>
        ) : null}
      </SettingsSection>
      <SettingsSection title="Sync guarantees">
        <SettingsRow
          title="Incremental cursors"
          description="A cursor advances only after the run is recorded successfully."
        >
          <Badge variant="success">Included</Badge>
        </SettingsRow>
        <SettingsRow
          title="Crosswalk"
          description="External ids remain linked to application records across repeated pulls."
        >
          <Badge variant="success">Included</Badge>
        </SettingsRow>
        <SettingsRow
          title="Authoritative snapshots"
          description="Missing-record archival is blocked for empty pulls and any run with processing failures."
        >
          <Badge variant="success">Fail closed</Badge>
        </SettingsRow>
      </SettingsSection>
    </>
  )
}
function Outbound() {
  return (
    <SettingsSection
      title="Destinations"
      description="Applications register their own triggers, then install only the destinations they use."
    >
      {DESTINATIONS.map((item) => (
        <SettingsRow
          key={item.key}
          title={
            <span className="flex items-center gap-2">
              {React.cloneElement(
                DESTINATION_ICONS[item.key] as React.ReactElement<{
                  className?: string
                }>,
                { className: 'size-4 text-fg-muted' },
              )}
              {item.name}
            </span>
          }
          description={item.description}
        >
          <Badge variant={item.reversible ? 'success' : 'secondary'}>
            {item.reversible ? 'Reversible' : 'Replay safe'}
          </Badge>
        </SettingsRow>
      ))}
    </SettingsSection>
  )
}
function Runs() {
  const [result, setResult] = React.useState<{ first: string; second: string; email: IntegrationEmail; ledgerRows: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [running, setRunning] = React.useState(false)

  async function runDeliveryDemo() {
    setRunning(true)
    setError(null)
    const sent: IntegrationEmail[] = []
    try {
      // Keep the DOM sanitizer in a click-loaded browser chunk. Importing this
      // adapter during server rendering would load its browser DOM dependency.
      const { createEmailDestination } = await import('@appkit/integrations/email')
      const destination = createEmailDestination(async (message) => { sent.push(message) })
      const registry = createIntegrationRegistry({ destinations: [destination] })
      const definition: IntegrationDefinition = {
        id: 'project-email', tenantId: 'demo', name: 'Project update', enabled: true,
        triggerKey: 'project.updated', destinationKey: 'email', oncePerRecord: true,
        config: {
          to: 'operations@example.com',
          subject: 'Project {{project}} updated',
          mapping: { body: '<p><strong>{{project}}</strong> is now {{status}}.</p>' },
        },
      }
      const store = createMemoryIntegrationStore([definition])
      const event = { type: 'project.updated', tenantId: 'demo', subjectId: 'P-1048', items: [{ project: 'North Tower', status: 'active' }] }
      const first = await dispatchIntegration({ integrationId: definition.id, event, registry, store })
      const second = await dispatchIntegration({ integrationId: definition.id, event, registry, store })
      const email = sent[0]
      if (!first.ok || !second.ok || !email) throw new Error(first.error ?? second.error ?? 'The delivery did not produce an email.')
      const ledgerRows = [...store.ledger.values()].reduce((count, rows) => count + rows.length, 0)
      setResult({ first: first.summary ?? 'Delivered', second: second.summary ?? 'Suppressed', email, ledgerRows })
    } catch (deliveryError) {
      setResult(null)
      setError(deliveryError instanceof Error ? deliveryError.message : 'Delivery failed')
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <SettingsSection title="Delivery policy">
        <SettingsRow
          title="Send once"
          description="Completed ledger entries suppress duplicate delivery for the same trigger and subject."
        >
          <Badge variant="success">Available</Badge>
        </SettingsRow>
        <SettingsRow
          title="Partial retry"
          description="Successful items are retained when a later item fails, so retries resume instead of replaying them."
        >
          <Badge variant="success">Available</Badge>
        </SettingsRow>
        <SettingsRow
          title="Secrets"
          description="The application injects its secret unsealer; plaintext credentials never enter stored configuration."
        >
          <Badge variant="success">Injected</Badge>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection title="Live delivery ledger" description="Executes the real dispatcher, sanitized email destination, memory store, and send-once suppression without external credentials." footer={<Button size="sm" onClick={() => void runDeliveryDemo()} disabled={running}><Play className="size-4" />{running ? 'Delivering…' : 'Run delivery'}</Button>}>
        {error ? <SettingsRow title="Delivery failed" description={error}><Badge variant="destructive">Error</Badge></SettingsRow> : result ? <>
          <SettingsRow title={result.email.subject} description={`${result.email.to.join(', ')} · ${result.first}`}><Badge variant="success">{result.ledgerRows} ledger ref</Badge></SettingsRow>
          <SettingsRow title="Replay attempt" description={result.second}><Badge variant="secondary">Suppressed</Badge></SettingsRow>
        </> : <SettingsRow title="No delivery run yet" description="Run the credential-free email delivery to populate the in-memory ledger."><Badge variant="secondary">Ready</Badge></SettingsRow>}
      </SettingsSection>
    </>
  )
}
