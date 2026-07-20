'use client'

import { useEffect } from 'react'

/**
 * Keeps the browser tab aligned with the title already rendered by a page.
 *
 * Applications can set `data-application-name` on the root `<html>` element
 * to retain their brand in the tab title. The contract remains application-
 * agnostic so existing page components can move to AppKit unchanged.
 */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    const applicationName = document.documentElement.dataset.applicationName
    document.title = applicationName ? `${title} · ${applicationName}` : title
  }, [title])

  return null
}
