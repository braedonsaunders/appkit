---
"@braedonsaunders/appkit-desk": patch
---

The Cloud Hypervisor backend removes a vsock socket left behind by a VMM that did not exit cleanly before it boots a desk, so the boot no longer fails with "Address in use". When a VMM still listens on that socket, the boot refuses with "Desk … is already running" and leaves the socket alone. `unixSocketListening` is exported.
