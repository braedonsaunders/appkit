# QueryChips

`QueryChips` is a controlled expression display with editable field/operator/value chips, removable conditions, nested group indicators, and an inline editor slot. It complements the URL-backed single-select `FilterChips`.

```tsx
import { QueryChips } from '@braedonsaunders/appkit-ui'

;<QueryChips
  ariaLabel="Conditions"
  items={[
    {
      kind: 'condition',
      id: 'status',
      field: 'Status',
      operator: 'is',
      value: 'Open',
    },
  ]}
  editLabel={(chip) => `Edit ${chip.id}`}
  removeLabel={(chip) => `Remove ${chip.id}`}
  onEdit={(chip) => setEditingId(chip.id)}
  onRemove={(chip) => removeCondition(chip.id)}
  editingId={editingId}
  renderEditor={(chip) => renderConditionEditor(chip.id)}
/>
```

All IDs must be stable and unique within the expression. A group has `{ kind: 'group', id, label, children }`; its localized label indicates the host's matching semantics. Conditions accept React nodes for field, operator and value. Labels and callbacks receive the condition, allowing the host to supply meaningful accessible names without parsing rendered nodes. `disabled` disables all edit/remove controls; individual conditions also accept `disabled`. `empty` and `actions` supply the empty presentation and add/clear controls. Buttons use native keyboard behavior and visible focus styles. The active editor remains controlled by `editingId`; the host owns commit/cancel behavior and focus when committing or removing.

The component does not compile SQL, parse natural language, resolve facets, persist filters, or infer group semantics. Applications retain their typed expression model, authorization, search, and persistence. The runnable `/query-chips` playground demonstrates editing, removing, adding, and changing a group indicator in both themes.
