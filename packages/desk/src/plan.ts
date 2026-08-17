import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

export const DEFAULT_VMM_PATH = '/usr/bin/cloud-hypervisor'
export const DEFAULT_KVM_PATH = '/dev/kvm'
export const DEFAULT_QEMU_IMG_PATH = '/usr/bin/qemu-img'
export const DEFAULT_RUNTIME_DIR = '/run/appkit-desk'
export const DEFAULT_MEMORY_MB = 384
export const DEFAULT_VCPUS = 2
export const DEFAULT_KERNEL_CMDLINE = 'root=/dev/vda rw quiet'

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

export interface DeskLaunchPlanOptions {
  deskId: string
  vmmPath?: string
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
  /** Guest vsock context ID; must be unique among resident desks. */
  vsockCid: number
  /** Directory holding the vsock and API control sockets. */
  runtimeDir?: string
  /** Host TAP device name; derived from the CID when omitted. */
  tapDevice?: string
  /** Guest MAC address; derived from the CID when omitted. */
  macAddress?: string
  kernelCmdline?: string
  launcherIdentity?: DeskLauncherIdentity
}

/**
 * The complete Cloud Hypervisor invocation as inspectable data. Nothing here
 * has been spawned: tests, audit logs, and readiness screens can assert on the
 * exact argv a desk would boot with.
 */
export interface DeskLaunchPlan {
  deskId: string
  vmm: { command: string; args: string[] }
  overlay: {
    path: string
    basePath: string
    /** The overlay-creation step, or `null` when the overlay already exists. */
    create: { command: string; args: string[] } | null
  }
  vsock: { cid: number; socketPath: string }
  api: { socketPath: string }
  tap: { device: string; mac: string }
  memoryMb: number
  vcpus: number
  kernelPath: string
  /** Resolved initramfs path, or `null` when the kernel needs none. */
  initramfsPath: string | null
  kernelCmdline: string
  launcherIdentity?: DeskLauncherIdentity
}

/**
 * Whether this host can run desks at all: Linux, a usable `/dev/kvm`, and the
 * Cloud Hypervisor binary. All three checks are injectable and the answer is
 * fail-closed — a host missing any of them gets no desk capability rather
 * than a degraded one.
 */
export function isDeskSupported(options: {
  platform?: NodeJS.Platform
  kvmPath?: string
  vmmPath?: string
  pathExists?: (path: string) => boolean
} = {}): boolean {
  const platform = options.platform ?? process.platform
  const pathExists = options.pathExists ?? existsSync
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

/**
 * Build the deterministic Cloud Hypervisor launch plan without spawning
 * anything. Fail closed: a missing `/dev/kvm`, VMM binary, kernel, base image,
 * or overlay directory throws instead of producing a plan that cannot boot.
 */
export function buildDeskLaunchPlan(
  options: DeskLaunchPlanOptions,
  dependencies: {
    pathExists?: (path: string) => boolean
    deviceExists?: (path: string) => boolean
  } = {},
): DeskLaunchPlan {
  const pathExists = dependencies.pathExists ?? existsSync
  const deviceExists = dependencies.deviceExists ?? existsSync
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

  const args = [
    '--api-socket', apiSocketPath,
    '--kernel', kernelPath,
    // A modular distro kernel needs its initramfs to bring up virtio_blk and
    // mount root; omitted only for a kernel with those drivers built in.
    ...(initramfsPath === null ? [] : ['--initramfs', initramfsPath]),
    '--cmdline', kernelCmdline,
    // Be explicit that the disk is raw: CH deprecated image-format auto-detection
    // and warns without image_type; there is never a qcow2 overlay here.
    '--disk', `path=${overlayPath},image_type=raw`,
    '--memory', `size=${memoryMb}M`,
    '--cpus', `boot=${vcpus}`,
    '--vsock', `cid=${vsockCid},socket=${vsockSocketPath}`,
    '--net', `tap=${tapDevice},mac=${macAddress}`,
    '--serial', 'off',
    '--console', 'off',
  ]

  return {
    deskId,
    vmm: { command: vmmPath, args },
    overlay: { path: overlayPath, basePath: baseImagePath, create },
    vsock: { cid: vsockCid, socketPath: vsockSocketPath },
    api: { socketPath: apiSocketPath },
    tap: { device: tapDevice, mac: macAddress },
    memoryMb,
    vcpus,
    kernelPath,
    initramfsPath,
    kernelCmdline,
    launcherIdentity,
  }
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
