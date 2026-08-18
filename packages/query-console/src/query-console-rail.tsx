'use client'

import { useState } from 'react'
import {
  Bookmark,
  BookmarkPlus,
  Database,
  History,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { Button, Input, cn } from '@braedonsaunders/appkit-ui'
import { QuerySchemaBrowser } from './schema-browser'
import type {
  QueryConsoleLabels,
  QueryHistoryItem,
  QuerySchemaTable,
  QuerySnippet,
  SavedQuerySnippet,
} from './types'

export type QueryConsoleRailTab = 'schema' | 'snippets' | 'history'

export interface QueryConsoleRailProps {
  tab: QueryConsoleRailTab
  onTabChange: (tab: QueryConsoleRailTab) => void
  labels: QueryConsoleLabels
  schema: QuerySchemaTable[]
  schemaLoading: boolean
  schemaError: string | null
  history: QueryHistoryItem[]
  savedSnippets: SavedQuerySnippet[]
  snippets: QuerySnippet[]
  canSaveSnippet: boolean
  snippetNameInputRef?: React.Ref<HTMLInputElement>
  onInsert: (text: string) => void
  onBrowse: (sql: string) => void
  onUseSql: (sql: string) => void
  onSaveSnippet: (name: string) => void
  onDeleteSnippet: (id: string) => void
  onClearHistory: () => void
}

export function QueryConsoleRail({
  tab,
  onTabChange,
  labels,
  schema,
  schemaLoading,
  schemaError,
  history,
  savedSnippets,
  snippets,
  canSaveSnippet,
  snippetNameInputRef,
  onInsert,
  onBrowse,
  onUseSql,
  onSaveSnippet,
  onDeleteSnippet,
  onClearHistory,
}: QueryConsoleRailProps) {
  const [snippetName, setSnippetName] = useState('')

  function saveSnippet() {
    onSaveSnippet(snippetName)
    setSnippetName('')
  }

  const tabs: { key: QueryConsoleRailTab; label: string; icon: typeof Database }[] = [
    { key: 'schema', label: labels.rail.schema, icon: Database },
    { key: 'snippets', label: labels.rail.snippets, icon: Sparkles },
    { key: 'history', label: labels.rail.history, icon: History },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-subtle/50">
      <div className="flex shrink-0 border-b border-border" role="tablist" aria-label={labels.queryTools}>
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            onClick={() => onTabChange(item.key)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
              tab === item.key
                ? 'border-primary text-primary'
                : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            <item.icon size={14} />
            {item.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
        {tab === 'schema' ? (
          <QuerySchemaBrowser
            tables={schema}
            loading={schemaLoading}
            error={schemaError}
            labels={labels}
            onInsert={onInsert}
            onBrowse={onBrowse}
          />
        ) : tab === 'snippets' ? (
          <div className="flex h-full flex-col">
            <div className="shrink-0 border-b border-border p-2">
              <div className="flex items-center gap-1.5">
                <Input
                  ref={snippetNameInputRef}
                  value={snippetName}
                  onChange={(event) => setSnippetName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      saveSnippet()
                    }
                  }}
                  placeholder={labels.snippets.namePlaceholder}
                  className="h-8 text-xs"
                  spellCheck={false}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={saveSnippet}
                  disabled={!canSaveSnippet}
                  className="h-8 shrink-0"
                >
                  <BookmarkPlus size={14} /> {labels.snippets.save}
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {savedSnippets.length > 0 ? (
                <div className="mb-2">
                  <div className="px-1.5 pb-1 text-[10px] font-semibold tracking-wide text-fg-subtle uppercase">
                    {labels.snippets.savedHeading}
                  </div>
                  <ul>
                    {savedSnippets.map((snippet) => (
                      <li key={snippet.id} className="group relative">
                        <button
                          type="button"
                          onClick={() => onUseSql(snippet.sql)}
                          className="w-full rounded-md px-2.5 py-2 pr-8 text-left hover:bg-surface hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-center gap-1.5 truncate text-[13px] font-medium text-fg">
                            <Bookmark size={12} className="shrink-0 text-primary" />
                            <span className="truncate">{snippet.name}</span>
                          </div>
                          <p className="mt-0.5 truncate pl-[1.15rem] font-mono text-[11px] text-fg-subtle">
                            {snippet.sql.split('\n')[0]}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteSnippet(snippet.id)}
                          aria-label={labels.snippets.delete}
                          className="absolute top-2 right-1.5 rounded-sm p-1 text-fg-subtle opacity-0 hover:bg-danger-subtle hover:text-danger focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {snippets.length > 0 ? (
                <>
                  <div className="px-1.5 pb-1 text-[10px] font-semibold tracking-wide text-fg-subtle uppercase">
                    {labels.snippets.examplesHeading}
                  </div>
                  <ul>
                    {snippets.map((snippet) => (
                      <li key={snippet.key}>
                        <button
                          type="button"
                          onClick={() => onUseSql(snippet.sql)}
                          className="group w-full rounded-md px-2.5 py-2 text-left hover:bg-surface hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <div className="flex items-center gap-1.5 text-[13px] font-medium text-fg group-hover:text-primary">
                            <Sparkles size={12} className="shrink-0 text-primary" />
                            {snippet.label}
                          </div>
                          <p className="mt-0.5 pl-[1.15rem] text-xs text-fg-muted">
                            {snippet.description}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {history.length > 0 ? (
              <div className="flex shrink-0 items-center justify-between px-3 py-1.5 text-[11px] text-fg-subtle">
                <span>{labels.history.count(history.length)}</span>
                <button
                  type="button"
                  onClick={onClearHistory}
                  className="rounded-sm hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {labels.history.clear}
                </button>
              </div>
            ) : null}
            <ul className="min-h-0 flex-1 overflow-y-auto p-2">
              {history.length === 0 ? (
                <li className="flex flex-col items-center gap-2 p-6 text-center text-xs text-fg-subtle">
                  <History size={20} />
                  {labels.history.empty}
                </li>
              ) : history.map((item) => (
                <li key={`${item.at}-${item.sql}`}>
                  <button
                    type="button"
                    onClick={() => onUseSql(item.sql)}
                    className="group w-full rounded-md px-2.5 py-2 text-left hover:bg-surface hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="truncate font-mono text-xs text-fg-muted group-hover:text-primary">
                      {item.sql.split('\n')[0]}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-fg-subtle">
                      {item.ok ? (
                        <span className="tabular-nums">
                          {labels.history.rows(item.rowCount)} · {item.durationMs}ms
                        </span>
                      ) : (
                        <span className="text-danger">{labels.history.failed}</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
