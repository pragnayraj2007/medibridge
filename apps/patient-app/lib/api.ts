import Constants from 'expo-constants'

export type Level = 'RED' | 'YELLOW' | 'GREEN'
export type Message = { role: 'patient' | 'assistant'; text: string }
export type Patient = {
  name?: string | null
  age?: number | null
  sex?: 'male' | 'female' | 'other' | null
  phone?: string | null
  pregnant?: boolean | null
}
export type DocumentMeta = { name: string; type?: string | null }

export type NextQuestionResponse = {
  question: string
  done: boolean
  source: 'groq' | 'rules'
  safety: { level: Level; urgent: boolean; guidance: string | null }
}

export type CaseResponse = {
  id: string
  created_at: string
  status: string
  triage_level: Level
  patient: Patient
  messages: Message[]
  documents: DocumentMeta[]
  extraction: { source: string; symptoms: string[]; keyword_flags: string[]; llm_flags: string[] }
  summary: string | null
  triage: { level: Level; reasons: { rule_id: string; level: Level; label: string; source: string }[] }
  guidance: string
}

// In development the phone reaches the PC at the same address as the Expo dev
// server, so default to that host on port 8000. Override with EXPO_PUBLIC_API_URL.
function defaultApiUrl() {
  const host = Constants.expoConfig?.hostUri?.split(':')[0]
  return host ? `http://${host}:8000` : 'http://localhost:8000'
}

export const API_URL = process.env.EXPO_PUBLIC_API_URL || defaultApiUrl()

async function post<T>(path: string, body: unknown): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 45000)
  try {
    const res = await fetch(API_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Server error ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  nextQuestion: (body: { patient: Patient; language: string; messages: Message[] }) =>
    post<NextQuestionResponse>('/intake/next-question', body),
  submitCase: (body: { patient: Patient; language: string; messages: Message[]; documents: DocumentMeta[] }) =>
    post<CaseResponse>('/cases', body),
}

export const SERVER_ERROR = `Can't reach the MediBridge server at ${API_URL}. Make sure it is running and your phone is on the same Wi-Fi as the computer.`
