// Screen 9: Submitted — wording and colour follow the Safety Engine result
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, S, TRIAGE } from '../constants/theme'
import { useIntake } from '../lib/intake'

export default function AllGood() {
  const router = useRouter()
  const { result } = useIntake()
  const level = result?.triage_level ?? 'GREEN'
  const t = TRIAGE[level]
  const red = level === 'RED'
  const submitted = result ? new Date(result.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.container}>
        <View style={[styles.outerRing, { backgroundColor: t.bg }]}>
          <View style={[styles.innerRing, { backgroundColor: red ? '#FFCDD2' : '#C8E6C9' }]}>
            <View style={[styles.shieldCircle, { backgroundColor: red ? t.color : C.green }]}>
              <Ionicons name={red ? 'alert' : 'shield-checkmark'} size={52} color={C.white} />
            </View>
          </View>
        </View>

        <Text style={styles.title}>{red ? 'Please Tell Staff Now' : 'Information Submitted!'}</Text>
        <Text style={[styles.subtitle, red && { color: t.text, fontWeight: '600' }]}>
          {result?.guidance ?? 'Your health information has been sent to your doctor.'}
        </Text>

        <View style={styles.cards}>
          <View style={styles.infoCard}>
            <Ionicons name="document-text-outline" size={20} color={C.primary} />
            <View>
              <Text style={styles.infoTitle}>Case ID</Text>
              <Text style={styles.infoValue}>#{result ? result.id.slice(0, 8).toUpperCase() : '—'}</Text>
            </View>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="time-outline" size={20} color={C.primary} />
            <View>
              <Text style={styles.infoTitle}>Submitted</Text>
              <Text style={styles.infoValue}>{submitted}</Text>
            </View>
          </View>
        </View>

        <View style={[styles.triageBadge, { backgroundColor: t.bg, borderColor: t.color }]}>
          <View style={[styles.triageDot, { backgroundColor: t.color }]} />
          <Text style={[styles.triageText, { color: t.text }]}>Priority: {level} · {t.label}</Text>
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 20 }]} onPress={() => router.push('/complete')}>
          <Text style={S.btnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  outerRing: { width: 180, height: 180, borderRadius: 90, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  innerRing: { width: 144, height: 144, borderRadius: 72, alignItems: 'center', justifyContent: 'center' },
  shieldCircle: { width: 108, height: 108, borderRadius: 54, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: C.textGray, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  cards: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 },
  infoCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  infoTitle: { fontSize: 11, color: C.textGray },
  infoValue: { fontSize: 14, fontWeight: '700', color: C.textDark },
  triageBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1 },
  triageDot: { width: 8, height: 8, borderRadius: 4 },
  triageText: { fontSize: 13, fontWeight: '600' },
})
