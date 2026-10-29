import { isAbsolute } from 'node:path'

/** Host-side identities required to restore a child of a sealed snapshot. */
export interface DeskTemplateChildIdentity {
  diskPath: string
  tap: string
  mac: string
  vsockCid: number
  vsockSocket: string
}

type ObjectValue = Record<string, unknown>
function object(value: unknown, name: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid template ${name}`)
  return value as ObjectValue
}
function path(value: string): boolean { return isAbsolute(value) && !value.includes('\0') }

/**
 * Construct a child-specific Cloud Hypervisor config without modifying the
 * sealed input. This only plans host-side device paths. The guest's restored
 * NIC state still contains the old MAC; the guest must set its new MAC and
 * reset its identity while externally fenced before the child can be exposed.
 */
export function planTemplateConfig(input: unknown, child: DeskTemplateChildIdentity): ObjectValue {
  if (!path(child.diskPath) || !path(child.vsockSocket) || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,14}$/.test(child.tap)
      || !/^(?:[0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(child.mac)
      || (parseInt(child.mac.slice(0, 2), 16) & 1) !== 0
      || !Number.isSafeInteger(child.vsockCid) || child.vsockCid < 3 || child.vsockCid > 0xfffffffe) {
    throw new Error('Invalid template child identity')
  }
  const config = structuredClone(object(input, 'config'))
  const memory = object(config.memory, 'memory')
  if (memory.shared || memory.hugepages || memory.mergeable || memory.hotplug_size || memory.hotplugged_size || memory.prefault || memory.zones || memory.file || memory.host_numa_node != null || memory.reserve || memory.hotplug_method === 'VirtioMem') {
    throw new Error('Template memory cannot use a copy-on-write restore')
  }
  for (const name of ['fs', 'pmem', 'devices', 'user_devices', 'vdpa', 'gpu', 'tpm', 'pvmemcontrol']) {
    const value = config[name]
    if (Array.isArray(value) ? value.length !== 0 : value != null && value !== false) throw new Error(`Unsupported template device: ${name}`)
  }
  if (!Array.isArray(config.disks) || config.disks.length < 1 || !Array.isArray(config.net) || config.net.length !== 1) throw new Error('Template needs a writable disk and one network device')
  for (const attachment of config.disks.slice(1)) {
    const item = object(attachment, 'attachment')
    if (item.readonly !== true || item.vhost_user || typeof item.path !== 'string' || !path(item.path) || item.path === child.diskPath) throw new Error('Unsupported template attachment')
  }
  const disk = object(config.disks[0], 'disk')
  const net = object(config.net[0], 'network')
  const vsock = object(config.vsock, 'vsock')
  if (disk.readonly || disk.vhost_user || net.vhost_user || net.fds || typeof disk.path !== 'string' || typeof net.tap !== 'string' || typeof vsock.socket !== 'string') throw new Error('Unsupported template disk, network or vsock')
  if (disk.path === child.diskPath || net.tap === child.tap || vsock.socket === child.vsockSocket || String(net.mac).toLowerCase() === child.mac.toLowerCase() || vsock.cid === child.vsockCid) throw new Error('Child identity must differ from the template')
  disk.path = child.diskPath
  net.tap = child.tap
  net.mac = child.mac
  vsock.cid = child.vsockCid
  vsock.socket = child.vsockSocket
  return config
}
