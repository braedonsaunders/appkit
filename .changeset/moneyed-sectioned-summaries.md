---
'@appkitjs/reports': minor
---

Production report-engine upgrades ported from the source platform.

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
