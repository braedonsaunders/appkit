'use client'

import * as React from 'react'
import {
  ArrowRight,
  Bell,
  Check,
  CircleAlert,
  Info,
  Moon,
  Palette,
  PanelRightOpen,
  Sparkles,
  Sun,
  TriangleAlert,
} from 'lucide-react'
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Drawer,
  Input,
  Label,
  Progress,
  Separator,
  Skeleton,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
} from '@appkit/ui'

function useTheme() {
  const [dark, setDark] = React.useState(false)
  React.useEffect(() => {
    const root = document.documentElement
    let saved: string | null = null
    try {
      saved = localStorage.getItem('theme')
    } catch {}
    if (saved === 'dark') root.classList.add('dark')
    if (saved === 'light') root.classList.add('light')
    const effectiveDark =
      root.classList.contains('dark') ||
      (!root.classList.contains('light') &&
        window.matchMedia('(prefers-color-scheme: dark)').matches)
    setDark(effectiveDark)
  }, [])
  const toggle = React.useCallback(() => {
    setDark((d) => {
      const next = !d
      const root = document.documentElement
      root.classList.toggle('dark', next)
      root.classList.toggle('light', !next)
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light')
      } catch {}
      return next
    })
  }, [])
  return { dark, toggle }
}

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

export default function Home() {
  const { dark, toggle } = useTheme()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const [tab, setTab] = React.useState('overview')
  const [progress, setProgress] = React.useState(12)

  React.useEffect(() => {
    const id = setInterval(() => setProgress((p) => (p >= 96 ? 24 : p + 12)), 1400)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="mx-auto min-h-screen max-w-5xl">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" />
          appkit
          <Badge variant="secondary">v0.1</Badge>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip content={dark ? 'Light mode' : 'Dark mode'}>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </Button>
          </Tooltip>
        </div>
      </header>

      <main className="space-y-14 px-6 py-12">
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
            <Alert variant="info" icon={<Info className="size-4" />} title="Heads up">
              A tokenized info message.
            </Alert>
            <Alert variant="success" icon={<Check className="size-4" />} title="Saved">
              Your changes were saved.
            </Alert>
            <Alert variant="warning" icon={<TriangleAlert className="size-4" />} title="Careful">
              This action needs review.
            </Alert>
            <Alert variant="danger" icon={<CircleAlert className="size-4" />} title="Error">
              Something went wrong.
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
