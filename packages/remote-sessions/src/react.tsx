'use client'

import * as React from 'react'
import type { RemoteControlScope, RemoteProtocol, RemoteViewerConnection } from './types'

export type TerminalSurfaceEntry = {
  id: string
  kind: 'system' | 'command' | 'stdout' | 'stderr'
  text: string
  prompt?: string
  at?: string
}

export interface TerminalSurfaceProps {
  title: string
  subtitle?: string
  cwd?: string | null
  entries: readonly TerminalSurfaceEntry[]
  status?: 'idle' | 'running' | 'failed' | 'completed'
  /** Host-owned controls rendered beside status, such as expand-to-fullscreen. */
  headerActions?: React.ReactNode
  className?: string
  emptyLabel?: string
}

/** Keep following output only while the viewer has not intentionally scrolled away. */
export function shouldFollowTerminalOutput(
  metrics: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
  threshold = 48,
): boolean {
  return metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight <= threshold
}

/**
 * A provider-neutral, human-observable terminal. Hosts feed it their durable
 * command/output ledger; it never owns execution or keeps a second history.
 * The presentation is extracted from Steward's remote terminal and adapted to
 * AppKit's semantic tokens and read-only observer role.
 */
export function TerminalSurface({
  title,
  subtitle = 'Live terminal',
  cwd,
  entries,
  status = 'idle',
  headerActions,
  className,
  emptyLabel = 'Terminal output will appear here when work begins.',
}: TerminalSurfaceProps) {
  const outputRef = React.useRef<HTMLDivElement | null>(null)
  const followOutputRef = React.useRef(true)
  const lastEntry = entries.at(-1)
  const visibleCwd = cwd && cwd !== '.' && cwd !== './' ? cwd : null

  React.useLayoutEffect(() => {
    const output = outputRef.current
    if (output && followOutputRef.current) output.scrollTop = output.scrollHeight
  }, [entries.length, lastEntry?.id, lastEntry?.text, status])

  return (
    <section
      className={['flex size-full min-h-0 flex-col overflow-hidden bg-surface', className].filter(Boolean).join(' ')}
      aria-label={`${title} terminal`}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-fg">{title}</p>
          <p className="truncate text-xs text-fg-muted">{subtitle}</p>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          {visibleCwd ? <code className="max-w-48 truncate rounded-full border border-border px-2 py-0.5 text-xs text-fg-muted">{visibleCwd}</code> : null}
          <span className="rounded-full border border-border px-2 py-0.5 text-xs capitalize text-fg-muted">{status}</span>
          {headerActions}
        </div>
      </header>
      <div
        ref={outputRef}
        onScroll={(event) => { followOutputRef.current = shouldFollowTerminalOutput(event.currentTarget) }}
        className="min-h-0 flex-1 overflow-auto bg-fg px-4 py-4 font-mono text-[13px] text-bg"
      >
        {entries.length === 0 ? <p className="text-bg/60">{emptyLabel}</p> : null}
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="whitespace-pre-wrap break-words">
              {entry.kind === 'command' ? (
                <div className="flex gap-3">
                  <span className="select-none text-bg/60">{entry.prompt ?? '$'}</span>
                  <span>{entry.text}</span>
                </div>
              ) : (
                <pre className={['whitespace-pre-wrap break-words font-inherit leading-6', entry.kind === 'stderr' ? 'text-danger' : entry.kind === 'system' ? 'text-bg/60' : 'text-bg'].join(' ')}>
                  {entry.text}
                </pre>
              )}
            </div>
          ))}
          {status === 'running' ? (
            <div className="flex items-center gap-2 text-bg/60">
              <span aria-hidden className="size-2 animate-pulse rounded-full bg-bg" />
              <span>Running command…</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export interface RemoteComputerViewerProps {
  targetName: string
  protocol: RemoteProtocol
  scope: RemoteControlScope
  connect: (signal: AbortSignal) => Promise<RemoteViewerConnection>
  onDisconnect?: () => void
  className?: string
}

export function RemoteComputerViewer({ targetName, protocol, scope, connect, onDisconnect, className }: RemoteComputerViewerProps) {
  const [state, setState] = React.useState<{ status: 'connecting' | 'connected' | 'failed'; connection: RemoteViewerConnection | null; error: string | null }>({ status: 'connecting', connection: null, error: null })
  const reconnect = React.useCallback(() => setState({ status: 'connecting', connection: null, error: null }), [])

  React.useEffect(() => {
    if (state.status !== 'connecting') return
    const controller = new AbortController()
    connect(controller.signal).then(
      (connection) => { if (!controller.signal.aborted) setState({ status: 'connected', connection, error: null }) },
      (error: unknown) => { if (!controller.signal.aborted) setState({ status: 'failed', connection: null, error: error instanceof Error ? error.message : 'The remote computer could not be opened.' }) },
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
        {state.connection?.kind === 'guacamole' ? (
          <GuacamoleViewer
            bridgeWsUrl={state.connection.bridgeWsUrl}
            connectQuery={state.connection.connectQuery}
            scope={scope}
            initialWidth={state.connection.width}
            initialHeight={state.connection.height}
          />
        ) : state.connection ? (
          <iframe src={state.connection.url} title={`${targetName} ${protocol.toUpperCase()} session`} className="size-full border-0" allow="clipboard-read; clipboard-write; fullscreen" referrerPolicy="no-referrer" />
        ) : (
          <div className="flex size-full items-center justify-center p-6 text-center text-sm text-fg-muted">{state.error ?? `Connecting securely to ${targetName}…`}</div>
        )}
      </div>
    </section>
  )
}

type GuacamoleNamespace = {
  WebSocketTunnel: new (url: string) => { onerror?: (event: unknown) => void }
  Client: {
    new (tunnel: unknown): {
      getDisplay(): { getElement(): HTMLElement; scale(value: number): void; onresize?: (width: number, height: number) => void }
      connect(query: string): void
      disconnect(): void
      sendMouseState(state: unknown, applyScale?: boolean): void
      sendKeyEvent(pressed: number, keysym: number): void
      onstatechange?: (state: number) => void
    }
    State: Record<string, number>
  }
  Mouse: new (element: HTMLElement) => { onmousedown?: (state: unknown) => void; onmouseup?: (state: unknown) => void; onmousemove?: (state: unknown) => void }
  Keyboard: new (element: HTMLElement) => { onkeydown?: (keysym: number) => boolean; onkeyup?: (keysym: number) => boolean }
}

function GuacamoleViewer({
  bridgeWsUrl,
  connectQuery,
  scope,
  initialWidth = 1440,
  initialHeight = 900,
}: {
  bridgeWsUrl: string
  connectQuery: string
  scope: RemoteControlScope
  initialWidth?: number
  initialHeight?: number
}) {
  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const mountRef = React.useRef<HTMLDivElement | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [status, setStatus] = React.useState('connecting')

  React.useEffect(() => {
    let stopped = false
    let client: InstanceType<GuacamoleNamespace['Client']> | null = null
    let keyboard: InstanceType<GuacamoleNamespace['Keyboard']> | null = null
    const mount = mountRef.current
    const viewport = viewportRef.current
    if (!mount || !viewport) return

    void import('guacamole-common-js').then((loaded) => {
      if (stopped) return
      const Guacamole = (loaded.default ?? loaded) as unknown as GuacamoleNamespace
      const tunnel = new Guacamole.WebSocketTunnel(bridgeWsUrl)
      client = new Guacamole.Client(tunnel)
      const display = client.getDisplay()
      const scale = (width: number, height: number) => {
        const next = Math.min(1, viewport.clientWidth / width, viewport.clientHeight / height)
        display.scale(Number.isFinite(next) && next > 0 ? next : 1)
      }
      display.onresize = scale
      mount.replaceChildren(display.getElement())

      if (scope === 'control') {
        const mouse = new Guacamole.Mouse(display.getElement())
        const sendMouse = (state: unknown) => client?.sendMouseState(state, true)
        mouse.onmousedown = sendMouse
        mouse.onmouseup = sendMouse
        mouse.onmousemove = sendMouse
        keyboard = new Guacamole.Keyboard(viewport)
        keyboard.onkeydown = (keysym) => { client?.sendKeyEvent(1, keysym); return false }
        keyboard.onkeyup = (keysym) => { client?.sendKeyEvent(0, keysym); return false }
      }

      client.onstatechange = (next) => {
        if (next === Guacamole.Client.State.CONNECTED) setStatus('connected')
        if (next === Guacamole.Client.State.DISCONNECTED) setStatus('disconnected')
      }
      tunnel.onerror = (reason) => {
        setStatus('failed')
        setError(reason instanceof Error ? reason.message : 'The remote desktop bridge disconnected.')
      }
      scale(initialWidth, initialHeight)
      client.connect(connectQuery)
    }).catch((reason: unknown) => {
      if (!stopped) {
        setStatus('failed')
        setError(reason instanceof Error ? reason.message : 'The remote desktop client could not start.')
      }
    })

    return () => {
      stopped = true
      keyboard = null
      try { client?.disconnect() } catch { /* best-effort browser teardown */ }
      mount.replaceChildren()
    }
  }, [bridgeWsUrl, connectQuery, initialHeight, initialWidth, scope])

  return (
    <div ref={viewportRef} tabIndex={scope === 'control' ? 0 : -1} className="relative size-full overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
      <div ref={mountRef} className="size-full" />
      <span className="absolute right-3 top-3 rounded-full border border-border bg-surface/90 px-2 py-0.5 text-xs text-fg-muted shadow-sm backdrop-blur">{error ?? status}</span>
    </div>
  )
}
