import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Route navigations are React transitions in the App Router. This enables
    // the browser-native View Transitions handoff around the persistent shell.
    viewTransition: true,
  },
  // Workspace packages ship TSX/TS source, not built output.
  transpilePackages: [
    '@appkit/ai',
    '@appkit/ui',
    '@appkit/tokens',
    '@appkit/db',
    '@appkit/tenant',
    '@appkit/events',
    '@appkit/crypto',
    '@appkit/emails',
    '@appkit/sms',
  ],
  // Node-native server deps stay external to the bundle.
  serverExternalPackages: ['pg'],
}

export default nextConfig
