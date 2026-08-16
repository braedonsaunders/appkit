import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildDeskLaunchPlan,
  cleanDeskId,
  DEFAULT_KVM_PATH,
  DEFAULT_VMM_PATH,
  DeskError,
  isDeskSupported,
  type DeskLaunchPlanOptions,
} from './plan'

const allPathsExist = () => true

const baseOptions: DeskLaunchPlanOptions = {
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
