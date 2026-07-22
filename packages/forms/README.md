# @appkit/forms

Production form design and filling for AppKit applications.
The package is optional and uses `@appkit/forms-core` as its portable schema and
validation contract.

## Production runtime

`ProductionFormRenderer` is the source-parity fill surface. It includes:

- revision- and sequence-safe draft autosave, lazy draft creation, unload
  beacons, inline field saves, resume state, and conflict handling;
- guided workflow steps, client and server validation, formulas, defaults,
  conditional logic, read-only records, and submission handling;
- responsive grid, columns, and free-positioned canvas layouts;
- repeating sections and line tables, matrices, ratings, risk controls,
  attestations, signatures, sketches, rich text, address and hierarchy fields;
- tenant data queries and aggregates, entity-attribute refresh, file/photo
  upload, photo annotation, optional analysis, QR scanning, and camera input.

The runtime never reaches into an application's database, authorization layer,
storage, AI provider, or router. Supply those capabilities through
`ProductionFormRuntimeAdapter` and render through
`ProductionFormRuntimeProvider`. A database-free memory adapter is a valid
deployment; a production application can bind the same contract to RLS-scoped
services without changing the form component.

```tsx
import { ProductionFormRenderer } from '@appkit/forms'
import '@appkit/forms/styles.css'

<ProductionFormRenderer adapter={adapter} {...input} />
```

`input` carries the source-shaped template, sites, people, entity data, current
user, optional resumed response, and application-owned record/review links.
The built-in English copy catalogue is complete; pass `translateGenerated` to
the renderer to bind generated copy IDs to another catalogue.

## Production designer

`ProductionFormDesigner` is the complete source authoring workspace. It ships
the production 1/3–2/3 editor composition with overview, field palette,
stacked and free-canvas layouts, tabs, sign-off steps, record behaviour,
configurable record lists, manual record actions, assignments, access control,
preview, immutable publishing, localized content, and the full properties
inspector. `formFlowProfile` and `lintFormFlowGraph` bind the same form schema
to `@appkit/workflows/react` without duplicating automation rules.

Application-owned persistence, routing, authorization, workflow storage, data
sources, and optional AI assistance enter through typed adapters and render
seams. The database-free playground uses browser-local adapters; a production
application can bind the same component to tenant-scoped services.

```tsx
import { ProductionFormDesigner } from '@appkit/forms'

<ProductionFormDesigner
  adapter={designerAdapter}
  recordActionAdapter={recordActionAdapter}
  renderFlows={(input) => <FlowsCanvas {...toWorkflowProps(input)} />}
  {...template}
/>
```

## Controlled surfaces

`FormRenderer` is a smaller controlled renderer for applications that want to
own every value and field callback. It is not the production-parity renderer.

`FormDesigner`, `LogicBuilder`, inspectors, canvas controls, and record/workflow
configuration remain available as smaller controlled compositions when an
application does not need the production shell. Do not substitute the smaller
`FormDesigner` for `ProductionFormDesigner` in a parity cutover.
