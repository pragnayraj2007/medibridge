'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { TopBar, TriageBadge, apptBadge, triageDot, useDoctorSession } from '@/components/ui'
import {
  Appointment, APPT_LABEL, AppointmentStatus, Case, documentUrl, getCase, Level, NEXT_STEPS, patientName, setAppointmentStatus,
  setStatus, Status, STATUS_LABEL, when,
} from '@/lib/api'

const triageConfig: Record<Level, { bar: string; label: string }> = {
  RED: { bar: 'bg-red-600', label: 'Urgent - Safety Engine found danger signs' },
  YELLOW: { bar: 'bg-yellow-500', label: 'Priority - timely attention required' },
  GREEN: { bar: 'bg-green-600', label: 'Routine - no danger signs found' },
}
const STEP_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled', confirmed: 'Confirm', in_progress: 'Start consultation', completed: 'Complete', cancelled: 'Cancel',
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h3>
        {right}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 w-40 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-gray-800">{value || '—'}</span>
    </div>
  )
}

const list = (xs: string[] | undefined) => (xs && xs.length ? xs.join(', ') : null)
const humanFlag = (f: string) => f.replace(/_/g, ' ')

export default function PatientDetail() {
  const session = useDoctorSession()
  const { id } = useParams<{ id: string }>()
  const [c, setCase] = useState<Case | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    getCase(id).then(setCase).catch(e => setError(e.status === 404 ? 'Case not found.' : e.message))
  }, [id])

  useEffect(() => { if (session) load() }, [session, load])

  const updateCase = async (status: Status) => {
    setSaving(true)
    try { setCase(await setStatus(id, status)) } catch (e) { setError(e instanceof Error ? e.message : 'Could not update status.') } finally { setSaving(false) }
  }

  const updateAppointment = async (a: Appointment, status: AppointmentStatus) => {
    if (status === 'cancelled' && !window.confirm('Cancel this appointment?')) return
    setSaving(true)
    try { await setAppointmentStatus(a.id, status); load() } catch (e) { setError(e instanceof Error ? e.message : 'Could not update the appointment.') } finally { setSaving(false) }
  }

  const openDocument = async (docId: string) => {
    try { window.open((await documentUrl(docId)).url, '_blank', 'noopener') } catch (e) { setError(e instanceof Error ? e.message : 'File unavailable.') }
  }

  if (!session) return null
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
  const a = c.appointment
  const inputs = c.triage.inputs
  const docFlags = inputs?.document_flags ?? x.document_flags ?? {}
  const fused = c.fused_context
  const submitted = new Date(c.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar session={session}>
        <Link href="/doctor" className="text-sm text-blue-600 hover:underline">Dashboard</Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-500 truncate">{patientName(c)} · {c.case_code}</span>
      </TopBar>

      <div className={`${tc.bar} px-8 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-3 text-white">
          <span className="font-bold text-sm">{c.triage_level}</span>
          <span className="text-white/70 text-sm">·</span>
          <span className="text-white/90 text-sm">{tc.label}</span>
        </div>
        <span className="text-white/80 text-xs">Submitted {submitted} · case {STATUS_LABEL[c.status]}</span>
      </div>

      <main className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left column */}
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-lg">{patientName(c).charAt(0)}</div>
                <div>
                  <h2 className="font-bold text-gray-900">{patientName(c)}</h2>
                  <p className="text-sm text-gray-500 font-mono">{c.patient_code ?? 'no patient ID'}</p>
                </div>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex gap-2"><span className="text-gray-400 w-24">Age / sex</span><span>{p.age ?? '?'} · {p.sex ?? '—'}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24">Phone</span><span>{p.phone || '—'}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24">Language</span><span>{c.language}</span></div>
                <div className="flex gap-2"><span className="text-gray-400 w-24">Case ID</span><span className="font-mono">{c.case_code}</span></div>
              </div>
            </div>

            {/* Safety Engine: the final urgency authority */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Final triage · Safety Engine</p>
                <TriageBadge level={c.triage_level} />
              </div>
              <p className="text-[11px] text-amber-800 mb-3 mt-1">
                Deterministic rules ({c.triage.engine_version}), WHO IITT-based. Decided by the Safety Engine, not the AI.
              </p>
              {c.triage.reasons.length === 0 ? (
                <p className="text-xs text-amber-900">No danger criteria met.</p>
              ) : (
                <ul className="space-y-1.5">
                  {c.triage.reasons.map(r => (
                    <li key={r.rule_id} className="flex items-start gap-2 text-xs text-amber-950">
                      <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${triageDot[r.level]}`} />
                      <span>{r.label} <span className="text-amber-700 font-mono">({r.rule_id}{r.source !== 'IITT' ? `, ${r.source}` : ''})</span></span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 pt-3 border-t border-amber-200 text-[11px] text-amber-900 space-y-1">
                <p className="font-semibold">Inputs to the engine</p>
                <p>Keyword rules: {list((inputs?.keyword_flags ?? x.keyword_flags).map(humanFlag)) ?? 'none'}</p>
                <p>AI extraction (candidates): {list((inputs?.ai_flags ?? x.llm_flags).map(humanFlag)) ?? 'none'}</p>
                <p>Documents (candidates): {Object.keys(docFlags).length ? Object.entries(docFlags).map(([f, d]) => `${humanFlag(f)} (${d.join(', ')})`).join('; ') : 'none'}</p>
                <p>Age {inputs?.age ?? p.age ?? '?'} · vitals {inputs?.vitals ? 'yes' : 'none'}{inputs?.pregnant_from_patient_words ? ' · patient said they are pregnant' : ''}</p>
              </div>
            </div>

            {/* Case actions */}
            <div className="space-y-2">
              <button disabled={saving || c.status === 'reviewed'} onClick={() => updateCase('reviewed')}
                className="w-full bg-blue-600 text-white font-semibold py-2.5 rounded-xl hover:bg-blue-700 text-sm disabled:opacity-50">
                {c.status === 'reviewed' ? 'Reviewed ✓' : 'Mark as Reviewed'}
              </button>
              <button disabled={saving || c.status === 'follow_up'} onClick={() => updateCase('follow_up')}
                className="w-full border border-gray-200 bg-white text-gray-700 font-medium py-2.5 rounded-xl hover:bg-gray-50 text-sm disabled:opacity-50">
                {c.status === 'follow_up' ? 'Follow-up requested ✓' : 'Request Follow-up'}
              </button>
            </div>
          </div>

          {/* Right column */}
          <div className="lg:col-span-2 space-y-4">
            {/* Appointment */}
            <Section title="Appointment" right={a && <span className={`text-xs rounded-full px-2 py-0.5 ${apptBadge[a.status]}`}>{APPT_LABEL[a.status]}</span>}>
              {a ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                    <div>
                      <div className="text-xs text-gray-400">Time</div>
                      <div className={`text-xl font-bold ${c.triage_level === 'RED' ? 'text-red-700' : 'text-gray-900'}`}>{when(a.scheduled_at)}</div>
                    </div>
                    <div><div className="text-xs text-gray-400">Doctor</div><div className="text-sm font-semibold">{a.doctor?.name ?? '—'}</div></div>
                    <div><div className="text-xs text-gray-400">Distance</div><div className="text-sm font-semibold">{a.distance_km ?? '—'} km</div></div>
                    <div><div className="text-xs text-gray-400">Priority</div><div className="text-sm font-semibold">{a.priority} · {a.priority_label}</div></div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {NEXT_STEPS[a.status].map(s => (
                      <button key={s} disabled={saving} onClick={() => updateAppointment(a, s)}
                        className={`text-xs rounded-lg px-3 py-1.5 border ${s === 'cancelled' ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-blue-200 text-blue-700 hover:bg-blue-50'} disabled:opacity-50`}>
                        {STEP_LABEL[s]}
                      </button>
                    ))}
                  </div>
                  {a.assignment_reason && <p className="text-xs text-gray-600 bg-gray-50 rounded-lg p-3 leading-relaxed">{a.assignment_reason}</p>}
                  {a.assignment?.candidates && (
                    <div className="overflow-x-auto">
                      <p className="text-[11px] text-gray-400 mb-1">Scheduling rule: {a.assignment.rule}</p>
                      <table className="w-full text-xs">
                        <thead><tr className="text-gray-400 text-left"><th className="py-1">Doctor</th><th>Distance</th><th>Availability</th><th>Earliest slot</th><th>Wait</th><th>Score</th><th /></tr></thead>
                        <tbody>
                          {a.assignment.candidates.map(k => (
                            <tr key={k.doctor_id} className={k.selected ? 'font-semibold text-blue-800' : 'text-gray-600'}>
                              <td className="py-1">{k.name}</td>
                              <td>{k.distance_km} km</td>
                              <td>{k.availability_status}</td>
                              <td>{k.slot ? when(k.slot) : '—'}</td>
                              <td>{k.wait_minutes != null ? `${k.wait_minutes} min` : '—'}</td>
                              <td>{k.score ?? '—'}</td>
                              <td>{k.selected ? '✓ assigned' : k.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : <p className="text-sm text-gray-500">No appointment was booked for this case.</p>}
            </Section>

            {/* AI summary - separate from triage */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">AI clinical summary (fused context)</span>
                <span className="text-xs text-blue-500 ml-auto">
                  {x.summary_source === 'groq' || (!x.summary_source && x.source === 'groq') ? `AI-assisted (${x.model ?? 'Groq'}) · does not set urgency` : 'AI unavailable - rule-based summary'}
                </span>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{c.summary || '—'}</p>
              {fused?.sources && <p className="text-[11px] text-blue-600 mt-3">Sources fused: {fused.sources.join(', ')}</p>}
            </div>

            {fused && fused.conflicts.length > 0 && (
              <Section title={`Conflicts & unconfirmed information (${fused.conflicts.length})`}>
                <ul className="space-y-2">
                  {fused.conflicts.map((k, i) => (
                    <li key={i} className="text-sm">
                      <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 mr-2 ${k.kind === 'conflict' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>{k.kind}</span>
                      <b className="text-gray-800">{k.field}</b>
                      <ul className="ml-4 mt-1 text-xs text-gray-600 list-disc">
                        {k.statements.map((s, j) => <li key={j}><span className="text-gray-400">{s.source}:</span> {s.value}</li>)}
                      </ul>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            <Section title="Extracted details (patient conversation)">
              <Row label="Symptoms" value={list(x.symptoms)} />
              <Row label="Duration" value={x.duration} />
              <Row label="Severity" value={x.severity} />
              <Row label="Past history" value={list(x.history)} />
              <Row label="Medications" value={list(x.medications)} />
              <Row label="Allergies" value={list(x.allergies)} />
              {fused?.voice_transcripts && fused.voice_transcripts.length > 0 && <Row label="Voice transcripts" value={`${fused.voice_transcripts.length} answer(s) given by voice`} />}
              {c.vitals && <Row label="Vitals" value={Object.entries(c.vitals).filter(([, v]) => v != null).map(([k, v]) => `${k.toUpperCase()} ${v}`).join(' · ')} />}
            </Section>

            <Section title={`Documents (${c.document_details?.length ?? 0})`}>
              {!c.document_details?.length && <p className="text-sm text-gray-500">No documents uploaded.</p>}
              <div className="space-y-4">
                {c.document_details?.map(d => (
                  <div key={d.id} className="border border-gray-100 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-gray-800">{d.name} <span className="text-xs font-normal text-gray-400">{d.doc_type}</span></div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5">OCR: {d.ocr_status}</span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5">Gemini: {d.analysis_status}{d.analysis_error ? ` (${d.analysis_error})` : ''}</span>
                        {d.has_file && <button onClick={() => openDocument(d.id)} className="text-blue-600 hover:underline">Open original</button>}
                      </div>
                    </div>
                    {d.findings ? (
                      <div className="mt-2 text-xs text-gray-700 space-y-1">
                        {d.findings.summary && <p>{d.findings.summary}</p>}
                        {d.findings.findings.length > 0 && <p><span className="text-gray-400">Findings:</span> {d.findings.findings.join('; ')}</p>}
                        {d.findings.diagnoses_mentioned.length > 0 && <p><span className="text-gray-400">Conditions written:</span> {d.findings.diagnoses_mentioned.join(', ')}</p>}
                        {d.findings.medications.length > 0 && <p><span className="text-gray-400">Medications:</span> {d.findings.medications.join(', ')}</p>}
                        {d.findings.allergies.length > 0 && <p><span className="text-gray-400">Allergies:</span> {d.findings.allergies.join(', ')}</p>}
                        {d.findings.lab_results.length > 0 && (
                          <p><span className="text-gray-400">Labs:</span> {d.findings.lab_results.map(l => `${l.name} ${l.value}${l.unit ? ` ${l.unit}` : ''}${l.flag && l.flag !== 'normal' ? ` (${l.flag})` : ''}`).join(' · ')}</p>
                        )}
                      </div>
                    ) : <p className="mt-2 text-xs text-gray-500">No multimodal findings ({d.status}).</p>}
                    {d.ocr_text && (
                      <details className="mt-2 text-xs"><summary className="cursor-pointer text-gray-400">OCR text</summary><pre className="whitespace-pre-wrap text-gray-600 mt-1">{d.ocr_text}</pre></details>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            <Section title={`Previous cases (${c.previous_cases?.length ?? 0})`}>
              {!c.previous_cases?.length && <p className="text-sm text-gray-500">No previous cases for this patient ID.</p>}
              <ul className="divide-y divide-gray-50">
                {c.previous_cases?.map(pc => (
                  <li key={pc.id} className="py-2 flex items-start gap-3">
                    <TriageBadge level={pc.triage_level} />
                    <div className="flex-1 text-sm">
                      <Link href={`/doctor/case/${pc.id}`} className="font-mono text-blue-600 hover:underline">{pc.case_code}</Link>
                      <span className="text-gray-400"> · {new Date(pc.created_at).toLocaleDateString()} · {STATUS_LABEL[pc.status]}</span>
                      {pc.appointment && <span className="text-gray-400"> · {pc.appointment.doctor?.name}, {APPT_LABEL[pc.appointment.status]}</span>}
                      <div className="text-xs text-gray-600">{pc.symptoms.join(', ') || (pc.summary ?? '').slice(0, 160)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Intake conversation">
              <div className="space-y-2">
                {c.messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'patient' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.role === 'patient' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
                      {m.via === 'voice' && <span className="block text-[10px] opacity-75">Voice transcript</span>}
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
