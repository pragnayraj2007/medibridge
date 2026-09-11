// Screen 8: Health Summary — what was sent to the doctor, with the Safety Engine result
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, S, TRIAGE } from '../constants/theme'
import { useIntake } from '../lib/intake'

export default function Timeline() {
  const router = useRouter()
  const { result } = useIntake()

  if (!result) {
    return (
      <SafeAreaView style={[S.screen, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <Text style={styles.headerTitle}>No summary yet</Text>
        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 20 }]} onPress={() => router.replace('/')}>
          <Text style={S.btnText}>Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const t = TRIAGE[result.triage_level]
  const p = result.patient
  const told = result.messages.filter(m => m.role === 'patient')
  const meta = [p.age != null ? `Age ${p.age}` : null, p.sex ? p.sex[0].toUpperCase() + p.sex.slice(1) : null, p.pregnant ? 'Pregnant' : null]
    .filter(Boolean).join(' · ')

  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topRow}>
          <View style={{ width: 22 }} />
          <Text style={styles.headerTitle}>Your Health Summary</Text>
          <View style={{ width: 22 }} />
        </View>

        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '87.5%' }]} /></View>
        <View style={styles.stepBadge}><Text style={styles.stepText}>7 of 8</Text></View>

        {/* Safety Engine result */}
        <View style={[styles.triageCard, { backgroundColor: t.bg, borderColor: t.color }]}>
          <View style={styles.triageRow}>
            <View style={[styles.triageDot, { backgroundColor: t.color }]} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.triageLevel, { color: t.text }]}>{result.triage_level} · {t.label}</Text>
              <Text style={styles.triageSub}>Safety check result · your doctor makes the final decision</Text>
            </View>
            <Ionicons name="shield-checkmark-outline" size={22} color={t.color} />
          </View>
          {result.triage.reasons.length > 0 && (
            <View style={styles.reasons}>
              {result.triage.reasons.map(r => (
                <Text key={r.rule_id} style={styles.reasonText}>• {r.label}</Text>
              ))}
            </View>
          )}
          <Text style={[styles.guidance, { color: t.text }]}>{result.guidance}</Text>
        </View>

        {/* Patient card */}
        <View style={[S.card, styles.patientCard]}>
          <View style={styles.patientRow}>
            <View style={styles.avatar}><Ionicons name="person" size={24} color={C.primary} /></View>
            <View>
              <Text style={styles.patientName}>{p.name || 'Patient'}</Text>
              <Text style={styles.patientMeta}>{meta ? `${meta} · ` : ''}#{result.id.slice(0, 8).toUpperCase()}</Text>
            </View>
          </View>
        </View>

        {/* What you told us */}
        <Text style={styles.sectionTitle}>What You Told Us</Text>
        <View style={[S.card, styles.section]}>
          {told.map((m, i) => (
            <View key={i} style={styles.listItem}>
              <View style={styles.bullet} />
              <Text style={styles.listText}>{m.text}</Text>
            </View>
          ))}
        </View>

        {/* Symptoms (AI-extracted, when available) */}
        {result.extraction.symptoms.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Symptoms Noted</Text>
            <View style={styles.chips}>
              {result.extraction.symptoms.map(s => (
                <View key={s} style={styles.chip}><Text style={styles.chipText}>{s}</Text></View>
              ))}
            </View>
          </>
        )}

        {/* Summary for doctor */}
        {result.summary && result.extraction.source === 'groq' ? (
          <>
            <Text style={styles.sectionTitle}>Summary For Your Doctor</Text>
            <View style={[S.card, styles.section]}>
              <Text style={styles.listText}>{result.summary}</Text>
            </View>
          </>
        ) : null}

        <View style={styles.aiNote}>
          <Ionicons name="information-circle-outline" size={16} color={C.primaryLight} />
          <Text style={styles.aiNoteText}>This summary was AI-assisted. Your doctor will review and verify all information.</Text>
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 16 }]} onPress={() => router.push('/allgood')}>
          <Text style={S.btnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.textDark },
  progressBar: { height: 6, backgroundColor: C.border, borderRadius: 3, marginBottom: 8 },
  progressFill: { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  stepBadge: { alignSelf: 'flex-start', backgroundColor: C.primaryBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 18 },
  stepText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  triageCard: { borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 16, gap: 10 },
  triageRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  triageDot: { width: 10, height: 10, borderRadius: 5 },
  triageLevel: { fontSize: 16, fontWeight: '800' },
  triageSub: { fontSize: 12, color: C.textGray },
  reasons: { gap: 2 },
  reasonText: { fontSize: 13, color: C.textMid },
  guidance: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  patientCard: { marginBottom: 20 },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  patientName: { fontSize: 16, fontWeight: '700', color: C.textDark },
  patientMeta: { fontSize: 12, color: C.textGray, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.textDark, marginBottom: 8, marginTop: 4 },
  section: { marginBottom: 16, gap: 10 },
  listItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary, marginTop: 7 },
  listText: { flex: 1, fontSize: 14, color: C.textMid, lineHeight: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { backgroundColor: C.white, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  chipText: { fontSize: 13, color: C.textMid },
  aiNote: { flexDirection: 'row', gap: 8, backgroundColor: C.primaryBg, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  aiNoteText: { flex: 1, fontSize: 12, color: C.textGray, lineHeight: 17 },
})
