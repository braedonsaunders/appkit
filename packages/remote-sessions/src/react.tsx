'use client'

import * as React from 'react'
import type { RemoteControlScope, RemoteProtocol, RemoteViewerConnection } from './types'

export interface RemoteComputerViewerProps {
  targetName: string
  protocol: RemoteProtocol
  scope: RemoteControlScope
  connect: (signal: AbortSignal) => Promise<RemoteViewerConnection>
  onDisconnect?: () => void
  className?: string
}

export function RemoteComputerViewer({ targetName, protocol, scope, connect, onDisconnect, className }: RemoteComputerViewerProps) {
  const [state, setState] = React.useState<{ status: 'connecting' | 'connected' | 'failed'; url: string | null; error: string | null }>({ status: 'connecting', url: null, error: null })
  const reconnect = React.useCallback(() => setState({ status: 'connecting', url: null, error: null }), [])

  React.useEffect(() => {
    if (state.status !== 'connecting') return
    const controller = new AbortController()
    connect(controller.signal).then(
      (connection) => { if (!controller.signal.aborted) setState({ status: 'connected', url: connection.url, error: null }) },
      (error: unknown) => { if (!controller.signal.aborted) setState({ status: 'failed', url: null, error: error instanceof Error ? error.message : 'The remote computer could not be opened.' }) },
    )
    return () => controller.abort()
  }, [connect, state.status])

  return (
    <section className={['flex size-full min-h-0 flex-col overflow-hidden bg-surface', className].filter(Boolean).join(' ')} aria-label={`${targetName} remote computer`}>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{targetName}</p>
          <p className="text-xs text-fg-muted">{protocol.toUpperCase()} · {scope === 'observe' ? 'View only' : 'Interactive'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">{state.status}</span>
          {state.status === 'failed' ? <button type="button" onClick={reconnect} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-hover">Reconnect</button> : null}
          {onDisconnect ? <button type="button" onClick={onDisconnect} className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-fg hover:bg-surface-hover">Disconnect</button> : null}
        </div>
      </header>
      <div className="min-h-0 flex-1 bg-bg-subtle">
        {state.url ? (
          <iframe src={state.url} title={`${targetName} ${protocol.toUpperCase()} session`} className="size-full border-0" allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex size-full items-center justify-center p-6 text-center text-sm text-fg-muted">{state.error ?? `Connecting securely to ${targetName}…`}</div>
        )}
      </div>
    </section>
  )
}
