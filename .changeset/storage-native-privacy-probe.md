---
"@braedonsaunders/appkit-storage": patch
---

Use Node's native HTTP transport for private-bucket readiness probes so S3-compatible ingress endpoints that stall Undici fetches can still be verified without waiting for a response body.
