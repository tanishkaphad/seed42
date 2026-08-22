import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    const api = process.env.API_ORIGIN || 'http://localhost:3002';
    return [{ source: '/sim/:path*', destination: `${api}/:path*` }];
  },
};

export default nextConfig;
