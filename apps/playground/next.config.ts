import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Route navigations are React transitions in the App Router. This enables
    // the browser-native View Transitions handoff around the persistent shell.
    viewTransition: true,
  },
  // Workspace packages ship TSX/TS source, not built output.
  transpilePackages: [
    '@braedonsaunders/appkit-ai',
    '@braedonsaunders/appkit-dashboard',
    '@braedonsaunders/appkit-editor',
    '@braedonsaunders/appkit-ui',
    '@braedonsaunders/appkit-tokens',
    '@braedonsaunders/appkit-db',
    '@braedonsaunders/appkit-tenant',
    '@braedonsaunders/appkit-events',
    '@braedonsaunders/appkit-crypto',
    '@braedonsaunders/appkit-emails',
    '@braedonsaunders/appkit-sms',
    '@braedonsaunders/appkit-i18n',
    '@braedonsaunders/appkit-forms-core',
    '@braedonsaunders/appkit-forms-documents',
    '@braedonsaunders/appkit-forms',
  ],
  // Node-native server deps stay external to the bundle.
  serverExternalPackages: ['pg', 'pdfkit', 'puppeteer-core', 'exceljs'],
}

export default nextConfig
