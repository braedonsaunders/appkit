'use client'

import * as React from 'react'
import {
  ArrowRight,
  Bell,
  Check,
  CircleAlert,
  Info,
  MoreHorizontal,
  Palette,
  PanelRightOpen,
  Pencil,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ContextMenu,
  Dialog,
  Drawer,
  Input,
  Label,
  LineGrid,
  type LineGridColumn,
  Progress,
  RecordList,
  type RecordColumn,
  SearchSelect,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  toast,
  Tooltip,
  useContextMenu,
} from '@appkit/ui'

function Section({
  title,
  description,
  children,
  i = 0,
}: {
  title: string
  description?: string
  children: React.ReactNode
  i?: number
}) {
  return (
    <section className="reveal space-y-5" style={{ ['--reveal-delay' as string]: `${i * 60}ms` }}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description ? <p className="max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Swatch({ label, className, sub }: { label: string; className: string; sub?: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-14 rounded-lg border border-border ${className}`} />
      <div className="text-xs font-medium">{label}</div>
      {sub ? <div className="font-mono text-[11px] text-fg-subtle">{sub}</div> : null}
    </div>
  )
}

const SURFACES = [
  { label: 'bg', className: 'bg-bg' },
  { label: 'bg-subtle', className: 'bg-bg-subtle' },
  { label: 'surface', className: 'bg-surface' },
  { label: 'elevated', className: 'bg-elevated' },
]
const BRAND = [
  { label: 'primary', className: 'bg-primary' },
  { label: 'primary-hover', className: 'bg-primary-hover' },
  { label: 'primary-subtle', className: 'bg-primary-subtle' },
  { label: 'ring', className: 'bg-ring' },
]
const SEMANTIC = [
  { label: 'danger', className: 'bg-danger' },
  { label: 'warning', className: 'bg-warning' },
  { label: 'success', className: 'bg-success' },
  { label: 'info', className: 'bg-info' },
]

const PEOPLE = [
  { value: 'ada', label: 'Ada Lovelace', hint: 'Owner', group: 'Engineering' },
  { value: 'grace', label: 'Grace Hopper', hint: 'Admin', group: 'Engineering' },
  { value: 'alan', label: 'Alan Turing', group: 'Engineering' },
  { value: 'katherine', label: 'Katherine Johnson', group: 'Finance' },
  { value: 'linus', label: 'Linus Pauling', group: 'Finance' },
  { value: 'marie', label: 'Marie Curie', group: 'Research' },
  { value: 'rosalind', label: 'Rosalind Franklin', group: 'Research' },
  { value: 'nikola', label: 'Nikola Tesla', group: 'Research' },
]

type Invoice = { id: string; number: string; customer: string; status: string; amount: number }
const INVOICES: Invoice[] = [
  { id: '1', number: 'INV-1042', customer: 'Northwind Traders', status: 'paid', amount: 4820 },
  { id: '2', number: 'INV-1041', customer: 'Globex Corp', status: 'pending', amount: 12960 },
  { id: '3', number: 'INV-1040', customer: 'Initech', status: 'overdue', amount: 780 },
  { id: '4', number: 'INV-1039', customer: 'Umbrella Inc', status: 'paid', amount: 3400 },
  { id: '5', number: 'INV-1038', customer: 'Acme Co', status: 'draft', amount: 990 },
]
const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary'> = {
  paid: 'success',
  pending: 'warning',
  overdue: 'destructive',
  draft: 'secondary',
}
const usd = (v: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v))

const INVOICE_COLUMNS: RecordColumn<Invoice>[] = [
  { key: 'number', label: 'Invoice', kind: 'reference', sortable: true, href: () => '#' },
  { key: 'customer', label: 'Customer', sortable: true },
  { key: 'status', label: 'Status', kind: 'status', statusVariant: (v) => STATUS_VARIANT[v] ?? 'secondary' },
  { key: 'amount', label: 'Amount', kind: 'amount', sortable: true, format: usd },
]

type LineRow = { item: string; qty: string; rate: string; account: string }
const ACCOUNTS = [
  { value: 'services', label: 'Services income' },
  { value: 'product', label: 'Product income' },
  { value: 'consulting', label: 'Consulting' },
]
const LINE_COLUMNS: LineGridColumn<LineRow>[] = [
  { key: 'item', label: 'Item', width: 'minmax(200px,2fr)', type: 'text', placeholder: 'Description', required: true },
  { key: 'account', label: 'Account', width: '180px', type: 'select', options: ACCOUNTS },
  { key: 'qty', label: 'Qty', width: '90px', type: 'amount', align: 'right' },
  { key: 'rate', label: 'Rate', width: '120px', type: 'amount', align: 'right' },
  {
    key: 'amount',
    label: 'Amount',
    width: '120px',
    type: 'readonly',
    align: 'right',
    render: (r) => {
      const n = Number(r.qty) * Number(r.rate)
      return Number.isFinite(n) ? usd(n) : '—'
    },
  },
]

export default function ComponentGallery() {
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [tab, setTab] = React.useState('overview')
  const [progress, setProgress] = React.useState(12)

  React.useEffect(() => {
    const id = setInterval(() => setProgress((p) => (p >= 96 ? 24 : p + 12)), 1400)
    return () => clearInterval(id)
  }, [])

  const menu = useContextMenu()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [role, setRole] = React.useState('editor')
  const [assignee, setAssignee] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [sort, setSort] = React.useState<{ key: string; dir: 'asc' | 'desc' }>({
    key: 'number',
    dir: 'desc',
  })
  const [lines, setLines] = React.useState<LineRow[]>([
    { item: 'Design retainer', qty: '1', rate: '2400.00', account: 'services' },
    { item: 'Hosting (annual)', qty: '1', rate: '360.00', account: 'services' },
  ])

  const filtered = INVOICES.filter((r) =>
    search ? `${r.number} ${r.customer}`.toLowerCase().includes(search.toLowerCase()) : true,
  ).sort((a, b) => {
    const dir = sort.dir === 'asc' ? 1 : -1
    const av = a[sort.key as keyof Invoice]
    const bv = b[sort.key as keyof Invoice]
    return av < bv ? -dir : av > bv ? dir : 0
  })

  return (
    <div className="app-scroll h-full overflow-y-auto">
      <main className="mx-auto max-w-5xl space-y-14 px-6 py-12">
        {/* Hero */}
        <div className="reveal space-y-5">
          <Badge>
            <Palette className="size-3" /> Design system
          </Badge>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            A polished foundation for building apps.
          </h1>
          <p className="max-w-xl text-lg text-fg-muted">
            Fully tokenized, motion-aware components that look right in light and dark out of the
            box — and rebrand from a single file.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="lg">
              Get started <ArrowRight className="size-4" />
            </Button>
            <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
              <PanelRightOpen className="size-4" /> Open a panel
            </Button>
          </div>
        </div>

        {/* Foundations */}
        <Section
          title="Color tokens"
          description="Every component resolves through these semantic tokens — never a raw color. Swap the channel values and the whole system, both modes included, follows."
          i={0}
        >
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SURFACES.map((s) => (
                <Swatch key={s.label} {...s} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {BRAND.map((s) => (
                <Swatch key={s.label} {...s} />
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {SEMANTIC.map((s) => (
                <Swatch key={s.label} {...s} />
              ))}
            </div>
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons" description="Seven variants, four sizes, icon and loading states." i={1}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="subtle">Subtle</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
              <Button
                onClick={() => {
                  setSaving(true)
                  setTimeout(() => setSaving(false), 1400)
                }}
              >
                {saving ? <Spinner className="text-primary-fg" /> : <Check className="size-4" />}
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </Section>

        {/* Badges + tabs */}
        <Section title="Badges & tabs" i={2}>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">
              <Check className="size-3" /> Success
            </Badge>
            <Badge variant="warning">Warning</Badge>
            <Badge variant="destructive">Danger</Badge>
            <Badge variant="info">Info</Badge>
          </div>
          <Tabs
            value={tab}
            onValueChange={setTab}
            tabs={[
              { value: 'overview', label: 'Overview' },
              { value: 'activity', label: 'Activity' },
              { value: 'settings', label: 'Settings' },
            ]}
          />
        </Section>

        {/* Form controls */}
        <Section title="Form controls" description="Inputs, toggles, and selection — all with tokenized focus rings." i={3}>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="note">Note</Label>
                <Textarea id="note" placeholder="Add a note…" />
              </div>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                <span className="text-sm font-medium">Email notifications</span>
                <Switch defaultChecked />
              </label>
              <label className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
                <span className="text-sm font-medium">Weekly digest</span>
                <Switch />
              </label>
              <div className="flex items-center gap-2 px-1">
                <Checkbox id="terms" defaultChecked />
                <Label htmlFor="terms">I agree to the terms</Label>
              </div>
              <div className="flex items-center gap-2 px-1">
                <Checkbox id="marketing" />
                <Label htmlFor="marketing">Send me product updates</Label>
              </div>
            </div>
          </div>
        </Section>

        {/* Alerts */}
        <Section title="Alerts" i={4}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Alert variant="info">
              <AlertTitle className="flex items-center gap-2">
                <Info className="size-4" /> Heads up
              </AlertTitle>
              <AlertDescription>A tokenized info message.</AlertDescription>
            </Alert>
            <Alert variant="success">
              <AlertTitle className="flex items-center gap-2">
                <Check className="size-4" /> Saved
              </AlertTitle>
              <AlertDescription>Your changes were saved.</AlertDescription>
            </Alert>
            <Alert variant="warning">
              <AlertTitle className="flex items-center gap-2">
                <TriangleAlert className="size-4" /> Careful
              </AlertTitle>
              <AlertDescription>This action needs review.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle className="flex items-center gap-2">
                <CircleAlert className="size-4" /> Error
              </AlertTitle>
              <AlertDescription>Something went wrong.</AlertDescription>
            </Alert>
          </div>
        </Section>

        {/* People + progress */}
        <Section title="Data display" i={5}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Team</CardTitle>
                <CardDescription>Avatars with image + initial fallback.</CardDescription>
              </CardHeader>
              <CardContent className="flex items-center gap-3">
                <Avatar name="Ada Lovelace" src="https://i.pravatar.cc/80?img=5" />
                <Avatar name="Grace Hopper" />
                <Avatar name="Alan Turing" />
                <Tooltip content="+4 more">
                  <Avatar name="+ 4" className="bg-bg-subtle text-fg-muted" />
                </Tooltip>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Progress</CardTitle>
                <CardDescription>Determinate and indeterminate.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Progress value={progress} />
                <Progress />
                <div className="space-y-2 pt-1">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </CardContent>
            </Card>
          </div>
        </Section>

        {/* Menus & selection */}
        <Section
          title="Menus & selection"
          description="A searchable select (typeahead, grouped options, keyboard nav, mobile bottom sheet) and a context menu."
          i={6}
        >
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-56 space-y-1.5">
              <Label>Role</Label>
              <SearchSelect
                value={role}
                onChange={setRole}
                options={[
                  { value: 'viewer', label: 'Viewer' },
                  { value: 'editor', label: 'Editor' },
                  { value: 'admin', label: 'Admin' },
                  { value: 'owner', label: 'Owner' },
                ]}
              />
            </div>
            <div className="w-64 space-y-1.5">
              <Label>Assignee</Label>
              <SearchSelect
                value={assignee}
                onChange={setAssignee}
                options={PEOPLE}
                searchable
                clearable
                emptyLabel="Unassigned"
                placeholder="Unassigned"
                searchPlaceholder="Search people…"
              />
            </div>
            <Button variant="outline" onClick={(e) => menu.openBelow(e.currentTarget)}>
              <MoreHorizontal className="size-4" /> Actions
            </Button>
          </div>
        </Section>

        {/* Dialogs & toasts */}
        <Section title="Dialogs & toasts" description="A sonner-compatible toast API (toast.success / .error / .promise) and a modal dialog." i={7}>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setDialogOpen(true)}>
              Open dialog
            </Button>
            <Button variant="outline" onClick={() => toast.success('Saved', { description: 'Your changes are live.' })}>
              Success toast
            </Button>
            <Button variant="outline" onClick={() => toast.error('Something went wrong')}>
              Error toast
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                toast.promise(new Promise((res) => setTimeout(res, 1600)), {
                  loading: 'Saving…',
                  success: 'Saved',
                  error: 'Failed to save',
                })
              }
            >
              Promise toast
            </Button>
          </div>
        </Section>

        {/* Record list */}
        <Section
          title="Record list"
          description="A data-driven list page — search, sortable columns, typed cells (reference, amount, status badge), empty state."
          i={8}
        >
          <RecordList
            columns={INVOICE_COLUMNS}
            rows={filtered}
            getRowId={(r) => r.id}
            search={{ value: search, onChange: setSearch, placeholder: 'Search invoices…' }}
            sort={sort}
            onSortChange={(key) =>
              setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }))
            }
            empty={{ title: 'No invoices', description: 'Try a different search.' }}
          />
        </Section>

        {/* Line editor */}
        <Section
          title="Line editor"
          description="A spreadsheet-grade line-item grid. Enter adds a row, Alt+↑/↓ moves, ⌘D duplicates, ⌘⌫ removes."
          i={9}
        >
          <LineGrid
            columns={LINE_COLUMNS}
            rows={lines}
            onRowsChange={setLines}
            emptyRow={() => ({ item: '', qty: '1', rate: '', account: 'services' })}
            footer={
              <div className="text-sm text-fg-muted">
                Total{' '}
                <span className="font-semibold text-fg tabular-nums">
                  {usd(lines.reduce((s, l) => s + (Number(l.qty) * Number(l.rate) || 0), 0))}
                </span>
              </div>
            }
          />
        </Section>

        {/* Overlay */}
        <Section
          title="Panels"
          description="A slide-in flyout for detail views and forms — backdrop, focus trap, Esc / click-out, and expand to full screen."
          i={6}
        >
          <Button onClick={() => setOpen(true)}>
            <PanelRightOpen className="size-4" /> Open panel
          </Button>
        </Section>

        <Separator />
        <footer className="reveal pb-4 text-sm text-fg-subtle">
          Built with appkit — tokenized, animated, themeable.
        </footer>
      </main>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title="Delete project?"
        description="This action cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDialogOpen(false)
                toast.error('Project deleted')
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-fg-muted">Everything in this project will be permanently removed.</p>
      </Dialog>

      <ContextMenu
        open={menu.open}
        position={menu.position}
        onClose={menu.close}
        items={[
          { key: 'edit', label: 'Edit', icon: Pencil, onSelect: () => toast.info('Editing') },
          { key: 'mute', label: 'Mute', icon: Bell, onSelect: () => toast('Muted') },
          { key: 'sep', separator: true },
          { key: 'del', label: 'Delete', icon: Trash2, danger: true, onSelect: () => toast.error('Deleted') },
        ]}
      />

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Notification settings"
        description="Manage how and when you're notified."
        size="lg"
        headerActions={
          <Button size="sm" onClick={() => setOpen(false)}>
            <Bell className="size-4" /> Save
          </Button>
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="text-sm text-fg-muted">
            Use the expand control in the header to grow this panel to the full viewport, then
            collapse it back.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="channel">Display name</Label>
            <Input id="channel" placeholder="Type something…" />
          </div>
          <div className="space-y-3">
            {[
              { label: 'Product updates', on: true },
              { label: 'Security alerts', on: true },
              { label: 'Weekly summary', on: false },
            ].map((row) => (
              <label
                key={row.label}
                className="flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3"
              >
                <span className="text-sm font-medium">{row.label}</span>
                <Switch defaultChecked={row.on} />
              </label>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  )
}
