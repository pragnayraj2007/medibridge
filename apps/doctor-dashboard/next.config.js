// One URL for everything:
//   /          home page
//   /doctor    doctor dashboard (this Next.js app)
//   /patient   patient web app (Expo web export copied into public/patient)
//   /api/*     backend (FastAPI on its own Vercel project), proxied here so the
//              browser never calls another origin (no CORS)
const BACKEND_URL = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true }, // no ESLint config in this app; type-check still runs
  async rewrites() {
    // Applied after pages and public/ files, so real patient assets are served as-is
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/:path*` },
      { source: '/patient', destination: '/patient/index.html' },
      { source: '/patient/:path*', destination: '/patient/index.html' },
    ]
  },
}
module.exports = nextConfig
