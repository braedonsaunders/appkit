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
  Loader2,
  Send,
  Sparkles,
  Square,
} from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button, EmptyState, UiLink, cn } from '@braedonsaunders/appkit-ui'

export type AgentMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  parts: unknown[]
}

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
}

export type AgentPanelProps = {
  enabled: boolean
  initialMessages?: AgentMessage[]
  suggestions?: string[]
  labels?: Partial<AgentPanelLabels>
  headerActions?: React.ReactNode
  send?: (prompt: string, signal: AbortSignal) => Promise<Response>
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
  send,
  maxPromptCharacters = 32_000,
  toolLabels,
}: AgentPanelProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const [messages, setMessages] = React.useState(initialMessages)
  const [input, setInput] = React.useState('')
  const [streaming, setStreaming] = React.useState(false)
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
    const prompt = raw.trim()
    if (!enabled || !send || !prompt || prompt.length > maxPromptCharacters || abortRef.current) return
    const controller = new AbortController()
    abortRef.current = controller
    const stamp = Date.now()
    setInput('')
    setError(null)
    setMessages((current) => [...current, { id: `user-${stamp}`, role: 'user', parts: [{ type: 'text', text: prompt }] }, { id: `assistant-${stamp}`, role: 'assistant', parts: [] }])
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
  }, [enabled, labels.failed, maxPromptCharacters, scrollToBottom, send])

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-subtle">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-4"><Sparkles size={16} className="text-primary" /><span className="text-sm font-medium text-fg">{labels.title}</span>{headerActions != null ? <div className="ml-auto flex items-center gap-2">{headerActions}</div> : null}</header>
      <div ref={messageViewportRef} className="app-scroll min-h-0 flex-1 overflow-y-auto"><div className="mx-auto w-full max-w-3xl px-4 py-6">
        {messages.length === 0 ? <AgentWelcome enabled={enabled} title={enabled ? labels.welcomeTitle : labels.disabledTitle} description={enabled ? labels.welcomeDescription : labels.disabledDescription} suggestions={suggestions} onPick={(value) => void submit(value)} /> : <div className="space-y-6">{messages.map((message) => message.role === 'system' ? null : <AgentMessageRow key={message.id} message={message} streaming={streaming} labels={labels} toolLabels={toolLabels} />)}</div>}
        {error ? <div role="alert" className="mt-5 rounded-lg border border-danger/25 bg-danger-subtle px-3 py-2 text-sm text-danger">{error}</div> : null}
      </div></div>
      {enabled ? <div className="shrink-0 border-t border-border bg-surface px-4 py-3"><div className="mx-auto w-full max-w-3xl"><div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-surface p-2 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-ring/20"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(input) } }} maxLength={maxPromptCharacters} rows={1} placeholder={labels.placeholder} className="max-h-40 flex-1 resize-none overflow-y-auto border-0 bg-transparent px-2 py-1.5 text-base text-fg outline-none placeholder:text-fg-subtle sm:text-sm" />{streaming ? <Button type="button" variant="outline" size="icon" onClick={() => abortRef.current?.abort()} aria-label={labels.stop}><Square size={16} /></Button> : <Button type="button" size="icon" onClick={() => void submit(input)} disabled={!input.trim() || !send} aria-label={labels.send}><Send size={16} /></Button>}</div></div></div> : null}
    </div>
  )
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

function AgentMessageRow({ message, streaming, labels, toolLabels }: { message: AgentMessage; streaming: boolean; labels: AgentPanelLabels; toolLabels?: Record<string, string> }) {
  if (message.role === 'user') {
    const text = (message.parts.find((part) => (part as { type?: string }).type === 'text') as { text?: string } | undefined)?.text
    return <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2 text-sm whitespace-pre-wrap text-primary-fg">{text}</div></div>
  }
  return <div className="flex gap-3"><span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-fg shadow-sm"><Sparkles size={16} /></span><div className="min-w-0 flex-1 pt-0.5">{message.parts.length === 0 && streaming ? <div className="flex items-center gap-1 py-1.5">{[0,1,2].map((index) => <span key={index} className="size-1.5 animate-bounce rounded-full bg-fg-subtle" style={{ animationDelay: `${index * 0.15}s` }} />)}</div> : <AgentMessageParts parts={message.parts} labels={labels} toolLabels={toolLabels} />}</div></div>
}

function AgentMessageParts({ parts, labels, toolLabels }: { parts: unknown[]; labels: AgentPanelLabels; toolLabels?: Record<string, string> }) {
  const rendered: React.ReactNode[] = []
  let tools: AgentToolPart[] = []
  let toolGroupStart = 0
  const flushTools = () => {
    if (tools.length === 0) return
    rendered.push(<AgentToolActivity key={`tools-${toolGroupStart}`} parts={tools} labels={labels} toolLabels={toolLabels} />)
    tools = []
  }
  ;(parts as { type: string; [key: string]: unknown }[]).forEach((part, index) => {
    if (isAgentToolPart(part)) {
      if (tools.length === 0) toolGroupStart = index
      tools.push(part)
      return
    }
    if (part.type === 'step-start' || part.type === 'reasoning') return
    flushTools()
    if (part.type === 'text' && typeof part.text === 'string' && part.text.trim()) {
      rendered.push(<ChatMarkdown key={`text-${index}`}>{part.text}</ChatMarkdown>)
    }
  })
  flushTools()
  return <div className="space-y-2.5">{rendered}</div>
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
