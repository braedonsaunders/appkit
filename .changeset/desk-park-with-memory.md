---
'@braedonsaunders/appkit-desk': minor
---

Desks can now be parked with their memory, so resuming continues the guest's process tree instead of cold booting it.

Parking meant `machine.shutdown()`: the VM stopped and only the disk survived. Nothing inside a guest lived between runs, which makes a desk unable to host anything continuous — an agent that installs a daemon and believes it is watching something is wrong about its own machine, and the cold boot on every scheduled occurrence is, from inside the guest, indistinguishable from a failing host.

`parkWithMemory` turns on the Cloud Hypervisor snapshot path: `vm.pause` then `vm.snapshot` over the API socket the launch plan has always created, and a resume that spawns the VMM with `--restore`. Off by default, because each parked desk holds a snapshot roughly the size of its guest RAM and the backend must offer `park`.

The hazard it introduces is handled rather than documented. A memory image is valid only against the disk it was taken with, so:

- A restore comes back **paused** (`resume=false`) and the new `onRestored` hook destroys the snapshot before the guest can write. There is no window in which a snapshot and a writing guest coexist.
- The guest filesystem is synced before the park, so the disk on its own is consistent and discarding a snapshot is always safe.
- A snapshot that will not restore is discarded and the desk cold boots, because an unusable snapshot would otherwise make the desk unbootable for as long as it sat there.
- `destroy` reclaims the snapshot with the overlay, whether or not parking is enabled — a snapshot outliving its disk would restore one desk's RAM over another desk's fresh disk.
