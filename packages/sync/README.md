# @appkit/sync

Production inbound synchronization for applications that need to ingest CSV,
database, HTTP, managed-connector, or ERP data without giving up transaction
safety or an audit trail.

## What ships

- The production connector contract, registry, summaries, CSV parser,
  transforms, database drivers, and hardened outbound-network policy.
- A source-compatible orchestration entry through `createSyncOrchestrator`:
  tenant, connection, trigger, and optional preview mode go in; a durable run
  result comes back.
- Transactional batches with a savepoint per source record. One invalid row can
  be recorded and skipped without poisoning the remaining batch.
- A per-record change ledger containing action, canonical identity, before and
  after values, diff, source hash, failure detail, and dry-run state.
- Clean-run-only cursor advancement. Failed and partial runs retain the prior
  cursor so the next pull covers every failed row again.
- Fail-closed authoritative snapshots: missing-record archival is disabled when
  any row failed, an entity snapshot is empty, or authority was not explicit.
- Source-wins and manual-wins ownership policy, including the extracted people
  convergence and natural-key adoption rules.
- Complete Drizzle schema and migration for connections, crosswalks, runs, and
  record changes, plus database-free memory persistence and target adapters.

## Compose the runtime

```ts
import {
  createSyncOrchestrator,
  type SyncTarget,
} from '@appkit/sync'
import { createDrizzleSyncPersistence } from '@appkit/sync/drizzle'

const runSync = createSyncOrchestrator({
  connectors,
  persistence: createDrizzleSyncPersistence(db, withTenant),
  target: applicationTarget satisfies SyncTarget,
  resolveSecrets: (sealed) => credentials.unsealAll(sealed),
})

const result = await runSync({
  tenantId,
  connectionId,
  trigger: 'manual',
})
```

The application target is the deliberate domain boundary. It owns canonical
tables, natural keys, permission-aware lookups, field ownership, and archive
behavior. AppKit owns connection execution, transactions, savepoints, run and
change ledgers, cursor safety, snapshot policy, and connector infrastructure.
Credential unsealing is likewise injected through `resolveSecrets`, so this
package does not force an application to adopt a particular key derivation or
secret store.

## Public entries

- `@appkit/sync` — source-shaped runtime and the dependency-light API; optional
  SQL drivers remain isolated at `/db-drivers`
- `@appkit/sync/catalog` and `/registry` — connector contracts and the optional
  built-in registry, isolated so unused database vendors never enter the root
- `@appkit/sync/csv` and `/transform` — browser-safe parsing and mapping helpers
- `@appkit/sync/connectors/*` — optional connector families
- `@appkit/sync/runtime` — orchestration and memory adapters
- `@appkit/sync/person-sync-policy` — extracted ownership conflict decisions
- `@appkit/sync/snapshot-policy` — fail-closed archival planning
- `@appkit/sync/egress` and `/db-drivers` — hardened network/database access
- `@appkit/sync/schema` and `/drizzle` — feature-owned persistence

No credentials, application record schema, entity mapping, or product-specific
route is bundled in this package.
