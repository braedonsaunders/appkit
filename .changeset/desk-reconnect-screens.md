---
"@braedonsaunders/appkit-desk": patch
---

Recover screen capture after a guest-agent reconnect by invalidating stale running state while preserving the existing screen handle and handover mask. Preserve native double-clicks as one validated guest request instead of two latency-sensitive round trips.
