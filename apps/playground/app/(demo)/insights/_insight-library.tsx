'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { BarChart3, CreditCard, Plus, Search } from 'lucide-react'
import type { AnalyticsCatalog } from '@appkit/analytics'
import {
  Badge, Button, Drawer, EmptyState, ListPageLayout, PageHeader,
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@appkit/ui'
import type { CardStudioResult, InsightCardDraft } from '@appkit/dashboard'
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

export function InsightLibrary({ cards: initialCards, catalog, selectedId, createNew, browserPersistence }: { cards: InsightCardDraft[]; catalog: AnalyticsCatalog; selectedId: string | null; createNew: boolean; browserPersistence: boolean }) {
  const router = useRouter()
  const [query, setQuery] = React.useState('')
  const [cards, setCards] = React.useState(initialCards)
  const cardsRef = React.useRef(initialCards)

  React.useEffect(() => { cardsRef.current = cards }, [cards])

  React.useEffect(() => {
    if (!browserPersistence) return
    try {
      const stored = window.localStorage.getItem('appkit-demo:insight-cards:v1')
      if (!stored) return
      const parsed = JSON.parse(stored) as InsightCardDraft[]
      if (Array.isArray(parsed)) {
        const valid = parsed.filter(validStoredCard)
        cardsRef.current = valid
        setCards(valid)
      }
    } catch {
      // Storage can be unavailable in privacy-restricted browser contexts. The
      // built-in card library remains fully usable for the current render.
    }
  }, [browserPersistence])

  function updateBrowserCards(update: (current: InsightCardDraft[]) => InsightCardDraft[]) {
    const next = update(cardsRef.current)
    window.localStorage.setItem('appkit-demo:insight-cards:v1', JSON.stringify(next))
    cardsRef.current = next
    setCards(next)
  }

  async function saveBrowserCard(draft: InsightCardDraft): Promise<CardStudioResult> {
    const name = draft.name.trim()
    if (!name || name.length > 120) return { ok: false, error: 'Give the card a name of 120 characters or fewer.' }
    if ((draft.description?.length ?? 0) > 500) return { ok: false, error: 'Descriptions can be at most 500 characters.' }
    if (JSON.stringify(draft).length > 25_000) return { ok: false, error: 'The card definition is too large.' }
    const id = draft.id ?? crypto.randomUUID()
    const saved = { ...draft, id, name, description: draft.description?.trim() || null }
    try {
      updateBrowserCards((current) => [...current.filter((card) => card.id !== id), saved])
      return { ok: true, id }
    } catch {
      return { ok: false, error: 'The browser could not save this card.' }
    }
  }

  const saveCard = browserPersistence ? saveBrowserCard : saveInsightCardAction
  const deleteCard = browserPersistence
    ? async (draft: InsightCardDraft): Promise<CardStudioResult> => {
        if (!draft.id) return { ok: false, error: 'This card has not been saved yet.' }
        updateBrowserCards((current) => current.filter((card) => card.id !== draft.id))
        return { ok: true }
      }
    : deleteInsightCardAction
  const publishCard = browserPersistence
    ? async (published: boolean, draft: InsightCardDraft) => saveBrowserCard({ ...draft, status: published ? 'published' : 'draft' })
    : publishInsightCardAction
  const selected = createNew ? NEW_CARD : cards.find((card) => card.id === selectedId) ?? null
  const filtered = cards.filter((card) => `${card.name} ${card.description ?? ''} ${card.query.source}`.toLowerCase().includes(query.trim().toLowerCase()))
  const close = () => router.push('/insights')
  return <>
    <ListPageLayout header={<><PageHeader title="Insight cards" description="Build reusable cards with measures, formulas, dimensions, filters, and ten visualization types." actions={<Button onClick={() => router.push('/insights?new=1')}><Plus size={15} />New card</Button>} /><div className="relative max-w-md"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search cards…" aria-label="Search insight cards" className="h-9 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm text-fg outline-none transition focus:border-primary focus:ring-2 focus:ring-ring/20" /></div></>}
    >
      {filtered.length ? <Table><TableHeader><TableRow noAnimate><TableHead>Card</TableHead><TableHead>Source</TableHead><TableHead>Visualization</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{filtered.map((card) => <TableRow key={card.id} tabIndex={0} role="link" onClick={() => router.push(`/insights?card=${card.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') router.push(`/insights?card=${card.id}`) }} className="cursor-pointer"><TableCell><div className="flex items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-subtle text-primary"><CreditCard size={16} /></span><div><div className="font-medium text-fg">{card.name}</div><div className="mt-0.5 max-w-xl truncate text-xs text-fg-muted">{card.description || 'No description'}</div></div></div></TableCell><TableCell className="text-fg-muted">{catalog.sources.find((source) => source.key === card.query.source)?.label ?? card.query.source}</TableCell><TableCell className="capitalize text-fg-muted">{card.visualization}</TableCell><TableCell><Badge variant={card.status === 'published' ? 'success' : 'secondary'}>{card.status}</Badge></TableCell></TableRow>)}</TableBody></Table> : <EmptyState icon={<BarChart3 />} title="No insight cards found" description={query ? 'Try a different search.' : 'Create a card to start building your analytics library.'} action={!query ? <Button onClick={() => router.push('/insights?new=1')}><Plus size={15} />New card</Button> : undefined} />}
    </ListPageLayout>
    <Drawer open={!!selected} onClose={close} title={selected?.name ?? 'Insight card'} description="Card studio" size="2xl" initialFullscreen={createNew} bodyClassName="flex min-h-0 p-0">
      {selected ? <CardStudio key={selected.id ?? 'new'} initial={selected} catalog={catalog} onRun={runInsightQueryAction} onSave={async (draft) => { const result = await saveCard(draft); if (result.ok && result.id && !draft.id) { router.replace(`/insights?card=${result.id}`); if (!browserPersistence) router.refresh() } return result }} onDelete={async (draft) => { const result = await deleteCard(draft); if (result.ok) { close(); if (!browserPersistence) router.refresh() } return result }} onPublishChange={async (published, draft) => { const result = await publishCard(published, draft); if (result.ok && !browserPersistence) router.refresh(); return result }} /> : null}
    </Drawer>
  </>
}

function validStoredCard(value: InsightCardDraft): boolean {
  const visualizations = new Set(['scalar', 'progress', 'table', 'bar', 'row', 'line', 'area', 'pie', 'donut', 'gauge'])
  return Boolean(
    value
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && value.query
    && typeof value.query.source === 'string'
    && visualizations.has(value.visualization)
    && (value.status === 'draft' || value.status === 'published'),
  )
}
