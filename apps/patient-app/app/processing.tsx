// Consultation step 5: submit. The backend fuses everything, runs the Safety Engine,
// stores the case, then books the earliest suitable doctor. Nothing is shown as booked
// unless the backend saved it.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { C, S } from '../constants/theme'
import { api, errorText, Patient } from '../lib/api'
import { useIntake } from '../lib/intake'
import { useSession } from '../lib/session'

const STEPS = [
  { icon: 'git-merge-outline', label: 'Combining your answers, voice and documents' },
  { icon: 'time-outline', label: 'Checking your previous visits' },
  { icon: 'shield-checkmark-outline', label: 'Running safety checks' },
  { icon: 'people-outline', label: 'Finding the nearest available doctor' },
  { icon: 'calendar-outline', label: 'Booking your appointment' },
]

export default function Processing() {
  const router = useRouter()
  const { session, profile } = useSession()
  const { language, messages, documents, result, update } = useIntake()
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<'working' | 'error' | 'empty'>('working')
  const [message, setMessage] = useState('')

  const submit = async () => {
    if (result) return router.replace('/complete') // already submitted, nothing changed since
    if (!messages.some(m => m.role === 'patient')) return setStatus('empty')
    if (!session) {
      setMessage('Please register before starting a consultation.')
      return setStatus('error')
    }
    setStatus('working')
    const patient: Patient = {
      name: profile?.name, age: profile?.age, sex: profile?.sex, phone: profile?.phone,
    }
    try {
      const created = await api.submitCase(session, { patient, language, messages, document_ids: documents.map(d => d.id) })
      update({ result: created })
      router.replace('/complete')
    } catch (e) {
      setMessage(errorText(e))
      setStatus('error')
    }
  }

  useEffect(() => {
    submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status !== 'working') return
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 1400)
    return () => clearInterval(t)
  }, [status])

  const title = { working: 'Preparing Your Consultation', error: 'Could Not Send', empty: 'Nothing To Send Yet' }[status]
  const subtitle = {
    working: 'This takes a few seconds.',
    error: `${message} Your consultation was not saved, so nothing has been booked yet.`,
    empty: 'Please answer at least one question in the chat first.',
  }[status]

  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.container}>
        <View style={styles.brainCircle}>
          <Ionicons name={status === 'error' ? 'cloud-offline' : 'hardware-chip'} size={56} color={C.primary} />
          <View style={styles.pulseRing} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {status === 'working' && (
          <View style={styles.checklist}>
            {STEPS.map((s, i) => {
              const isDone = i < step
              const isActive = i === step
              return (
                <View key={i} style={styles.checkItem}>
                  <View style={[styles.checkCircle, isDone && styles.checkCircleDone, isActive && styles.checkCircleActive]}>
                    {isDone ? <Ionicons name="checkmark" size={14} color={C.white} /> : isActive ? <Ionicons name="ellipsis-horizontal" size={12} color={C.primary} /> : <View style={styles.checkDot} />}
                  </View>
                  <Ionicons name={s.icon as any} size={16} color={isDone ? C.green : isActive ? C.primary : C.textGray} />
                  <Text style={[styles.checkLabel, isDone && styles.checkLabelDone, isActive && styles.checkLabelActive]}>{s.label}</Text>
                </View>
              )
            })}
          </View>
        )}

        {status === 'error' && (
          <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 24 }]} onPress={submit}>
            <Ionicons name="refresh" size={18} color={C.white} />
            <Text style={S.btnText}>Try Again</Text>
          </TouchableOpacity>
        )}
        {status === 'empty' && (
          <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 24 }]} onPress={() => router.replace('/chat')}>
            <Text style={S.btnText}>Back to Chat</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  brainCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', marginBottom: 32, position: 'relative' },
  pulseRing: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: C.primaryLight, opacity: 0.3 },
  title: { fontSize: 24, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, color: C.textGray, textAlign: 'center', marginBottom: 28, lineHeight: 20 },
  checklist: { width: '100%', gap: 14 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkCircleDone: { backgroundColor: C.green, borderColor: C.green },
  checkCircleActive: { borderColor: C.primary },
  checkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  checkLabel: { flex: 1, fontSize: 14, color: C.textGray },
  checkLabelDone: { color: C.textDark, fontWeight: '600' },
  checkLabelActive: { color: C.primary, fontWeight: '600' },
})
