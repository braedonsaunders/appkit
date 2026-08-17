'use client'

import * as React from 'react'
import dynamic from 'next/dynamic'
import { Eye, RotateCcw } from 'lucide-react'
import {
  compileEmailDesign,
  renderEmailDesign,
  sampleMergeValues,
  starterHtml,
  type EmailCollection,
  type EmailDesignerPreset,
  type EmailMergeField,
} from '@appkitjs/email-designer'
import '@appkitjs/email-designer/styles.css'
import { hexColor } from '@appkitjs/tokens'
import { Button, Spinner } from '@appkitjs/ui'

// GrapesJS touches window, so the designer only ever loads in the browser.
const EmailDesigner = dynamic(
  () => import('@appkitjs/email-designer/react').then((m) => m.EmailDesigner),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-fg-muted">
        <Spinner />
        Loading the designer…
      </div>
    ),
  },
)

const STORAGE_KEY = 'appkit-demo:email-design:v1'

const fields: EmailMergeField[] = [
  { key: 'agent.name', label: 'Name', sample: 'Alex Morgan', group: 'Sender' },
  { key: 'agent.title', label: 'Title', sample: 'Project Manager', group: 'Sender' },
  { key: 'agent.email', label: 'Email', sample: 'alex@northstar.example', group: 'Sender' },
  { key: 'agent.phone', label: 'Phone', sample: '(555) 010-4820', group: 'Sender' },
  { key: 'company.name', label: 'Company', sample: 'Northstar Works', group: 'Company' },
  { key: 'company.website', label: 'Website', sample: 'https://northstar.example', group: 'Company' },
  { key: 'company.address', label: 'Address', sample: '18 Harbour Rd, Kingston', group: 'Company' },
  { key: 'project.name', label: 'Project', sample: 'North Tower', group: 'Project' },
  { key: 'project.number', label: 'Project number', sample: 'P-1048', group: 'Project' },
]

const collections: EmailCollection[] = [
  {
    key: 'milestones',
    label: 'Milestone',
    fields: [
      { key: 'name', label: 'Milestone' },
      { key: 'due', label: 'Due' },
      { key: 'owner', label: 'Owner' },
    ],
  },
]

const previewValues = sampleMergeValues(fields, collections, 3)

export function EmailWorkbench() {
  const [preset, setPreset] = React.useState<EmailDesignerPreset>('email')
  const [draft, setDraft] = React.useState('')
  const [restored, setRestored] = React.useState(false)

  const theme = React.useMemo(
    () => ({ accent: hexColor('primary'), ink: hexColor('fg'), muted: hexColor('fg-muted') }),
    [],
  )

  const storageKey = `${STORAGE_KEY}:${preset}`

  React.useEffect(() => {
    setRestored(false)
    try {
      setDraft(window.localStorage.getItem(storageKey) ?? '')
    } catch {
      setDraft('') // The designer stays usable when browser storage is unavailable.
    }
    setRestored(true)
  }, [storageKey])

  function update(html: string) {
    setDraft(html)
    try {
      window.localStorage.setItem(storageKey, html)
    } catch {
      /* Keep the in-memory edit. */
    }
  }

  function reset() {
    try {
      window.localStorage.removeItem(storageKey)
    } catch {
      /* Keep the reset in memory. */
    }
    setDraft('')
    setRestored(false)
    window.setTimeout(() => setRestored(true), 0) // remount the designer on the starter
  }

  // No inliner here: juice is server-only, and a browser honors the <style>
  // block the designer serializes. A real app inlines at save time.
  const compiled = React.useMemo(
    () =>
      compileEmailDesign(draft.trim() || starterHtml(preset, theme), {
        fragment: preset === 'signature',
      }),
    [draft, preset, theme],
  )

  const rendered = React.useMemo(
    () =>
      compiled.errors.length > 0
        ? { html: '', text: '' }
        : renderEmailDesign(compiled.compiledHtml, previewValues),
    [compiled],
  )

  function openPreview() {
    const blob = new Blob([rendered.html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener,noreferrer')
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['email', 'signature'] as const).map((option) => (
          <Button
            key={option}
            type="button"
            size="sm"
            variant={preset === option ? 'default' : 'outline'}
            onClick={() => setPreset(option)}
          >
            {option === 'email' ? 'Whole message' : 'Signature'}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <RotateCcw size={14} />
            Reset
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={openPreview}>
            <Eye size={14} />
            Preview output
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-2">
        <div className="min-h-0 overflow-hidden rounded-lg border border-border">
          {restored ? (
            <EmailDesigner
              key={preset}
              preset={preset}
              theme={theme}
              initialHtml={draft || null}
              mergeFields={fields}
              collections={preset === 'email' ? collections : []}
              onChange={update}
            />
          ) : null}
        </div>

        <div className="flex min-h-0 flex-col gap-2 overflow-y-auto rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Rendered with sample data
          </p>
          {compiled.errors.length > 0 ? (
            <p className="text-sm text-danger">{compiled.errors[0]}</p>
          ) : (
            <div className="rounded-md border border-border bg-white p-4">
              <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
            </div>
          )}
          <p className="mt-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            Plain-text part
          </p>
          <pre className="rounded-md border border-border bg-surface-muted p-3 text-xs whitespace-pre-wrap text-fg-muted">
            {rendered.text || '—'}
          </pre>
        </div>
      </div>
    </div>
  )
}
