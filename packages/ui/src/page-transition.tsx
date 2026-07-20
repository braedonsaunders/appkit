/// <reference types="react/canary" />

'use client'

import * as React from 'react'
import { ViewTransition } from 'react'
import { cn } from './utils'

export interface PageTransitionProps {
  /** A stable value that changes when the routed page changes, usually usePathname(). */
  navigationKey: React.Key
  children: React.ReactNode
  className?: string
}

/**
 * Keeps the application shell live while the browser hands the changing page
 * canvas between routes. Requires Next.js `experimental.viewTransition`.
 */
export function PageTransition({
  navigationKey,
  children,
  className,
}: PageTransitionProps) {
  return (
    <ViewTransition
      key={navigationKey}
      name="appkit-page"
      share="appkit-page-transition"
      enter="appkit-page-transition"
      exit="appkit-page-transition"
      default="none"
    >
      <div
        className={cn(
          'appkit-page-frame flex min-h-0 flex-1 flex-col overflow-hidden',
          className,
        )}
      >
        {children}
      </div>
    </ViewTransition>
  )
}
