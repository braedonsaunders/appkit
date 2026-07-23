import type { Metadata } from 'next'
import { ConfirmRoot, getThemeScript, PromptRoot, Toaster } from '@appkit/ui'
import './globals.css'

export const metadata: Metadata = {
  title: 'appkit — the design system',
  description: 'A polished, tokenized, motion-aware component foundation for building apps.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script id="appkit-theme" dangerouslySetInnerHTML={{ __html: getThemeScript() }} />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {children}
        <PromptRoot />
        <ConfirmRoot />
        <Toaster richColors closeButton />
      </body>
    </html>
  )
}
