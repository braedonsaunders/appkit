import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Route navigations are React transitions in the App Router. This enables
    // the browser-native View Transitions handoff around the persistent shell.
    viewTransition: true,
  },
  // Workspace packages ship TSX/TS source, not built output.
  transpilePackages: [
    '@braedonsaunders/ai',
    '@braedonsaunders/dashboard',
    '@braedonsaunders/editor',
    '@braedonsaunders/ui',
    '@braedonsaunders/tokens',
    '@braedonsaunders/db',
    '@braedonsaunders/tenant',
    '@braedonsaunders/events',
    '@braedonsaunders/crypto',
    '@braedonsaunders/emails',
    '@braedonsaunders/sms',
    '@braedonsaunders/i18n',
    '@braedonsaunders/forms-core',
    '@braedonsaunders/forms-documents',
    '@braedonsaunders/forms',
  ],
  // Node-native server deps stay external to the bundle.
  serverExternalPackages: ['pg', 'pdfkit', 'puppeteer-core', 'exceljs'],
}

export default nextConfig
