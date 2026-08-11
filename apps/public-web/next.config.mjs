import { PUBLIC_SECURITY_HEADERS } from './lib/securityHeaders.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: PUBLIC_SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
