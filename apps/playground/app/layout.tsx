import type { Metadata } from 'next'
import Script from 'next/script'
import { getThemeScript, Toaster } from '@appkit/ui'
import './globals.css'

export const metadata: Metadata = {
  title: 'appkit — the design system',
  description: 'A polished, tokenized, motion-aware component foundation for building apps.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><Script id="appkit-theme" strategy="beforeInteractive">{getThemeScript()}</Script></head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {children}
        <Toaster richColors closeButton />
      </body>
    </html>
  )
}
