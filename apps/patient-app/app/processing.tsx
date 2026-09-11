// Screen 7: Processing / Organizing Info
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import { C, S } from '../constants/theme'

const STEPS = [
  { icon: 'chatbubbles-outline', label: 'Reading your responses', done: true },
  { icon: 'document-text-outline', label: 'Analyzing documents', done: true },
  { icon: 'medkit-outline', label: 'Extracting key symptoms', done: true },
  { icon: 'shield-checkmark-outline', label: 'Running safety checks', done: false },
  { icon: 'clipboard-outline', label: 'Preparing summary for doctor', done: false },
]

export default function Processing() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const t = setInterval(() => {
      setStep(s => {
        if (s >= STEPS.length - 1) {
          clearInterval(t)
          setTimeout(() => setDone(true), 600)
          return s
        }
        return s + 1
      })
    }, 900)
    return () => clearInterval(t)
  }, [])

  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.container}>
        {/* Brain animation placeholder */}
        <View style={styles.brainCircle}>
          <Ionicons name="hardware-chip" size={56} color={C.primary} />
          <View style={styles.pulseRing} />
        </View>

        <Text style={styles.title}>{done ? 'All Done!' : 'Organizing Your Information'}</Text>
        <Text style={styles.subtitle}>
          {done
            ? 'Your health summary is ready for your doctor.'
            : 'Our AI is carefully reviewing everything you shared...'}
        </Text>

        {/* Step checklist */}
        <View style={styles.checklist}>
          {STEPS.map((s, i) => {
            const isActive = i === step && !done
            const isDone = done || i < step
            return (
              <View key={i} style={styles.checkItem}>
                <View style={[styles.checkCircle, isDone && styles.checkCircleDone, isActive && styles.checkCircleActive]}>
                  {isDone
                    ? <Ionicons name="checkmark" size={14} color={C.white} />
                    : isActive
                      ? <Ionicons name="ellipsis-horizontal" size={12} color={C.primary} />
                      : <View style={styles.checkDot} />
                  }
                </View>
                <Ionicons name={s.icon as any} size={16} color={isDone ? C.green : isActive ? C.primary : C.textGray} />
                <Text style={[styles.checkLabel, isDone && styles.checkLabelDone, isActive && styles.checkLabelActive]}>
                  {s.label}
                </Text>
              </View>
            )
          })}
        </View>

        {done && (
          <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 32 }]} onPress={() => router.push('/timeline')}>
            <Text style={S.btnText}>View Your Health Summary</Text>
            <Ionicons name="arrow-forward" size={18} color={C.white} />
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
