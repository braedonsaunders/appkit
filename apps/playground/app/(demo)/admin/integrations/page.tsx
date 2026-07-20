'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  History,
  Cable,
  Database,
  FileSpreadsheet,
  Globe,
  Mail,
  MessageSquare,
} from 'lucide-react'
import {
  createIntegrationRegistry,
  type DestinationDefinition,
} from '@appkit/integrations/catalog'
import {
  createConnectorRegistry,
  type SyncConnector,
} from '@appkit/sync/catalog'
import {
  Badge,
  EmptyState,
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
const connector = (
  key: string,
  name: string,
  description: string,
  entities: string[],
): SyncConnector => ({
  key,
  name,
  description,
  entities,
  kind: 'native',
  async pull() {
    return []
  },
})
const CONNECTORS = createConnectorRegistry([
  connector(
    'csv',
    'CSV import',
    'Map a delimited file into application records.',
    ['app-defined'],
  ),
  connector(
    'database',
    'SQL database',
    'Read from PostgreSQL, MySQL, MariaDB, or SQL Server over verified TLS.',
    ['app-defined'],
  ),
  connector(
    'provider',
    'Provider connector',
    'Register an OAuth or API-backed source through the same cursor and crosswalk contract.',
    ['app-defined'],
  ),
]).summaries()
const destination = (
  key: string,
  name: string,
  description: string,
  mappingKind: string,
  reversible = false,
): DestinationDefinition => ({
  key,
  name,
  description,
  mappingKind,
  reversible,
  configFields: [],
  secretFields: [],
  async deliver() {
    return { ok: true }
  },
})
const DESTINATIONS = createIntegrationRegistry({
  destinations: [
    destination(
      'http',
      'HTTP / REST',
      'Token-templated POST, PUT, or PATCH to a public HTTPS endpoint.',
      'http',
    ),
    destination(
      'chat',
      'Slack / Teams',
      'Incoming-webhook messages with resumable multi-item delivery.',
      'chat',
    ),
    destination(
      'sheets',
      'Google Sheets',
      'Append mapped rows through a service-account credential.',
      'sheets',
    ),
    destination(
      'email',
      'Email',
      'Bounded, sanitized email through the application email transport.',
      'email',
    ),
    destination(
      'sql',
      'External SQL',
      'Reversible inserts over verified TLS with an identity-column ledger.',
      'sql',
      true,
    ),
  ],
}).destinations()

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
  chat: <MessageSquare />,
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
  return (
    <>
      <SettingsSection
        title="Data sources"
        description="Each connector emits the same record envelope; your app controls how those records map into its own models."
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
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState
          icon={<Cable />}
          title="No demo deliveries"
          description="Delivery history appears here after an application connects the Drizzle store and emits an event."
        />
      </div>
    </>
  )
}
