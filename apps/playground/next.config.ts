import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Compile the workspace packages (they ship TSX source, not built output).
  transpilePackages: ['@appkit/ui', '@appkit/tokens'],
}

export default nextConfig
