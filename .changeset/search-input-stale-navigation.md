---
'@appkit/ui': patch
---

Keep URL-backed search input authoritative while overlapping route transitions
settle. Previously, an older streamed response could restore its query value
after the user had typed additional characters, visibly deleting newer input.

`SearchInput` now tracks whether it owns an uncommitted local edit, ignores stale
URL snapshots until all navigation settles with that exact value, and still
adopts browser-history or link changes whenever no local edit is pending.
