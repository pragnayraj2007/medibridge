'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TopBar, TriageBadge, apptBadge, triageDot, useDoctorSession } from '@/components/ui'
import {
  APPT_LABEL, Availability, Case, complaint, Doctor, getCases, getDoctors, Level, LEVEL_RANK, patientName, resetDemo,
  setAvailability, STATUS_LABEL, timeAgo, when,
} from '@/lib/api'

const AVAIL: Record<Availability, { label: string; cls: string }> = {
  available: { label: 'Available', cls: 'bg-green-100 text-green-700 border-green-200' },
  busy: { label: 'Busy', cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  offline: { label: 'Offline', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
}

// Active work first; then triage priority, appointment time, created time
function sortKey(c: Case) {
  const done = c.status === 'reviewed' || c.appointment?.status === 'completed' || c.appointment?.status === 'cancelled'
  return [Number(done), LEVEL_RANK[c.triage_level], c.appointment?.scheduled_at ?? '9999', c.created_at] as const
}

export default function Dashboard() {
  const session = useDoctorSession()
  const [cases, setCases] = useState<Case[]>([])
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState<'' | Level>('')
  const [mine, setMine] = useState(false)
  const [search, setSearch] = useState('')
  const [busyDoctor, setBusyDoctor] = useState<string | null>(null)
  const [demoNote, setDemoNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [cs, ds] = await Promise.all([getCases(), getDoctors()])
      setCases(cs)
      setDoctors(ds)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Can't reach the backend.")
    } finally {
      setLoaded(true)
    }
  }, [])

  useEffect(() => {
    if (!session) return
    load()
    const t = setInterval(load, 5000) // new patient submissions appear automatically
    return () => clearInterval(t)
  }, [session, load])

  const changeAvailability = async (d: Doctor, status: Availability) => {
    setBusyDoctor(d.id)
    try {
      await setAvailability(d.id, status)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update availability.')
    } finally {
      setBusyDoctor(null)
    }
  }

  const reset = async (cancel: boolean) => {
    setDemoNote(null)
    try {
      const r = await resetDemo(cancel)
      setDoctors(r.doctors)
      setDemoNote(`Demo scenario restored${cancel ? `; ${r.cancelled_appointments} upcoming appointment(s) cancelled` : ''}.`)
      load()
    } catch (e) {
      setDemoNote(e instanceof Error ? e.message : 'Reset failed.')
    }
  }

  const open = cases.filter(c => c.status !== 'reviewed')
  const counts = { RED: 0, YELLOW: 0, GREEN: 0 } as Record<Level, number>
  open.forEach(c => { counts[c.triage_level] += 1 })

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return cases
      .filter(c => !level || c.triage_level === level)
      .filter(c => !mine || c.appointment?.doctor_id === session?.doctor.id)
      .filter(c => !q || `${patientName(c)} ${c.patient_code ?? ''} ${c.case_code} ${complaint(c)}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const ka = sortKey(a), kb = sortKey(b)
        return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2]) || kb[3].localeCompare(ka[3])
      })
  }, [cases, level, mine, search, session])

  if (!session) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <TopBar session={session}>
        <span className="text-sm text-gray-500">Doctor Dashboard</span>
        <span className="flex items-center gap-1.5 text-xs text-gray-400 ml-2">
          <span className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'}`} />
          {error ? 'Offline' : 'Live'}
        </span>
      </TopBar>

      <main className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Summary cards (open cases) */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {([
            { label: 'Urgent', l: 'RED', color: 'border-red-300 bg-red-50', text: 'text-red-700' },
            { label: 'Priority', l: 'YELLOW', color: 'border-yellow-300 bg-yellow-50', text: 'text-yellow-700' },
            { label: 'Routine', l: 'GREEN', color: 'border-green-300 bg-green-50', text: 'text-green-700' },
          ] as const).map(({ label, l, color, text }) => (
            <button key={l} onClick={() => setLevel(level === l ? '' : l)}
              className={`text-left border rounded-xl p-5 ${color} ${level === l ? 'ring-2 ring-blue-500' : ''}`}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${triageDot[l]}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${text}`}>{l}</span>
              </div>
              <div className={`text-3xl font-bold ${text}`}>{counts[l]}</div>
              <div className="text-xs text-gray-500 mt-1">{label} · open cases</div>
            </button>
          ))}
        </div>

        {/* Doctor availability (persisted; drives the next assignment) */}
        <section className="bg-white rounded-xl border border-gray-200 mb-6">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">Doctors &amp; availability</h2>
              <p className="text-xs text-gray-500">New cases go to the doctor with the earliest suitable slot (RED) or the best wait + distance balance. Changes apply to the next assignment.</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => reset(false)} className="text-xs border border-gray-200 rounded-lg px-3 py-1.5 text-gray-600 hover:bg-gray-50">
                Reset demo scenario
              </button>
              <button onClick={() => { if (window.confirm('Reset the scenario and cancel all upcoming scheduled/confirmed appointments?')) reset(true) }}
                className="text-xs border border-red-200 rounded-lg px-3 py-1.5 text-red-600 hover:bg-red-50">
                Reset + clear upcoming
              </button>
            </div>
          </div>
          {demoNote && <p className="px-6 pt-3 text-xs text-blue-700">{demoNote}</p>}
          <div className="grid md:grid-cols-3 gap-4 p-6">
            {doctors.map(d => (
              <div key={d.id} className={`border rounded-xl p-4 ${d.id === session.doctor.id ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-gray-900 text-sm">{d.name}{d.id === session.doctor.id && <span className="text-blue-600 text-xs"> (you)</span>}</div>
                    <div className="text-xs text-gray-500">{d.specialization} · {d.distance_km} km from patient</div>
                  </div>
                  <span className={`text-xs font-semibold border rounded-full px-2 py-0.5 ${AVAIL[d.availability_status].cls}`}>{AVAIL[d.availability_status].label}</span>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  {d.availability_status === 'available'
                    ? <>Next free slot: <b className="text-gray-800">{d.next_free_slot ? when(d.next_free_slot) : '—'}</b></>
                    : d.availability_status === 'busy' && d.next_available_at
                      ? <>Busy until about {when(d.next_available_at)} · not assigned</>
                      : 'Not accepting patients'}
                  {' · '}{d.upcoming_appointments ?? 0} upcoming
                </div>
                <div className="flex gap-1.5 mt-3">
                  {(['available', 'busy', 'offline'] as Availability[]).map(s => (
                    <button key={s} disabled={busyDoctor === d.id || d.availability_status === s} onClick={() => changeAvailability(d, s)}
                      className={`flex-1 text-xs rounded-lg py-1.5 border ${d.availability_status === s ? AVAIL[s].cls + ' font-semibold' : 'border-gray-200 text-gray-600 hover:bg-gray-50'} disabled:cursor-default`}>
                      {AVAIL[s].label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {loaded && doctors.length === 0 && <p className="text-sm text-gray-400">No doctors found. Run the Supabase migration.</p>}
          </div>
        </section>

        {/* Cases + appointments */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-gray-900 mr-2">Cases &amp; appointments</h2>
              {[['All', false], ['My patients', true]].map(([label, val]) => (
                <button key={String(label)} onClick={() => setMine(val as boolean)}
                  className={`text-xs rounded-full px-3 py-1 border ${mine === val ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-200 text-gray-600'}`}>
                  {label as string}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, PAT- or CASE- ID…"
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 w-56" />
              <select value={level} onChange={e => setLevel(e.target.value as '' | Level)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-600">
                <option value="">All triage</option>
                <option value="RED">RED</option>
                <option value="YELLOW">YELLOW</option>
                <option value="GREEN">GREEN</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <th className="text-left px-5 py-3 font-medium">Patient</th>
                  <th className="text-left px-5 py-3 font-medium">Triage</th>
                  <th className="text-left px-5 py-3 font-medium">Appointment</th>
                  <th className="text-left px-5 py-3 font-medium">Doctor</th>
                  <th className="text-left px-5 py-3 font-medium">Distance</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Case</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(c => {
                  const a = c.appointment
                  const faded = c.status === 'reviewed' || a?.status === 'completed' || a?.status === 'cancelled'
                  return (
                    <tr key={c.id} className={`hover:bg-gray-50 ${c.triage_level === 'RED' && !faded ? 'bg-red-50/60 border-l-4 border-l-red-500' : ''} ${faded ? 'opacity-60' : ''}`}>
                      <td className="px-5 py-3">
                        <div className="font-medium text-gray-900 text-sm">{patientName(c)}</div>
                        <div className="text-xs text-gray-400">
                          {c.patient_code ?? 'no patient ID'} · {c.patient.age != null ? `${c.patient.age}y` : 'age ?'}{c.patient.sex ? ` ${c.patient.sex[0].toUpperCase()}` : ''}
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-1 max-w-[220px]">{complaint(c)}</div>
                      </td>
                      <td className="px-5 py-3"><TriageBadge level={c.triage_level} /></td>
                      <td className="px-5 py-3 text-sm">
                        {a ? (
                          <>
                            <div className={`font-semibold ${c.triage_level === 'RED' ? 'text-red-700' : 'text-gray-800'}`}>{when(a.scheduled_at)}</div>
                            <div className="text-xs text-gray-400">Priority {a.priority} · {a.priority_label}</div>
                          </>
                        ) : <span className="text-xs text-gray-400">Not booked</span>}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-700">{a?.doctor?.name ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{a?.distance_km != null ? `${a.distance_km} km` : '—'}</td>
                      <td className="px-5 py-3">
                        {a && <span className={`text-xs rounded-full px-2 py-0.5 ${apptBadge[a.status]}`}>{APPT_LABEL[a.status]}</span>}
                        <div className="text-xs text-gray-400 mt-1">Case: {STATUS_LABEL[c.status]}</div>
                      </td>
                      <td className="px-5 py-3 text-xs text-gray-500">
                        <div className="font-mono">{c.case_code}</div>
                        <div>{timeAgo(c.created_at)}</div>
                      </td>
                      <td className="px-5 py-3">
                        <Link href={`/doctor/case/${c.id}`} className="text-blue-600 hover:text-blue-800 text-sm font-medium">Open →</Link>
                      </td>
                    </tr>
                  )
                })}
                {loaded && rows.length === 0 && (
                  <tr><td colSpan={8} className="px-6 py-10 text-center text-sm text-gray-400">
                    {cases.length === 0 ? 'No cases yet. Submit one from the patient app.' : 'No cases match your filters.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  )
}
