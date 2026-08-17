import type { DeskBackend } from './backend'
import type { DeskLaunchPlan } from './plan'
import { parseCapabilities } from './protocol'

export type DeskBackendConformanceReport = {
  deskId: string
  ping: true
  capabilities: { virtioGpu: boolean }
  shutdownIdempotent: true
  rejectsAfterShutdown: true
}

/**
 * Executable behavioral contract for every Desk backend. It boots a disposable
 * plan, verifies the request channel and terminal shutdown semantics, and
 * always tears the machine down. Provider packages can run this unchanged in
 * CI rather than maintaining lookalike test suites.
 */
export async function verifyDeskBackendConformance(
  backend: DeskBackend,
  plan: DeskLaunchPlan,
): Promise<DeskBackendConformanceReport> {
  const machine = await backend.boot(plan)
  let firstShutdown = false
  try {
    if (machine.deskId !== plan.deskId) throw new Error('Desk backend returned a machine for the wrong desk.')
    const ping = await machine.request({ op: 'ping' })
    if (!isPong(ping)) throw new Error('Desk backend did not return a valid ping response.')
    const capabilities = parseCapabilities(await machine.request({ op: 'capabilities' }))
    await machine.shutdown()
    firstShutdown = true
    await machine.shutdown()
    let rejectsAfterShutdown = false
    try {
      await machine.request({ op: 'ping' })
    } catch {
      rejectsAfterShutdown = true
    }
    if (!rejectsAfterShutdown) throw new Error('Desk backend accepted a request after shutdown.')
    return {
      deskId: machine.deskId,
      ping: true,
      capabilities,
      shutdownIdempotent: true,
      rejectsAfterShutdown: true,
    }
  } finally {
    if (!firstShutdown) await machine.shutdown().catch(() => undefined)
  }
}

function isPong(value: unknown): value is { pong: true } {
  return typeof value === 'object' && value !== null && (value as { pong?: unknown }).pong === true
}
