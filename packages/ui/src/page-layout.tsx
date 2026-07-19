import * as React from 'react'
import { cn } from './utils'

// The page shells that fill an AppShell's <main>. The fade-in is the CSS
// `.reveal` (visible-by-default @starting-style), never a JS animation.

/** Content-driven pages (dashboards, forms): the whole body scrolls. */
export function PageContainer({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className="app-scroll flex-1 overflow-y-auto">
      <div className={cn('reveal mx-auto w-full max-w-(--breakpoint-2xl) p-4 sm:p-6', className)}>
        {children}
      </div>
    </div>
  )
}

/** List pages: a sticky header (title/actions/search/filters); only the body scrolls. */
export function ListPageLayout({
  header,
  children,
  className,
}: {
  header: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-surface px-3 pb-2.5 pt-3 sm:px-6 sm:pb-3 sm:pt-4">
        <div className="reveal mx-auto max-w-(--breakpoint-2xl) space-y-2 sm:space-y-2.5">{header}</div>
      </div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={cn('reveal mx-auto max-w-(--breakpoint-2xl) p-3 sm:p-6', className)}>{children}</div>
      </div>
    </div>
  )
}

/** Detail pages: fixed header + optional alerts + subtab strip; content scrolls. */
export function DetailPageLayout({
  header,
  alerts,
  subtabs,
  children,
  className,
}: {
  header: React.ReactNode
  alerts?: React.ReactNode
  subtabs?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border bg-surface">
        <div className="reveal mx-auto max-w-(--breakpoint-2xl) px-3 pt-3 sm:px-6 sm:pt-5">
          {header}
          {alerts ? <div className="mt-2.5 space-y-2 sm:mt-3">{alerts}</div> : null}
          {subtabs ? <div className="mt-2.5 sm:mt-4">{subtabs}</div> : null}
        </div>
      </div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={cn('reveal mx-auto max-w-(--breakpoint-2xl) p-3 sm:p-6', className)}>{children}</div>
      </div>
    </div>
  )
}

/** Wizard/form pages: sticky header, scrolling body, optional sticky footer. */
export function WizardLayout({
  header,
  footer,
  children,
  className,
  wide = false,
}: {
  header: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
  wide?: boolean
}) {
  const maxW = wide ? 'max-w-(--breakpoint-2xl)' : 'max-w-3xl'
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className="border-b border-border bg-surface">
        <div className={cn('reveal mx-auto px-4 py-4 sm:px-6', maxW)}>{header}</div>
      </div>
      <div className="app-scroll min-h-0 flex-1 overflow-y-auto">
        <div className={cn('reveal mx-auto space-y-5 p-4 sm:p-6', maxW)}>{children}</div>
      </div>
      {footer != null ? (
        <div className="border-t border-border bg-surface">
          <div className={cn('mx-auto px-4 py-3 sm:px-6', maxW)}>{footer}</div>
        </div>
      ) : null}
    </div>
  )
}
