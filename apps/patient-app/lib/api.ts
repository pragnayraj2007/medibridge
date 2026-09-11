import Constants from 'expo-constants'
import { Platform } from 'react-native'

export type Level = 'RED' | 'YELLOW' | 'GREEN'
export type Message = { role: 'patient' | 'assistant'; text: string; via?: 'text' | 'voice' }
export type Sex = 'male' | 'female' | 'other'
export type PregnancyStatus = 'pregnant' | 'not_pregnant' | 'unknown'

// Per-visit details the Safety Engine needs (sent with each intake)
export type Patient = {
  name?: string | null
  age?: number | null
  sex?: Sex | null
  phone?: string | null
  pregnant?: boolean | null
}

export type PatientProfile = {
  id: string
  patient_code: string
  name: string | null
  phone: string | null
  age: number | null
  sex: Sex | null
  pregnancy_status: PregnancyStatus
  language: string
  created_at: string
  qr?: string | null // PNG data URI encoding only the patient code
}

export type Session = { code: string; token: string }

export type Appointment = {
  id: string
  case_id: string | null
  doctor: { id: string; name: string; specialization: string | null } | null
  scheduled_at: string
  duration_minutes: number
  triage_level: Level
  priority: 1 | 2 | 3
  priority_label: string
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
  distance_km: number | null
  created_at: string
}

export type UploadedDocument = {
  id: string
  name: string
  doc_type: string | null
  status: 'processed' | 'partial' | 'empty' | 'failed'
  ocr_status: 'done' | 'empty' | 'not_configured' | 'failed' | null
  analysis_status: 'done' | 'not_configured' | 'failed' | null
  summary: string | null
  message: string
  created_at: string
}

export type NextQuestionResponse = {
  question: string
  done: boolean
  source: 'groq' | 'rules'
  safety: { level: Level; urgent: boolean; guidance: string | null }
}

export type CaseResponse = {
  id: string
  case_code: string
  created_at: string
  status: string
  triage_level: Level
  triage: { level: Level; reasons: { rule_id: string; level: Level; label: string; source: string }[] }
  extraction: { symptoms: string[] }
  messages: Message[]
  documents: { id?: string; name: string }[]
  guidance: string
  appointment: Appointment | null
  appointment_error: string | null
}

export type PatientCase = {
  id: string
  case_code: string
  created_at: string
  status: string
  triage_level: Level
  reasons: string[]
  symptoms: string[]
  your_answers: string[]
  documents: string[]
  guidance: string
  appointment: Appointment | null
}

// Backend URL, in priority order:
//   1. EXPO_PUBLIC_API_URL — build-time override (web export uses "/api";
//      a local backend uses http://<PC-IP>:8000)
//   2. extra.apiUrl from app.config.js — the deployed backend
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || Constants.expoConfig?.extra?.apiUrl || '').replace(/\/+$/, '')

export const SERVER_ERROR = `Can't reach the MediBridge server. Check your internet connection and try again. (${API_URL || 'no server configured'})`

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message)
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; session?: Session | null; timeoutMs?: number }

async function request<T>(path: string, { method = 'GET', body, form, session, timeoutMs = 45000 }: Opts = {}): Promise<T> {
  if (!API_URL) throw new ApiError('No API URL configured', 0)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (session) {
    headers['X-Patient-Code'] = session.code
    headers['X-Patient-Token'] = session.token
  }
  let res: Response
  try {
    res = await fetch(API_URL + path, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    })
  } catch (e) {
    const aborted = (e as Error)?.name === 'AbortError'
    throw new ApiError(aborted ? 'The server took too long to respond. Please try again.' : SERVER_ERROR, 0)
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    let detail = `Server error ${res.status}`
    try {
      const j = await res.json()
      if (typeof j?.detail === 'string') detail = j.detail
    } catch {}
    throw new ApiError(detail, res.status)
  }
  return (await res.json()) as T
}

/** A picked/recorded file as FormData, on both Android (uri) and web (Blob). */
export async function fileFormData(file: { uri: string; name: string; type: string; webFile?: Blob | null }, fields: Record<string, string>) {
  const form = new FormData()
  if (Platform.OS === 'web') {
    const blob = file.webFile ?? (await (await fetch(file.uri)).blob())
    form.append('file', blob, file.name)
  } else {
    form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob)
  }
  Object.entries(fields).forEach(([k, v]) => form.append(k, v))
  return form
}

export const api = {
  registerPatient: (body: { name: string; phone: string | null; age: number; sex: Sex | null; pregnancy_status: PregnancyStatus; language: string }) =>
    request<{ patient: PatientProfile; token: string }>('/patients', { method: 'POST', body }),
  getPatient: (s: Session) => request<PatientProfile>(`/patients/${s.code}`, { session: s }),
  updatePatient: (s: Session, body: Partial<Pick<PatientProfile, 'name' | 'phone' | 'age' | 'sex' | 'pregnancy_status' | 'language'>>) =>
    request<PatientProfile>(`/patients/${s.code}`, { method: 'PATCH', body, session: s }),
  appointments: (s: Session) => request<Appointment[]>(`/patients/${s.code}/appointments`, { session: s }),
  cases: (s: Session) => request<PatientCase[]>(`/patients/${s.code}/cases`, { session: s }),
  caseDetail: (s: Session, id: string) => request<PatientCase>(`/patients/${s.code}/cases/${id}`, { session: s }),
  documents: (s: Session) => request<UploadedDocument[]>(`/patients/${s.code}/documents`, { session: s }),

  nextQuestion: (body: { patient: Patient; language: string; messages: Message[] }) =>
    request<NextQuestionResponse>('/intake/next-question', { method: 'POST', body }),
  submitCase: (s: Session, body: { patient: Patient; language: string; messages: Message[]; document_ids: string[] }) =>
    request<CaseResponse>('/cases', { method: 'POST', body, session: s, timeoutMs: 90000 }),
  rebook: (s: Session, caseId: string, preferredAt: Date) =>
    request<Appointment>('/appointments', { method: 'POST', body: { case_id: caseId, preferred_at: preferredAt.toISOString() }, session: s }),

  uploadDocument: (s: Session, form: FormData) =>
    request<UploadedDocument>('/documents', { method: 'POST', form, session: s, timeoutMs: 90000 }),
  transcribe: (s: Session, form: FormData) =>
    request<{ transcript: string; language_code: string | null }>('/voice/transcribe', { method: 'POST', form, session: s, timeoutMs: 45000 }),
  speak: (s: Session, text: string, language: string) =>
    request<{ audio_base64: string; mime: string }>('/voice/speak', { method: 'POST', body: { text, language }, session: s, timeoutMs: 30000 }),
}

export const errorText = (e: unknown) => (e instanceof ApiError ? e.message : SERVER_ERROR)
