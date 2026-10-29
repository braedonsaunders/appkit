import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeskLaunchPlan,
  cleanDeskId,
  DEFAULT_KVM_PATH,
  DEFAULT_VIRTIOFSD_PATH,
  DEFAULT_VMM_PATH,
  DeskError,
  isDeskSupported,
  type DeskLaunchPlanOptions,
} from './plan'

const allPathsExist = () => true

const baseOptions: DeskLaunchPlanOptions & { hypervisor?: 'cloud-hypervisor' } = {
  deskId: 'agent-7',
  kernelPath: '/data/agent-disks/vmlinux',
  baseImagePath: '/data/agent-disks/base.qcow2',
  overlayPath: '/data/agent-disks/overlays/agent-7.qcow2',
  vsockCid: 107,
}

test('builds the complete Cloud Hypervisor invocation as inspectable data', () => {
  const plan = buildDeskLaunchPlan(baseOptions, {
    pathExists: (path) => path !== baseOptions.overlayPath,
    deviceExists: allPathsExist,
  })

  assert.equal(plan.deskId, 'agent-7')
  assert.equal(plan.vmm.command, DEFAULT_VMM_PATH)
  assert.equal(plan.memoryMb, 384)
  assert.equal(plan.vcpus, 2)

  const args = plan.vmm.args
  const value = (flag: string) => args[args.indexOf(flag) + 1]
  assert.equal(value('--kernel'), '/data/agent-disks/vmlinux')
  assert.equal(value('--disk'), 'path=/data/agent-disks/overlays/agent-7.qcow2,image_type=raw')
  assert.equal(value('--memory'), 'size=384M')
  assert.equal(value('--cpus'), 'boot=2')
  assert.equal(value('--vsock'), 'cid=107,socket=/run/appkit-desk/desk-agent-7.vsock')
  assert.equal(value('--net'), 'tap=dsk107,mac=06:00:00:00:00:6b')

  assert.equal(plan.vsock.cid, 107)
  assert.equal(plan.vsock.socketPath, '/run/appkit-desk/desk-agent-7.vsock')
  assert.equal(plan.tap.device, 'dsk107')
  assert.ok(plan.tap.device.length <= 15)

  // No initramfs by default: the arg is absent and the field is null.
  assert.equal(plan.initramfsPath, null)
  assert.equal(args.includes('--initramfs'), false)
})

test('passes --initramfs right after --kernel when an initramfs is given', () => {
  const plan = buildDeskLaunchPlan(
    { ...baseOptions, initramfsPath: '/data/agent-disks/initrd' },
    { pathExists: (path) => path !== baseOptions.overlayPath, deviceExists: allPathsExist },
  )
  assert.equal(plan.initramfsPath, '/data/agent-disks/initrd')
  const args = plan.vmm.args
  assert.equal(args[args.indexOf('--kernel') + 2], '--initramfs')
  assert.equal(args[args.indexOf('--initramfs') + 1], '/data/agent-disks/initrd')
})

test('rejects an initramfs path that does not exist', () => {
  assert.throws(
    () =>
      buildDeskLaunchPlan(
        { ...baseOptions, initramfsPath: '/data/agent-disks/initrd' },
        {
          pathExists: (path) =>
            path !== baseOptions.overlayPath && path !== '/data/agent-disks/initrd',
          deviceExists: allPathsExist,
        },
      ),
    DeskError,
  )
})

test('includes the copy-on-write overlay creation step only when the overlay is missing', () => {
  const missing = buildDeskLaunchPlan(baseOptions, {
    pathExists: (path) => path !== baseOptions.overlayPath,
    deviceExists: allPathsExist,
  })
  assert.deepEqual(missing.overlay.create, {
    command: 'cp',
    args: [
      '--reflink=auto',
      '/data/agent-disks/base.qcow2',
      '/data/agent-disks/overlays/agent-7.qcow2',
    ],
  })

  const existing = buildDeskLaunchPlan(baseOptions, {
    pathExists: allPathsExist,
    deviceExists: allPathsExist,
  })
  assert.equal(existing.overlay.create, null)
  assert.equal(existing.overlay.basePath, '/data/agent-disks/base.qcow2')
})

test('fails closed when KVM, the VMM, the kernel, the base image, or the overlay directory is absent', () => {
  assert.throws(
    () => buildDeskLaunchPlan(baseOptions, {
      pathExists: allPathsExist,
      deviceExists: () => false,
    }),
    /KVM is not available/,
  )
  assert.throws(
    () => buildDeskLaunchPlan(baseOptions, {
      pathExists: (path) => path !== DEFAULT_VMM_PATH,
      deviceExists: allPathsExist,
    }),
    /Cloud Hypervisor was not found/,
  )
  assert.throws(
    () => buildDeskLaunchPlan(baseOptions, {
      pathExists: (path) => path !== baseOptions.kernelPath,
      deviceExists: allPathsExist,
    }),
    /Guest kernel does not exist/,
  )
  assert.throws(
    () => buildDeskLaunchPlan(baseOptions, {
      pathExists: (path) => path !== baseOptions.baseImagePath,
      deviceExists: allPathsExist,
    }),
    /Base image does not exist/,
  )
  assert.throws(
    () => buildDeskLaunchPlan(baseOptions, {
      pathExists: (path) =>
        path !== '/data/agent-disks/overlays' && path !== baseOptions.overlayPath,
      deviceExists: allPathsExist,
    }),
    /Overlay directory does not exist/,
  )
})

test('rejects malformed desk identifiers, CIDs, sizes, and network names', () => {
  const dependencies = { pathExists: allPathsExist, deviceExists: allPathsExist }
  assert.throws(() => cleanDeskId('has space'), DeskError)
  assert.throws(() => cleanDeskId(''), DeskError)
  assert.throws(
    () => buildDeskLaunchPlan({ ...baseOptions, vsockCid: 2 }, dependencies),
    /vsockCid/,
  )
  assert.throws(
    () => buildDeskLaunchPlan({ ...baseOptions, memoryMb: 0 }, dependencies),
    /memoryMb must be a positive integer/,
  )
  assert.throws(
    () => buildDeskLaunchPlan({ ...baseOptions, vcpus: 1.5 }, dependencies),
    /vcpus must be a positive integer/,
  )
  assert.throws(
    () => buildDeskLaunchPlan({ ...baseOptions, tapDevice: 'a-name-far-too-long' }, dependencies),
    /tapDevice/,
  )
  assert.throws(
    () => buildDeskLaunchPlan({ ...baseOptions, macAddress: 'not-a-mac' }, dependencies),
    /macAddress/,
  )
  assert.throws(
    () => buildDeskLaunchPlan({ ...baseOptions, launcherIdentity: { uid: 0, gid: 0 } }, dependencies),
    /launcherIdentity.uid/,
  )
})

test('derives a deterministic tap device and MAC address from the vsock CID', () => {
  const dependencies = { pathExists: allPathsExist, deviceExists: allPathsExist }
  const first = buildDeskLaunchPlan(baseOptions, dependencies)
  const again = buildDeskLaunchPlan(baseOptions, dependencies)
  assert.equal(first.tap.device, again.tap.device)
  assert.equal(first.tap.mac, again.tap.mac)

  const other = buildDeskLaunchPlan({ ...baseOptions, vsockCid: 108 }, dependencies)
  assert.notEqual(other.tap.device, first.tap.device)
  assert.notEqual(other.tap.mac, first.tap.mac)
  assert.match(other.tap.mac, /^06:00:/)
})

test('support detection requires Linux, KVM, and the VMM binary, and fails closed', () => {
  assert.equal(isDeskSupported({ platform: 'linux', pathExists: () => true }), true)
  assert.equal(isDeskSupported({ platform: 'darwin', pathExists: () => true }), false)
  assert.equal(
    isDeskSupported({ platform: 'linux', pathExists: (path) => path !== DEFAULT_KVM_PATH }),
    false,
  )
  assert.equal(
    isDeskSupported({ platform: 'linux', pathExists: (path) => path !== DEFAULT_VMM_PATH }),
    false,
  )
  assert.equal(isDeskSupported({ platform: 'linux', pathExists: () => false }), false)
})

// --- restoring from a memory snapshot ---------------------------------------
test('a restoring plan is handed the snapshot and nothing else', () => {
  const plan = buildDeskLaunchPlan(
    { ...baseOptions, snapshotDir: '/data/agent-disks/overlays/agent-7.snapshot', restore: true },
    { pathExists: () => true, deviceExists: () => true },
  )
  assert.equal(plan.snapshot.restoring, true)
  assert.equal(plan.snapshot.dir, '/data/agent-disks/overlays/agent-7.snapshot')
  // The snapshot carries the whole machine config, so these are not redundant,
  // they are rejected by Cloud Hypervisor.
  for (const flag of ['--kernel', '--disk', '--memory', '--cpus', '--vsock', '--net', '--cmdline']) {
    assert.equal(plan.vmm.args.includes(flag), false, `${flag} must not accompany --restore`)
  }
  assert.ok(plan.vmm.args.includes('--api-socket'), 'but the control socket is still needed, to resume')
  const restore = plan.vmm.args[plan.vmm.args.indexOf('--restore') + 1]
  assert.match(restore ?? '', /^source_url=file:\/\//, 'a file:// source url')
  // The safety property: paused on arrival, so the caller can destroy the
  // snapshot before anything is able to write to the disk it belongs to.
  assert.match(restore ?? '', /resume=false/, 'restored paused')
  // net_fds is for VMs whose tap was passed as a descriptor. Ours is named, so
  // Cloud Hypervisor reopens it itself — which is the only reason this is
  // possible from Node at all, since producing a tap fd needs an ioctl.
  assert.equal(restore?.includes('net_fds'), false)
})

test('a cold plan defaults its snapshot beside the overlay and says it is not restoring', () => {
  const plan = buildDeskLaunchPlan(baseOptions, { pathExists: () => true, deviceExists: () => true })
  assert.equal(plan.snapshot.restoring, false)
  // Beside the overlay, not in the runtime dir: a snapshot is guest RAM and
  // belongs on the volume provisioned for desk state, never on a tmpfs.
  assert.match(plan.snapshot.dir, /^\/data\/agent-disks\/overlays\//)
  assert.ok(plan.vmm.args.includes('--kernel'), 'and it boots a kernel')
  assert.equal(plan.vmm.args.includes('--restore'), false)
})

test('restoring without a snapshot is refused rather than quietly cold booted', () => {
  // A caller asking to restore has been told this desk kept its memory. Booting
  // a fresh kernel instead would lose the process tree it was relying on, and
  // look like a crash inside the guest rather than a missing file out here.
  assert.throws(
    () =>
      buildDeskLaunchPlan(
        { ...baseOptions, restore: true },
        { pathExists: (path: string) => !path.endsWith('.snapshot'), deviceExists: () => true },
      ),
    /no snapshot to restore/,
  )
})

// --- host directory shares ---------------------------------------------------
const shareDependencies = {
  pathExists: () => true,
  deviceExists: () => true,
  isDirectory: (path: string) => path.startsWith('/srv/'),
  searchPath: '',
}
const storeShare = { tag: 'flatpak', path: '/srv/flatpak', readOnly: true }
const buildShare = { tag: 'build-out', path: '/srv/build/', readOnly: false }

test('a plan without shares keeps private memory, adds no file system, and needs no virtiofsd', () => {
  const plan = buildDeskLaunchPlan(baseOptions, { ...shareDependencies, pathExists: (path) => !path.includes('virtiofsd') })
  const args = plan.vmm.args
  assert.deepEqual(plan.shares, [])
  assert.equal(args[args.indexOf('--memory') + 1], 'size=384M')
  assert.equal(args.includes('--fs'), false)
})

test('each share gets a virtiofsd on its own socket, and the VMM shared memory and a --fs device', () => {
  const plan = buildDeskLaunchPlan(
    { ...baseOptions, shares: [storeShare, buildShare], virtiofsdPath: '/opt/bin/virtiofsd' },
    shareDependencies,
  )
  const args = plan.vmm.args
  assert.equal(args[args.indexOf('--memory') + 1], 'size=384M,shared=on')
  const fs = args.indexOf('--fs')
  assert.deepEqual(args.slice(fs + 1, fs + 3), [
    'tag=flatpak,socket=/run/appkit-desk/desk-agent-7.flatpak.fs.sock',
    'tag=build-out,socket=/run/appkit-desk/desk-agent-7.build-out.fs.sock',
  ])
  assert.deepEqual(plan.shares, [
    {
      tag: 'flatpak',
      path: '/srv/flatpak',
      readOnly: true,
      socketPath: '/run/appkit-desk/desk-agent-7.flatpak.fs.sock',
      daemon: {
        command: '/opt/bin/virtiofsd',
        args: [
          '--socket-path=/run/appkit-desk/desk-agent-7.flatpak.fs.sock',
          '--shared-dir=/srv/flatpak',
          '--sandbox=namespace',
          '--cache=auto',
          '--migration-mode=find-paths',
          '--migration-on-error=guest-error',
          '--readonly',
        ],
      },
    },
    {
      tag: 'build-out',
      // Normalised, as every other path in the plan is.
      path: '/srv/build',
      readOnly: false,
      socketPath: '/run/appkit-desk/desk-agent-7.build-out.fs.sock',
      daemon: {
        command: '/opt/bin/virtiofsd',
        args: [
          '--socket-path=/run/appkit-desk/desk-agent-7.build-out.fs.sock',
          '--shared-dir=/srv/build',
          '--sandbox=namespace',
          '--cache=auto',
          '--migration-mode=find-paths',
          '--migration-on-error=guest-error',
        ],
      },
    },
  ])
})

test('the virtiofsd sandbox is configurable to chroot and never to none', () => {
  const plan = buildDeskLaunchPlan(
    { ...baseOptions, shares: [storeShare], virtiofsdPath: '/opt/bin/virtiofsd', virtiofsdSandbox: 'chroot' },
    shareDependencies,
  )
  assert.ok(plan.shares[0]?.daemon.args.includes('--sandbox=chroot'))
  assert.throws(
    () =>
      buildDeskLaunchPlan(
        // @ts-expect-error -- an unconfined daemon is deliberately not a choice.
        { ...baseOptions, shares: [storeShare], virtiofsdPath: '/opt/bin/virtiofsd', virtiofsdSandbox: 'none' },
        shareDependencies,
      ),
    /virtiofsdSandbox/,
  )
})

test('a restoring plan still starts every share daemon, because the snapshot holds only their state', () => {
  const plan = buildDeskLaunchPlan(
    { ...baseOptions, shares: [storeShare], virtiofsdPath: '/opt/bin/virtiofsd', restore: true },
    shareDependencies,
  )
  assert.equal(plan.snapshot.restoring, true)
  assert.equal(plan.vmm.args.includes('--fs'), false, 'the snapshot names its file systems itself')
  assert.equal(plan.shares[0]?.socketPath, '/run/appkit-desk/desk-agent-7.flatpak.fs.sock')
  assert.equal(plan.shares[0]?.daemon.command, '/opt/bin/virtiofsd')
})

test('virtiofsd is found on PATH first, then in /usr/libexec, and an explicit path must exist', () => {
  const withShare = { ...baseOptions, shares: [storeShare] }
  const found = (present: string[], searchPath: string) =>
    buildDeskLaunchPlan(withShare, {
      ...shareDependencies,
      searchPath,
      pathExists: (path) => !path.includes('virtiofsd') || present.includes(path),
    }).shares[0]?.daemon.command
  assert.equal(
    found(['/usr/bin/virtiofsd', DEFAULT_VIRTIOFSD_PATH], 'relative:/usr/local/bin:/usr/bin'),
    '/usr/bin/virtiofsd',
  )
  assert.equal(found([DEFAULT_VIRTIOFSD_PATH], '/usr/bin'), DEFAULT_VIRTIOFSD_PATH)
  assert.throws(() => found([], '/usr/bin'), /virtiofsd was not found on PATH/)
  assert.throws(
    () =>
      buildDeskLaunchPlan(
        { ...withShare, virtiofsdPath: '/opt/virtiofsd' },
        { ...shareDependencies, pathExists: (path) => path !== '/opt/virtiofsd' },
      ),
    /virtiofsd was not found at \/opt\/virtiofsd/,
  )
  assert.throws(
    () => buildDeskLaunchPlan({ ...withShare, virtiofsdPath: 'virtiofsd' }, shareDependencies),
    /virtiofsdPath must be an absolute path/,
  )
})

test('shares are refused with bad tags, duplicate tags, missing directories, or no explicit access', () => {
  const plan = (shares: unknown) =>
    buildDeskLaunchPlan(
      { ...baseOptions, virtiofsdPath: '/opt/bin/virtiofsd', shares: shares as DeskLaunchPlanOptions['shares'] },
      shareDependencies,
    )
  for (const tag of ['', 'Flatpak', '-store', 'store_1', 'a.b', 'x'.repeat(37)]) {
    assert.throws(() => plan([{ ...storeShare, tag }]), /shares\[0\]\.tag must be/, tag)
  }
  assert.doesNotThrow(() => plan([{ ...storeShare, tag: 'x'.repeat(36) }]))
  assert.throws(() => plan([storeShare, { ...buildShare, tag: 'flatpak' }]), /shares\[1\]\.tag flatpak is already used/)
  assert.throws(() => plan([{ ...storeShare, path: 'srv/flatpak' }]), /shares\[0\]\.path must be an absolute path/)
  assert.throws(() => plan([{ ...storeShare, path: '/data/missing' }]), /not an existing directory/)
  assert.throws(() => plan([{ tag: 'flatpak', path: '/srv/flatpak' }]), /shares\[0\]\.readOnly must be a boolean/)
  assert.throws(() => plan([null]), /shares\[0\] must be an object/)
  assert.throws(() => plan({ tag: 'flatpak' }), /shares must be an array/)
})

test('a share socket path longer than Linux allows is refused', () => {
  assert.throws(
    () =>
      buildDeskLaunchPlan(
        {
          ...baseOptions,
          deskId: 'd'.repeat(64),
          runtimeDir: '/var/lib/caboose/images/runtime',
          virtiofsdPath: '/opt/bin/virtiofsd',
          shares: [{ ...storeShare, tag: 's'.repeat(20) }],
        },
        shareDependencies,
      ),
    /longer than the 107 bytes Linux allows/,
  )
})
