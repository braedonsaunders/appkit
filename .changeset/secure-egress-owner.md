---
"@braedonsaunders/appkit-egress-proxy": patch
"@braedonsaunders/appkit-ai": patch
---

Move the DNS-pinned, SSRF-safe HTTPS transport into the shared egress package and remove AI's accidental runtime dependency on the data-sync package. Sync continues to re-export the transport for compatibility.
