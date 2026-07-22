'use client'

import * as React from 'react'
import { APP_CSP, bridgeClientSource, inlineDocument, isBridgeMethod, makeBridgeResult, parseBridgeRequest, type BridgeContext, type BridgeMethod } from './bridge'

export interface AppFrameProps {
  appKey: string
  context: BridgeContext
  bundle: { entry: string; entryHtml: string; replacements: Record<string, string> }
  onBridgeCall: (request: { method: BridgeMethod; payload: unknown }) => Promise<unknown>
  className?: string
  title?: string
  /** SDK global exposed inside the iframe. Defaults to `appkit`. */
  globalName?: string
}

/** Host for an uploaded frontend: opaque origin, no cookies, no parent DOM, no network. */
export function AppFrame({ appKey, context, bundle, onBridgeCall, className, title, globalName = 'appkit' }: AppFrameProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const srcDoc = React.useMemo(() => {
    const head = `<meta http-equiv="Content-Security-Policy" content="${APP_CSP}"><script>${bridgeClientSource(context, globalName)}</script>`
    return inlineDocument(bundle.entryHtml, bundle.replacements, head)
  }, [bundle, context, globalName])

  React.useEffect(() => {
    async function receive(event: MessageEvent) {
      const frame = iframeRef.current
      if (!frame || event.source !== frame.contentWindow) return
      const request = parseBridgeRequest(event.data)
      if (!request) return
      const post = (ok: boolean, value: unknown) => frame.contentWindow?.postMessage(makeBridgeResult(request.id, ok, value), '*')
      if (!isBridgeMethod(request.method)) { post(false, `unknown bridge method: ${request.method}`); return }
      try { post(true, await onBridgeCall({ method: request.method, payload: request.payload })) }
      catch (error) { post(false, error instanceof Error ? error.message : String(error)) }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [appKey, onBridgeCall])

  return <iframe ref={iframeRef} title={title ?? `app-${appKey}`} sandbox="allow-scripts" srcDoc={srcDoc} className={className} style={{ width: '100%', minHeight: '32rem', border: 0, display: 'block' }} />
}
