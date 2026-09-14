'use client'

import * as React from 'react'
import { APP_CSP, BRIDGE_MARKER, bridgeClientSource, inlineDocument, isBridgeMethod, makeBridgeResult, makeThemeMessage, parseBridgeRequest, type AppTheme, type BridgeContext, type BridgeMethod } from './bridge'

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
    return inlineDocument(bundle.entryHtml, bundle.replacements, head, bundle.entry)
  }, [bundle, context, globalName])

  React.useEffect(() => {
    const hostTheme = (): AppTheme => {
      const root = document.documentElement
      if (root.classList.contains('dark')) return 'dark'
      if (root.classList.contains('light')) return 'light'
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    const postTheme = () => iframeRef.current?.contentWindow?.postMessage(makeThemeMessage(hostTheme()), '*')
    async function receive(event: MessageEvent) {
      const frame = iframeRef.current
      if (!frame || event.source !== frame.contentWindow) return
      if (event.data?.[BRIDGE_MARKER] === true && event.data.type === 'ready') {
        postTheme()
        return
      }
      const request = parseBridgeRequest(event.data)
      if (!request) return
      const post = (ok: boolean, value: unknown) => frame.contentWindow?.postMessage(makeBridgeResult(request.id, ok, value), '*')
      if (!isBridgeMethod(request.method)) { post(false, `unknown bridge method: ${request.method}`); return }
      try { post(true, await onBridgeCall({ method: request.method, payload: request.payload })) }
      catch (error) { post(false, error instanceof Error ? error.message : String(error)) }
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const observer = new MutationObserver(postTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    media.addEventListener('change', postTheme)
    window.addEventListener('message', receive)
    postTheme()
    return () => {
      observer.disconnect()
      media.removeEventListener('change', postTheme)
      window.removeEventListener('message', receive)
    }
  }, [appKey, onBridgeCall])

  return <iframe ref={iframeRef} title={title ?? `app-${appKey}`} sandbox="allow-scripts" srcDoc={srcDoc} className={className} style={{ width: '100%', minHeight: '32rem', border: 0, display: 'block' }} />
}
