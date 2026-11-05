import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryChips, type QueryChip, type QueryChipsProps } from './query-chips'

const condition: QueryChip = {
  kind: 'condition',
  id: 'priority',
  field: 'Priority',
  operator: 'is',
  value: 'High',
}
const props: QueryChipsProps = {
  items: [{ kind: 'group', id: 'all', label: 'Toutes', children: [condition] }],
  ariaLabel: 'Filtres',
  editLabel: (c) => `Modifier ${c.id}`,
  removeLabel: (c) => `Supprimer ${c.id}`,
  onEdit: () => assert.fail('SSR must not edit'),
  onRemove: () => assert.fail('SSR must not remove'),
}

test('QueryChips renders localized native controls and group indicators', () => {
  const markup = renderToStaticMarkup(React.createElement(QueryChips, props))
  assert.match(markup, /role="group" aria-label="Filtres"/)
  assert.match(markup, /role="group" aria-label="Toutes"/)
  assert.match(markup, /aria-label="Modifier priority"/)
  assert.match(markup, /aria-label="Supprimer priority"/)
  assert.match(markup, /Priority/)
  assert.match(markup, /High/)
  assert.equal((markup.match(/<button/g) ?? []).length, 2)
})

test('QueryChips expands only the controlled editor, preserving condition and callbacks', () => {
  const calls: string[] = []
  const node = QueryChips({
    ...props,
    items: [condition],
    editingId: condition.id,
    onEdit: (c) => calls.push(`edit:${c.id}`),
    onRemove: (c) => calls.push(`remove:${c.id}`),
    renderEditor: (c) =>
      React.createElement('input', {
        'aria-label': `Value ${c.id}`,
        defaultValue: 'High',
      }),
  })
  const markup = renderToStaticMarkup(node)
  assert.match(markup, /aria-expanded="true"/)
  assert.match(markup, /aria-label="Value priority"/)
  function visit(element: React.ReactNode) {
    if (!React.isValidElement(element)) return
    const p = element.props as {
      onClick?: () => void
      children?: React.ReactNode
    }
    p.onClick?.()
    React.Children.forEach(p.children, visit)
  }
  visit(node)
  assert.deepEqual(calls, ['edit:priority', 'remove:priority'])
})

test('QueryChips supports disabled conditions, empty state and supplied actions', () => {
  const disabled = renderToStaticMarkup(
    React.createElement(QueryChips, { ...props, disabled: true }),
  )
  assert.equal((disabled.match(/disabled=""/g) ?? []).length, 2)
  const empty = renderToStaticMarkup(
    React.createElement(QueryChips, {
      ...props,
      items: [],
      empty: 'No filters',
      actions: React.createElement('button', null, 'Add filter'),
    }),
  )
  assert.match(empty, /No filters/)
  assert.match(empty, /Add filter/)
})
