# @braedonsaunders/appkit-query-console

A governed raw-SQL workbench extracted from OpenBooks. The package owns the
editor, live schema tree, snippets, history, sortable/filterable results, CSV
export, browser or injected persistence, response validation, and HTTP adapter.

The consuming application owns the actual query trust boundary. Its
`QueryConsoleAdapter` must authorize the request and execute with database-level
tenant scope, a SELECT-only role, a read-only transaction, a statement timeout,
and a result cap. `validateReadOnlySql()` is defense in depth, not a substitute
for those controls.

## Install

```bash
pnpm add @braedonsaunders/appkit-query-console @braedonsaunders/appkit-ui
```

Import `@braedonsaunders/appkit-query-console/styles.css` beside the AppKit UI
stylesheet so Tailwind scans the optional React entry.

```tsx
import { createHttpQueryConsoleAdapter } from '@braedonsaunders/appkit-query-console'
import { QueryConsole } from '@braedonsaunders/appkit-query-console/react'

const adapter = createHttpQueryConsoleAdapter({
  executeUrl: '/api/query',
  schemaUrl: '/api/query/schema',
})

export function QueryPage() {
  return <QueryConsole adapter={adapter} storageNamespace="my-app.query.user-123" />
}
```

For multi-user applications, include the authenticated user and tenant in the
browser-storage namespace or inject a durable `QueryConsoleStorage`. Saved SQL
can reveal schema and business vocabulary and must not leak between sessions.

## Host-owned boundaries

- route authentication and `sql.execute` authorization;
- tenant/subsidiary scope and any fail-closed scope restrictions;
- governed schema views and sensitive-column exclusion;
- the database role, read-only transaction, timeout, and row cap;
- audit persistence and application error redaction.

The package intentionally does not accept a database connection or infer a
tenant from the browser.
