'use client'

import { useMemo, useState } from 'react'
import {
  ChevronRight,
  Columns3,
  Database,
  Eye,
  KeyRound,
  Play,
  Search,
  Table2,
  TextCursorInput,
} from 'lucide-react'
import {
  ContextMenu,
  Input,
  cn,
  useContextMenu,
  type ContextMenuEntry,
} from '@braedonsaunders/appkit-ui'
import { createSelectTemplate, quoteSqlIdentifier } from './core'
import type { QueryConsoleLabels, QuerySchemaTable } from './types'

export interface QuerySchemaBrowserProps {
  tables: QuerySchemaTable[]
  loading: boolean
  error: string | null
  labels: QueryConsoleLabels
  onInsert: (text: string) => void
  onBrowse: (sql: string) => void
}

export function QuerySchemaBrowser({
  tables,
  loading,
  error,
  labels,
  onInsert,
  onBrowse,
}: QuerySchemaBrowserProps) {
  const [search, setSearch] = useState('')
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({})
  const [menuTable, setMenuTable] = useState<QuerySchemaTable | null>(null)
  const menu = useContextMenu()

  const query = search.trim().toLocaleLowerCase()
  const filteredTables = useMemo(() => {
    if (!query) return tables
    return tables
      .map((table) => {
        if (table.name.toLocaleLowerCase().includes(query)) return table
        const columns = table.columns.filter((column) => column.name.toLocaleLowerCase().includes(query))
        return columns.length > 0 ? { ...table, columns } : null
      })
      .filter((table): table is QuerySchemaTable => table !== null)
  }, [query, tables])

  const isOpen = (name: string) => openTables[name] ?? Boolean(query)

  function showSchema(table: QuerySchemaTable) {
    setSearch(table.name)
    setOpenTables((current) => ({ ...current, [table.name]: true }))
  }

  function openTableMenu(event: React.MouseEvent<HTMLButtonElement>, table: QuerySchemaTable) {
    setMenuTable(table)
    event.currentTarget.focus()
    menu.onContextMenu(event)
  }

  const menuItems: ContextMenuEntry[] = menuTable
    ? [
        {
          key: 'show-schema',
          label: labels.schema.showSchema,
          icon: Columns3,
          onSelect: () => showSchema(menuTable),
        },
        {
          key: 'browse-rows',
          label: labels.schema.browseRows,
          icon: Play,
          onSelect: () => onBrowse(createSelectTemplate(menuTable.name)),
        },
        { key: 'insert-separator', separator: true },
        {
          key: 'insert-table',
          label: labels.schema.insertTableName,
          icon: TextCursorInput,
          onSelect: () => onInsert(quoteSqlIdentifier(menuTable.name)),
        },
        {
          key: 'insert-select',
          label: labels.schema.insertSelectTemplate,
          icon: Table2,
          onSelect: () => onInsert(createSelectTemplate(menuTable.name)),
        },
      ]
    : []

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-border p-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={labels.schema.searchPlaceholder}
            className="h-8 pl-8 text-xs"
            spellCheck={false}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {loading ? (
          <div className="space-y-1 p-1" aria-label={labels.schema.loading}>
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="h-7 animate-pulse rounded-md bg-bg-subtle" />
            ))}
          </div>
        ) : error ? (
          <div className="p-3 text-xs text-danger" role="alert">{error}</div>
        ) : filteredTables.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-fg-subtle">
            <Database size={20} />
            {labels.schema.noMatch}
          </div>
        ) : (
          <ul className="space-y-0.5">
            {filteredTables.map((table) => (
              <li key={table.name}>
                <button
                  type="button"
                  onClick={() => setOpenTables((current) => ({ ...current, [table.name]: !isOpen(table.name) }))}
                  onContextMenu={(event) => openTableMenu(event, table)}
                  aria-expanded={isOpen(table.name)}
                  className="group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1.5 text-left text-[13px] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronRight
                    size={13}
                    className={cn('shrink-0 text-fg-subtle transition-transform', isOpen(table.name) && 'rotate-90')}
                  />
                  {table.kind === 'view'
                    ? <Eye size={13} className="shrink-0 text-info" />
                    : <Table2 size={13} className="shrink-0 text-primary" />}
                  <span
                    className="min-w-0 flex-1 truncate font-mono text-fg"
                    onClick={(event) => {
                      event.stopPropagation()
                      onInsert(quoteSqlIdentifier(table.name))
                    }}
                    title={labels.schema.insertTable}
                  >
                    {table.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-fg-subtle tabular-nums opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                    {table.columns.length}
                  </span>
                </button>
                {isOpen(table.name) ? (
                  <ul className="mb-1 ml-[1.35rem] border-l border-border pl-1.5">
                    {table.columns.map((column) => (
                      <li key={column.name}>
                        <button
                          type="button"
                          onClick={() => onInsert(quoteSqlIdentifier(column.name))}
                          title={labels.schema.insertColumn}
                          className="group flex w-full items-center gap-1.5 rounded-sm px-1.5 py-1 text-left text-xs hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Columns3 size={12} className="shrink-0 text-fg-subtle" />
                          <span className="min-w-0 flex-1 truncate font-mono text-fg-muted">{column.name}</span>
                          {!column.nullable ? <KeyRound size={10} className="shrink-0 text-warning" /> : null}
                          <span className="shrink-0 font-mono text-[10px] text-fg-subtle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100">
                            {column.type}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
      <ContextMenu open={menu.open} position={menu.position} items={menuItems} onClose={menu.close} />
    </div>
  )
}
