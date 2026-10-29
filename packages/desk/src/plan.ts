import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { isIP } from 'node:net'
import { arch as hostArch, release as hostRelease, tmpdir } from 'node:os'
import { delimiter, dirname, isAbsolute, join, resolve } from 'node:path'

export const DEFAULT_VMM_PATH = '/usr/bin/cloud-hypervisor'
export const DEFAULT_KVM_PATH = '/dev/kvm'
export const DEFAULT_QEMU_IMG_PATH = '/usr/bin/qemu-img'
export const DEFAULT_RUNTIME_DIR = '/run/appkit-desk'
export const DEFAULT_MEMORY_MB = 384
export const DEFAULT_VCPUS = 2
export const DEFAULT_KERNEL_CMDLINE = 'root=/dev/vda rw quiet'
/**
 * Where a Cloud Hypervisor desk looks for `virtiofsd` when `virtiofsdPath` is
 * not set and it is not on `PATH`: Debian's and Fedora's package location.
 */
export const DEFAULT_VIRTIOFSD_PATH = '/usr/libexec/virtiofsd'
export const DEFAULT_VIRTIOFSD_SANDBOX: DeskVirtiofsdSandbox = 'namespace'
/**
 * The guest network Virtualization.framework desks get from the helper's NAT:
 * the same addresses QEMU's user networking uses, so they are unsurprising in
 * a guest. Nothing outside the helper ever sees them.
 */
export const DEFAULT_VZ_GUEST_ADDRESS = '10.0.2.15'
export const DEFAULT_VZ_GATEWAY_ADDRESS = '10.0.2.2'
export const DEFAULT_VZ_PREFIX_LENGTH = 24
export const DEFAULT_VZ_DNS: readonly string[] = ['1.1.1.1', '9.9.9.9']
/** Virtualization.framework always gives the guest vsock context ID 3. */
export const VZ_GUEST_CID = 3
/** The first Darwin release with Virtualization.framework save and restore (macOS 14). */
const MIN_DARWIN_MAJOR = 23
/** `sun_path` holds 104 bytes on Darwin, including the terminator. */
const DARWIN_SOCKET_PATH_LIMIT = 103
/** `sun_path` holds 108 bytes on Linux, including the terminator. */
const LINUX_SOCKET_PATH_LIMIT = 107
/** Linux's virtio-fs tag field is 36 bytes; Virtualization.framework enforces the same. */
const SHARE_TAG_PATTERN = /^[a-z0-9][a-z0-9-]{0,35}$/

const DESK_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const TAP_DEVICE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,14}$/
const MAC_ADDRESS_PATTERN = /^[0-9a-f]{2}(?::[0-9a-f]{2}){5}$/i
/** vsock CIDs 0–2 are reserved (hypervisor, loopback, host). */
const MIN_GUEST_CID = 3
const MAX_GUEST_CID = 0xffff_fffe

/**
 * Every failure this package raises. The `name` is annotated as `string`
 * rather than left to infer its literal so a subclass can narrow the meaning
 * of a failure — see `DeskRequestFateUnknownError` — without callers losing
 * the one `instanceof DeskError` they already check.
 */
export class DeskError extends Error {
  override readonly name: string = 'DeskError'
}

export interface DeskLauncherIdentity {
  /** Host/container UID used to invoke the VMM and image tooling. */
  uid: number
  /** Host/container GID used to invoke the VMM and image tooling. */
  gid: number
}

/**
 * Which hypervisor a plan is for: Cloud Hypervisor over KVM on Linux, or
 * Apple's Virtualization.framework through the `appkit-desk-vz` helper on an
 * Apple silicon Mac.
 */
export type DeskHypervisor = 'cloud-hypervisor' | 'virtualization'

/**
 * The guest network of a Virtualization.framework desk. The helper runs a
 * userspace NAT: the guest reaches the public internet and nothing else unless
 * `allowLan` is set — no RFC 1918 space, link-local, CGNAT, or the Mac itself.
 */
export interface DeskGuestNetworkOptions {
  /** Let the guest reach the Mac's LAN, link-local and CGNAT space, and the Mac. */
  allowLan?: boolean
  /** The address the helper's DHCP server leases the guest. */
  guestAddress?: string
  /** The helper's own address on the link: the guest's router. */
  gatewayAddress?: string
  prefixLength?: number
  /** Resolvers the guest is handed; the first also answers DNS sent to the gateway. */
  dns?: readonly string[]
}

/**
 * A host directory shared into the guest over virtio-fs. The guest mounts it
 * with `mount -t virtiofs <tag> <dir>`.
 */
export interface DeskShare {
  /** 1–36 lowercase letters, digits, or hyphens, starting with a letter or digit; unique per desk. */
  tag: string
  /** Absolute path of an existing host directory. */
  path: string
  /**
   * Refuse every write from the guest. Enforced by the host's file server, so
   * a guest cannot lift it by remounting the share read-write.
   */
  readOnly: boolean
}

/**
 * How `virtiofsd` confines itself to the shared directory. `namespace` (its
 * own default) pivots into the directory inside new mount, PID and network
 * namespaces, which needs CAP_SYS_ADMIN when run as root and unprivileged user
 * namespaces otherwise. `chroot` only chroots, which needs root and suits a
 * container that may not create namespaces. Both stop symlinks from escaping
 * the share; running unconfined is not offered.
 */
export type DeskVirtiofsdSandbox = 'namespace' | 'chroot'

/** An immutable host image. The caller must retain its bytes and path for every snapshot. */
export interface DeskReadOnlyAttachment {
  path: string
  /** SHA-256 of the immutable image, used as snapshot identity. */
  sha256: string
  kind: 'block' | 'pmem'
}

export interface DeskLaunchPlanOptions {
  deskId: string
  /** Defaults to `cloud-hypervisor`. */
  hypervisor?: DeskHypervisor
  /** Cloud Hypervisor only: the VMM binary. */
  vmmPath?: string
  /** Cloud Hypervisor only: the KVM device. */
  kvmPath?: string
  qemuImgPath?: string
  /** Absolute path of the kernel image the microVM boots. */
  kernelPath: string
  /**
   * Absolute path of an initramfs. Required whenever the kernel loads its
   * root-filesystem or virtio drivers as modules — a stock distro cloud kernel
   * panics with "VFS: Unable to mount root fs" if it boots without one. Omit
   * only for a kernel with virtio_blk/ext4 built in.
   */
  initramfsPath?: string
  /** Absolute path of the golden raw base image every desk clones. */
  baseImagePath: string
  /** Absolute path of this desk's copy-on-write overlay (a raw reflink clone). */
  overlayPath: string
  memoryMb?: number
  vcpus?: number
  /**
   * Guest vsock context ID; must be unique among resident desks. Cloud
   * Hypervisor only — a Virtualization.framework guest is always CID 3, and
   * its vsock is private to its helper.
   */
  vsockCid: number
  /**
   * Directory holding the desk's control sockets. Defaults to
   * `/run/appkit-desk` for Cloud Hypervisor and `<os tmpdir>/appkit-desk` for
   * Virtualization.framework.
   */
  runtimeDir?: string
  /** Cloud Hypervisor only: host TAP device name; derived from the CID when omitted. */
  tapDevice?: string
  /**
   * Guest MAC address. Derived from the CID for Cloud Hypervisor, and from the
   * desk ID for Virtualization.framework, whose restore needs the same NIC.
   */
  macAddress?: string
  /** Virtualization.framework only: the helper's NAT network and fence. */
  guestNetwork?: DeskGuestNetworkOptions
  /**
   * Host directories shared into the guest. Restoring a snapshot requires the
   * same shares the desk was parked with; see the backends.
   */
  shares?: readonly DeskShare[]
  /** Additional immutable Cloud Hypervisor devices, in guest enumeration order. */
  readOnlyAttachments?: readonly DeskReadOnlyAttachment[]
  /**
   * Cloud Hypervisor only: the `virtiofsd` binary (1.13 or later) that serves
   * each share. Defaults to the first `virtiofsd` on `PATH`, then
   * `/usr/libexec/virtiofsd`. Not needed, and not looked for, without shares.
   */
  virtiofsdPath?: string
  /** Cloud Hypervisor only: defaults to `namespace`. */
  virtiofsdSandbox?: DeskVirtiofsdSandbox
  kernelCmdline?: string
  launcherIdentity?: DeskLauncherIdentity
  /**
   * Where this desk's memory snapshot lives. Defaults beside the overlay, which
   * is the volume sized for desk state — a snapshot is roughly `memoryMb` of
   * guest RAM, so it does not belong on a runtime tmpfs.
   */
  snapshotDir?: string
  /**
   * Resume from that snapshot instead of booting the kernel.
   *
   * A restored VM continues with its process tree intact, which is the whole
   * point of parking with memory rather than shutting down: an agent's in-guest
   * daemon survives. Refused when the snapshot is not there, rather than falling
   * back to a cold boot — a silent cold boot is how a desk loses the state it
   * was promised to have kept.
   */
  restore?: boolean
  /** Cloud Hypervisor copy-on-write restore; the source must remain unchanged while resident. */
  memoryRestoreMode?: 'copyonwrite'
}

/** What every plan carries, whichever hypervisor runs it. */
export interface DeskLaunchPlanBase {
  deskId: string
  overlay: {
    path: string
    basePath: string
    /** The overlay-creation step, or `null` when the overlay already exists. */
    create: { command: string; args: string[] } | null
  }
  /**
   * The host Unix socket the guest's vsock is reached through, with Cloud
   * Hypervisor's hybrid-vsock preamble: write `CONNECT <port>\n`, read
   * `OK <n>\n`, then the stream is the guest connection.
   */
  vsock: { cid: number; socketPath: string }
  /** Where a memory snapshot of this desk is written, and read back from. */
  snapshot: { dir: string; restoring: boolean }
  /** Host directories shared into the guest, in the order they were given. */
  shares: readonly DeskShare[]
  memoryMb: number
  vcpus: number
  kernelPath: string
  /** Resolved initramfs path, or `null` when the kernel needs none. */
  initramfsPath: string | null
  kernelCmdline: string
  launcherIdentity?: DeskLauncherIdentity
}

/**
 * The complete Cloud Hypervisor invocation as inspectable data. Nothing here
 * has been spawned: tests, audit logs, and readiness screens can assert on the
 * exact argv a desk would boot with.
 */
export interface CloudHypervisorLaunchPlan extends DeskLaunchPlanBase {
  hypervisor: 'cloud-hypervisor'
  vmm: { command: string; args: string[] }
  api: { socketPath: string }
  tap: { device: string; mac: string }
  /**
   * Each share with the `virtiofsd` that serves it. Every daemon must be
   * listening on its socket before the VMM starts, for a boot and for a
   * restore alike.
   */
  shares: readonly CloudHypervisorShare[]
}

export interface CloudHypervisorShare extends DeskShare {
  /** The vhost-user socket the daemon listens on and the VMM connects to. */
  socketPath: string
  daemon: { command: string; args: string[] }
}

/**
 * A Virtualization.framework desk as inspectable data: what the helper is
 * asked to boot. The helper path belongs to the backend, not the plan.
 */
export interface VirtualizationLaunchPlan extends DeskLaunchPlanBase {
  hypervisor: 'virtualization'
  /**
   * The host Unix socket guest TCP ports are reached through, with the same
   * preamble as `vsock`: `CONNECT <tcp port>\n` answered by `OK <n>\n` once
   * the guest accepts, or a close with nothing written when it refuses.
   */
  ports: { socketPath: string }
  network: {
    mac: string
    allowLan: boolean
    guestAddress: string
    gatewayAddress: string
    prefixLength: number
    dns: string[]
  }
}

export type DeskLaunchPlan = CloudHypervisorLaunchPlan | VirtualizationLaunchPlan

/**
 * Whether this host can run desks at all. On Linux: a usable `/dev/kvm` and
 * the Cloud Hypervisor binary. On macOS: Apple silicon, macOS 14 or later (the
 * first with Virtualization.framework save and restore), and an existing
 * `appkit-desk-vz` helper at `helperPath`. Signature and entitlement are checked
 * by macOS on execution, not by this probe. Every check is injectable and the
 * answer is fail-closed — a host missing any of them gets no desk capability
 * rather than a degraded one.
 */
export function isDeskSupported(options: {
  platform?: NodeJS.Platform
  kvmPath?: string
  vmmPath?: string
  /** macOS: the signed `appkit-desk-vz` helper. Required there. */
  helperPath?: string
  arch?: string
  /** The kernel release, as `os.release()` reports it. */
  osRelease?: string
  pathExists?: (path: string) => boolean
} = {}): boolean {
  const platform = options.platform ?? process.platform
  const pathExists = options.pathExists ?? existsSync
  if (platform === 'darwin') {
    const major = Number.parseInt((options.osRelease ?? hostRelease()).split('.')[0] ?? '', 10)
    return (
      (options.arch ?? hostArch()) === 'arm64'
      && Number.isInteger(major)
      && major >= MIN_DARWIN_MAJOR
      && options.helperPath !== undefined
      && isAbsolute(options.helperPath)
      && pathExists(options.helperPath)
    )
  }
  return (
    platform === 'linux'
    && pathExists(options.kvmPath ?? DEFAULT_KVM_PATH)
    && pathExists(options.vmmPath ?? DEFAULT_VMM_PATH)
  )
}

/** Validate a desk identifier, which is used in socket paths and device names. */
export function cleanDeskId(value: string): string {
  if (!DESK_ID_PATTERN.test(value)) {
    throw new DeskError(
      'deskId must be 1–64 letters, numbers, dots, underscores, or hyphens.',
    )
  }
  return value
}

export interface DeskLaunchPlanDependencies {
  pathExists?: (path: string) => boolean
  deviceExists?: (path: string) => boolean
  /** Whether a path is an existing directory; checked for every share. */
  isDirectory?: (path: string) => boolean
  /** Searched for `virtiofsd` when `virtiofsdPath` is not set; defaults to `process.env.PATH`. */
  searchPath?: string
}

/**
 * Build the deterministic launch plan without spawning anything. Fail closed:
 * a missing `/dev/kvm` or VMM binary (Cloud Hypervisor), kernel, base image,
 * or overlay directory throws instead of producing a plan that cannot boot.
 */
export function buildDeskLaunchPlan(
  options: DeskLaunchPlanOptions & { hypervisor: 'virtualization' },
  dependencies?: DeskLaunchPlanDependencies,
): VirtualizationLaunchPlan
export function buildDeskLaunchPlan(
  options: DeskLaunchPlanOptions & { hypervisor?: 'cloud-hypervisor' },
  dependencies?: DeskLaunchPlanDependencies,
): CloudHypervisorLaunchPlan
export function buildDeskLaunchPlan(
  options: DeskLaunchPlanOptions,
  dependencies?: DeskLaunchPlanDependencies,
): DeskLaunchPlan
export function buildDeskLaunchPlan(
  options: DeskLaunchPlanOptions,
  dependencies: DeskLaunchPlanDependencies = {},
): DeskLaunchPlan {
  const hypervisor = options.hypervisor ?? 'cloud-hypervisor'
  if (options.memoryRestoreMode !== undefined && (options.memoryRestoreMode !== 'copyonwrite' || hypervisor !== 'cloud-hypervisor')) {
    throw new DeskError('Copy-on-write restore requires Cloud Hypervisor.')
  }
  if (hypervisor === 'virtualization') return buildVirtualizationPlan(options, dependencies)
  if (hypervisor !== 'cloud-hypervisor') {
    throw new DeskError(`Unknown hypervisor: ${String(hypervisor)}`)
  }
  if (options.guestNetwork !== undefined) {
    throw new DeskError(
      'guestNetwork applies to Virtualization.framework desks; a Cloud Hypervisor desk is networked with createDeskNetwork.',
    )
  }
  return buildCloudHypervisorPlan(options, dependencies)
}

function buildCloudHypervisorPlan(
  options: DeskLaunchPlanOptions,
  dependencies: DeskLaunchPlanDependencies,
): CloudHypervisorLaunchPlan {
  const pathExists = dependencies.pathExists ?? existsSync
  const deviceExists = dependencies.deviceExists ?? existsSync
  const isDirectory = dependencies.isDirectory ?? directoryExists
  const deskId = cleanDeskId(options.deskId)
  const kvmPath = absolutePath(options.kvmPath ?? DEFAULT_KVM_PATH, 'kvmPath')
  if (!deviceExists(kvmPath)) {
    throw new DeskError(
      `KVM is not available at ${kvmPath}. Desks require hardware virtualization; `
        + 'there is no software-emulation fallback.',
    )
  }
  const vmmPath = absolutePath(options.vmmPath ?? DEFAULT_VMM_PATH, 'vmmPath')
  if (!pathExists(vmmPath)) {
    throw new DeskError(
      `Cloud Hypervisor was not found at ${vmmPath}. Install cloud-hypervisor or configure vmmPath.`,
    )
  }
  const kernelPath = absolutePath(options.kernelPath, 'kernelPath')
  if (!pathExists(kernelPath)) {
    throw new DeskError(`Guest kernel does not exist: ${kernelPath}`)
  }
  const initramfsPath =
    options.initramfsPath === undefined
      ? null
      : absolutePath(options.initramfsPath, 'initramfsPath')
  if (initramfsPath !== null && !pathExists(initramfsPath)) {
    throw new DeskError(`Initramfs does not exist: ${initramfsPath}`)
  }
  const baseImagePath = absolutePath(options.baseImagePath, 'baseImagePath')
  if (!pathExists(baseImagePath)) {
    throw new DeskError(`Base image does not exist: ${baseImagePath}`)
  }
  const overlayPath = absolutePath(options.overlayPath, 'overlayPath')
  const overlayDirectory = dirname(overlayPath)
  if (!pathExists(overlayDirectory)) {
    throw new DeskError(`Overlay directory does not exist: ${overlayDirectory}`)
  }
  const memoryMb = positiveInteger(options.memoryMb ?? DEFAULT_MEMORY_MB, 'memoryMb')
  const vcpus = positiveInteger(options.vcpus ?? DEFAULT_VCPUS, 'vcpus')
  const vsockCid = cleanCid(options.vsockCid)
  const runtimeDir = absolutePath(options.runtimeDir ?? DEFAULT_RUNTIME_DIR, 'runtimeDir')
  const tapDevice = cleanTapDevice(options.tapDevice ?? defaultTapDevice(vsockCid))
  const macAddress = cleanMacAddress(options.macAddress ?? defaultMacAddress(vsockCid))
  const kernelCmdline = options.kernelCmdline ?? DEFAULT_KERNEL_CMDLINE
  const launcherIdentity = cleanLauncherIdentity(options.launcherIdentity)
  const vsockSocketPath = join(runtimeDir, `desk-${deskId}.vsock`)
  const apiSocketPath = join(runtimeDir, `desk-${deskId}.api.sock`)
  // Beside the overlay by default: a snapshot is the guest's RAM, so it belongs
  // on the volume provisioned for desk state rather than on a runtime tmpfs.
  const snapshotDir = options.snapshotDir
    ? absolutePath(options.snapshotDir, 'snapshotDir')
    : join(overlayDirectory, `${deskId}.snapshot`)
  const restoring = options.restore === true
  if (restoring && !pathExists(snapshotDir)) {
    // Refused rather than silently cold-booted. A caller asking to restore has
    // been told this desk kept its memory; quietly booting a fresh kernel would
    // lose the process tree it was relying on and look like a crash inside the
    // guest instead of a missing snapshot out here.
    throw new DeskError(`Desk ${deskId} has no snapshot to restore at ${snapshotDir}`)
  }
  const attachments = cleanAttachments(options.readOnlyAttachments, pathExists)
  const shares = cloudHypervisorShares(cleanShares(options.shares, isDirectory), {
    deskId,
    runtimeDir,
    virtiofsdPath: options.virtiofsdPath,
    sandbox: options.virtiofsdSandbox ?? DEFAULT_VIRTIOFSD_SANDBOX,
    pathExists,
    searchPath: dependencies.searchPath ?? process.env.PATH ?? '',
  })

  const create = pathExists(overlayPath)
    ? null
    : {
        // Cloud Hypervisor cannot follow disk backing chains: a qcow2 overlay
        // over a qcow2/raw base is rejected with UnsupportedFeature /
        // MaxNestingDepthExceeded. So the overlay is a plain raw file, cloned
        // from the raw base with `cp --reflink=auto` — an instant, block-sharing
        // copy-on-write clone on XFS/Btrfs and a graceful full-copy fallback on
        // ext4. Either way CH boots the resulting raw file with no backing chain.
        command: 'cp',
        args: ['--reflink=auto', baseImagePath, overlayPath],
      }

  // A restoring VMM is handed the snapshot and nothing else.
  //
  // The snapshot carries the whole machine config — memory size, cpus, disk,
  // vsock, net — so passing `--kernel`/`--disk` alongside `--restore` is not
  // redundant, it is rejected.
  //
  // `resume=false` is deliberate, and it is the difference between this being
  // safe and being a data-loss bug. A memory snapshot is only valid against the
  // disk as it stood when the snapshot was taken. Resume the guest in this same
  // spawn and it starts writing immediately, so for as long as the snapshot
  // still exists there are two valid-looking pasts for one desk — and a host
  // that died in that window would, on the next start, replay this memory
  // against a disk that had moved on. That is corruption, not a stale cache.
  //
  // The guest comes back PAUSED; before it runs, the caller must make the
  // snapshot unavailable for replay. File-backed restores keep their retired
  // source unchanged until the VMM exits.
  //
  // The tap is reopened BY NAME from the snapshotted config. That is the detail
  // that makes this possible at all: Cloud Hypervisor's `net_fds` restore
  // parameter exists for VMs whose tap was passed as a file descriptor, and
  // producing one from Node would mean an ioctl(TUNSETIFF) it cannot make.
  // Because `deskPlan` configures `--net tap=<name>`, there is nothing to pass.
  //
  // Shares are in the snapshotted config too, by socket path, with each
  // daemon's state. What the snapshot cannot hold is a running `virtiofsd`, so
  // the backend starts the same daemons on the same sockets before this VMM
  // either way, and the VMM loads their state back into them.
  const args = restoring
    ? [
        '--api-socket', apiSocketPath,
        '--restore', `source_url=file://${snapshotDir},resume=false${options.memoryRestoreMode === 'copyonwrite' ? ',memory_restore_mode=copyonwrite' : ''}`,
      ]
    : [
        '--api-socket', apiSocketPath,
        '--kernel', kernelPath,
        // A modular distro kernel needs its initramfs to bring up virtio_blk and
        // mount root; omitted only for a kernel with those drivers built in.
        ...(initramfsPath === null ? [] : ['--initramfs', initramfsPath]),
        '--cmdline', kernelCmdline,
        // Be explicit that the disk is raw: CH deprecated image-format auto-detection
        // and warns without image_type; there is never a qcow2 overlay here.
        '--disk', `path=${overlayPath},image_type=raw`, ...attachments.filter(a => a.kind === 'block').map(a => `path=${a.path},readonly=on,image_type=raw`),
        ...attachments.filter(a => a.kind === 'pmem').flatMap(a => ['--pmem', `file=${a.path},discard_writes=on`]),
        // vhost-user devices map guest RAM into their daemon, so it must be
        // shared memory; a desk without shares keeps private memory.
        '--memory', `size=${memoryMb}M${shares.length === 0 ? '' : ',shared=on'}`,
        '--cpus', `boot=${vcpus}`,
        '--vsock', `cid=${vsockCid},socket=${vsockSocketPath}`,
        '--net', `tap=${tapDevice},mac=${macAddress}`,
        ...(shares.length === 0
          ? []
          : ['--fs', ...shares.map((share) => `tag=${share.tag},socket=${share.socketPath}`)]),
        '--serial', 'off',
        '--console', 'off',
      ]

  return {
    hypervisor: 'cloud-hypervisor',
    deskId,
    vmm: { command: vmmPath, args },
    overlay: { path: overlayPath, basePath: baseImagePath, create },
    vsock: { cid: vsockCid, socketPath: vsockSocketPath },
    api: { socketPath: apiSocketPath },
    tap: { device: tapDevice, mac: macAddress },
    snapshot: { dir: snapshotDir, restoring },
    shares,
    memoryMb,
    vcpus,
    kernelPath,
    initramfsPath,
    kernelCmdline,
    launcherIdentity,
  }
}

/**
 * The Virtualization.framework plan. The same fail-closed checks on the guest
 * assets; no KVM or VMM binary, because the backend owns the helper; and the
 * overlay is an APFS clone (`cp -c`), which is to APFS what `--reflink=auto`
 * is to XFS: instant and block-sharing. A volume that cannot clone must be
 * replaced with one that supports it.
 */
function buildVirtualizationPlan(
  options: DeskLaunchPlanOptions,
  dependencies: DeskLaunchPlanDependencies,
): VirtualizationLaunchPlan {
  const pathExists = dependencies.pathExists ?? existsSync
  if (options.readOnlyAttachments?.length) throw new DeskError('Read-only attachments require Cloud Hypervisor.')
  const deskId = cleanDeskId(options.deskId)
  if (options.tapDevice !== undefined) {
    throw new DeskError('tapDevice applies to Cloud Hypervisor desks; a Virtualization.framework desk has no TAP.')
  }
  if (options.virtiofsdPath !== undefined || options.virtiofsdSandbox !== undefined) {
    throw new DeskError(
      'virtiofsdPath and virtiofsdSandbox apply to Cloud Hypervisor desks; Virtualization.framework serves shares itself.',
    )
  }
  const kernelPath = absolutePath(options.kernelPath, 'kernelPath')
  if (!pathExists(kernelPath)) {
    throw new DeskError(`Guest kernel does not exist: ${kernelPath}`)
  }
  const initramfsPath =
    options.initramfsPath === undefined ? null : absolutePath(options.initramfsPath, 'initramfsPath')
  if (initramfsPath !== null && !pathExists(initramfsPath)) {
    throw new DeskError(`Initramfs does not exist: ${initramfsPath}`)
  }
  const baseImagePath = absolutePath(options.baseImagePath, 'baseImagePath')
  if (!pathExists(baseImagePath)) {
    throw new DeskError(`Base image does not exist: ${baseImagePath}`)
  }
  const overlayPath = absolutePath(options.overlayPath, 'overlayPath')
  const overlayDirectory = dirname(overlayPath)
  if (!pathExists(overlayDirectory)) {
    throw new DeskError(`Overlay directory does not exist: ${overlayDirectory}`)
  }
  const memoryMb = positiveInteger(options.memoryMb ?? DEFAULT_MEMORY_MB, 'memoryMb')
  const vcpus = positiveInteger(options.vcpus ?? DEFAULT_VCPUS, 'vcpus')
  const runtimeDir = absolutePath(options.runtimeDir ?? join(tmpdir(), 'appkit-desk'), 'runtimeDir')
  // Keep Darwin's small sockaddr_un limit even for a maximum-length desk ID.
  const socketId = createHash('sha256').update(deskId).digest('hex').slice(0, 20)
  const vsockSocketPath = socketPath(join(runtimeDir, `d-${socketId}.vsock`))
  const portsSocketPath = socketPath(join(runtimeDir, `d-${socketId}.ports`))
  const snapshotDir = options.snapshotDir
    ? absolutePath(options.snapshotDir, 'snapshotDir')
    : join(overlayDirectory, `${deskId}.snapshot`)
  const restoring = options.restore === true
  if (restoring && !pathExists(snapshotDir)) {
    throw new DeskError(`Desk ${deskId} has no snapshot to restore at ${snapshotDir}`)
  }
  const network = cleanGuestNetwork(options.guestNetwork ?? {})
  const shares = cleanShares(options.shares, dependencies.isDirectory ?? directoryExists)
  return {
    hypervisor: 'virtualization',
    deskId,
    overlay: {
      path: overlayPath,
      basePath: baseImagePath,
      create: pathExists(overlayPath) ? null : { command: 'cp', args: ['-c', baseImagePath, overlayPath] },
    },
    vsock: { cid: VZ_GUEST_CID, socketPath: vsockSocketPath },
    ports: { socketPath: portsSocketPath },
    network: {
      mac: cleanMacAddress(options.macAddress ?? deskMacAddress(deskId)),
      ...network,
    },
    snapshot: { dir: snapshotDir, restoring },
    shares,
    memoryMb,
    vcpus,
    kernelPath,
    initramfsPath,
    kernelCmdline: options.kernelCmdline ?? DEFAULT_KERNEL_CMDLINE,
    launcherIdentity: cleanLauncherIdentity(options.launcherIdentity),
  }
}

/** Reject ambiguous Cloud Hypervisor key-value arguments and unpinned images. */
export function cleanAttachments(attachments: readonly DeskReadOnlyAttachment[] | undefined, pathExists: (path: string) => boolean): DeskReadOnlyAttachment[] {
  if (attachments === undefined) return []
  if (!Array.isArray(attachments)) throw new DeskError('readOnlyAttachments must be an array.')
  return attachments.map((attachment, index) => {
    if (!attachment || !['block', 'pmem'].includes(attachment.kind) || !/^[a-f0-9]{64}$/.test(attachment.sha256)) throw new DeskError(`Invalid readOnlyAttachments[${index}].`)
    const path = absolutePath(attachment.path, `readOnlyAttachments[${index}].path`)
    if (path.includes(',') || !pathExists(path)) throw new DeskError(`Invalid attachment path: ${path}`)
    return { path, kind: attachment.kind, sha256: attachment.sha256 }
  })
}

/** Validate shares as given: tags, absolute existing directories, explicit access. */
function cleanShares(
  shares: readonly DeskShare[] | undefined,
  isDirectory: (path: string) => boolean,
): DeskShare[] {
  if (shares === undefined) return []
  if (!Array.isArray(shares)) throw new DeskError('shares must be an array.')
  const tags = new Set<string>()
  return shares.map((share: DeskShare, index) => {
    const field = `shares[${index}]`
    if (typeof share !== 'object' || share === null) throw new DeskError(`${field} must be an object.`)
    if (typeof share.tag !== 'string' || !SHARE_TAG_PATTERN.test(share.tag)) {
      throw new DeskError(
        `${field}.tag must be 1–36 lowercase letters, digits, or hyphens, starting with a letter or digit.`,
      )
    }
    if (tags.has(share.tag)) throw new DeskError(`${field}.tag ${share.tag} is already used by another share.`)
    tags.add(share.tag)
    if (typeof share.path !== 'string') throw new DeskError(`${field}.path must be an absolute path.`)
    const path = absolutePath(share.path, `${field}.path`)
    if (!isDirectory(path)) throw new DeskError(`${field}.path is not an existing directory: ${path}`)
    if (typeof share.readOnly !== 'boolean') throw new DeskError(`${field}.readOnly must be a boolean.`)
    return { tag: share.tag, path, readOnly: share.readOnly }
  })
}

/**
 * One `virtiofsd` per share. `--cache=auto` lets the guest cache for a second
 * at a time, so changes the host makes under a share reach running guests;
 * `always` would let a guest keep serving a file the host has replaced.
 * `--readonly` is the enforcement for a read-only share — the guest is never
 * trusted to honour a read-only mount.
 *
 * The migration flags are for parking. Cloud Hypervisor carries the daemon's
 * state — the files and directories the guest holds — inside a snapshot, and
 * hands it to the fresh daemon on restore, which reopens each by path. A file
 * that has no path by then (unlinked on the host, or by the guest while held
 * open) becomes an error for the guest to see on that file alone, rather than
 * a restore that fails and costs the whole desk its memory.
 */
function cloudHypervisorShares(
  shares: readonly DeskShare[],
  context: {
    deskId: string
    runtimeDir: string
    virtiofsdPath: string | undefined
    sandbox: DeskVirtiofsdSandbox
    pathExists: (path: string) => boolean
    searchPath: string
  },
): CloudHypervisorShare[] {
  if (shares.length === 0) return []
  if (context.sandbox !== 'namespace' && context.sandbox !== 'chroot') {
    throw new DeskError("virtiofsdSandbox must be 'namespace' or 'chroot'.")
  }
  const command = resolveVirtiofsd(context.virtiofsdPath, context.pathExists, context.searchPath)
  return shares.map((share) => {
    // A dot cannot appear in a tag, so `<desk>.<tag>` names one socket for
    // exactly one desk and share even though desk IDs may contain hyphens.
    const socketPath = join(context.runtimeDir, `desk-${context.deskId}.${share.tag}.fs.sock`)
    if (Buffer.byteLength(socketPath) > LINUX_SOCKET_PATH_LIMIT) {
      throw new DeskError(
        `Socket path ${socketPath} is longer than the ${LINUX_SOCKET_PATH_LIMIT} bytes Linux allows; `
          + 'use a shorter runtimeDir, deskId, or share tag.',
      )
    }
    return {
      ...share,
      socketPath,
      daemon: {
        command,
        args: [
          `--socket-path=${socketPath}`,
          `--shared-dir=${share.path}`,
          `--sandbox=${context.sandbox}`,
          '--cache=auto',
          '--migration-mode=find-paths',
          '--migration-on-error=guest-error',
          ...(share.readOnly ? ['--readonly'] : []),
        ],
      },
    }
  })
}

function resolveVirtiofsd(
  configured: string | undefined,
  pathExists: (path: string) => boolean,
  searchPath: string,
): string {
  if (configured !== undefined) {
    const path = absolutePath(configured, 'virtiofsdPath')
    if (!pathExists(path)) {
      throw new DeskError(`virtiofsd was not found at ${path}. Install virtiofsd or configure virtiofsdPath.`)
    }
    return path
  }
  const candidates = [
    ...searchPath.split(delimiter).filter((entry) => isAbsolute(entry)).map((entry) => join(entry, 'virtiofsd')),
    DEFAULT_VIRTIOFSD_PATH,
  ]
  const found = candidates.find((candidate) => pathExists(candidate))
  if (found === undefined) {
    throw new DeskError(
      `virtiofsd was not found on PATH or at ${DEFAULT_VIRTIOFSD_PATH}. Install virtiofsd 1.13 or later, or configure virtiofsdPath.`,
    )
  }
  return found
}

function directoryExists(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true
}

function cleanGuestNetwork(
  options: DeskGuestNetworkOptions,
): Omit<VirtualizationLaunchPlan['network'], 'mac'> {
  if (options.allowLan !== undefined && typeof options.allowLan !== 'boolean') {
    throw new DeskError('guestNetwork.allowLan must be a boolean.')
  }
  const guestAddress = ipv4(options.guestAddress ?? DEFAULT_VZ_GUEST_ADDRESS, 'guestNetwork.guestAddress')
  const gatewayAddress = ipv4(options.gatewayAddress ?? DEFAULT_VZ_GATEWAY_ADDRESS, 'guestNetwork.gatewayAddress')
  const prefixLength = options.prefixLength ?? DEFAULT_VZ_PREFIX_LENGTH
  if (!Number.isInteger(prefixLength) || prefixLength < 8 || prefixLength > 30) {
    throw new DeskError('guestNetwork.prefixLength must be an integer between 8 and 30.')
  }
  const mask = (0xffff_ffff << (32 - prefixLength)) >>> 0
  if (
    guestAddress === gatewayAddress
    || ((ipv4Number(guestAddress) & mask) >>> 0) !== ((ipv4Number(gatewayAddress) & mask) >>> 0)
  ) {
    throw new DeskError("guestNetwork.guestAddress must be a different address in the gateway's subnet.")
  }
  const dns = [...(options.dns ?? DEFAULT_VZ_DNS)]
  if (dns.length < 1 || dns.length > 3) {
    throw new DeskError('guestNetwork.dns must list one to three IPv4 resolvers.')
  }
  return {
    allowLan: options.allowLan ?? false,
    guestAddress,
    gatewayAddress,
    prefixLength,
    dns: dns.map((entry) => ipv4(entry, 'guestNetwork.dns')),
  }
}

/** Stable per desk, so a restored guest finds the NIC it was saved with. */
function deskMacAddress(deskId: string): string {
  const digest = createHash('sha256').update(`appkit-desk:${deskId}`).digest()
  const octets = [0x06, ...digest.subarray(0, 5)]
  return octets.map((octet) => octet.toString(16).padStart(2, '0')).join(':')
}

function socketPath(path: string): string {
  if (Buffer.byteLength(path) > DARWIN_SOCKET_PATH_LIMIT) {
    throw new DeskError(
      `Socket path ${path} is longer than the ${DARWIN_SOCKET_PATH_LIMIT} bytes macOS allows; `
        + 'use a shorter runtimeDir or deskId.',
    )
  }
  return path
}

function ipv4(value: string, field: string): string {
  if (typeof value !== 'string' || isIP(value) !== 4) {
    throw new DeskError(`${field} must be an IPv4 address.`)
  }
  return value
}

function ipv4Number(address: string): number {
  return address.split('.').reduce((value, octet) => ((value << 8) | Number(octet)) >>> 0, 0)
}

function defaultTapDevice(cid: number): string {
  return `dsk${cid}`
}

function defaultMacAddress(cid: number): string {
  // Locally administered, unicast prefix; the low four octets carry the CID so
  // the address is stable per desk and never collides across resident desks.
  const octets = [0x06, 0x00, (cid >>> 24) & 0xff, (cid >>> 16) & 0xff, (cid >>> 8) & 0xff, cid & 0xff]
  return octets.map((octet) => octet.toString(16).padStart(2, '0')).join(':')
}

function cleanCid(value: number): number {
  if (!Number.isInteger(value) || value < MIN_GUEST_CID || value > MAX_GUEST_CID) {
    throw new DeskError(
      `vsockCid must be an integer between ${MIN_GUEST_CID} and ${MAX_GUEST_CID}.`,
    )
  }
  return value
}

function cleanTapDevice(value: string): string {
  if (!TAP_DEVICE_PATTERN.test(value)) {
    throw new DeskError('tapDevice must be 1–15 characters of letters, numbers, underscores, or hyphens.')
  }
  return value
}

function cleanMacAddress(value: string): string {
  if (!MAC_ADDRESS_PATTERN.test(value)) {
    throw new DeskError(`macAddress is not a valid MAC address: ${value}`)
  }
  return value.toLowerCase()
}

export function cleanLauncherIdentity(
  identity: DeskLauncherIdentity | undefined,
): DeskLauncherIdentity | undefined {
  if (!identity) return undefined
  const max = 2_147_483_647
  if (!Number.isInteger(identity.uid) || identity.uid < 1 || identity.uid > max) {
    throw new DeskError(`launcherIdentity.uid must be an integer between 1 and ${max}.`)
  }
  if (!Number.isInteger(identity.gid) || identity.gid < 0 || identity.gid > max) {
    throw new DeskError(`launcherIdentity.gid must be an integer between 0 and ${max}.`)
  }
  return { uid: identity.uid, gid: identity.gid }
}

function absolutePath(value: string, field: string): string {
  if (!value || !isAbsolute(value)) {
    throw new DeskError(`${field} must be an absolute path.`)
  }
  return resolve(value)
}

function positiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new DeskError(`${field} must be a positive integer.`)
  }
  return value
}
