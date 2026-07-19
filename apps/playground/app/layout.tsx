import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'appkit — the design system',
  description: 'A polished, tokenized, motion-aware component foundation for building apps.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  )
}
