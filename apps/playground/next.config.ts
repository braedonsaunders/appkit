import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Route navigations are React transitions in the App Router. This enables
    // the browser-native View Transitions handoff around the persistent shell.
    viewTransition: true,
  },
  // Workspace packages ship TSX/TS source, not built output.
  transpilePackages: [
    '@appkitjs/ai',
    '@appkitjs/dashboard',
    '@appkitjs/editor',
    '@appkitjs/ui',
    '@appkitjs/tokens',
    '@appkitjs/db',
    '@appkitjs/tenant',
    '@appkitjs/events',
    '@appkitjs/crypto',
    '@appkitjs/emails',
    '@appkitjs/sms',
    '@appkitjs/i18n',
    '@appkitjs/forms-core',
    '@appkitjs/forms-documents',
    '@appkitjs/forms',
  ],
  // Node-native server deps stay external to the bundle.
  serverExternalPackages: ['pg', 'pdfkit', 'puppeteer-core', 'exceljs'],
}

export default nextConfig
