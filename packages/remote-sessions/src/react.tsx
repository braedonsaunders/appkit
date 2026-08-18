'use client'

import * as React from 'react'
import type { ITheme, Terminal } from '@xterm/xterm'
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

/** Render one immutable ledger entry as terminal bytes. ANSI from commands is preserved. */
export function terminalEntryText(entry: TerminalSurfaceEntry): string {
  const text = entry.text.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  if (entry.kind === 'command') {
    return `\u001b[2m${entry.prompt ?? '$'}\u001b[0m \u001b[1m${text}\u001b[0m\r\n`
  }
  const line = text.endsWith('\n') ? text : `${text}\n`
  if (entry.kind === 'stderr') return `\u001b[31m${line}\u001b[0m`
  if (entry.kind === 'system') return `\u001b[2m${line}\u001b[0m`
  return line
}

function semanticTerminalTheme(host: HTMLElement): ITheme {
  const swatch = (className: string): string => {
    const node = document.createElement('span')
    node.className = className
    node.hidden = true
    host.append(node)
    const color = getComputedStyle(node).color
    node.remove()
    return color
  }
  return {
    background: swatch('text-fg'),
    foreground: swatch('text-bg'),
    cursor: swatch('text-bg'),
    selectionBackground: swatch('text-info'),
    black: swatch('text-fg'),
    red: swatch('text-danger'),
    green: swatch('text-success'),
    yellow: swatch('text-warning'),
    blue: swatch('text-info'),
    magenta: swatch('text-accent'),
    cyan: swatch('text-info'),
    white: swatch('text-bg'),
    brightBlack: swatch('text-fg-muted'),
    brightRed: swatch('text-danger'),
    brightGreen: swatch('text-success'),
    brightYellow: swatch('text-warning'),
    brightBlue: swatch('text-info'),
    brightMagenta: swatch('text-accent'),
    brightCyan: swatch('text-info'),
    brightWhite: swatch('text-bg'),
  }
}

function TerminalEmulator({ entries, emptyLabel }: { entries: readonly TerminalSurfaceEntry[]; emptyLabel: string }) {
  const hostRef = React.useRef<HTMLDivElement | null>(null)
  const terminalRef = React.useRef<Terminal | null>(null)
  const fitRef = React.useRef<{ fit(): void } | null>(null)
  const renderedRef = React.useRef<readonly TerminalSurfaceEntry[]>([])
  const latestEntriesRef = React.useRef(entries)
  latestEntriesRef.current = entries

  React.useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let disposed = false
    let resizeObserver: ResizeObserver | null = null
    let themeObserver: MutationObserver | null = null

    void Promise.all([import('@xterm/xterm'), import('@xterm/addon-fit')]).then(([xterm, fit]) => {
      if (disposed) return
      const terminal = new xterm.Terminal({
        allowProposedApi: false,
        convertEol: true,
        cursorBlink: false,
        disableStdin: true,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.35,
        scrollback: 10_000,
        screenReaderMode: false,
        theme: semanticTerminalTheme(host),
      })
      const fitAddon = new fit.FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(host)
      terminalRef.current = terminal
      fitRef.current = fitAddon
      fitAddon.fit()
      const currentEntries = latestEntriesRef.current
      const initial = currentEntries.length ? currentEntries : [{ id: 'empty', kind: 'system' as const, text: emptyLabel }]
      terminal.write(initial.map(terminalEntryText).join(''))
      renderedRef.current = currentEntries

      resizeObserver = new ResizeObserver(() => fitAddon.fit())
      resizeObserver.observe(host)
      themeObserver = new MutationObserver(() => { terminal.options.theme = semanticTerminalTheme(host) })
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] })
    })

    return () => {
      disposed = true
      resizeObserver?.disconnect()
      themeObserver?.disconnect()
      terminalRef.current?.dispose()
      terminalRef.current = null
      fitRef.current = null
      renderedRef.current = []
    }
  }, [])

  React.useEffect(() => {
    const terminal = terminalRef.current
    if (!terminal) return
    const previous = renderedRef.current
    const extendsPrevious =
      previous.length <= entries.length &&
      previous.every((entry, index) => entry.id === entries[index]?.id && entry.text === entries[index]?.text)
    const buffer = terminal.buffer.active
    const wasFollowing = buffer.viewportY >= buffer.baseY - 1

    if (!extendsPrevious || (previous.length === 0 && entries.length > 0)) {
      terminal.reset()
      const next = entries.length ? entries : [{ id: 'empty', kind: 'system' as const, text: emptyLabel }]
      terminal.write(next.map(terminalEntryText).join(''))
    } else if (entries.length > previous.length) {
      terminal.write(entries.slice(previous.length).map(terminalEntryText).join(''))
    }
    renderedRef.current = entries
    if (wasFollowing) terminal.scrollToBottom()
    fitRef.current?.fit()
  }, [emptyLabel, entries])

  return <div ref={hostRef} className="appkit-terminal size-full min-h-0 px-2 py-2" aria-hidden />
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
  const visibleCwd = cwd && cwd !== '.' && cwd !== './' ? cwd : null

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
      <div className="relative min-h-0 flex-1 overflow-hidden bg-fg">
        <TerminalEmulator entries={entries} emptyLabel={emptyLabel} />
        <div className="sr-only" role="log" aria-live="polite">
          {entries.length === 0 ? emptyLabel : entries.map((entry) => `${entry.prompt ? `${entry.prompt} ` : ''}${entry.text}`).join('\n')}
        </div>
        {status === 'running' ? (
          <div className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-2 rounded-full border border-border bg-surface/90 px-2.5 py-1 text-xs text-fg-muted shadow-sm">
            <span aria-hidden className="size-2 animate-pulse rounded-full bg-info" />
            <span>Running</span>
          </div>
        ) : null}
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
