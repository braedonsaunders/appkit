# @braedonsaunders/appkit-egress-proxy

## 0.1.1

### Patch Changes

- cfe19a9: Move the DNS-pinned, SSRF-safe HTTPS transport into the shared egress package and remove AI's accidental runtime dependency on the data-sync package. Sync continues to re-export the transport for compatibility.
