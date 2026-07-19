import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'appkit — playground',
  description: 'Live preview of the appkit design system.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Pre-paint theme: honor a saved choice, else OS preference. Inline so
          there is no flash of the wrong theme before hydration. */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t? t==='dark' : matchMedia('(prefers-color-scheme: dark)').matches; if(d)document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-bg text-fg antialiased">{children}</body>
    </html>
  )
}
