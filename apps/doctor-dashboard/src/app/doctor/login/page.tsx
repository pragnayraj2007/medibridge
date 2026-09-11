'use client'

// Demo doctor sign-in. Accounts are seeded in Supabase; credentials are never in this code.
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import { getSession, login } from '@/lib/api'

export default function Login() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const next = () => {
    const n = new URLSearchParams(window.location.search).get('next')
    return n && n.startsWith('/doctor') ? n : '/doctor'
  }

  useEffect(() => {
    if (getSession()) router.replace(next())
  }, [router])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      router.replace(next())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <div>
            <Link href="/" className="font-bold text-gray-900">MediBridge</Link>
            <p className="text-xs text-gray-500">Doctor sign-in</p>
          </div>
        </div>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Email</span>
          <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-gray-600">Password</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={busy} className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-60 text-sm">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-[11px] text-gray-400 leading-relaxed">
          Demo authentication for a hackathon prototype. Demo doctor accounts are provided by the MediBridge team.
        </p>
      </form>
    </div>
  )
}
