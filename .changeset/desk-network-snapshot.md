---
"@braedonsaunders/appkit-desk": minor
---

Add routed TAP networking with selectable open or proxied egress, guest TCP streams, and CPU-aware snapshot fallback. Existing deployments using `bh` iptables chains should set `chainPrefix: 'bh'` to retain them during rolling upgrades.
