import { NextResponse } from 'next/server'
import { deleteDemoScript, runDemoScript, saveDemoScript, scriptsSnapshot } from '../../../../lib/server/scripts-demo'
import type { ScriptEditorValue } from '@appkit/scripts/react'

export const runtime = 'nodejs'

export async function GET() { return NextResponse.json(scriptsSnapshot()) }

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action ?? '')
    if (action === 'save') saveDemoScript(body.value as ScriptEditorValue)
    else if (action === 'delete') deleteDemoScript(String(body.id))
    else if (action === 'run') {
      const run = await runDemoScript(String(body.id))
      return NextResponse.json({ snapshot: scriptsSnapshot(), run })
    }
    else return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    return NextResponse.json({ snapshot: scriptsSnapshot() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 })
  }
}
