import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { DeskBackend, DeskMachine } from './backend'
import { verifyDeskBackendConformance } from './conformance'
import { buildDeskLaunchPlan } from './plan'

test('desk backend conformance verifies lifecycle and capability behavior', async () => {
  let closed = false
  let shutdowns = 0
  const machine: DeskMachine = {
    deskId: 'agent-7',
    async request(command) {
      if (closed) throw new Error('closed')
      if (command.op === 'ping') return { pong: true }
      if (command.op === 'capabilities') return { virtioGpu: true }
      return {}
    },
    subscribe() { return () => undefined },
    async shutdown() {
      shutdowns += 1
      closed = true
    },
  }
  const backend: DeskBackend = { async boot() { return machine } }
  const plan = buildDeskLaunchPlan({
    deskId: 'agent-7',
    kernelPath: '/images/vmlinux',
    baseImagePath: '/images/base.raw',
    overlayPath: '/images/overlays/agent-7.raw',
    vsockCid: 107,
  }, { pathExists: () => true, deviceExists: () => true })
  const report = await verifyDeskBackendConformance(backend, plan)
  assert.deepEqual(report.capabilities, { virtioGpu: true })
  assert.equal(report.rejectsAfterShutdown, true)
  assert.equal(shutdowns, 2)
})
