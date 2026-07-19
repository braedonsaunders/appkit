'use client'

import * as React from 'react'
import { Check, Moon, PanelRightOpen, Sparkles, Sun } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Drawer,
  Input,
  Label,
  Spinner,
} from '@appkit/ui'

function useTheme() {
  const [dark, setDark] = React.useState(false)
  React.useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])
  const toggle = React.useCallback(() => {
    setDark((d) => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      try {
        localStorage.setItem('theme', next ? 'dark' : 'light')
      } catch {}
      return next
    })
  }, [])
  return { dark, toggle }
}

/** Stagger helper: sets the CSS reveal delay without any JS animation loop. */
function revealStyle(i: number): React.CSSProperties {
  return { ['--reveal-delay' as string]: `${i * 70}ms` }
}

function Section({ title, children, i }: { title: string; children: React.ReactNode; i: number }) {
  return (
    <section className="reveal space-y-4" style={revealStyle(i)}>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-muted">{title}</h2>
      {children}
    </section>
  )
}

export default function Playground() {
  const { dark, toggle } = useTheme()
  const [open, setOpen] = React.useState(false)
  const [saving, setSaving] = React.useState(false)

  return (
    <div className="mx-auto min-h-screen max-w-5xl">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-bg/80 px-6 backdrop-blur-md">
        <div className="flex items-center gap-2 font-semibold">
          <Sparkles className="size-5 text-primary" />
          appkit
          <Badge variant="secondary">playground</Badge>
        </div>
        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
      </header>

      <main className="space-y-12 px-6 py-10">
        <div className="reveal">
          <h1 className="text-3xl font-bold tracking-tight">The design system, live</h1>
          <p className="mt-2 max-w-xl text-fg-muted">
            Every color is a semantic token — rebrandable from one file, correct in both modes.
            The flyout below is the extracted openbooks/beaconhs drawer with the animated
            full-screen expand.
          </p>
        </div>

        <Section title="Buttons" i={1}>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="subtle">Subtle</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
        </Section>

        <Section title="Badges" i={2}>
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
        </Section>

        <Section title="Cards & form" i={3}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Card interactive>
              <CardHeader>
                <CardTitle>Interactive card</CardTitle>
                <CardDescription>Hover me — token-driven lift + shadow.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-fg-muted">
                Surfaces, borders, and text all resolve through the token layer.
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Field</CardTitle>
                <CardDescription>Tokenized input with focus ring.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" />
              </CardContent>
            </Card>
          </div>
        </Section>

        <Section title="Flyout" i={4}>
          <Button onClick={() => setOpen(true)}>
            <PanelRightOpen className="size-4" /> Open flyout
          </Button>
        </Section>
      </main>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Extracted flyout"
        description="Spring slide-in · backdrop blur · ⤢ expand to full screen · Esc / click-out"
        size="lg"
        headerActions={
          <Button
            size="sm"
            onClick={() => {
              setSaving(true)
              setTimeout(() => setSaving(false), 1200)
            }}
          >
            {saving ? <Spinner className="text-primary-fg" /> : null}
            Save
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
        <div className="space-y-4">
          <p className="text-sm text-fg-muted">
            Click the ⤢ icon in the header to animate this panel out to the full viewport, then
            back. This is the same component openbooks and beaconhs use — now tokenized and
            app-agnostic.
          </p>
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" placeholder="Type something…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {['Alpha', 'Bravo', 'Charlie', 'Delta'].map((x) => (
              <Card key={x} className="p-4 text-sm font-medium">
                {x}
              </Card>
            ))}
          </div>
        </div>
      </Drawer>
    </div>
  )
}
