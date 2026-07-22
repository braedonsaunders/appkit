import { NextResponse } from 'next/server'
import {
  appsSnapshot,
  bridgeDemoApp,
  createDemoApp,
  deleteDemoApp,
  deleteDemoAppFile,
  importDemoApp,
  publishDemoApp,
  saveDemoAppFile,
  setDemoAppStatus,
  updateDemoApp,
} from '../../../../lib/server/apps-demo'
import type { AppMetaUpdate, AppStatus, InstalledApp } from '@appkit/apps'

export const runtime = 'nodejs'

export async function GET() { return NextResponse.json(await appsSnapshot()) }

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action ?? '')
    if (action === 'create') await createDemoApp(String(body.name ?? ''))
    else if (action === 'import') await importDemoApp(Uint8Array.from(body.bytes as number[]))
    else if (action === 'meta') await updateDemoApp(String(body.key), body.update as AppMetaUpdate)
    else if (action === 'save-file') await saveDemoAppFile(String(body.key), body.file as { path: string; content: string; isBinary?: boolean })
    else if (action === 'delete-file') await deleteDemoAppFile(String(body.key), String(body.path))
    else if (action === 'status') await setDemoAppStatus(String(body.key), body.status as AppStatus)
    else if (action === 'delete') await deleteDemoApp(String(body.key))
    else if (action === 'publish') await publishDemoApp(String(body.key))
    else if (action === 'bridge') {
      const result = await bridgeDemoApp(body.app as InstalledApp, String(body.method), body.payload)
      if (!result.ok) return NextResponse.json(result, { status: result.status })
      return NextResponse.json(result)
    } else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json(await appsSnapshot())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
