'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'
import { cn } from '@braedonsaunders/appkit-ui'
import { isQueryNumeric, queryCellText } from './core'
import type { QueryConsoleLabels, QueryResult } from './types'

type SortDirection = 'asc' | 'desc' | null

export interface QueryResultsGridProps {
  result: QueryResult
  filter: string
  labels: QueryConsoleLabels
}

export function QueryResultsGrid({ result, filter, labels }: QueryResultsGridProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  useEffect(() => {
    if (sortColumn && !result.columns.includes(sortColumn)) {
      setSortColumn(null)
      setSortDirection(null)
    }
  }, [result.columns, sortColumn])

  const numericColumns = useMemo(() => {
    const columns = new Set<string>()
    for (const column of result.columns) {
      const sample = result.rows
        .slice(0, 25)
        .map((row) => row[column])
        .filter((value) => value !== null && value !== undefined)
      if (sample.length > 0 && sample.every(isQueryNumeric)) columns.add(column)
    }
    return columns
  }, [result])

  const filteredRows = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase()
    if (!query) return result.rows
    return result.rows.filter((row) => (
      result.columns.some((column) => queryCellText(row[column]).toLocaleLowerCase().includes(query))
    ))
  }, [filter, result])

  const sortedRows = useMemo(() => {
    if (!sortColumn || !sortDirection) return filteredRows
    const numeric = numericColumns.has(sortColumn)
    const direction = sortDirection === 'asc' ? 1 : -1
    return [...filteredRows].sort((left, right) => {
      const leftValue = left[sortColumn]
      const rightValue = right[sortColumn]
      if (leftValue === null || leftValue === undefined) return 1
      if (rightValue === null || rightValue === undefined) return -1
      if (numeric) {
        return (
          Number(String(leftValue).replace(/,/g, ''))
          - Number(String(rightValue).replace(/,/g, ''))
        ) * direction
      }
      return queryCellText(leftValue).localeCompare(queryCellText(rightValue), undefined, { numeric: true }) * direction
    })
  }, [filteredRows, numericColumns, sortColumn, sortDirection])

  function toggleSort(column: string) {
    if (sortColumn !== column) {
      setSortColumn(column)
      setSortDirection('asc')
    } else if (sortDirection === 'asc') {
      setSortDirection('desc')
    } else {
      setSortColumn(null)
      setSortDirection(null)
    }
  }

  if (result.columns.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-fg-muted">
        {labels.emptyResultSet}
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-bg-subtle">
            <th className="w-12 border-b border-border px-2 py-2 text-right font-medium text-fg-subtle tabular-nums">
              #
            </th>
            {result.columns.map((column) => {
              const active = sortColumn === column
              const ariaSort = active
                ? sortDirection === 'asc' ? 'ascending' : 'descending'
                : 'none'
              return (
                <th
                  key={column}
                  aria-sort={ariaSort}
                  className={cn(
                    'border-b border-border p-0 font-semibold whitespace-nowrap',
                    numericColumns.has(column) ? 'text-right' : 'text-left',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(column)}
                    className={cn(
                      'group inline-flex w-full items-center gap-1.5 px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      numericColumns.has(column) && 'flex-row-reverse',
                      active ? 'text-primary' : 'text-fg-muted hover:text-fg',
                    )}
                  >
                    <span className="font-mono">{column}</span>
                    {active ? (
                      sortDirection === 'asc'
                        ? <ArrowUp size={13} className="shrink-0" />
                        : <ArrowDown size={13} className="shrink-0" />
                    ) : (
                      <ChevronsUpDown size={13} className="shrink-0 text-fg-subtle opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100" />
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className="border-b border-border-subtle odd:bg-surface even:bg-bg-subtle/40 hover:bg-primary-subtle"
            >
              <td className="px-2 py-1.5 text-right align-top font-mono text-[11px] text-fg-subtle tabular-nums">
                {rowIndex + 1}
              </td>
              {result.columns.map((column) => {
                const value = row[column]
                const isNull = value === null || value === undefined
                return (
                  <td
                    key={column}
                    className={cn(
                      'max-w-[28rem] truncate px-3 py-1.5 align-top',
                      numericColumns.has(column)
                        ? 'text-right font-mono text-fg tabular-nums'
                        : 'text-fg-muted',
                    )}
                    title={isNull ? 'NULL' : queryCellText(value)}
                  >
                    {isNull ? <span className="text-fg-subtle">∅</span> : queryCellText(value)}
                  </td>
                )
              })}
            </tr>
          ))}
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={result.columns.length + 1} className="px-3 py-10 text-center text-sm text-fg-muted">
                {labels.noFilterMatch}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
