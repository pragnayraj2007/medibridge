'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Case, getCase, Level, patientName, setStatus, Status, STATUS_LABEL } from '@/lib/api'

const triageConfig: Record<Level, { bar: string; badge: string; dot: string; label: string }> = {
  RED: { bar: 'bg-red-600', badge: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500', label: 'Immediate attention required' },
  YELLOW: { bar: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', dot: 'bg-yellow-400', label: 'Timely attention required' },
  GREEN: { bar: 'bg-green-600', badge: 'bg-green-100 text-green-700 border-green-200', dot: 'bg-green-500', label: 'No danger signs found' },
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-44 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800">{value || '—'}</span>
    </div>
  )
}

const list = (xs: string[]) => (xs.length ? xs.join(', ') : null)
const humanFlag = (f: string) => f.replace(/_/g, ' ')

export default function PatientDetail() {
  const { id } = useParams<{ id: string }>()
  const [c, setCase] = useState<Case | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getCase(id).then(setCase).catch(e => setError(String(e.message).includes('404') ? 'Case not found.' : "Can't reach the backend."))
  }, [id])

  const update = async (status: Status) => {
    setSaving(true)
    try { setCase(await setStatus(id, status)) } catch { setError('Could not update status.') } finally { setSaving(false) }
  }

  if (!c) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-3 text-sm text-gray-500">
        {error ?? 'Loading…'}
        <Link href="/doctor" className="text-blue-600 hover:underline">← Back to dashboard</Link>
      </div>
    )
  }

  const tc = triageConfig[c.triage_level]
  const p = c.patient
  const x = c.extraction
  const flags = Array.from(new Set([...x.keyword_flags, ...x.llm_flags]))
  const submitted = new Date(c.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

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
          <Link href="/" className="font-bold text-gray-900">MediBridge</Link>
          <span className="text-gray-300">|</span>
          <Link href="/doctor" className="text-sm text-blue-600 hover:underline">Dashboard</Link>
          <span className="text-gray-300">/</span>
          <span className="text-sm text-gray-500">{patientName(c)}</span>
        </div>
        <span className="text-xs text-gray-400">Status: {STATUS_LABEL[c.status]}</span>
      </header>

      {/* Triage bar */}
      <div className={`${tc.bar} px-8 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3 text-white">
          <span className="font-bold text-sm">{c.triage_level}</span>
          <span className="text-white/70 text-sm">·</span>
          <span className="text-white/90 text-sm">{tc.label}</span>
        </div>
        <span className="text-white/70 text-xs">Submitted {submitted}</span>
      </div>

      <main className="px-8 py-6 max-w-6xl mx-auto">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="grid grid-cols-3 gap-6">
          {/* Left col */}
          <div className="col-span-1 space-y-4">
            {/* Patient card */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">
                  {patientName(c).charAt(0)}
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">{patientName(c)}</h2>
                  <p className="text-sm text-gray-400">
                    {p.age != null ? `${p.age}y` : 'age unknown'}{p.sex ? ` · ${p.sex}` : ''} · #{c.id.slice(0, 8).toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <div className="flex gap-2"><span className="text-gray-400 w-20">Phone</span><span>{p.phone || '—'}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-20">Pregnant</span><span>{p.pregnant ? 'Yes' : p.pregnant === false ? 'No' : '—'}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-20">Language</span><span>{c.language}</span></div>
              </div>
              <div className="mt-4">
                <span className={`inline-flex items-center gap-2 border rounded-full px-3 py-1 text-xs font-semibold ${tc.badge}`}>
                  <span className={`w-2 h-2 rounded-full ${tc.dot}`} />
                  {c.triage_level}
                </span>
              </div>
            </div>

            {/* Safety Engine */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-yellow-800 uppercase tracking-wide">Safety Engine</p>
              <p className="text-[11px] text-yellow-700 mb-3">Deterministic · {c.triage.engine_version} · sets urgency, not diagnosis</p>
              {c.triage.reasons.length === 0 ? (
                <p className="text-xs text-yellow-800">No IITT danger criteria met.</p>
              ) : (
                <ul className="space-y-1.5">
                  {c.triage.reasons.map(r => (
                    <li key={r.rule_id} className="flex items-start gap-2 text-xs text-yellow-900">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${triageConfig[r.level].dot}`} />
                      <span>{r.label}{r.source !== 'IITT' && <span className="text-yellow-600"> ({r.source})</span>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                disabled={saving || c.status === 'reviewed'}
                onClick={() => update('reviewed')}
                className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 transition-colors text-sm disabled:opacity-50"
              >
                {c.status === 'reviewed' ? 'Reviewed ✓' : 'Mark as Reviewed'}
              </button>
              <button
                disabled={saving || c.status === 'follow_up'}
                onClick={() => update('follow_up')}
                className="w-full border border-gray-200 text-gray-600 font-medium py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-sm disabled:opacity-50"
              >
                {c.status === 'follow_up' ? 'Follow-up requested ✓' : 'Request Follow-up'}
              </button>
            </div>
          </div>

          {/* Right col */}
          <div className="col-span-2 space-y-4">
            {/* AI Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">AI Clinical Summary</span>
                <span className="text-xs text-blue-400 ml-auto">
                  {x.source === 'groq' ? `AI-assisted (${x.model}) · Doctor reviews` : 'AI unavailable — rule-based'}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{c.summary || '—'}</p>
            </div>

            <Section title="Extracted Details">
              <Row label="Symptoms" value={list(x.symptoms)} />
              <Row label="Duration" value={x.duration} />
              <Row label="Severity" value={x.severity} />
              <Row label="Past history" value={list(x.history)} />
              <Row label="Medications" value={list(x.medications)} />
              <Row label="Allergies" value={list(x.allergies)} />
              <Row label="Detected flags" value={flags.length ? flags.map(humanFlag).join(', ') : null} />
            </Section>

            {(c.documents.length > 0 || c.vitals) && (
              <Section title="Documents & Vitals">
                {c.documents.map(d => <Row key={d.name} label={d.type || 'Document'} value={d.name} />)}
                {c.vitals && Object.entries(c.vitals).filter(([, v]) => v != null).map(([k, v]) => (
                  <Row key={k} label={k.toUpperCase()} value={String(v)} />
                ))}
              </Section>
            )}

            <Section title="Intake Conversation">
              <div className="space-y-2">
                {c.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'patient' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === 'patient' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </main>
    </div>
  )
}
