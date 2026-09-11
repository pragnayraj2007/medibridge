// The browser calls /api/* on the dashboard's own origin and Next.js proxies it
// to the backend, so there are no CORS or localhost/127.0.0.1 mismatches.
const BACKEND_URL = process.env.BACKEND_URL || 'http://127.0.0.1:8000'

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/:path*` }]
  },
}
module.exports = nextConfig
