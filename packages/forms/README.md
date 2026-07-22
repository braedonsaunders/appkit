# @appkit/forms

Production form filling and controlled form authoring for AppKit applications.
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

## Controlled surfaces

`FormRenderer` is a smaller controlled renderer for applications that want to
own every value and field callback. It is not the production-parity renderer.

`FormDesigner`, `LogicBuilder`, inspectors, canvas controls, and record/workflow
configuration are available for controlled authoring. `LogicBuilder` is a
faithful generalized extraction. The current `FormDesigner` is not yet the
complete production designer shell and must not be treated as a drop-in source
replacement until the remaining overview, workflow, assignment, permission,
publishing, and assisted-authoring surfaces are extracted.
