'use client'

import * as React from 'react'
import { defaultFormLayout, defaultListView, getRecordType, mergeListViewColumns, queryRecordList, type SavedListView } from '@appkit/customization'
import {
  CustomizationStudio,
  RecordListView,
  type CustomFieldDefinition,
  type CustomizationDesignerAdapter,
  type FormDefinition,
  type ListViewDefinition,
} from '@appkit/customization/react'
import { Badge, Button, Drawer, Spinner } from '@appkit/ui'

const STORAGE_KEY = 'appkit-customization-studio-v2'

const SOURCE_LABELS: Record<string, string> = {
  'customization.recordTypes.vendor_bill': 'Vendor bill',
  'common.labels.vendor': 'Vendor',
  'common.labels.customer': 'Customer',
  'common.labels.date': 'Date',
  'common.labels.dueDate': 'Due date',
  'common.labels.reference': 'Reference',
  'common.labels.memo': 'Memo',
  'common.labels.postingDate': 'Posting date',
  'common.labels.department': 'Department',
  'common.labels.project': 'Project',
  'common.labels.location': 'Location',
  'common.labels.class': 'Class',
  'common.labels.subsidiary': 'Subsidiary',
  'common.labels.internalNotes': 'Internal notes',
  'common.labels.expectedPayDate': 'Expected pay date',
  'common.labels.paymentHold': 'Payment hold',
  'common.labels.account': 'Account',
  'common.labels.item': 'Item',
  'common.labels.description': 'Description',
  'common.labels.quantity': 'Quantity',
  'common.labels.unit': 'Unit',
  'common.labels.unitPrice': 'Unit price',
  'common.labels.tax': 'Tax',
  'common.labels.amount': 'Amount',
  'common.labels.number': 'Number',
  'common.labels.total': 'Total',
  'common.labels.openBalance': 'Open balance',
  'common.labels.status': 'Status',
  'common.labels.actions': 'Actions',
  'ap.drawer.dateLabel': 'Bill date',
  'ap.drawer.dueDate': 'Due date',
  'ap.drawer.reference': 'Vendor ref #',
  'ap.drawer.taxAmountColumn': 'Tax amount',
  'ap.list.columns.bill': 'Bill',
  'ap.list.columns.ref': 'Reference',
  'common.status.draft': 'Draft',
  'common.status.pendingApproval': 'Pending approval',
  'common.status.approved': 'Approved',
  'common.status.posted': 'Posted',
  'common.status.voided': 'Voided',
}

const INITIAL_FORMS: FormDefinition[] = [
  {
    id: 'form-vendor-bill-standard',
    recordType: 'vendor_bill',
    name: 'Standard vendor bill',
    isDefault: true,
    isActive: true,
    layout: defaultFormLayout('vendor_bill'),
  },
]

const INITIAL_VIEWS: ListViewDefinition[] = [
  {
    id: 'view-vendor-bill-open',
    recordType: 'vendor_bill',
    name: 'Open vendor bills',
    scope: 'organization',
    isDefault: true,
    isActive: true,
    config: {
      ...defaultListView('vendor_bill'),
      filters: [{ key: 'status', operator: 'in', value: ['draft', 'pending_approval', 'approved'] }],
    },
  },
]

const INITIAL_FIELDS: CustomFieldDefinition[] = [
  {
    id: 'field-review-owner',
    recordType: 'vendor_bill',
    level: 'header',
    key: 'review_owner',
    label: 'Review owner',
    fieldType: 'text',
    config: { helpText: 'Person accountable for the final review.', showInList: true },
    isRequired: false,
    isActive: true,
    sortOrder: 0,
  },
  {
    id: 'field-cost-category',
    recordType: 'vendor_bill',
    level: 'line',
    key: 'cost_category',
    label: 'Cost category',
    fieldType: 'select',
    config: { options: ['Materials', 'Labour', 'Equipment', 'Other'] },
    isRequired: false,
    isActive: true,
    sortOrder: 1,
  },
]

function upsert<T extends { id?: string }>(items: T[], value: T): T[] {
  const index = items.findIndex((item) => item.id === value.id)
  return index === -1
    ? [...items, value]
    : items.map((item, itemIndex) => (itemIndex === index ? value : item))
}

function ensureId<T extends { id?: string }>(value: T, prefix: string): T & { id: string } {
  return { ...value, id: value.id ?? `${prefix}-${crypto.randomUUID()}` }
}

export function CustomizationWorkbench() {
  const [forms, setForms] = React.useState(INITIAL_FORMS)
  const [views, setViews] = React.useState(INITIAL_VIEWS)
  const [fields, setFields] = React.useState(INITIAL_FIELDS)
  const [hydrated, setHydrated] = React.useState(false)
  const [surface, setSurface] = React.useState<'records' | 'customize'>('records')

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as {
          forms?: FormDefinition[]
          views?: ListViewDefinition[]
          fields?: CustomFieldDefinition[]
        }
        if (parsed.forms) setForms(parsed.forms)
        if (parsed.views) setViews(parsed.views)
        if (parsed.fields) setFields(parsed.fields)
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY)
    } finally {
      setHydrated(true)
    }
  }, [])

  React.useEffect(() => {
    if (!hydrated) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ forms, views, fields }))
  }, [fields, forms, hydrated, views])

  const adapter = React.useMemo<CustomizationDesignerAdapter>(
    () => ({
      async saveForm(definition) {
        const saved = ensureId(definition, 'form')
        setForms((current) => upsert(current, saved))
        return saved
      },
      async deleteForm(id) {
        setForms((current) => current.filter((form) => form.id !== id))
      },
      async saveListView(definition) {
        const saved = ensureId(definition, 'view')
        setViews((current) => upsert(current, saved))
        return saved
      },
      async deleteListView(id) {
        setViews((current) => current.filter((view) => view.id !== id))
      },
      async saveField(definition) {
        const saved = ensureId(definition, 'field')
        setFields((current) => upsert(current, saved))
        return saved
      },
      async deleteField(id) {
        setFields((current) => current.filter((field) => field.id !== id))
      },
    }),
    [],
  )

  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center bg-bg text-fg-muted">
        <Spinner label="Loading customization studio" />
      </div>
    )
  }

  return <div className="flex h-full min-h-0 flex-col bg-bg">
    <div className="flex shrink-0 gap-1 border-b border-border bg-surface px-4 pt-2">
      <SurfaceTab active={surface === 'records'} onClick={() => setSurface('records')}>Record list</SurfaceTab>
      <SurfaceTab active={surface === 'customize'} onClick={() => setSurface('customize')}>Customize</SurfaceTab>
    </div>
    <div className="min-h-0 flex-1 overflow-hidden">
      {surface === 'records' ? <RecordListDemo views={views} fields={fields} onCustomize={() => setSurface('customize')} setViews={setViews} /> : <CustomizationStudio
        adapter={adapter}
        forms={forms}
        views={views}
        fields={fields}
        initialRecordType="vendor_bill"
        initialMode="views"
        resolveLabel={(messageKey, fallback) => SOURCE_LABELS[messageKey] ?? fallback}
        roleOptions={[
          { value: 'administrator', label: 'Administrator' },
          { value: 'manager', label: 'Manager' },
          { value: 'member', label: 'Member' },
        ]}
        footer={<p className="text-xs text-fg-subtle">Changes are saved in this browser.</p>}
      />}
    </div>
  </div>
}

const RECORD_ROWS = [
  { id: '1', kind: 'bill', document_number: 'BILL-1048', party_name: 'Northwind Supply', document_date: '2026-07-18', reference_number: 'NW-8841', total: 18420, open_balance: 18420, status: 'pending_approval', cf_review_owner: 'Jordan Lee' },
  { id: '2', kind: 'bill', document_number: 'BILL-1047', party_name: 'Summit Materials', document_date: '2026-07-17', reference_number: 'SM-5520', total: 7235.5, open_balance: 7235.5, status: 'approved', cf_review_owner: 'Alex Morgan' },
  { id: '3', kind: 'credit', document_number: 'CR-0192', party_name: 'Northwind Supply', document_date: '2026-07-16', reference_number: 'CM-219', total: -940, open_balance: -940, status: 'posted', cf_review_owner: 'Jordan Lee' },
  { id: '4', kind: 'bill', document_number: 'BILL-1046', party_name: 'Harbour Equipment', document_date: '2026-07-15', reference_number: 'HE-19002', total: 32600, open_balance: 32600, status: 'draft', cf_review_owner: 'Sam Rivera' },
  { id: '5', kind: 'bill', document_number: 'BILL-1045', party_name: 'Cedar Electric', document_date: '2026-07-14', reference_number: 'CE-773', total: 4860, open_balance: 0, status: 'paid', cf_review_owner: 'Alex Morgan' },
  { id: '6', kind: 'credit', document_number: 'CR-0191', party_name: 'Summit Materials', document_date: '2026-07-13', reference_number: 'CM-218', total: -1275, open_balance: 0, status: 'posted', cf_review_owner: 'Sam Rivera' },
  { id: '7', kind: 'bill', document_number: 'BILL-1044', party_name: 'Fieldstone Rentals', document_date: '2026-07-12', reference_number: 'FR-6104', total: 9120, open_balance: 9120, status: 'pending_approval', cf_review_owner: 'Jordan Lee' },
  { id: '8', kind: 'bill', document_number: 'BILL-1043', party_name: 'Atlas Concrete', document_date: '2026-07-11', reference_number: 'AC-884', total: 15680, open_balance: 0, status: 'paid', cf_review_owner: 'Alex Morgan' },
  { id: '9', kind: 'bill', document_number: 'BILL-1042', party_name: 'Harbour Equipment', document_date: '2026-07-10', reference_number: 'HE-18977', total: 2440, open_balance: 2440, status: 'approved', cf_review_owner: 'Sam Rivera' },
  { id: '10', kind: 'credit', document_number: 'CR-0190', party_name: 'Cedar Electric', document_date: '2026-07-09', reference_number: 'CM-217', total: -320, open_balance: -320, status: 'draft', cf_review_owner: 'Jordan Lee' },
  { id: '11', kind: 'bill', document_number: 'BILL-1041', party_name: 'Northwind Supply', document_date: '2026-07-08', reference_number: 'NW-8798', total: 5840, open_balance: 5840, status: 'pending_approval', cf_review_owner: 'Alex Morgan' },
  { id: '12', kind: 'bill', document_number: 'BILL-1040', party_name: 'Summit Materials', document_date: '2026-07-07', reference_number: 'SM-5481', total: 11200, open_balance: 0, status: 'paid', cf_review_owner: 'Sam Rivera' },
]

function RecordListDemo({ views, fields, onCustomize, setViews }: { views: ListViewDefinition[]; fields: CustomFieldDefinition[]; onCustomize: () => void; setViews: React.Dispatch<React.SetStateAction<ListViewDefinition[]>> }) {
  const meta = getRecordType('vendor_bill')!
  const available = views.filter((view) => view.recordType === 'vendor_bill')
  const [viewId, setViewId] = React.useState(available.find((view) => view.isDefault)?.id ?? available[0]?.id ?? '')
  const selected = available.find((view) => view.id === viewId) ?? available[0]
  const dynamicColumns = fields.filter((field) => field.recordType === 'vendor_bill' && field.config.showInList).map((field) => ({ key: `cf_${field.key}`, label: field.label, kind: 'custom' as const }))
  const baseView = mergeListViewColumns(selected?.config ?? defaultListView('vendor_bill'), meta, dynamicColumns)
  const [sort, setSort] = React.useState(baseView.sort)
  const [search, setSearch] = React.useState('')
  const [status, setStatus] = React.useState<string | undefined>()
  const [tab, setTab] = React.useState('all')
  const [page, setPage] = React.useState(1)
  const [open, setOpen] = React.useState<(typeof RECORD_ROWS)[number] | null>(null)
  React.useEffect(() => { setSort(baseView.sort); setPage(1) }, [viewId])
  const runtimeView = { ...baseView, sort }
  const input = tab === 'all' ? RECORD_ROWS : RECORD_ROWS.filter((row) => row.kind === tab)
  const result = queryRecordList({ rows: input, view: runtimeView, meta, search, filters: status ? [{ key: 'status', operator: 'eq', value: status }] : [], page })
  const statusOptions = [...new Set(RECORD_ROWS.map((row) => row.status))].map((value) => ({ value, label: value.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase()), count: RECORD_ROWS.filter((row) => row.status === value).length }))
  const savedViews: SavedListView[] = available.map((view) => ({ ...view, id: view.id!, ownerId: null }))
  return <div className="h-full overflow-y-auto p-4 sm:p-6"><div className="mx-auto max-w-screen-2xl space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold text-fg">Bills and credits</h1><p className="mt-1 text-sm text-fg-muted">Search, filter, sort, switch saved views, and open a record.</p></div><Button onClick={onCustomize}>Customize views</Button></div>
    <RecordListView
      meta={meta}
      view={runtimeView}
      rows={result.rows}
      total={result.total}
      page={result.page}
      perPage={result.perPage}
      views={savedViews}
      currentViewId={selected?.id ?? null}
      currentViewName={selected?.name ?? 'Standard'}
      dynamicColumns={dynamicColumns}
      subtabs={[
        { key: 'all', label: 'All activity', count: RECORD_ROWS.length },
        { key: 'bill', label: 'Bills', count: RECORD_ROWS.filter((row) => row.kind === 'bill').length },
        { key: 'credit', label: 'Credits', count: RECORD_ROWS.filter((row) => row.kind === 'credit').length },
      ]}
      activeSubtab={tab}
      search={search}
      currency="USD"
      statusVariant={(value) => value === 'approved' || value === 'paid' || value === 'posted'
        ? 'success'
        : value === 'draft' || value === 'pending_approval'
          ? 'warning'
          : value === 'voided'
            ? 'outline'
            : 'secondary'}
      quickFilters={[{ key: 'status', label: 'Status', value: status, options: statusOptions, onChange: (value) => { setStatus(value); setPage(1) } }]}
      canManageViews
      resolveLabel={(messageKey, fallback) => SOURCE_LABELS[messageKey] ?? fallback}
      rowKey={(row) => String(row.id)}
      onSearchChange={(value) => { setSearch(value); setPage(1) }}
      onPageChange={setPage}
      onSortChange={(column, direction) => { setSort({ column, dir: direction }); setPage(1) }}
      onViewChange={(id) => setViewId(id)}
      onSetDefaultView={async (id) => setViews((current) => current.map((view) => view.recordType === 'vendor_bill' ? { ...view, isDefault: view.id === id } : view))}
      onCreateView={onCustomize}
      onManageViews={onCustomize}
      onSubtabChange={(key) => { setTab(key); setPage(1) }}
      onOpenRow={setOpen}
    />
    <Drawer open={Boolean(open)} onClose={() => setOpen(null)} title={open?.document_number} description={open?.party_name} size="md"><div className="grid gap-4 sm:grid-cols-2"><RecordField label="Status"><Badge>{open?.status.replace(/_/g, ' ')}</Badge></RecordField><RecordField label="Date">{open?.document_date}</RecordField><RecordField label="Reference">{open?.reference_number}</RecordField><RecordField label="Review owner">{open?.cf_review_owner}</RecordField><RecordField label="Total">{open ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(open.total) : null}</RecordField><RecordField label="Open balance">{open ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(open.open_balance) : null}</RecordField></div></Drawer>
  </div></div>
}

function SurfaceTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={active ? '-mb-px border-b-2 border-primary px-3 py-2 text-sm font-medium text-primary' : '-mb-px border-b-2 border-transparent px-3 py-2 text-sm font-medium text-fg-muted hover:text-fg'}>{children}</button> }
function RecordField({ label, children }: { label: string; children: React.ReactNode }) { return <div><p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">{label}</p><div className="mt-1 text-sm text-fg">{children}</div></div> }
