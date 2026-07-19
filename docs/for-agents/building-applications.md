# Building applications on appkit — generalized rules

The portable, **app-agnostic** engineering + product rules for any application
built on the appkit foundation, distilled from the openbooks and beaconhs
`AGENTS.md`. An app's own `AGENTS.md` should adopt these and add only its
domain-specific rules (its ledger/kernel invariants, its regulatory model, its
per-tenant config surfaces). Nothing here names a specific product.

---

## A. Non-negotiable engineering rules

1. **Clean cutover — leave no legacy code.** A pre-launch app has nothing to be
   backward-compatible with. Do not preserve old paths, compatibility shims,
   deprecated APIs, or duplicate flows unless explicitly asked for a temporary
   migration step. Delete, don't deprecate.
2. **Ship complete, production-grade code.** No stubs, placeholders, mock
   implementations, TODO-driven behavior, fake data paths, or "wire it later"
   branches. If it's in the tree, it works end to end.
3. **See a bug, fix it** — even if unrelated to your task. If it's too large to
   fix safely in the current pass, flag it clearly before continuing.
4. **Search before you build.** Verify no duplicate already exists — search route
   names, table names, package exports, and UI labels; inspect nearby modules;
   reuse the existing system where it fits.
5. **Unify and abstract** shared behavior when it reduces real duplication or
   reconciles competing implementations — not speculatively.
6. **No dead code.** No duplicate implementations, abandoned files, unused
   exports, stale routes, or shadow systems. Flag and clean up in the same change.
7. **Reuse the foundation.** appkit is the UI/UX + platform baseline — copy its
   primitives and quality bar, don't approximate them. When appkit gains a
   primitive worth having, adopt it rather than re-rolling one.
8. **Docs are part of the feature.** When you add or change a user-facing
   capability, update its in-app help/manual article (and guided-tour steps, if
   any) in the **same change**, so the docs never drift from the software. A new
   capability ships with its article; a changed option updates the one that
   documents it.
9. **Configurable by default.** Anything a user of the app would reasonably expect
   to tune must be UI-configurable (per-tenant, stored on the tenant's data),
   never hardcoded, seeded-only, or editable only by engineers. Reserve hardcoding
   for true domain invariants and pure infra. When unsure, make it configurable.

## B. Validation gates (green before "done")

Run the full gate set locally and make every one pass before you commit; capture
each gate's own exit code (don't pipe to `tail` and read `$?`):

```
format-check · typecheck · lint · test · build
```

Never commit on red. **Never** disable, `--no-verify`, `eslint-disable`, or
`ts-ignore` your way around a failing gate — fix the underlying issue. A red
pipeline blocks the cutover. Run the narrowest meaningful checks while iterating,
then broaden when touching shared packages, schema, auth, tenant scoping, workers,
or UI primitives.

## C. Architecture

- **Workspace over copies.** pnpm/Turbo monorepo; prefer workspace packages over
  local re-implementations.
- **TypeScript, strictly** — `strict`, `noUncheckedIndexedAccess`,
  `noImplicitOverride` and friends stay on.
- **Drizzle for data access.** No ad-hoc SQL except where it's the right tool for
  a migration, policy, or a query the ORM can't express cleanly.
- **A native capability is a real column/table, never a JSON blob.** A JSONB
  `custom` column is reserved for user/admin-defined custom fields. First-class
  product features (settings, preferences, flags, links) get typed columns —
  storing a feature in `custom` to skip a migration is a bug.
- Prefer existing queue / event / storage / report / form primitives over
  inventing parallel systems. Keep module logic near its module until a shared
  abstraction is proven, then unify it into a package.

## D. Multi-tenancy, auth & permissions

- **Tenant data flows through the RLS-applying executor** (the request-scoped DB
  helper / `withOrg`-style context), so Postgres row-level security is enforced
  at the database. Only use the root/bypass handle with an explicit, intentional
  super-admin/system scope.
- **Every tenant table** carries the tenant/org id, is covered by RLS policy, and
  has an idempotent migration path. Never bypass RLS to "make it work" — fix the
  context, schema, or policy.
- **Permissions are wildcard strings** (`module.action`, e.g. `records.*`). Every
  mutation is explicit about the permission it requires (`assertCan` /
  `requirePermission`), writes an audit record, and revalidates affected paths.

## E. UI / UX (what appkit encodes — hold the line)

- **Fully tokenized; light + dark always.** No hardcoded colors; preserve both
  modes in every change. Use `@appkit/ui` primitives and the page shells — don't
  rebuild buttons/inputs/selects/tables/drawers. `lucide-react` icons. Keep
  operational UI dense, calm, scannable.
- **Every table/list ships search + relevant filters + pagination**, URL-driven.
  Module lists, detail sub-tables, dashboards, admin tables — all of them. An
  unbounded or unsearchable table is a bug, not a shortcut.
- **Records are flyout-first.** Create/view/edit happens in a drawer/flyout over
  the list (`?<record>=<id>`), not a separate route, unless a record is genuinely
  too complex (then a detail page). "New X" creates a real draft server-side and
  opens it in the flyout; drafts autosave; posting/submitting is explicit.
- **In-app navigation uses the client router — never a full reload.** Use
  `<Link>` / `router.push`; plain `<a href>` is only for real file downloads and
  external URLs.
- **One primary record per detail surface; verbs live behind one Actions menu.**
  The body shows data; every secondary mutate ("Add X", "Generate Y") is an entry
  in the record's Actions menu (a `ContextMenu` / `Popover`), never a standalone
  button bolted onto the page body.
- **Navigation comes from a nav registry** (+ per-tenant overrides), never
  hardcoded sidebar entries.
- **Statuses are `Badge` variants; toasts via the sonner-compatible `toast`**
  (`toast.success` / `toast.error`). Money and numeric columns render right-
  aligned `tabular-nums`.
- **Layout discipline:** KPI/stat tiles in a **single** row (never two stacked
  rows). Never place two wide (≥6-col) tables side-by-side — give each full width
  or split into subtabs.
- **Motion never hides content.** Entrance/reveal animations are
  visible-by-default (CSS `@starting-style`), never gated on a JS/rAF animation
  that strands content in a backgrounded/prerendered tab or causes an SSR/client
  hydration mismatch. Reserve framer-motion for interaction-driven, foreground
  motion. Honor `prefers-reduced-motion`.
- **Accessibility + responsive stay intact** — apps are used in the field, on
  tablets and small screens.

## F. Quality bar

- Production-grade means: permissions, validation, empty/loading/error states,
  audit trail, tenant isolation, persistence, revalidation, and tests or focused
  verification where the risk justifies it.
- **No fake success paths** — surface a real configuration error or a graceful
  disabled state when a dependency is missing.
- **No unreachable UI** — the navigation entry, permission key, and route land
  together. **No orphaned schema** — UI, actions, migration, RLS/policy, and any
  worker/report hooks land as one complete change.
- **Verify UI changes in the preview browser.** Drive the real screen; don't rely
  on typecheck alone. (Note: entrance animations idle in hidden headless tabs —
  inject a CSS override for screenshots; the console buffer is per-tab and stale,
  so read a fresh tab after a fix.)

## G. Testing

Tests are part of "complete, production-grade code" (rule A2), never a follow-up.

- Any change to logic where a wrong result is silent and costly (money math,
  posting, tax, anything balance- or correctness-critical) ships with automated
  tests in the **same change**.
- **Test invariants, not just the happy path** — the properties a reviewer would
  assert (totals balance, runs are idempotent, reversals net to zero, rounding is
  exact, closed/immutable rules refuse the write). Cover boundaries: zero,
  negative, multi-currency, precision, period edges, empty inputs.
- Colocate `*.test.ts` next to the code. Pure-logic tests run without a database;
  keep a contract/integration layer where risk justifies it. Never commit on red;
  never delete or weaken a test to go green — fix the code or the assertion's
  premise.

## H. Git & handoff

- **Commit atomically to local `main`** as you work — focused, self-contained
  commits. Stage only files you intentionally touched; the worktree may hold
  concurrent agent work, so **never revert files you did not edit**. End commit
  messages with the project's co-author trailer.
- **End completed work with a condensed checklist** the user can test against:
  what you changed, what you verified (and how), what remains risky. Name any bug
  you found and fixed. Keep documentation honest — if code and docs disagree, fix
  the stale docs in the same change.
