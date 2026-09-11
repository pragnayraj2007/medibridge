// Proxied to the backend by next.config.js (set BACKEND_URL there / in Vercel)
const API_BASE = '/api'
const AUTH_KEY = 'medibridge.doctor.v1'

export type Level = 'RED' | 'YELLOW' | 'GREEN'
export type Status = 'new' | 'reviewed' | 'follow_up'
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
export type Availability = 'available' | 'busy' | 'offline'

export type Doctor = {
  id: string
  name: string
  specialization: string | null
  email: string | null
  availability_status: Availability
  next_available_at: string | null
  slot_minutes: number
  distance_km?: number
  next_free_slot?: string | null
  upcoming_appointments?: number
}

export type Candidate = {
  doctor_id: string
  name: string
  distance_km: number
  availability_status: Availability
  eligible: boolean
  slot: string | null
  wait_minutes: number | null
  score: number | null
  selected: boolean
  note: string
}

export type Appointment = {
  id: string
  patient_id: string
  case_id: string | null
  doctor_id: string | null
  doctor: { id: string; name: string; specialization: string | null } | null
  scheduled_at: string
  duration_minutes: number
  triage_level: Level
  priority: 1 | 2 | 3
  priority_label: string
  status: AppointmentStatus
  distance_km: number | null
  assignment_reason: string | null
  assignment: { rule: string; candidates: Candidate[]; decided_at: string; preferred_at: string | null } | null
  requested_at: string
  created_at: string
}

export type Conflict = { field: string; kind: 'conflict' | 'unconfirmed'; statements: { source: string; value: string }[] }

export type DocFindings = {
  readable: boolean
  document_type: string
  document_date: string | null
  summary: string
  findings: string[]
  diagnoses_mentioned: string[]
  medications: string[]
  allergies: string[]
  lab_results: { name: string; value: string; unit: string | null; flag: 'high' | 'low' | 'normal' | null }[]
  vitals: Record<string, number | null>
  danger_signs: string[]
}

export type DocumentDetail = {
  id: string
  name: string
  doc_type: string | null
  status: 'processed' | 'partial' | 'empty' | 'failed'
  ocr_status: string | null
  analysis_status: string | null
  analysis_error?: string | null
  ocr_error?: string | null
  summary: string | null
  findings: DocFindings | null
  ocr_text: string | null
  has_file: boolean
  created_at: string
}

export type PreviousCase = {
  id: string
  case_code: string
  created_at: string
  triage_level: Level
  status: Status
  symptoms: string[]
  summary: string | null
  appointment: Appointment | null
}

export type Case = {
  id: string
  case_code: string
  created_at: string
  updated_at: string
  status: Status
  triage_level: Level
  language: string
  patient_id: string | null
  patient_code: string | null
  patient: { name?: string | null; age?: number | null; sex?: string | null; phone?: string | null; pregnant?: boolean | null }
  messages: { role: 'patient' | 'assistant'; text: string; via?: 'text' | 'voice' }[]
  documents: { id?: string; name: string; type?: string | null }[]
  vitals: Record<string, number | null> | null
  extraction: {
    source: 'groq' | 'rules'
    model: string | null
    symptoms: string[]
    duration: string | null
    severity: string | null
    history: string[]
    medications: string[]
    allergies: string[]
    llm_flags: string[]
    keyword_flags: string[]
    document_flags?: Record<string, string[]>
    summary_source?: 'groq' | 'rules'
  }
  summary: string | null
  triage: {
    level: Level
    reasons: { rule_id: string; level: Level; label: string; source: string }[]
    engine_version: string
    decided_by?: string
    inputs?: { keyword_flags: string[]; ai_flags: string[]; document_flags: Record<string, string[]>; age: number | null; pregnant: boolean; vitals: boolean }
  }
  fused_context?: {
    sources: string[]
    conflicts: Conflict[]
    voice_transcripts: string[]
    vitals: Record<string, number> | null
  } | null
  appointment: Appointment | null
  // detail endpoint only
  appointments?: Appointment[]
  previous_cases?: PreviousCase[]
  document_details?: DocumentDetail[]
  patient_profile?: { patient_code: string; name: string | null; phone: string | null; age: number | null; sex: string | null; pregnancy_status: string } | null
}

// ── Auth (demo) ─────────────────────────────────────────────────────────────

export type Session = { token: string; doctor: Doctor }

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

function saveSession(s: Session | null) {
  try {
    if (s) window.localStorage.setItem(AUTH_KEY, JSON.stringify(s))
    else window.localStorage.removeItem(AUTH_KEY)
  } catch {}
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

async function request<T>(path: string, init?: RequestInit & { noAuth?: boolean }): Promise<T> {
  const session = getSession()
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(session && !init?.noAuth ? { Authorization: `Bearer ${session.token}` } : {}),
      },
      cache: 'no-store',
    })
  } catch {
    throw new ApiError("Can't reach the backend.", 0)
  }
  if (res.status === 401 && !init?.noAuth) {
    saveSession(null)
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/doctor/login')) {
      window.location.href = `/doctor/login?next=${encodeURIComponent(window.location.pathname)}`
    }
  }
  if (!res.ok) {
    let detail = `API ${res.status}`
    try {
      const j = await res.json()
      if (typeof j?.detail === 'string') detail = j.detail
    } catch {}
    throw new ApiError(detail, res.status)
  }
  return res.json()
}

export async function login(email: string, password: string) {
  const s = await request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }), noAuth: true })
  saveSession(s)
  return s
}

export const logout = () => saveSession(null)

// ── Data ────────────────────────────────────────────────────────────────────

export const getCases = () => request<Case[]>('/cases').then(cs => cs.map(normalizeCase))
export const getCase = (id: string) => request<Case>(`/cases/${id}`).then(normalizeCase)
export const setStatus = (id: string, status: Status) =>
  request<Case>(`/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(normalizeCase)
export const getDoctors = () => request<Doctor[]>('/doctors')
export const setAvailability = (id: string, availability_status: Availability, busy_minutes?: number) =>
  request<Doctor>(`/doctors/${id}/availability`, { method: 'PATCH', body: JSON.stringify({ availability_status, busy_minutes }) })
export const resetDemo = (cancel_upcoming: boolean) =>
  request<{ doctors: Doctor[]; cancelled_appointments: number }>('/demo/reset', { method: 'POST', body: JSON.stringify({ cancel_upcoming }) })
export const setAppointmentStatus = (id: string, status: AppointmentStatus) =>
  request<Appointment>(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) })
export const documentUrl = (id: string) => request<{ url: string }>(`/documents/${id}/file`)

// ── Helpers ─────────────────────────────────────────────────────────────────

export const LEVEL_RANK: Record<Level, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
export const STATUS_LABEL: Record<Status, string> = { new: 'New', reviewed: 'Reviewed', follow_up: 'Follow-up' }
export const APPT_LABEL: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled', confirmed: 'Confirmed', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled',
}
export const NEXT_STEPS: Record<AppointmentStatus, AppointmentStatus[]> = {
  scheduled: ['confirmed', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  cancelled: [],
}

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} hr ago` : new Date(iso).toLocaleDateString()
}

export function when(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const dayDiff = Math.round((new Date(d.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86400000)
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (dayDiff === 0) return `Today ${time}`
  if (dayDiff === 1) return `Tomorrow ${time}`
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`
}

export function patientName(c: Case) {
  return c.patient.name || (c.patient.phone ? `Patient ${c.patient.phone}` : `Patient #${c.id.slice(0, 8).toUpperCase()}`)
}

export function complaint(c: Case) {
  const symptoms = c.extraction?.symptoms ?? []
  if (symptoms.length) return symptoms.join(', ')
  return (c.messages ?? []).find(m => m.role === 'patient')?.text ?? '—'
}

// Older or hand-edited rows may miss fields; fill defaults so pages never crash.
const EMPTY_EXTRACTION: Case['extraction'] = {
  source: 'rules', model: null, symptoms: [], duration: null, severity: null, history: [],
  medications: [], allergies: [], llm_flags: [], keyword_flags: [],
}

export function normalizeCase(c: Case): Case {
  const emptyTriage: Case['triage'] = { level: c.triage_level, reasons: [], engine_version: '—' }
  return {
    ...c,
    case_code: c.case_code ?? `CASE-${c.id.slice(0, 8).toUpperCase()}`,
    patient: c.patient ?? {},
    messages: c.messages ?? [],
    documents: c.documents ?? [],
    extraction: { ...EMPTY_EXTRACTION, ...(c.extraction ?? {}) },
    triage: { ...emptyTriage, ...(c.triage ?? {}) },
    appointment: c.appointment ?? null,
  }
}
