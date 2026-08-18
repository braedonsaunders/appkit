'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  BookmarkPlus,
  ClipboardCopy,
  Clock,
  Download,
  Eraser,
  Menu,
  Play,
  TerminalSquare,
} from 'lucide-react'
import {
  Badge,
  Button,
  Drawer,
  Input,
  Select,
  cn,
  toast,
} from '@braedonsaunders/appkit-ui'
import { mergeQueryConsoleLabels } from './labels'
import { queryResultToCsv } from './core'
import { createLocalQueryConsoleStorage } from './storage'
import { QueryConsoleRail, type QueryConsoleRailTab } from './query-console-rail'
import { QueryResultsGrid } from './results-grid'
import type {
  QueryConsoleAdapter,
  QueryConsoleLabelOverrides,
  QueryConsoleStorage,
  QueryConsoleStorageOperation,
  QueryHistoryItem,
  QueryResult,
  QuerySnippet,
  SavedQuerySnippet,
} from './types'

export interface QueryConsoleProps {
  adapter: QueryConsoleAdapter
  starterSql?: string
  snippets?: QuerySnippet[]
  labels?: QueryConsoleLabelOverrides
  rowLimits?: number[]
  defaultRowLimit?: number
  storage?: QueryConsoleStorage | null
  storageNamespace?: string
  onStorageError?: (error: unknown, operation: QueryConsoleStorageOperation) => void
  downloadFileName?: (result: QueryResult) => string
  className?: string
}

const DEFAULT_STARTER_SQL = 'select current_date as today'
const DEFAULT_ROW_LIMITS = [100, 500, 1_000, 5_000]

function storageFailure(error: unknown, operation: QueryConsoleStorageOperation) {
  console.error(`Query console could not persist ${operation}`, error)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function QueryConsole({
  adapter,
  starterSql = DEFAULT_STARTER_SQL,
  snippets = [],
  labels: labelOverrides,
  rowLimits = DEFAULT_ROW_LIMITS,
  defaultRowLimit = 500,
  storage,
  storageNamespace = 'appkit.queryConsole',
  onStorageError = storageFailure,
  downloadFileName = (result) => `query-${result.rowCount}rows.csv`,
  className,
}: QueryConsoleProps) {
  const labels = useMemo(() => mergeQueryConsoleLabels(labelOverrides), [labelOverrides])
  const normalizedRowLimits = useMemo(() => {
    const values = [...new Set(rowLimits.map((value) => Math.trunc(value)).filter((value) => value > 0))]
    return values.length > 0 ? values : DEFAULT_ROW_LIMITS
  }, [rowLimits])
  const initialRowLimit = normalizedRowLimits.includes(defaultRowLimit)
    ? defaultRowLimit
    : normalizedRowLimits[0]!
  const resolvedStorage = useMemo(() => (
    storage === undefined ? createLocalQueryConsoleStorage(storageNamespace) : storage
  ), [storage, storageNamespace])

  const [sqlText, setSqlText] = useState(starterSql)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [ranSelection, setRanSelection] = useState(false)
  const [maxRows, setMaxRows] = useState(initialRowLimit)
  const [resultFilter, setResultFilter] = useState('')
  const [railTab, setRailTab] = useState<QueryConsoleRailTab>('schema')
  const [mobileRailOpen, setMobileRailOpen] = useState(false)
  const [schema, setSchema] = useState<Awaited<ReturnType<QueryConsoleAdapter['listSchema']>>>([])
  const [schemaLoading, setSchemaLoading] = useState(true)
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [history, setHistory] = useState<QueryHistoryItem[]>([])
  const [savedSnippets, setSavedSnippets] = useState<SavedQuerySnippet[]>([])
  const [storageReady, setStorageReady] = useState(resolvedStorage === null)
  const [editorHeight, setEditorHeight] = useState(260)

  const editorRef = useRef<HTMLTextAreaElement>(null)
  const workbenchRef = useRef<HTMLDivElement>(null)
  const snippetNameRef = useRef<HTMLInputElement>(null)
  const activeRunRef = useRef<{ id: number; controller: AbortController } | null>(null)
  const runSequenceRef = useRef(0)
  const dragCleanupRef = useRef<(() => void) | null>(null)

  const reportStorageError = useCallback((caught: unknown, operation: QueryConsoleStorageOperation) => {
    onStorageError(caught, operation)
  }, [onStorageError])

  useEffect(() => {
    if (!resolvedStorage) {
      setStorageReady(true)
      return
    }
    let active = true
    setStorageReady(false)
    Promise.resolve(resolvedStorage.load())
      .then((stored) => {
        if (!active) return
        if (stored.draft) setSqlText(stored.draft)
        setHistory(stored.history)
        setSavedSnippets(stored.snippets)
      })
      .catch((caught: unknown) => reportStorageError(caught, 'load'))
      .finally(() => {
        if (active) setStorageReady(true)
      })
    return () => {
      active = false
    }
  }, [reportStorageError, resolvedStorage])

  useEffect(() => {
    if (!resolvedStorage || !storageReady) return
    const timer = window.setTimeout(() => {
      Promise.resolve(resolvedStorage.saveDraft(sqlText))
        .catch((caught: unknown) => reportStorageError(caught, 'draft'))
    }, 200)
    return () => window.clearTimeout(timer)
  }, [reportStorageError, resolvedStorage, sqlText, storageReady])

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    setSchemaLoading(true)
    setSchemaError(null)
    adapter.listSchema(controller.signal)
      .then((tables) => {
        if (active) setSchema(tables)
      })
      .catch((caught: unknown) => {
        if (active && !isAbortError(caught)) {
          setSchemaError(caught instanceof Error ? caught.message : 'Query schema unavailable')
        }
      })
      .finally(() => {
        if (active) setSchemaLoading(false)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [adapter])

  useEffect(() => () => {
    activeRunRef.current?.controller.abort()
    dragCleanupRef.current?.()
  }, [])

  const saveHistory = useCallback((next: QueryHistoryItem[]) => {
    setHistory(next)
    if (resolvedStorage && storageReady) {
      Promise.resolve(resolvedStorage.saveHistory(next))
        .catch((caught: unknown) => reportStorageError(caught, 'history'))
    }
  }, [reportStorageError, resolvedStorage, storageReady])

  const pushHistory = useCallback((item: QueryHistoryItem) => {
    setHistory((current) => {
      const next = [item, ...current.filter((candidate) => candidate.sql !== item.sql)].slice(0, 30)
      if (resolvedStorage && storageReady) {
        Promise.resolve(resolvedStorage.saveHistory(next))
          .catch((caught: unknown) => reportStorageError(caught, 'history'))
      }
      return next
    })
  }, [reportStorageError, resolvedStorage, storageReady])

  const persistSnippets = useCallback((next: SavedQuerySnippet[]) => {
    setSavedSnippets(next)
    if (resolvedStorage && storageReady) {
      Promise.resolve(resolvedStorage.saveSnippets(next))
        .catch((caught: unknown) => reportStorageError(caught, 'snippets'))
    }
  }, [reportStorageError, resolvedStorage, storageReady])

  const executeSql = useCallback(async (sql: string, selection = false) => {
    if (!sql.trim()) return
    activeRunRef.current?.controller.abort()
    const controller = new AbortController()
    const id = ++runSequenceRef.current
    activeRunRef.current = { id, controller }
    setBusy(true)
    setRanSelection(selection)
    setError(null)
    setResultFilter('')
    try {
      const nextResult = await adapter.execute({ sql, maxRows, signal: controller.signal })
      if (activeRunRef.current?.id !== id) return
      setResult(nextResult)
      pushHistory({
        sql: sql.trim(),
        at: Date.now(),
        durationMs: nextResult.durationMs,
        rowCount: nextResult.rowCount,
        ok: true,
      })
    } catch (caught) {
      if (activeRunRef.current?.id !== id || isAbortError(caught)) return
      setError(caught instanceof Error ? caught.message : 'Query failed')
      setResult(null)
      pushHistory({ sql: sql.trim(), at: Date.now(), durationMs: 0, rowCount: 0, ok: false })
    } finally {
      if (activeRunRef.current?.id === id) {
        activeRunRef.current = null
        setBusy(false)
      }
    }
  }, [adapter, maxRows, pushHistory])

  const run = useCallback(async () => {
    const editor = editorRef.current
    let sql = sqlText
    let selection = false
    if (editor && editor.selectionStart !== editor.selectionEnd) {
      sql = sqlText.slice(editor.selectionStart, editor.selectionEnd)
      selection = true
    }
    await executeSql(sql, selection)
  }, [executeSql, sqlText])

  const useSql = useCallback((sql: string) => {
    setSqlText(sql)
    setMobileRailOpen(false)
    requestAnimationFrame(() => editorRef.current?.focus())
  }, [])

  const browseRows = useCallback((sql: string) => {
    useSql(sql)
    void executeSql(sql)
  }, [executeSql, useSql])

  const insertAtCaret = useCallback((text: string) => {
    const editor = editorRef.current
    if (!editor) {
      setSqlText((current) => `${current}${text}`)
      return
    }
    const start = editor.selectionStart
    const end = editor.selectionEnd
    setSqlText((current) => current.slice(0, start) + text + current.slice(end))
    setMobileRailOpen(false)
    requestAnimationFrame(() => {
      editor.focus()
      const position = start + text.length
      editor.setSelectionRange(position, position)
    })
  }, [])

  function onEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void run()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const editor = event.currentTarget
      const start = editor.selectionStart
      const end = editor.selectionEnd
      setSqlText((current) => current.slice(0, start) + '  ' + current.slice(end))
      requestAnimationFrame(() => editor.setSelectionRange(start + 2, start + 2))
    }
  }

  function resizeEditor(clientY: number) {
    const workbench = workbenchRef.current
    if (!workbench) return
    const top = workbench.getBoundingClientRect().top
    setEditorHeight(Math.min(Math.max(clientY - top - 44, 120), Math.max(120, workbench.clientHeight - 160)))
  }

  function startDrag(event: React.PointerEvent) {
    event.preventDefault()
    dragCleanupRef.current?.()
    const move = (pointerEvent: PointerEvent) => resizeEditor(pointerEvent.clientY)
    const cleanup = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
      dragCleanupRef.current = null
    }
    dragCleanupRef.current = cleanup
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  async function copyCsv() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(queryResultToCsv(result))
      toast.success(labels.copiedCsv)
    } catch {
      toast.error(labels.copyFailed)
    }
  }

  function downloadCsv() {
    if (!result) return
    const blob = new Blob([queryResultToCsv(result)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = downloadFileName(result)
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  function clearHistory() {
    saveHistory([])
  }

  function saveSnippet(nameInput: string) {
    const sql = sqlText.trim()
    if (!sql) return
    const name = nameInput.trim() || sql.split('\n')[0]!.slice(0, 60)
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${savedSnippets.length}`
    const item: SavedQuerySnippet = { id, name, sql, at: Date.now() }
    persistSnippets([item, ...savedSnippets.filter((snippet) => snippet.name !== name)].slice(0, 100))
    toast.success(labels.snippetSaved(name))
  }

  function beginSaveSnippet() {
    if (!sqlText.trim()) return
    setRailTab('snippets')
    if (window.matchMedia('(max-width: 1023px)').matches) setMobileRailOpen(true)
    requestAnimationFrame(() => snippetNameRef.current?.focus())
  }

  const rail = (
    <QueryConsoleRail
      tab={railTab}
      onTabChange={setRailTab}
      labels={labels}
      schema={schema}
      schemaLoading={schemaLoading}
      schemaError={schemaError}
      history={history}
      savedSnippets={savedSnippets}
      snippets={snippets}
      canSaveSnippet={Boolean(sqlText.trim())}
      snippetNameInputRef={snippetNameRef}
      onInsert={insertAtCaret}
      onBrowse={browseRows}
      onUseSql={useSql}
      onSaveSnippet={saveSnippet}
      onDeleteSnippet={(id) => persistSnippets(savedSnippets.filter((snippet) => snippet.id !== id))}
      onClearHistory={clearHistory}
    />
  )

  return (
    <div className={cn('flex h-full min-h-[42rem] min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm', className)}>
      <div className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
            <TerminalSquare size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-fg">{labels.title}</h1>
            <p className="hidden truncate text-xs text-fg-muted sm:block">{labels.subtitle}</p>
          </div>
        </div>
        <Badge variant="secondary" className="hidden shrink-0 gap-1.5 sm:inline-flex">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          {labels.readOnlyBadge}
        </Badge>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden min-h-0 border-r border-border lg:block">
          {rail}
        </aside>

        <div ref={workbenchRef} className="flex min-h-0 min-w-0 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
            <Button size="sm" onClick={() => void run()} disabled={busy} aria-keyshortcuts="Control+Enter Meta+Enter">
              <Play size={14} />
              {busy ? labels.running : labels.run}
            </Button>
            <Button size="sm" variant="outline" onClick={beginSaveSnippet} disabled={!sqlText.trim()}>
              <BookmarkPlus size={14} />
              {labels.snippets.save}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSqlText('')} disabled={!sqlText}>
              <Eraser size={14} />
              {labels.clear}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="lg:hidden"
              onClick={() => setMobileRailOpen(true)}
              aria-label={labels.openRail}
            >
              <Menu size={14} />
              {labels.rail.schema}
            </Button>
            <kbd className="hidden rounded-sm border border-border bg-bg-subtle px-1.5 py-0.5 font-mono text-[10px] text-fg-muted sm:inline-block">
              ⌘⏎
            </kbd>
            <div className="ml-auto flex items-center gap-2 text-xs text-fg-muted">
              <label htmlFor="appkit-query-console-row-limit">{labels.rowLimit}</label>
              <Select
                id="appkit-query-console-row-limit"
                value={String(maxRows)}
                onChange={(event) => setMaxRows(Number(event.target.value))}
                className="h-8 w-24"
                aria-label={labels.rowLimit}
              >
                {normalizedRowLimits.map((limit) => (
                  <option key={limit} value={limit}>{limit.toLocaleString()}</option>
                ))}
              </Select>
            </div>
          </div>

          <div className="shrink-0 bg-bg-subtle" style={{ height: editorHeight }}>
            <textarea
              ref={editorRef}
              value={sqlText}
              onChange={(event) => setSqlText(event.target.value)}
              onKeyDown={onEditorKeyDown}
              spellCheck={false}
              placeholder={labels.editorPlaceholder}
              aria-label={labels.editorPlaceholder}
              className="h-full w-full resize-none border-0 bg-transparent p-3 font-mono text-[13px] leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          </div>

          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={labels.resizeEditor}
            tabIndex={0}
            onPointerDown={startDrag}
            onKeyDown={(event) => {
              if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                event.preventDefault()
                setEditorHeight((height) => Math.max(120, height + (event.key === 'ArrowUp' ? -16 : 16)))
              }
            }}
            className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-y border-border bg-bg-subtle hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="h-0.5 w-8 rounded-full bg-border-strong group-hover:bg-primary" />
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-2">
            <div className="flex items-center gap-2 text-xs" aria-live="polite">
              {error ? (
                <span className="flex items-center gap-1.5 font-medium text-danger">
                  <AlertTriangle size={13} /> {labels.failed}
                </span>
              ) : result ? (
                <>
                  <span className="font-medium text-fg tabular-nums">{labels.rowCount(result.rowCount)}</span>
                  <span className="flex items-center gap-1 text-fg-subtle tabular-nums">
                    <Clock size={12} /> {result.durationMs}ms
                  </span>
                  {result.truncated ? <Badge variant="warning">{labels.truncated(maxRows)}</Badge> : null}
                  {ranSelection ? <Badge variant="outline">{labels.ranSelection}</Badge> : null}
                </>
              ) : (
                <span className="text-fg-subtle">{labels.resultsIdle}</span>
              )}
            </div>
            {result && result.rowCount > 0 ? (
              <div className="ml-auto flex items-center gap-1.5">
                <Input
                  value={resultFilter}
                  onChange={(event) => setResultFilter(event.target.value)}
                  placeholder={labels.filterResults}
                  className="h-7 w-32 text-xs sm:w-40"
                  spellCheck={false}
                />
                <Button size="sm" variant="outline" onClick={() => void copyCsv()} className="h-7" aria-label={labels.copyCsv}>
                  <ClipboardCopy size={13} /> <span className="hidden sm:inline">{labels.copyCsv}</span>
                </Button>
                <Button size="sm" variant="outline" onClick={downloadCsv} className="h-7" aria-label={labels.downloadCsv}>
                  <Download size={13} /> CSV
                </Button>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden bg-surface">
            {error ? (
              <div className="p-4">
                <div className="rounded-lg border border-danger bg-danger-subtle p-4" role="alert">
                  <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-danger">
                    <AlertTriangle size={15} /> {labels.queryError}
                  </div>
                  <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-danger">{error}</pre>
                </div>
              </div>
            ) : result ? (
              <QueryResultsGrid result={result} filter={resultFilter} labels={labels} />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-bg-subtle text-fg-subtle">
                  <Play size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-fg-muted">{labels.runToSeeResults}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">{labels.runHint}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Drawer
        open={mobileRailOpen}
        onClose={() => setMobileRailOpen(false)}
        title={labels.title}
        description={labels.openRail}
        side="left"
        size="sm"
        disableFullscreen
        bodyClassName="min-h-0 overflow-hidden p-0"
      >
        {rail}
      </Drawer>
    </div>
  )
}
