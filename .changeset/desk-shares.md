---
'@braedonsaunders/appkit-desk': minor
---

Share host directories into desks over virtio-fs. `shares: [{ tag, path, readOnly }]` on `host.start` and `buildDeskLaunchPlan` mounts in the guest with `mount -t virtiofs <tag> <dir>`. Cloud Hypervisor desks run one `virtiofsd` (1.13 or later; `virtiofsdPath`, `virtiofsdSandbox`) per share with shared guest memory, started before the VMM on boot and restore and stopped with it; Virtualization.framework desks use `VZVirtioFileSystemDeviceConfiguration`. Read-only shares are enforced on the host. A parked desk records its shares beside its snapshot and restores with them.
