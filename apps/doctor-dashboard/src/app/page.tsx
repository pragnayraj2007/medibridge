'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { API_URL, Case, complaint, getCases, Level, LEVEL_RANK, patientName, STATUS_LABEL, timeAgo } from '@/lib/api'

const triageStyle: Record<Level, string> = {
  RED: 'bg-red-100 text-red-700 border-red-200',
  YELLOW: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  GREEN: 'bg-green-100 text-green-700 border-green-200',
}

const triageDot: Record<Level, string> = {
  RED: 'bg-red-500',
  YELLOW: 'bg-yellow-400',
  GREEN: 'bg-green-500',
}

export default function Dashboard() {
  const [cases, setCases] = useState<Case[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const [level, setLevel] = useState<'' | Level>('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    let alive = true
    const load = () =>
      getCases()
        .then(data => { if (alive) { setCases(data); setError(false) } })
        .catch(() => { if (alive) setError(true) })
        .finally(() => { if (alive) setLoaded(true) })
    load()
    const t = setInterval(load, 5000) // new patient submissions appear automatically
    return () => { alive = false; clearInterval(t) }
  }, [])

  const open = cases.filter(c => c.status !== 'reviewed')
  const counts = {
    RED: open.filter(c => c.triage_level === 'RED').length,
    YELLOW: open.filter(c => c.triage_level === 'YELLOW').length,
    GREEN: open.filter(c => c.triage_level === 'GREEN').length,
  }

  // Open cases first, then most urgent, then newest
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases
      .filter(c => !level || c.triage_level === level)
      .filter(c => !q || `${patientName(c)} ${complaint(c)}`.toLowerCase().includes(q))
      .sort((a, b) =>
        Number(a.status === 'reviewed') - Number(b.status === 'reviewed')
        || LEVEL_RANK[a.triage_level] - LEVEL_RANK[b.triage_level]
        || b.created_at.localeCompare(a.created_at))
  }, [cases, level, search])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900">MediBridge</span>
          <span className="text-gray-300">|</span>
          <span className="text-sm text-gray-500">Doctor Dashboard</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'}`} />
          {error ? 'Offline' : 'Live'}
        </div>
      </header>

      <main className="px-8 py-6 max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Can&apos;t reach the backend at {API_URL}. Start it with <code>uvicorn main:app</code> in apps/backend.
          </div>
        )}

        {/* Summary cards (open cases) */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {([
            { label: 'Urgent', level: 'RED', color: 'border-red-300 bg-red-50', text: 'text-red-700', count: counts.RED },
            { label: 'Needs Attention', level: 'YELLOW', color: 'border-yellow-300 bg-yellow-50', text: 'text-yellow-700', count: counts.YELLOW },
            { label: 'Stable', level: 'GREEN', color: 'border-green-300 bg-green-50', text: 'text-green-700', count: counts.GREEN },
          ] as const).map(({ label, level: l, color, text, count }) => (
            <button
              key={l}
              onClick={() => setLevel(level === l ? '' : l)}
              className={`text-left border rounded-xl p-5 ${color} ${level === l ? 'ring-2 ring-blue-500' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${triageDot[l]}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{l}</span>
              </div>
              <div className={`text-3xl font-bold ${text}`}>{count}</div>
              <div className="text-xs text-gray-500 mt-1">{label} · open</div>
            </button>
          ))}
        </div>

        {/* Cases table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Patient Cases</h2>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search patients..."
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-52"
              />
              <select
                value={level}
                onChange={e => setLevel(e.target.value as '' | Level)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none"
              >
                <option value="">All triage</option>
                <option value="RED">RED</option>
                <option value="YELLOW">YELLOW</option>
                <option value="GREEN">GREEN</option>
              </select>
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                <th className="text-left px-6 py-3 font-medium">Patient</th>
                <th className="text-left px-6 py-3 font-medium">Complaint</th>
                <th className="text-left px-6 py-3 font-medium">Triage</th>
                <th className="text-left px-6 py-3 font-medium">Submitted</th>
                <th className="text-left px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.status === 'reviewed' ? 'opacity-60' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 font-semibold text-xs flex-shrink-0">
                        {patientName(c).charAt(0)}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 text-sm">{patientName(c)}</div>
                        <div className="text-xs text-gray-400">
                          {c.patient.age != null ? `${c.patient.age}y` : 'age ?'}
                          {c.patient.sex ? ` · ${c.patient.sex[0].toUpperCase()}` : ''}
                          {c.patient.pregnant ? ' · pregnant' : ''}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-xs">
                    <span className="text-sm text-gray-600 line-clamp-1">{complaint(c)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold border rounded-full px-2.5 py-1 ${triageStyle[c.triage_level]}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${triageDot[c.triage_level]}`} />
                      {c.triage_level}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{timeAgo(c.created_at)}</td>
                  <td className="px-6 py-4">
                    <span className="text-xs text-gray-500">{STATUS_LABEL[c.status]}</span>
                  </td>
                  <td className="px-6 py-4">
                    <Link href={`/patient/${c.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
              {loaded && rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">
                    {cases.length === 0 ? 'No cases yet. Submit one from the patient app.' : 'No cases match your filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  )
}
