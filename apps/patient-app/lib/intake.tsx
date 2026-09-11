// Intake answers shared across screens for one patient session (in memory only).
import { createContext, ReactNode, useCallback, useContext, useState } from 'react'
import type { CaseResponse, DocumentMeta, Message, Patient } from './api'

type IntakeState = {
  language: string
  patient: Patient
  messages: Message[]
  documents: DocumentMeta[]
  result: CaseResponse | null
}

type Update = Partial<IntakeState> | ((s: IntakeState) => Partial<IntakeState>)

const initial: IntakeState = { language: 'en', patient: {}, messages: [], documents: [], result: null }

const IntakeContext = createContext<(IntakeState & { update: (u: Update) => void; reset: () => void }) | null>(null)

export function IntakeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<IntakeState>(initial)
  const update = useCallback((u: Update) => setState(s => ({ ...s, ...(typeof u === 'function' ? u(s) : u) })), [])
  const reset = useCallback(() => setState(initial), [])
  return <IntakeContext.Provider value={{ ...state, update, reset }}>{children}</IntakeContext.Provider>
}

export function useIntake() {
  const ctx = useContext(IntakeContext)
  if (!ctx) throw new Error('useIntake must be used inside IntakeProvider')
  return ctx
}
