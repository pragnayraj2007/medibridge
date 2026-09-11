'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ReactNode, useEffect, useState } from 'react'
import { AppointmentStatus, getSession, Level, logout, Session } from '@/lib/api'

export const triageBadge: Record<Level, string> = {
  RED: 'bg-red-100 text-red-700 border-red-200',
  YELLOW: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  GREEN: 'bg-green-100 text-green-700 border-green-200',
}
export const triageDot: Record<Level, string> = { RED: 'bg-red-500', YELLOW: 'bg-yellow-400', GREEN: 'bg-green-500' }
export const apptBadge: Record<AppointmentStatus, string> = {
  scheduled: 'bg-gray-100 text-gray-700',
  confirmed: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
}

export function TriageBadge({ level }: { level: Level }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-2.5 py-1 ${triageBadge[level]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${triageDot[level]}`} />
      {level}
    </span>
  )
}

/** Redirects to /doctor/login when there is no demo session. */
export function useDoctorSession() {
  const router = useRouter()
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    const s = getSession()
    if (!s) router.replace(`/doctor/login?next=${encodeURIComponent(window.location.pathname)}`)
    else setSession(s)
  }, [router])
  return session
}

export function TopBar({ session, children }: { session: Session | null; children?: ReactNode }) {
  const router = useRouter()
  return (
    <header className="bg-white border-b border-gray-200 px-6 lg:px-8 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>
        <Link href="/" className="font-bold text-gray-900">MediBridge</Link>
        <span className="text-gray-300">|</span>
        {children}
      </div>
      {session && (
        <div className="flex items-center gap-3 text-sm">
          <span className="text-gray-600 hidden sm:inline">{session.doctor.name}</span>
          <button
            onClick={() => { logout(); router.replace('/doctor/login') }}
            className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  )
}
