---
"@braedonsaunders/appkit-desk": minor
---

`DeskHandle.boot` reports whether a residency `restored` from its parked memory snapshot or booted `cold` from disk, so callers no longer have to parse `stats().lastError` to learn that a restore was abandoned.
