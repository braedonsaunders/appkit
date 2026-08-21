# @braedonsaunders/appkit-reports

## 1.1.0

### Minor Changes

- a923c9b: Keep report studio usable while a name is blank, add Save as, keep relation filters on the physical identifier, expose related-table columns, and stop SearchSelect menus from running off the page.

### Patch Changes

- Updated dependencies [a923c9b]
  - @braedonsaunders/appkit-ui@0.2.1

## 1.0.0

### Minor Changes

- 0eff9e0: Add production report-engine upgrades.

  - New `money` column kind: flows through the compiler as `currency` semantics
    (right-aligned, currency-formatted on the paper, numeric filter operators and
    inputs). Count-style aggregates over money columns stay plain numbers.
  - New `latest` aggregate: the value on the chronologically last row of the
    group — what running figures (payroll YTD) need, where `max()` overstates
    after a net-negative period. Entities declare `latestOrderExpr`; compiling a
    `latest` measure without one fails loudly.
  - Summarize sections: a summarize query whose `groupBy` names an un-binned
    breakout shapes per-bucket titled `summary` groups with that column lifted
    out of the table. Sectioned enum breakouts order by their catalogue option
    position instead of alphabetically (a payroll journal lists earnings before
    deductions before employer contributions), and grand-total rows keep that
    ledger order.
  - `totals: { sections, grand }` for sectioned summaries: per-section subtotal
    rows at the first non-section breakout level plus a final Grand totals group,
    computed as exact decimal sums over the raw aggregates. Additive measures and
    `latest` running figures total (disjoint bucket endings add); avg/min/max
    stay blank — omission over a wrong number. Viewers style the new `totalRows`
    indices as total rows. `totals.derived` appends validated derived footer rows
    (e.g. Net pay = earnings − deductions) per section and to the grand group:
    plus-bucket totals minus minus-bucket totals via exact bigint decimal
    arithmetic, failing closed when a leg's field is not an un-binned breakout.
  - Exact-bucket drill scoping: summarize rows carry `rowKeys` (eq for plain
    breakouts, inclusive local-date ranges for binned buckets, is-empty markers
    for null buckets; unscopeable rows carry null so viewers offer NO drill).
    `parseReportDrillScope` validates untrusted URL scope state fail-closed, and
    `reportDrillScopeFilter` compiles a scope into eq / gte+lte / is_null rules,
    throwing on unknown or internal columns. Paper groups accept a group-level
    `drillTarget` fallback, and drill callbacks receive `groupKind` + `rowScope`.
  - Exact number display: `formatExactReportNumber` keeps true integers intact
    (tax year 2026, not 2026.00) and normalizes decimal strings to ledger-style
    two places without losing genuine precision.
  - Summary-band money: report summary items with `semanticType: 'currency'`
    carry a `money` flag onto the paper and render currency-formatted.
  - Report filter bar: `extraPeriods` renders domain-specific named windows (pay
    periods…) as the first period optgroup; selecting one applies
    `period=custom` with exact bounds while the select keeps showing the named
    entry.

### Patch Changes

- Updated dependencies [22e968a]
- Updated dependencies [9f04661]
  - @braedonsaunders/appkit-ui@0.2.0

## 0.2.1

### Patch Changes

- 1e69bf8: Replace schedule-time rolling-days and raw JSON controls with the same compiler-native filter tree used by report definitions. Hosts provide the authorized report entity with each schedule definition.
- Updated dependencies [0c2dde7]
- Updated dependencies [0c2dde7]
- Updated dependencies [a1d5d50]
- Updated dependencies [8a17e9e]
  - @braedonsaunders/appkit-ui@0.1.10

## 0.2.0

### Minor Changes

- 6502bed: Make the shared paper preview honor the canonical report layout's margin and
  summary visibility, carry layouts through result views, and remove
  migration-only React aliases from the public package boundary.
- 3ae036d: Complete the production builder and runtime extraction pass: full form and print-design authoring, hardened form PDF rendering, dashboard lifecycle composition, report refinement/cadence/run claiming, AI production helpers, transactional event relay, notification digest/push policy, source connector and destination registries, and persisted-query validation.

### Patch Changes

- 3ab6056: Build every package as compiled ESM with declarations and clean publish
  metadata, verify packed artifacts in fresh Node/React/Next consumers, add the
  `create-appkit` CLI, and automate version PRs and npm publication with
  Changesets.
- Updated dependencies [3ae036d]
- Updated dependencies [3ab6056]
- Updated dependencies [1319bfb]
  - @braedonsaunders/appkit-analytics@0.2.0
  - @braedonsaunders/appkit-ui@0.1.1
