'use client'

import type { ReactNode } from 'react'
import {
  ArrowUpRight,
  Building2,
  Database,
  FileSpreadsheet,
  Plug,
  PlugZap,
  Trash2,
  Upload,
  type LucideIcon,
} from 'lucide-react'
import { Badge, Button } from '@appkit/ui'
import {
  DirectionPill,
  IntegrationCatalog,
  type IntegrationCatalogItem,
  type IntegrationDirection,
  type IntegrationLinkRender,
} from './integration-catalog'

const ICONS: Record<string, LucideIcon> = {
  database: Database,
  'building-2': Building2,
  'file-spreadsheet': FileSpreadsheet,
  'plug-zap': PlugZap,
  upload: Upload,
}

export type ConnectedIntegration = {
  id: string
  direction: IntegrationDirection
  title: string
  subtitle: string
  status: string
  href: string
  badge?: string
  meta: string
  iconKey: string
}

export function IntegrationHub({
  connected,
  catalog,
  onAdd,
  onDelete,
  linkRender,
  header,
}: {
  connected: readonly ConnectedIntegration[]
  catalog: readonly IntegrationCatalogItem[]
  onAdd: (item: IntegrationCatalogItem) => void | Promise<void>
  onDelete?: (item: ConnectedIntegration) => void | Promise<void>
  linkRender?: IntegrationLinkRender
  header?: ReactNode
}) {
  return (
    <div className="space-y-8">
      {header ?? (
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <Plug size={22} className="text-primary" />
            <h1 className="text-2xl font-semibold text-fg">Integrations</h1>
          </div>
          <p className="max-w-2xl text-sm text-fg-muted">
            Bring external records into your application and route application
            events to the services your team already uses.
          </p>
        </header>
      )}
      <section className="space-y-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
            Connected
          </h2>
          <span className="text-xs text-fg-subtle">{connected.length}</span>
        </div>
        {!connected.length ? (
          <div className="rounded-xl border border-dashed border-border px-5 py-8 text-sm text-fg-muted">
            No connections or outbound automations yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {connected.map((item) => (
              <ConnectedCard
                key={`${item.direction}-${item.id}`}
                item={item}
                onDelete={onDelete}
                linkRender={linkRender}
              />
            ))}
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">
          Browse integrations
        </h2>
        <IntegrationCatalog
          items={catalog}
          onAdd={onAdd}
          linkRender={linkRender}
        />
      </section>
    </div>
  )
}

function ConnectedCard({
  item,
  onDelete,
  linkRender,
}: {
  item: ConnectedIntegration
  onDelete?: (item: ConnectedIntegration) => void | Promise<void>
  linkRender?: IntegrationLinkRender
}) {
  const Icon = ICONS[item.iconKey] ?? Database
  const content = (
    <span className="font-semibold text-fg transition group-hover:text-primary">
      {item.title}
    </span>
  )
  return (
    <div className="group relative flex items-start gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface-hover text-fg-muted ring-1 ring-border-subtle">
        <Icon size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {linkRender
            ? linkRender({ href: item.href, children: content })
            : <a href={item.href}>{content}</a>}
          <DirectionPill direction={item.direction} />
          <StatusPill status={item.status} />
          {item.badge ? (
            <Badge variant="secondary" className="text-[10px]">
              {item.badge}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 truncate text-xs text-fg-muted">{item.subtitle}</p>
        <p className="mt-0.5 truncate text-[11px] text-fg-subtle">{item.meta}</p>
      </div>
      <div className="flex items-center gap-1 self-center text-fg-subtle transition group-hover:text-fg-muted">
        <ArrowUpRight size={15} className="hidden sm:block" />
        {onDelete ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove ${item.title}`}
            onClick={() => void onDelete(item)}
          >
            <Trash2 size={14} />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase()
  const variant =
    normalized === 'ready' || normalized === 'connected' || normalized === 'success'
      ? 'success'
      : normalized === 'error' || normalized === 'failed'
        ? 'destructive'
        : 'secondary'
  return <Badge variant={variant}>{status}</Badge>
}
