import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Workspace packages ship TSX/TS source, not built output.
  transpilePackages: ['@appkit/ui', '@appkit/tokens', '@appkit/db', '@appkit/tenant', '@appkit/auth', '@appkit/api', '@appkit/events'],
  // Node-native server deps stay external to the bundle.
  serverExternalPackages: ['pg'],
}

export default nextConfig
