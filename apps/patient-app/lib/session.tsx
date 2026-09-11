// The patient's persistent identity on this device: patient code + device token.
// Stored with AsyncStorage (localStorage on web), so the same patient ID is reused
// after the app is closed or the page is reloaded. The profile itself lives in Supabase.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { api, PatientProfile, Session } from './api'

const KEY = 'medibridge.session.v1'
const PROFILE_KEY = 'medibridge.profile.v1' // last known profile, shown offline

type Ctx = {
  ready: boolean
  session: Session | null
  profile: PatientProfile | null
  signIn: (s: Session, p: PatientProfile) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<PatientProfile | null>
  setProfile: (p: PatientProfile) => void
}

const SessionContext = createContext<Ctx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfileState] = useState<PatientProfile | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const [s, p] = await Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(PROFILE_KEY)])
        if (s) setSession(JSON.parse(s))
        if (s && p) setProfileState(JSON.parse(p))
      } catch {
        // storage unavailable (private browsing): the patient registers again
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const setProfile = useCallback((p: PatientProfile) => {
    setProfileState(p)
    AsyncStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, qr: p.qr ?? null })).catch(() => {})
  }, [])

  const signIn = useCallback(async (s: Session, p: PatientProfile) => {
    setSession(s)
    setProfile(p)
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(s))
    } catch {}
  }, [setProfile])

  const signOut = useCallback(async () => {
    setSession(null)
    setProfileState(null)
    try {
      await AsyncStorage.multiRemove([KEY, PROFILE_KEY])
    } catch {}
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session) return null
    const p = await api.getPatient(session)
    setProfile(p)
    return p
  }, [session, setProfile])

  return (
    <SessionContext.Provider value={{ ready, session, profile, signIn, signOut, refreshProfile, setProfile }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside SessionProvider')
  return ctx
}
