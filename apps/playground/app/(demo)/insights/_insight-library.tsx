'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, CreditCard, Plus, Search } from 'lucide-react'
import type { AnalyticsCatalog } from '@appkit/analytics'
import {
  Badge, Button, Drawer, EmptyState, ListPageLayout, PageHeader,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@appkit/ui'
import type { InsightCardDraft } from '@appkit/dashboard'
import { CardStudio } from '@appkit/dashboard/react'
import {
  deleteInsightCardAction, publishInsightCardAction, runInsightQueryAction,
  saveInsightCardAction,
} from '../../../lib/server/dashboard-actions'

const NEW_CARD: InsightCardDraft = {
  name: 'Untitled card',
  description: '',
  query: { source: 'members', measures: [{ fn: 'count' }], dimensions: [], filters: [], limit: 100 },
  visualization: 'scalar',
  visualizationSettings: {},
  status: 'draft',
}

export function InsightLibrary({ cards, catalog, selectedId, createNew }: { cards: InsightCardDraft[]; catalog: AnalyticsCatalog; selectedId: string | null; createNew: boolean }) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const selected = createNew ? NEW_CARD : cards.find((card) => card.id === selectedId) ?? null
  const filtered = cards.filter((card) => `${card.name} ${card.description ?? ''} ${card.query.source}`.toLowerCase().includes(query.trim().toLowerCase()))
  const close = () => router.push('/insights')
  return <>
    <ListPageLayout header={<><PageHeader title="Insight cards" description="Build reusable cards with measures, formulas, dimensions, filters, and ten visualization types." actions={<Button onClick={() => router.push('/insights?new=1')}><Plus size={15} />New card</Button>} /><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards…" aria-label="Search insight cards" className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20" /></div></>}
    >
      {filtered.length ? <Table><TableHeader><TableRow noAnimate><TableHead>Card</TableHead><TableHead>Source</TableHead><TableHead>Visualization</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{filtered.map((card) => <TableRow key={card.id} tabIndex={0} role="link" onClick={() => router.push(`/insights?card=${card.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') router.push(`/insights?card=${card.id}`) }} className="cursor-pointer"><TableCell><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary"><CreditCard size={16} /></span><div><div className="font-medium text-fg">{card.name}</div><div className="mt-0.5 max-w-xl truncate text-xs text-fg-muted">{card.description || 'No description'}</div></div></div></TableCell><TableCell className="text-fg-muted">{catalog.sources.find((source) => source.key === card.query.source)?.label ?? card.query.source}</TableCell><TableCell className="capitalize text-fg-muted">{card.visualization}</TableCell><TableCell><Badge variant={card.status === 'published' ? 'success' : 'secondary'}>{card.status}</Badge></TableCell></TableRow>)}</TableBody></Table> : <EmptyState icon={<BarChart3 />} title="No insight cards found" description={query ? 'Try a different search.' : 'Create a card to start building your analytics library.'} action={!query ? <Button onClick={() => router.push('/insights?new=1')}><Plus size={15} />New card</Button> : undefined} />}
    </ListPageLayout>
    <Drawer open={!!selected} onClose={close} title={selected?.name ?? 'Insight card'} description="Card studio" size="2xl" initialFullscreen={createNew} bodyClassName="flex min-h-0 p-0">
      {selected ? <CardStudio key={selected.id ?? 'new'} initial={selected} catalog={catalog} onRun={runInsightQueryAction} onSave={async (draft) => { const result = await saveInsightCardAction(draft); if (result.ok && result.id && !draft.id) { router.replace(`/insights?card=${result.id}`); router.refresh() } return result }} onDelete={async (draft) => { const result = await deleteInsightCardAction(draft); if (result.ok) { close(); router.refresh() } return result }} onPublishChange={async (published, draft) => { const result = await publishInsightCardAction(published, draft); if (result.ok) router.refresh(); return result }} /> : null}
    </Drawer>
  </>
}
