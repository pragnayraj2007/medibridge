// Screen 7: Processing — submits the intake; the backend extracts, runs the Safety Engine and stores the case
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { C, S } from '../constants/theme'
import { api, SERVER_ERROR } from '../lib/api'
import { useIntake } from '../lib/intake'

const STEPS = [
  { icon: 'chatbubbles-outline', label: 'Reading your responses' },
  { icon: 'document-text-outline', label: 'Checking your documents' },
  { icon: 'medkit-outline', label: 'Extracting key symptoms' },
  { icon: 'shield-checkmark-outline', label: 'Running safety checks' },
  { icon: 'clipboard-outline', label: 'Preparing summary for doctor' },
]

export default function Processing() {
  const router = useRouter()
  const { patient, language, messages, documents, result, update } = useIntake()
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<'working' | 'done' | 'error' | 'empty'>('working')

  const submit = async () => {
    if (result) {
      // Already submitted and nothing changed since (going back and forward again)
      setStatus('done')
      return
    }
    if (!messages.some(m => m.role === 'patient')) {
      setStatus('empty')
      return
    }
    setStatus('working')
    try {
      const created = await api.submitCase({ patient, language, messages, documents })
      update({ result: created })
      setStatus('done')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => {
    submit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Step animation while the request is in flight
  useEffect(() => {
    if (status !== 'working') return
    const t = setInterval(() => setStep(s => Math.min(s + 1, STEPS.length - 1)), 900)
    return () => clearInterval(t)
  }, [status])

  const done = status === 'done'
  const title = {
    working: 'Organizing Your Information',
    done: 'All Done!',
    error: 'Could Not Send',
    empty: 'Nothing To Send Yet',
  }[status]
  const subtitle = {
    working: 'Checking everything you shared...',
    done: 'Your health summary is ready for your doctor.',
    error: SERVER_ERROR,
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

        {(status === 'working' || done) && (
          <View style={styles.checklist}>
            {STEPS.map((s, i) => {
              const isDone = done || i < step
              const isActive = !done && i === step
              return (
                <View key={i} style={styles.checkItem}>
                  <View style={[styles.checkCircle, isDone && styles.checkCircleDone, isActive && styles.checkCircleActive]}>
                    {isDone
                      ? <Ionicons name="checkmark" size={14} color={C.white} />
                      : isActive
                        ? <Ionicons name="ellipsis-horizontal" size={12} color={C.primary} />
                        : <View style={styles.checkDot} />}
                  </View>
                  <Ionicons name={s.icon as any} size={16} color={isDone ? C.green : isActive ? C.primary : C.textGray} />
                  <Text style={[styles.checkLabel, isDone && styles.checkLabelDone, isActive && styles.checkLabelActive]}>{s.label}</Text>
                </View>
              )
            })}
          </View>
        )}

        {done && (
          <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 32 }]} onPress={() => router.replace('/timeline')}>
            <Text style={S.btnText}>View Your Health Summary</Text>
            <Ionicons name="arrow-forward" size={18} color={C.white} />
          </TouchableOpacity>
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
  brainCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 32, position: 'relative' },
  pulseRing: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: C.primaryLight, opacity: 0.3 },
  title: { fontSize: 26, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 10 },
  subtitle: { fontSize: 14, color: C.textGray, textAlign: 'center', marginBottom: 32, lineHeight: 20 },
  checklist: { width: '100%', gap: 14 },
  checkItem: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkCircle: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  checkCircleDone: { backgroundColor: C.green, borderColor: C.green },
  checkCircleActive: { borderColor: C.primary },
  checkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.border },
  checkLabel: { fontSize: 14, color: C.textGray },
  checkLabelDone: { color: C.textDark, fontWeight: '600' },
  checkLabelActive: { color: C.primary, fontWeight: '600' },
})
