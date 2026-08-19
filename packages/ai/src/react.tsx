'use client'

import * as React from 'react'
import {
  parseJsonEventStream,
  readUIMessageStream,
  uiMessageChunkSchema,
  type UIMessageChunk,
} from 'ai'
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  ListPlus,
  Loader2,
  Pencil,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button, EmptyState, Input, UiLink, cn } from '@braedonsaunders/appkit-ui'

export type AgentMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: unknown[]
}

export type AgentQueuedMessage = {
  id: string
  text: string
  position: number
  status: 'queued' | 'dispatching' | 'retrying' | 'failed'
  statusLabel?: string
  editable?: boolean
  removable?: boolean
  retryable?: boolean
}

export type AgentSecretRequestStatus = 'pending' | 'stored' | 'expired'

/** Transcript-safe metadata for an inline credential request. */
export type AgentSecretRequestPart = {
  type: 'secret-request'
  requestId: string
  providerLabel: string
  credentialLabel: string
  purpose: string
  helpUrl?: string
  status: AgentSecretRequestStatus
}

export type AgentSecretRequestLabels = {
  show: string
  hide: string
  submit: string
  cancel: string
  help: string
  submitting: string
  stored: string
  expired: string
  required: string
  failed: string
  cancelFailed: string
}

const DEFAULT_SECRET_REQUEST_LABELS: AgentSecretRequestLabels = {
  show: 'Show credential',
  hide: 'Hide credential',
  submit: 'Submit securely',
  cancel: 'Cancel',
  help: 'Open setup instructions',
  submitting: 'Submitting securely',
  stored: 'Credential stored securely.',
  expired: 'This credential request has expired.',
  required: 'Enter the credential before submitting.',
  failed: 'The credential could not be submitted. Enter it again and retry.',
  cancelFailed: 'The credential request could not be canceled. Please retry.',
}

export type AgentDispatchState = 'idle' | 'running' | 'recovering'

export type AgentPanelLabels = {
  title: string
  welcomeTitle: string
  welcomeDescription: string
  disabledTitle: string
  disabledDescription: string
  placeholder: string
  send: string
  stop: string
  failed: string
  input: string
  result: string
  working: string
  step: string
  steps: string
  queue: string
  queueTitle: string
  queuePosition: string
  queued: string
  dispatching: string
  retrying: string
  queueFailed: string
  editQueued: string
  removeQueued: string
  retryQueued: string
  responding: string
}

const DEFAULT_LABELS: AgentPanelLabels = {
  title: 'Assistant',
  welcomeTitle: 'How can I help?',
  welcomeDescription: 'Ask about your workspace or let the assistant use an approved tool.',
  disabledTitle: 'Connect an AI provider',
  disabledDescription: 'Connect an AI provider to enable agent conversations. No provider credentials are included in the demo.',
  placeholder: 'Ask the assistant…',
  send: 'Send',
  stop: 'Stop generating',
  failed: 'The assistant could not complete that turn. Please try again.',
  input: 'Input',
  result: 'Result',
  working: 'Working',
  step: 'step',
  steps: 'steps',
  queue: 'Add to queue',
  queueTitle: 'Up next',
  queuePosition: 'Position',
  queued: 'Queued',
  dispatching: 'Starting',
  retrying: 'Retrying',
  queueFailed: 'This queued message needs attention.',
  editQueued: 'Edit queued message',
  removeQueued: 'Remove queued message',
  retryQueued: 'Retry queued message',
  responding: 'Assistant is responding',
}

export type AgentPanelProps = {
  enabled: boolean
  initialMessages?: AgentMessage[]
  suggestions?: string[]
  labels?: Partial<AgentPanelLabels>
  headerActions?: React.ReactNode
  /** Replaces the stock empty-state card while preserving the panel header and composer. */
  emptyContent?: React.ReactNode
  /** Application-owned draft UI rendered immediately above the composer row. */
  composerContent?: React.ReactNode
  /** Application-owned controls rendered before the text input. */
  composerActions?: React.ReactNode
  /**
   * Non-text content currently attached to the draft. `fallbackPrompt` makes
   * a file-only draft sendable; `parts` are included in the optimistic user
   * turn so the attachment does not disappear while the response streams.
   */
  composerDraft?: { fallbackPrompt?: string; parts?: readonly unknown[] }
  send?: (prompt: string, signal: AbortSignal) => Promise<Response>
  /** Durable dispatch state supplied by the application after reload or handoff. */
  dispatchState?: AgentDispatchState
  /** Application-owned queue, already ordered by its durable dispatch position. */
  queuedMessages?: readonly AgentQueuedMessage[]
  /** Persists a turn behind the active or previously queued work. */
  enqueue?: (prompt: string) => Promise<void>
  onEditQueuedMessage?: (message: AgentQueuedMessage) => void
  onRemoveQueuedMessage?: (message: AgentQueuedMessage) => void
  onRetryQueuedMessage?: (message: AgentQueuedMessage) => void
  /** Receives the transient input value after AppKit clears the field. */
  onSubmitSecretRequest?: (requestId: string, secret: string) => void | Promise<void>
  onCancelSecretRequest?: (requestId: string) => void | Promise<void>
  secretRequestLabels?: Partial<AgentSecretRequestLabels>
  maxPromptCharacters?: number
  toolLabels?: Record<string, string>
}

/**
 * The streaming thread/composer extracted from the sibling assistant. The app
 * owns persistence and the HTTP transport; appkit owns UI-message decoding,
 * cancellation, ordered part rendering, and tool cards.
 */
export function AgentPanel({
  enabled,
  initialMessages = [],
  suggestions = [],
  labels: labelOverrides,
  headerActions,
  emptyContent,
  composerContent,
  composerActions,
  composerDraft,
  send,
  dispatchState = 'idle',
  queuedMessages = [],
  enqueue,
  onEditQueuedMessage,
  onRemoveQueuedMessage,
  onRetryQueuedMessage,
  onSubmitSecretRequest,
  onCancelSecretRequest,
  secretRequestLabels,
  maxPromptCharacters = 32_000,
  toolLabels,
}: AgentPanelProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const [messages, setMessages] = React.useState(initialMessages)
  const [input, setInput] = React.useState('')
  const [streaming, setStreaming] = React.useState(false)
  const [enqueueing, setEnqueueing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const messageViewportRef = React.useRef<HTMLDivElement>(null)

  const scrollToBottom = React.useCallback(() => {
    window.requestAnimationFrame(() => {
      const viewport = messageViewportRef.current
      if (viewport) viewport.scrollTop = viewport.scrollHeight
    })
  }, [])

  // An existing conversation opens where work most recently happened. Keep
  // this scoped to the panel's own viewport: scrollIntoView also moves every
  // scrolling ancestor and can make an otherwise app-height page jump.
  React.useLayoutEffect(() => {
    scrollToBottom()
  }, [scrollToBottom])

  const submit = React.useCallback(async (raw: string) => {
    const prompt = raw.trim() || composerDraft?.fallbackPrompt?.trim() || ''
    if (!enabled || !prompt || prompt.length > maxPromptCharacters) return
    const shouldEnqueue = dispatchState !== 'idle' || abortRef.current !== null || queuedMessages.length > 0
    if (shouldEnqueue) {
      if (!enqueue || enqueueing) return
      setEnqueueing(true)
      setError(null)
      try {
        await enqueue(prompt)
        setInput('')
      } catch {
        setError(labels.queueFailed)
      } finally {
        setEnqueueing(false)
      }
      return
    }
    if (!send) return
    const controller = new AbortController()
    abortRef.current = controller
    const stamp = Date.now()
    setInput('')
    setError(null)
    setMessages((current) => [...current, { id: `user-${stamp}`, role: 'user', parts: [{ type: 'text', text: prompt }, ...(composerDraft?.parts ?? [])] }, { id: `assistant-${stamp}`, role: 'assistant', parts: [] }])
    setStreaming(true)
    scrollToBottom()
    let producedParts = false
    try {
      const response = await send(prompt, controller.signal)
      if (!response.ok || !response.body) throw new Error('agent request failed')
      const chunks = parseJsonEventStream({ stream: response.body, schema: uiMessageChunkSchema }).pipeThrough(new TransformStream<{ success: boolean; value?: UIMessageChunk }, UIMessageChunk>({ transform(part, stream) { if (part.success && part.value) stream.enqueue(part.value) } }))
      let lastParts: unknown[] = []
      for await (const message of readUIMessageStream({ stream: chunks })) {
        lastParts = message.parts as unknown[]
        producedParts = lastParts.length > 0
        setMessages((current) => replaceLastAssistantParts(current, lastParts))
        scrollToBottom()
      }
      if (lastParts.length === 0 && !controller.signal.aborted) setError(labels.failed)
    } catch (reason) {
      if ((reason as Error).name !== 'AbortError') setError(labels.failed)
    } finally {
      if (!producedParts) {
        setMessages((current) => current.filter((message) => message.id !== `assistant-${stamp}`))
      }
      setStreaming(false)
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [composerDraft, dispatchState, enabled, enqueue, enqueueing, labels.failed, labels.queueFailed, maxPromptCharacters, queuedMessages.length, scrollToBottom, send])

  const queueMode = dispatchState !== 'idle' || streaming || queuedMessages.length > 0

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-subtle">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-4"><Sparkles size={16} className="text-primary" /><span className="text-sm font-medium text-fg">{labels.title}</span>{headerActions != null ? <div className="ml-auto flex items-center gap-2">{headerActions}</div> : null}</header>
      <div ref={messageViewportRef} className="app-scroll min-h-0 flex-1 overflow-y-auto">
        {messages.length === 0 && emptyContent != null ? (
          <div className="flex min-h-full flex-col">{emptyContent}</div>
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.length === 0 ? <AgentWelcome enabled={enabled} title={enabled ? labels.welcomeTitle : labels.disabledTitle} description={enabled ? labels.welcomeDescription : labels.disabledDescription} suggestions={suggestions} onPick={(value) => void submit(value)} /> : <div className="space-y-6">{messages.map((message) => message.role === 'system' ? null : <AgentMessageRow key={message.id} message={message} streaming={streaming} labels={labels} toolLabels={toolLabels} onSubmitSecretRequest={onSubmitSecretRequest} onCancelSecretRequest={onCancelSecretRequest} secretRequestLabels={secretRequestLabels} />)}</div>}
          </div>
        )}
        {error ? <div role="alert" className="mx-auto mb-5 w-[calc(100%-2rem)] max-w-3xl rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</div> : null}
      </div>
      {enabled ? <div className="shrink-0 border-t border-border bg-surface px-4 py-3"><div className="mx-auto w-full max-w-3xl">{queuedMessages.length > 0 ? <AgentMessageQueue messages={queuedMessages} labels={labels} onEdit={onEditQueuedMessage} onRemove={onRemoveQueuedMessage} onRetry={onRetryQueuedMessage} /> : null}{composerContent != null ? <div className="mb-2">{composerContent}</div> : null}<div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-surface p-2 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20">{composerActions}<textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(input) } }} maxLength={maxPromptCharacters} rows={1} placeholder={labels.placeholder} className="max-h-40 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-1.5 text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm" />{streaming ? <Button type="button" variant="outline" size="icon" onClick={() => abortRef.current?.abort()} aria-label={labels.stop}><Square size={16} /></Button> : null}<Button type="button" size="icon" onClick={() => void submit(input)} disabled={!(input.trim() || composerDraft?.fallbackPrompt?.trim()) || (queueMode ? !enqueue || enqueueing : !send)} aria-label={queueMode ? labels.queue : labels.send}>{enqueueing ? <Loader2 size={16} className="animate-spin" /> : queueMode ? <ListPlus size={16} /> : <Send size={16} />}</Button></div></div></div> : null}
    </div>
  )
}

export function AgentMessageQueue({
  messages,
  labels: labelOverrides,
  onEdit,
  onRemove,
  onRetry,
}: {
  messages: readonly AgentQueuedMessage[]
  labels?: Partial<AgentPanelLabels>
  onEdit?: (message: AgentQueuedMessage) => void
  onRemove?: (message: AgentQueuedMessage) => void
  onRetry?: (message: AgentQueuedMessage) => void
}) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  return (
    <section className="mb-3 rounded-xl border border-border bg-bg-subtle p-2" aria-label={labels.queueTitle}>
      <div className="px-2 pb-1 text-xs font-medium text-fg-muted">{labels.queueTitle}</div>
      <ol className="space-y-1">
        {messages.map((message) => (
          <li key={message.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-surface px-2 py-1.5 shadow-xs">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-xs font-medium text-primary" aria-label={`${labels.queuePosition} ${message.position}`}>{message.position}</span>
            <span className="min-w-0 flex-1 truncate text-sm text-fg">{message.text}</span>
            <span className={cn('shrink-0 text-xs', message.status === 'failed' ? 'text-danger' : 'text-fg-muted')}>{message.statusLabel ?? queueStatusLabel(message.status, labels)}</span>
            {message.retryable && onRetry ? <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onRetry(message)} aria-label={labels.retryQueued}><RotateCcw size={14} /></Button> : null}
            {message.editable && onEdit ? <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onEdit(message)} aria-label={labels.editQueued}><Pencil size={14} /></Button> : null}
            {message.removable && onRemove ? <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => onRemove(message)} aria-label={labels.removeQueued}><Trash2 size={14} /></Button> : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

function queueStatusLabel(status: AgentQueuedMessage['status'], labels: AgentPanelLabels): string {
  if (status === 'dispatching') return labels.dispatching
  if (status === 'retrying') return labels.retrying
  if (status === 'failed') return labels.queueFailed
  return labels.queued
}

function replaceLastAssistantParts(messages: AgentMessage[], parts: unknown[]): AgentMessage[] {
  const copy = messages.slice()
  for (let index = copy.length - 1; index >= 0; index -= 1) {
    if (copy[index]?.role === 'assistant') { copy[index] = { ...copy[index]!, parts }; break }
  }
  return copy
}

function AgentWelcome({ enabled, title, description, suggestions, onPick }: { enabled: boolean; title: string; description: string; suggestions: string[]; onPick: (value: string) => void }) {
  return <div className="pt-10"><EmptyState icon={<Sparkles />} title={title} description={description} />{enabled && suggestions.length ? <div className="mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2">{suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => onPick(suggestion)} className="rounded-xl border border-border bg-surface px-4 py-3 text-left text-sm text-fg-muted shadow-sm transition-colors hover:border-primary/40 hover:bg-primary-subtle hover:text-fg">{suggestion}</button>)}</div> : null}</div>
}

function AgentMessageRow({ message, streaming, labels, toolLabels, onSubmitSecretRequest, onCancelSecretRequest, secretRequestLabels }: { message: AgentMessage; streaming: boolean; labels: AgentPanelLabels; toolLabels?: Record<string, string>; onSubmitSecretRequest?: AgentPanelProps['onSubmitSecretRequest']; onCancelSecretRequest?: AgentPanelProps['onCancelSecretRequest']; secretRequestLabels?: Partial<AgentSecretRequestLabels> }) {
  if (message.role === 'user') {
    const text = (message.parts.find((part) => (part as { type?: string }).type === 'text') as { text?: string } | undefined)?.text
    const files = message.parts.filter(isAgentFilePart)
    return <div className="flex justify-end"><div className="max-w-[85%] space-y-2 rounded-2xl rounded-br-md bg-primary px-4 py-2 text-sm whitespace-pre-wrap text-primary-fg">{text ? <div>{text}</div> : null}{files.length > 0 ? <div className="flex flex-wrap justify-end gap-1.5">{files.map((file, index) => file.url ? <a key={`${file.filename}-${index}`} href={file.url} className="rounded-md border border-primary-fg/25 bg-primary-fg/10 px-2 py-1 text-xs font-medium hover:bg-primary-fg/15" download>{file.filename}</a> : <span key={`${file.filename}-${index}`} className="rounded-md border border-primary-fg/25 bg-primary-fg/10 px-2 py-1 text-xs font-medium">{file.filename}</span>)}</div> : null}</div></div>
  }
  return <div className="flex gap-3"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-sm"><Sparkles size={16} /></span><div className="min-w-0 flex-1 pt-0.5">{message.parts.length === 0 && streaming ? <AgentTypingIndicator label={labels.responding} /> : <AgentMessageParts parts={message.parts} labels={labels} toolLabels={toolLabels} onSubmitSecretRequest={onSubmitSecretRequest} onCancelSecretRequest={onCancelSecretRequest} secretRequestLabels={secretRequestLabels} />}</div></div>
}

const TYPING_DOT_DELAYS = [
  '0ms',
  'var(--duration-fast)',
  'calc(var(--duration-fast) + var(--duration-fast))',
] as const

/**
 * A self-contained streaming cue that does not depend on the consuming app's
 * Tailwind content scan. The cadence uses AppKit motion tokens and becomes a
 * still, readable ellipsis when the user requests reduced motion.
 */
export function AgentTypingIndicator({ label = DEFAULT_LABELS.responding }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center gap-1 py-1.5">
      <style>{`
        @keyframes appkit-agent-typing-dot {
          0%, 36%, 100% { opacity: 0.55; transform: translateY(0); }
          18% { opacity: 1; transform: translateY(-0.2rem); }
        }
        .appkit-agent-typing-dot {
          animation: appkit-agent-typing-dot calc(var(--duration-slow) + var(--duration-slow) + var(--duration-slow)) var(--ease-out) infinite;
          will-change: transform, opacity;
        }
        @media (prefers-reduced-motion: reduce) {
          .appkit-agent-typing-dot {
            animation: none;
            opacity: 0.7;
            transform: none;
            will-change: auto;
          }
        }
      `}</style>
      {TYPING_DOT_DELAYS.map((animationDelay) => (
        <span
          key={animationDelay}
          aria-hidden="true"
          className="appkit-agent-typing-dot size-1.5 rounded-full bg-fg-subtle"
          style={{ animationDelay }}
        />
      ))}
    </div>
  )
}

function isAgentFilePart(part: unknown): part is { type: 'file'; filename: string; url?: string } {
  if (!part || typeof part !== 'object') return false
  const candidate = part as { type?: unknown; filename?: unknown; url?: unknown }
  return candidate.type === 'file'
    && typeof candidate.filename === 'string'
    && candidate.filename.trim().length > 0
    && (candidate.url === undefined || typeof candidate.url === 'string')
}

function AgentMessageParts({ parts, labels, toolLabels, onSubmitSecretRequest, onCancelSecretRequest, secretRequestLabels }: { parts: unknown[]; labels: AgentPanelLabels; toolLabels?: Record<string, string>; onSubmitSecretRequest?: AgentPanelProps['onSubmitSecretRequest']; onCancelSecretRequest?: AgentPanelProps['onCancelSecretRequest']; secretRequestLabels?: Partial<AgentSecretRequestLabels> }) {
  const rendered: React.ReactNode[] = []
  let tools: AgentToolPart[] = []
  let toolGroupStart = 0
  const flushTools = () => {
    if (tools.length === 0) return
    rendered.push(<AgentToolActivity key={`tools-${toolGroupStart}`} parts={tools} labels={labels} toolLabels={toolLabels} />)
    tools = []
  }
  parts.forEach((value, index) => {
    if (!value || typeof value !== 'object' || typeof (value as { type?: unknown }).type !== 'string') return
    const part = value as { type: string; [key: string]: unknown }
    if (isAgentToolPart(part)) {
      if (tools.length === 0) toolGroupStart = index
      tools.push(part)
      return
    }
    if (part.type === 'step-start' || part.type === 'reasoning') return
    flushTools()
    if (isAgentSecretRequestPart(part)) {
      rendered.push(<AgentSecretRequestCard key={`secret-${part.requestId}-${part.status}`} request={part} labels={secretRequestLabels} onSubmit={onSubmitSecretRequest} onCancel={onCancelSecretRequest} />)
      return
    }
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
      rendered.push(<ChatMarkdown key={`text-${index}`}>{part.text}</ChatMarkdown>)
    }
  })
  flushTools()
  return <div className="space-y-2.5">{rendered}</div>
}

function isAgentSecretRequestPart(part: { type: string; [key: string]: unknown }): part is AgentSecretRequestPart & { [key: string]: unknown } {
  return part.type === 'secret-request'
    && typeof part.requestId === 'string'
    && part.requestId.trim().length > 0
    && typeof part.providerLabel === 'string'
    && part.providerLabel.trim().length > 0
    && typeof part.credentialLabel === 'string'
    && part.credentialLabel.trim().length > 0
    && typeof part.purpose === 'string'
    && part.purpose.trim().length > 0
    && (part.helpUrl === undefined || typeof part.helpUrl === 'string')
    && (part.status === 'pending' || part.status === 'stored' || part.status === 'expired')
}

function safeSecretHelpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  if (value.startsWith('/') && !value.startsWith('//')) return value
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

export type AgentSecretRequestCardProps = {
  request: AgentSecretRequestPart
  labels?: Partial<AgentSecretRequestLabels>
  onSubmit?: (requestId: string, secret: string) => void | Promise<void>
  onCancel?: (requestId: string) => void | Promise<void>
}

/**
 * Inline credential handoff for an assistant transcript. The password field is
 * uncontrolled: its value is read directly from the DOM, cleared before the
 * caller receives it, and never copied into React or transcript state.
 */
export function AgentSecretRequestCard({ request, labels: labelOverrides, onSubmit, onCancel }: AgentSecretRequestCardProps) {
  const labels = { ...DEFAULT_SECRET_REQUEST_LABELS, ...labelOverrides }
  const inputId = React.useId()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [revealed, setRevealed] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [settledStatus, setSettledStatus] = React.useState<Exclude<AgentSecretRequestStatus, 'pending'> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const requestIdentityRef = React.useRef(`${request.requestId}:${request.status}`)
  const status = settledStatus ?? request.status
  const helpUrl = safeSecretHelpUrl(request.helpUrl)

  const clearInput = React.useCallback(() => {
    if (inputRef.current) inputRef.current.value = ''
  }, [])

  React.useEffect(() => {
    const identity = `${request.requestId}:${request.status}`
    if (requestIdentityRef.current !== identity) {
      requestIdentityRef.current = identity
      clearInput()
      setRevealed(false)
      setSubmitting(false)
      setSettledStatus(null)
      setError(null)
    }
  }, [clearInput, request.requestId, request.status])

  React.useEffect(() => {
    return clearInput
  }, [clearInput])

  const submit = React.useCallback(async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!onSubmit || submitting || status !== 'pending') return
    const secret = inputRef.current?.value ?? ''
    if (secret.length === 0) {
      setError(labels.required)
      inputRef.current?.focus()
      return
    }
    clearInput()
    setRevealed(false)
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit(request.requestId, secret)
      setSettledStatus('stored')
    } catch {
      setError(labels.failed)
      inputRef.current?.focus()
    } finally {
      clearInput()
      setSubmitting(false)
    }
  }, [clearInput, labels.failed, labels.required, onSubmit, request.requestId, status, submitting])

  const cancel = React.useCallback(async () => {
    if (!onCancel || submitting || status !== 'pending') return
    clearInput()
    setRevealed(false)
    setError(null)
    setSubmitting(true)
    try {
      await onCancel(request.requestId)
      setSettledStatus('expired')
    } catch {
      setError(labels.cancelFailed)
    } finally {
      clearInput()
      setSubmitting(false)
    }
  }, [clearInput, labels.cancelFailed, onCancel, request.requestId, status, submitting])

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm" aria-labelledby={`${inputId}-title`}>
      <div className="flex items-start gap-3 p-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary"><KeyRound size={16} /></span>
        <div className="min-w-0 flex-1">
          <div id={`${inputId}-title`} className="text-sm font-semibold text-fg">{request.providerLabel}</div>
          <div className="mt-0.5 text-xs font-medium text-fg-muted">{request.credentialLabel}</div>
          <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{request.purpose}</p>
          {helpUrl ? helpUrl.startsWith('/') ? <UiLink href={helpUrl} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{labels.help}</UiLink> : <a href={helpUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">{labels.help}<ExternalLink size={12} aria-hidden="true" /></a> : null}
        </div>
      </div>
      {status === 'pending' ? (
        <form onSubmit={(event) => void submit(event)} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); void cancel() } }} className="space-y-2.5 border-t border-border bg-bg-subtle p-3">
          <label htmlFor={inputId} className="sr-only">{request.credentialLabel}</label>
          <div className="relative">
            <Input ref={inputRef} id={inputId} type={revealed ? 'text' : 'password'} autoComplete="new-password" autoCapitalize="none" spellCheck={false} disabled={submitting || !onSubmit} aria-invalid={error ? true : undefined} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} className="pr-11 font-mono" />
            <button type="button" onClick={() => setRevealed((value) => !value)} disabled={submitting || !onSubmit} aria-label={revealed ? labels.hide : labels.show} aria-pressed={revealed} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-fg-muted transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none">{revealed ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
          {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => void cancel()} disabled={submitting || !onCancel}>{labels.cancel}</Button>
            <Button type="submit" size="sm" disabled={submitting || !onSubmit}>{submitting ? <><Loader2 size={14} className="animate-spin motion-reduce:animate-none" />{labels.submitting}</> : labels.submit}</Button>
          </div>
        </form>
      ) : (
        <div role="status" className={cn('flex items-center gap-2 border-t border-border px-3 py-2.5 text-sm font-medium', status === 'stored' ? 'bg-success-subtle text-success' : 'bg-bg-subtle text-fg-muted')}>
          {status === 'stored' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {status === 'stored' ? labels.stored : labels.expired}
        </div>
      )}
    </section>
  )
}

type AgentToolPart = { type: string; toolName?: unknown; state?: unknown; input?: unknown; output?: unknown }

function isAgentToolPart(part: { type: string }): part is AgentToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}

function agentToolName(part: AgentToolPart): string {
  return part.type === 'dynamic-tool' ? String(part.toolName ?? 'tool') : part.type.slice(5)
}

function agentToolRunning(part: AgentToolPart): boolean {
  const state = String(part.state ?? 'output-available')
  return state === 'input-streaming' || state === 'input-available'
}

function agentToolErrored(part: AgentToolPart): boolean {
  return String(part.state) === 'output-error' || (part.output as { ok?: boolean } | undefined)?.ok === false
}

/**
 * A multi-step run stays quiet in the transcript: the newest action and total
 * step count occupy one line, while the complete inputs/results remain one
 * click away. Applications keep their full durable audit trail separately.
 */
function AgentToolActivity({ parts, labels, toolLabels }: { parts: AgentToolPart[]; labels: AgentPanelLabels; toolLabels?: Record<string, string> }) {
  const [open, setOpen] = React.useState(false)
  const latest = parts.at(-1)!
  const latestName = agentToolName(latest)
  const running = parts.some(agentToolRunning)
  const errored = parts.some(agentToolErrored)
  const count = parts.length
  const status = running ? labels.working : `${count} ${count === 1 ? labels.step : labels.steps}`
  return <div className="text-sm"><button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex h-7 max-w-full items-center gap-1.5 rounded-md px-1.5 text-left text-xs text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"><span className={cn('size-1.5 shrink-0 rounded-full', running ? 'animate-pulse bg-primary' : errored ? 'bg-danger' : 'bg-success')} /><span className="shrink-0 font-medium">{status}</span><span aria-hidden className="text-fg-subtle">·</span><span className="min-w-0 truncate">{toolLabels?.[latestName] ?? latestName.replaceAll('_', ' ')}</span><ChevronRight size={12} className={cn('shrink-0 text-fg-subtle transition-transform', open && 'rotate-90')} /></button>{open ? <div className="mt-1.5 space-y-1.5 border-l border-border pl-2">{parts.map((part, index) => { const name = agentToolName(part); return <AgentToolCard key={`${name}-${index}`} name={name} label={toolLabels?.[name]} state={String(part.state ?? 'output-available')} input={part.input} output={part.output} inputLabel={labels.input} resultLabel={labels.result} /> })}</div> : null}</div>
}

export function ChatMarkdown({ children }: { children: string }) {
  return <div className="space-y-2 text-sm leading-relaxed text-fg"><Markdown remarkPlugins={[remarkGfm]} components={{ p: ({ children: content }) => <p className="whitespace-pre-wrap">{content}</p>, h1: ({ children: content }) => <h1 className="text-lg font-semibold">{content}</h1>, h2: ({ children: content }) => <h2 className="text-base font-semibold">{content}</h2>, ul: ({ children: content }) => <ul className="list-disc space-y-1 pl-5">{content}</ul>, ol: ({ children: content }) => <ol className="list-decimal space-y-1 pl-5">{content}</ol>, code: ({ children: content }) => <code className="rounded bg-bg-subtle px-1 py-0.5 font-mono text-[0.85em] text-primary">{content}</code>, pre: ({ children: content }) => <pre className="overflow-auto rounded-lg bg-overlay p-3 text-sm whitespace-pre-wrap text-white">{content}</pre>, table: ({ children: content }) => <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">{content}</table></div>, th: ({ children: content }) => <th className="border-b border-border px-2 py-1 text-left">{content}</th>, td: ({ children: content }) => <td className="border-b border-border-subtle px-2 py-1">{content}</td>, a: ({ href, children: content }) => href?.startsWith('/') ? <UiLink href={href} className="font-medium text-primary underline-offset-2 hover:underline">{content}</UiLink> : <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary underline-offset-2 hover:underline">{content}</a> }}>{children}</Markdown></div>
}

export function AgentToolCard({ name, label, state, input, output, inputLabel = 'Input', resultLabel = 'Result' }: { name: string; label?: string; state: string; input?: unknown; output?: unknown; inputLabel?: string; resultLabel?: string }) {
  const [open, setOpen] = React.useState(false)
  const running = state === 'input-streaming' || state === 'input-available'
  const errored = state === 'output-error' || (output as { ok?: boolean } | undefined)?.ok === false
  return <div className="overflow-hidden rounded-lg border border-border bg-bg-subtle text-sm"><button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-hover"><span className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', errored ? 'bg-danger-subtle text-danger' : 'bg-primary-subtle text-primary')}><Database size={14} /></span><span className="min-w-0 flex-1 truncate font-medium text-fg">{label ?? name.replaceAll('_', ' ')}</span>{running ? <Loader2 size={14} className="animate-spin text-fg-subtle" /> : errored ? <AlertCircle size={14} className="text-danger" /> : <CheckCircle2 size={14} className="text-success" />}<ChevronRight size={14} className={cn('text-fg-subtle transition-transform', open && 'rotate-90')} /></button>{open ? <div className="space-y-2 border-t border-border px-3 py-2">{input !== undefined ? <AgentToolDetail label={inputLabel} value={input} /> : null}{output !== undefined ? <AgentToolDetail label={resultLabel} value={output} /> : null}</div> : null}</div>
}

function AgentToolDetail({ label, value }: { label: string; value: unknown }) {
  let text: string
  try { text = JSON.stringify(value, null, 2) } catch { text = String(value) }
  return <div><div className="mb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{label}</div><pre className="max-h-60 overflow-auto rounded-md bg-surface p-2 text-xs leading-relaxed text-fg ring-1 ring-border">{text}</pre></div>
}
