'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { mergeHref, type ListSearchParams } from './list-params'
import { useListNavClick } from './list-nav'

export type PaginationLabels = {
  showing: (from: string, to: string, total: string) => React.ReactNode
  noResults: string
  prev: string
  next: string
  pageOf: (page: number, pages: number) => string
  outOfRange: (page: string) => string
  goToPage: (page: string) => string
}

const DEFAULT_LABELS: PaginationLabels = {
  showing: (from, to, total) => (
    <>
      Showing <strong className="font-medium text-fg">{from}</strong>–
      <strong className="font-medium text-fg">{to}</strong> of{' '}
      <strong className="font-medium text-fg">{total}</strong>
    </>
  ),
  noResults: 'No results',
  prev: 'Prev',
  next: 'Next',
  pageOf: (page, pages) => `Page ${page} of ${pages}`,
  outOfRange: (page) => `Page ${page} is out of range`,
  goToPage: (page) => `Go to page ${page}`,
}

/**
 * URL-driven pagination row: showing X–Y of N + prev/next. When the current
 * page is past the end (a filter shrank the list), offers a jump to the last
 * page. (Copied from the openbooks Pagination; i18n → labels prop.)
 */
export function Pagination({
  basePath,
  currentParams,
  total,
  page,
  perPage,
  pageParamKey = 'page',
  labels: labelOverrides,
}: {
  basePath: string
  currentParams: ListSearchParams
  total: number
  page: number
  perPage: number
  /** URL param that carries the page number. Sub-tables pass a prefixed key. */
  pageParamKey?: string
  labels?: Partial<PaginationLabels>
}) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides }
  const pageCount = Math.max(1, Math.ceil(total / perPage))
  const isOutOfRange = total > 0 && page > pageCount
  const from = total === 0 ? 0 : (page - 1) * perPage + 1
  const to = Math.min(total, page * perPage)

  const prevHref = mergeHref(basePath, currentParams, { [pageParamKey]: page > 1 ? page - 1 : 1 })
  const nextHref = mergeHref(basePath, currentParams, { [pageParamKey]: Math.min(pageCount, page + 1) })
  const lastPageHref = mergeHref(basePath, currentParams, { [pageParamKey]: pageCount })

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-fg-muted">
      <span>
        {isOutOfRange
          ? labels.outOfRange(page.toLocaleString())
          : total === 0
            ? labels.noResults
            : labels.showing(from.toLocaleString(), to.toLocaleString(), total.toLocaleString())}
      </span>
      {isOutOfRange ? (
        <PageButton href={lastPageHref} aria-label={labels.goToPage(pageCount.toLocaleString())}>
          <ChevronLeft size={14} />
          {labels.goToPage(pageCount.toLocaleString())}
        </PageButton>
      ) : pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <PageButton href={prevHref} disabled={page <= 1}>
            <ChevronLeft size={14} />
            {labels.prev}
          </PageButton>
          <span className="px-2 text-fg-subtle">{labels.pageOf(page, pageCount)}</span>
          <PageButton href={nextHref} disabled={page >= pageCount}>
            {labels.next}
            <ChevronRight size={14} />
          </PageButton>
        </div>
      ) : null}
    </div>
  )
}

function PageButton({
  href,
  disabled,
  children,
  ...rest
}: {
  href: string
  disabled?: boolean
  children: React.ReactNode
} & React.HTMLAttributes<HTMLAnchorElement>) {
  const navClick = useListNavClick(href)
  if (disabled) {
    return (
      <span
        className="inline-flex cursor-not-allowed items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-fg-subtle"
        {...(rest as object)}
      >
        {children}
      </span>
    )
  }
  return (
    <a
      href={href}
      onClick={navClick}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-fg hover:bg-surface-hover"
      {...(rest as object)}
    >
      {children}
    </a>
  )
}
