---
'@appkit/jobs': minor
---

Add isolated Redis readiness probes, source-grade queue payload validation, and an atomic fixed-window rate limiter with explicit lifecycle management.
The optional Web Push entry validates subscriptions, rechecks public DNS at
persistence and delivery boundaries, bounds encrypted payloads, and preserves
terminal provider status for subscription cleanup.
