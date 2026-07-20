'use client'

import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronRight, Copy, Loader2, Play } from 'lucide-react'
import { Badge } from './badge'
import { Button } from './button'
import { Input } from './input'
import { cn } from './utils'

// Self-documenting API reference. Feed it route descriptions (structurally the
// same as @appkit/api's ApiRouteDoc) and it renders a live, interactive reference
// — method badges, params, code samples, and a real "Send" button.

export type ApiParamDoc = {
  name: string
  in?: 'query' | 'path' | 'header'
  type?: string
  required?: boolean
  description?: string
}

export type ApiEndpointDoc = {
  method: string
  path: string
  summary?: string
  description?: string
  tag?: string
  permission?: string
  params?: ApiParamDoc[]
  requestExample?: unknown
  responseExample?: unknown
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-success-subtle text-success',
  POST: 'bg-info-subtle text-info',
  PUT: 'bg-warning-subtle text-warning',
  PATCH: 'bg-warning-subtle text-warning',
  DELETE: 'bg-danger-subtle text-danger',
}

export function MethodBadge({ method, className }: { method: string; className?: string }) {
  const m = method.toUpperCase()
  return (
    <span
      className={cn(
        'inline-flex min-w-14 justify-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide',
        METHOD_COLORS[m] ?? 'bg-bg-subtle text-fg-muted',
        className,
      )}
    >
      {m}
    </span>
  )
}

export function CodeBlock({ code, className }: { code: string; className?: string }) {
  const [copied, setCopied] = React.useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className={cn('group relative overflow-hidden rounded-lg border border-border bg-bg-subtle', className)}>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy"
        className="absolute right-2 top-2 rounded-md p-1.5 text-fg-subtle opacity-0 transition hover:bg-surface-hover hover:text-fg group-hover:opacity-100"
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
      <pre className="app-scroll overflow-x-auto p-3 text-xs leading-relaxed">
        <code className="font-mono text-fg">{code}</code>
      </pre>
    </div>
  )
}

const json = (v: unknown) => JSON.stringify(v, null, 2)

export function ApiEndpoint({
  endpoint,
  baseUrl,
  apiKey,
  defaultOpen = false,
}: {
  endpoint: ApiEndpointDoc
  baseUrl?: string
  apiKey?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [sending, setSending] = React.useState(false)
  const [result, setResult] = React.useState<{ status: number; body: string } | null>(null)

  async function send() {
    if (!baseUrl) return
    setSending(true)
    setResult(null)
    try {
      const hasBody = endpoint.method !== 'GET' && endpoint.requestExample !== undefined
      const res = await fetch(baseUrl + endpoint.path, {
        method: endpoint.method,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
        },
        body: hasBody ? JSON.stringify(endpoint.requestExample) : undefined,
      })
      const text = await res.text()
      let body = text
      try {
        body = json(JSON.parse(text))
      } catch {
        // Preserve non-JSON response bodies verbatim.
      }
      setResult({ status: res.status, body })
    } catch (e) {
      setResult({ status: 0, body: String(e) })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover"
      >
        <MethodBadge method={endpoint.method} />
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-fg">{endpoint.path}</code>
        {endpoint.summary ? (
          <span className="hidden min-w-0 truncate text-sm text-fg-muted md:block">{endpoint.summary}</span>
        ) : null}
        <ChevronRight className={cn('size-4 shrink-0 text-fg-subtle transition-transform', open && 'rotate-90')} />
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 border-t border-border px-4 py-4">
              {endpoint.description ? <p className="text-sm text-fg-muted">{endpoint.description}</p> : null}
              {endpoint.permission ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-fg-subtle">Requires</span>
                  <Badge variant="secondary" className="font-mono">
                    {endpoint.permission}
                  </Badge>
                </div>
              ) : null}

              {endpoint.params?.length ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-bg-subtle text-xs uppercase tracking-wide text-fg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Param</th>
                        <th className="px-3 py-2 text-left font-medium">Type</th>
                        <th className="px-3 py-2 text-left font-medium">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {endpoint.params.map((p) => (
                        <tr key={p.name}>
                          <td className="px-3 py-2 font-mono text-fg">
                            {p.name}
                            {p.required ? <span className="text-danger"> *</span> : null}
                            <span className="ml-1 text-[11px] text-fg-subtle">{p.in ?? 'query'}</span>
                          </td>
                          <td className="px-3 py-2 font-mono text-fg-muted">{p.type ?? 'string'}</td>
                          <td className="px-3 py-2 text-fg-muted">{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {endpoint.requestExample !== undefined ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-fg-muted">Request body</div>
                  <CodeBlock code={json(endpoint.requestExample)} />
                </div>
              ) : null}
              {endpoint.responseExample !== undefined ? (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-fg-muted">Response</div>
                  <CodeBlock code={json(endpoint.responseExample)} />
                </div>
              ) : null}

              {baseUrl ? (
                <div className="space-y-2">
                  <Button size="sm" onClick={send} disabled={sending}>
                    {sending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    Send request
                  </Button>
                  {result ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-fg-subtle">Response</span>
                        <Badge variant={result.status >= 200 && result.status < 300 ? 'success' : 'destructive'}>
                          {result.status || 'error'}
                        </Badge>
                      </div>
                      <CodeBlock code={result.body} />
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

export function ApiReference({
  endpoints,
  baseUrl,
  title,
  description,
  apiKey: initialApiKey,
  showBearerToken = true,
  className,
}: {
  endpoints: ApiEndpointDoc[]
  baseUrl?: string
  title?: string
  description?: string
  apiKey?: string
  /** Show the optional bearer-token input beside the base URL. */
  showBearerToken?: boolean
  className?: string
}) {
  const [apiKey, setApiKey] = React.useState(initialApiKey ?? '')
  const groups = React.useMemo(() => {
    const map = new Map<string, ApiEndpointDoc[]>()
    for (const e of endpoints) {
      const tag = e.tag ?? 'Endpoints'
      ;(map.get(tag) ?? map.set(tag, []).get(tag)!).push(e)
    }
    return [...map.entries()]
  }, [endpoints])

  return (
    <div className={cn('space-y-6', className)}>
      {title || description ? (
        <div className="space-y-1">
          {title ? <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2> : null}
          {description ? <p className="text-sm text-fg-muted">{description}</p> : null}
        </div>
      ) : null}

      {baseUrl ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <div className="text-xs text-fg-subtle">Base URL</div>
            <code className="truncate font-mono text-sm text-fg">{baseUrl}</code>
          </div>
          {showBearerToken ? (
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Bearer token (optional)"
              className="sm:w-64"
            />
          ) : null}
        </div>
      ) : null}

      {groups.map(([tag, eps]) => (
        <section key={tag} className="space-y-2">
          <h3 className="px-0.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">{tag}</h3>
          <div className="space-y-2">
            {eps.map((e, i) => (
              <ApiEndpoint key={`${e.method}-${e.path}-${i}`} endpoint={e} baseUrl={baseUrl} apiKey={apiKey || initialApiKey} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
