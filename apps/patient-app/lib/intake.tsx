// One consultation's answers, shared across the intake screens (in memory only).
// The patient's identity and history are persistent (lib/session.tsx + Supabase).
import { createContext, ReactNode, useCallback, useContext, useState } from 'react'
import type { CaseResponse, Message, UploadedDocument } from './api'

type IntakeState = {
  language: string
  messages: Message[]
  documents: UploadedDocument[]
  result: CaseResponse | null
}

type Update = Partial<IntakeState> | ((s: IntakeState) => Partial<IntakeState>)

const initial: IntakeState = { language: 'en', messages: [], documents: [], result: null }

const IntakeContext = createContext<(IntakeState & { update: (u: Update) => void; reset: (language?: string) => void }) | null>(null)

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IntakeState>(initial)
  const update = useCallback((u: Update) => setState(s => ({ ...s, ...(typeof u === 'function' ? u(s) : u) })), [])
  const reset = useCallback((language?: string) => setState({ ...initial, language: language ?? initial.language }), [])
  return <IntakeContext.Provider value={{ ...state, update, reset }}>{children}</IntakeContext.Provider>
}

export function useIntake() {
  const ctx = useContext(IntakeContext)
  if (!ctx) throw new Error('useIntake must be used inside IntakeProvider')
  return ctx
}
