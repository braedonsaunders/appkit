# @appkit/integrations

Build outbound automations as a complete pipeline: an application event selects
matching automations, a durable queue isolates each delivery, the dispatcher
maps data into a destination, and a per-record ledger makes retries safe.

```bash
pnpm add @appkit/integrations
```

The package is modular. The root contains the dependency-free event, registry,
publisher, dispatcher, memory-store, idempotency, and authoring contracts. Add
only the destination, React, or Postgres entry points your application uses.

## Runtime

```ts
import {
  createIntegrationDispatcher,
  createIntegrationPublisher,
  createIntegrationRegistry,
  createMemoryIntegrationStore,
} from '@appkit/integrations'
import { httpDestination } from '@appkit/integrations/http'

const registry = createIntegrationRegistry({
  triggers: appTriggers,
  destinations: [httpDestination],
})
const store = createMemoryIntegrationStore(automationDefinitions)

const publishIntegrationEvent = createIntegrationPublisher({
  store,
  enqueueOutboundDispatch: outboundQueue.enqueueOutboundDispatch,
})
const dispatchOne = createIntegrationDispatcher({
  store,
  registry,
  unseal: applicationSecrets.unseal,
})
```

`publishIntegrationEvent(context, event, sourceEventId)` creates one stable job
id per matching automation. A worker calls
`dispatchOne(context, automationId, event)`. Completed send-once deliveries are
suppressed, partial deliveries resume known successes, reversible destinations
receive prior external ids, and an explicit empty ref list clears stale ledger
state.

## Destinations

- `/http` — public HTTPS REST requests with tokenized headers and bodies
- `/chat` — Slack and Teams incoming webhooks, including Slack Block Kit
- `/sheets` — Google Sheets append through service-account credentials
- `/email` — sanitized token templates through an application-owned transport
- `/sql` — TLS-only PostgreSQL, MySQL, MariaDB, and SQL Server delivery with
  identity-based reversal, weekly row fan-out, required-field filtering, and
  value maps

Each destination is an independent import. HTTP, chat, Sheets, and SQL reuse
the hardened egress and database-driver entries from `@appkit/sync`; email
accepts your queue or transport instead of choosing one for you.

## Authoring UI

```tsx
import { IntegrationBuilder, IntegrationHub } from '@appkit/integrations/react'
```

`IntegrationHub` provides the production connected-grid and searchable inbound
or outbound catalogue. `IntegrationBuilder` includes trigger and destination
selection, declared connection and secret fields, per-destination mapping
editors, click-to-insert trigger tokens, send-once policy, connection testing,
and save callbacks. It returns plaintext secret replacements separately so the
server can seal them before persistence.

## Postgres and RLS

`@appkit/integrations/schema` owns `tenant_integrations` and
`integration_export_log`, including the composite tenant foreign key, soft
deletion, lifecycle status, delivery details, and retry/reversal status.
`@appkit/integrations/drizzle` requires an RLS tenant runner:

```ts
import { createDrizzleIntegrationStore } from '@appkit/integrations/drizzle'

const store = createDrizzleIntegrationStore(db, withTenant)
```

Install `drizzle/0000_integrations.sql`, include
`INTEGRATION_TENANT_TABLES` in your RLS policy installation, and keep trigger
catalogues, authorization, domain event shaping, credentials, and the durable
queue in the application that owns them.
