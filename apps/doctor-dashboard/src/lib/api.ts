// Proxied to the backend by next.config.js (set BACKEND_URL there / in Vercel)
const API_BASE = '/api'

export type Level = 'RED' | 'YELLOW' | 'GREEN'
export type Status = 'new' | 'reviewed' | 'follow_up'

export type Case = {
  id: string
  created_at: string
  updated_at: string
  status: Status
  triage_level: Level
  language: string
  patient: { name?: string | null; age?: number | null; sex?: string | null; phone?: string | null; pregnant?: boolean | null }
  messages: { role: 'patient' | 'assistant'; text: string }[]
  documents: { name: string; type?: string | null }[]
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
  }
  summary: string | null
  triage: {
    level: Level
    reasons: { rule_id: string; level: Level; label: string; source: string }[]
    engine_version: string
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`API ${res.status}`)
  return res.json()
}

export const getCases = () => request<Case[]>('/cases').then(cs => cs.map(normalizeCase))
export const getCase = (id: string) => request<Case>(`/cases/${id}`).then(normalizeCase)
export const setStatus = (id: string, status: Status) =>
  request<Case>(`/cases/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(normalizeCase)

export const LEVEL_RANK: Record<Level, number> = { RED: 0, YELLOW: 1, GREEN: 2 }

export const STATUS_LABEL: Record<Status, string> = { new: 'New', reviewed: 'Reviewed', follow_up: 'Follow-up' }

export function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  return hrs < 24 ? `${hrs} hr ago` : new Date(iso).toLocaleDateString()
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
    patient: c.patient ?? {},
    messages: c.messages ?? [],
    documents: c.documents ?? [],
    extraction: { ...EMPTY_EXTRACTION, ...(c.extraction ?? {}) },
    triage: { ...emptyTriage, ...(c.triage ?? {}) },
  }
}
