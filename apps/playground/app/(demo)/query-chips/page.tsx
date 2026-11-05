'use client'

import * as React from 'react'
import Link from 'next/link'
import {
  Button,
  Input,
  QueryChips,
  type QueryChip,
} from '@braedonsaunders/appkit-ui'

export default function QueryChipsDemo() {
  const [items, setItems] = React.useState<QueryChip[]>([
    {
      kind: 'condition',
      id: 'priority',
      field: 'Priority',
      operator: 'is',
      value: 'High',
    },
    {
      kind: 'condition',
      id: 'owner',
      field: 'Owner',
      operator: 'is',
      value: 'Me',
    },
  ])
  const [editing, setEditing] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState('')
  const [matchAll, setMatchAll] = React.useState(true)
  return (
    <section aria-label="Query chip demo" className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <Link href="/components" className="text-sm text-primary">
        Components
      </Link>
      <h1 className="text-2xl font-semibold text-fg">Editable query chips</h1>
      <p className="text-fg-muted">
        Edit a condition in place, remove it, or change how the group matches.
        The host supplies fields, operators, value controls and translated
        labels.
      </p>
      <Button variant="outline" onClick={() => setMatchAll((v) => !v)}>
        {matchAll ? 'Match all' : 'Match any'}
      </Button>
      <QueryChips
        ariaLabel="Query conditions"
        items={
          items.length
            ? [
                {
                  kind: 'group',
                  id: 'root',
                  label: matchAll ? 'All' : 'Any',
                  children: items,
                },
              ]
            : []
        }
        editingId={editing}
        editLabel={(c) => `Edit ${c.field}`}
        removeLabel={(c) => `Remove ${c.field}`}
        onEdit={(c) => {
          setEditing(c.id)
          setDraft(String(c.value))
        }}
        onRemove={(c) => {
          setItems((prev) => prev.filter((v) => v.id !== c.id))
          if (editing === c.id) setEditing(null)
        }}
        empty={<p className="text-fg-muted">No conditions</p>}
        actions={
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const id = `condition-${Date.now()}`
              setItems((prev) => [
                ...prev,
                {
                  kind: 'condition',
                  id,
                  field: 'Label',
                  operator: 'contains',
                  value: 'New',
                },
              ])
              setDraft('New')
              setEditing(id)
            }}
          >
            Add condition
          </Button>
        }
        renderEditor={(c) => (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setItems((prev) =>
                prev.map((v) => (v.id === c.id ? { ...v, value: draft } : v)),
              )
              setEditing(null)
            }}
          >
            <Input
              aria-label="Condition value"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <Button type="submit" size="sm">
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </form>
        )}
      />
      <p role="status" className="text-sm text-fg-muted">
        {items.length} conditions
      </p>
    </section>
  )
}
