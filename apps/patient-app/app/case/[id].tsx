// A previous consultation, patient view: what they told us, the safety result and the
// appointment. The doctor-facing AI summary and fused clinical context are not shown here.
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import AppointmentCard, { TriageChip } from '../../components/AppointmentCard'
import { C, S } from '../../constants/theme'
import { api, errorText, PatientCase } from '../../lib/api'
import { shortDate } from '../../lib/format'
import { useSession } from '../../lib/session'

export default function CaseDetail() {
  const router = useRouter()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { session } = useSession()
  const [c, setCase] = useState<PatientCase | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!session || !id) return
    api.caseDetail(session, id).then(setCase).catch(e => setError(errorText(e)))
  }, [session, id])

  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/home'))} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={C.textDark} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>{c?.case_code ?? 'Consultation'}</Text>
        <View style={{ width: 22 }} />
      </View>
      {!c ? (
        <View style={styles.center}>{error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={C.primary} />}</View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headRow}>
            <Text style={styles.date}>{shortDate(c.created_at)}</Text>
            <TriageChip level={c.triage_level} />
          </View>
          {c.appointment ? <AppointmentCard a={c.appointment} caseCode={c.case_code} /> : <Text style={styles.muted}>No appointment was booked for this consultation.</Text>}

          <Text style={styles.section}>Safety check</Text>
          <View style={[S.card, styles.card]}>
            <Text style={styles.body}>{c.guidance}</Text>
            {c.reasons.length > 0 && <Text style={styles.small}>Flagged for medical review: {c.reasons.join('; ')}</Text>}
          </View>

          {c.symptoms.length > 0 && (
            <>
              <Text style={styles.section}>Symptoms noted</Text>
              <View style={styles.chips}>{c.symptoms.map(s => <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>)}</View>
            </>
          )}

          <Text style={styles.section}>What you told us</Text>
          <View style={[S.card, styles.card]}>
            {c.your_answers.map((t, i) => <Text key={i} style={styles.body}>• {t}</Text>)}
          </View>

          {c.documents.length > 0 && (
            <>
              <Text style={styles.section}>Documents</Text>
              <View style={[S.card, styles.card]}>{c.documents.map((d, i) => <Text key={i} style={styles.body}>• {d}</Text>)}</View>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  topTitle: { fontSize: 16, fontWeight: '800', color: C.textDark, letterSpacing: 0.5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  error: { color: '#B71C1C', textAlign: 'center' },
  scroll: { paddingHorizontal: 20, paddingBottom: 32, gap: 4 },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  date: { fontSize: 14, color: C.textGray, fontWeight: '600' },
  muted: { color: C.textGray, fontSize: 13 },
  section: { fontSize: 15, fontWeight: '800', color: C.textDark, marginTop: 18, marginBottom: 8 },
  card: { padding: 14, gap: 6 },
  body: { fontSize: 14, color: C.textMid, lineHeight: 20 },
  small: { fontSize: 12, color: C.textGray, lineHeight: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { backgroundColor: C.white, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  chipText: { fontSize: 13, color: C.textDark },
})
