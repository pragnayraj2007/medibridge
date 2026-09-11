// Screen 8: Health Timeline / Summary
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, S } from '../constants/theme'

const TRIAGE = { level: 'YELLOW', label: 'Moderate Priority', color: '#F9A825', bg: '#FFFDE7' }

const SYMPTOMS = ['Chest tightness', 'Shortness of breath', 'Fatigue for 3 days']
const HISTORY = ['Hypertension (controlled)', 'No known allergies']
const TIMELINE = [
  { date: '3 days ago', event: 'Fatigue began, difficulty sleeping' },
  { date: 'Yesterday', event: 'Shortness of breath during activity' },
  { date: 'Today', event: 'Chest tightness, decided to visit doctor' },
]

export default function Timeline() {
  const router = useRouter()
  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={C.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Your Health Summary</Text>
          <View style={{ width: 22 }} />
        </View>

        {/* Progress */}
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '87.5%' }]} /></View>
        <View style={styles.stepBadge}><Text style={styles.stepText}>7 of 8</Text></View>

        {/* Triage badge */}
        <View style={[styles.triageCard, { backgroundColor: TRIAGE.bg, borderColor: TRIAGE.color }]}>
          <View style={[styles.triageDot, { backgroundColor: TRIAGE.color }]} />
          <View>
            <Text style={[styles.triageLevel, { color: TRIAGE.color }]}>{TRIAGE.level}</Text>
            <Text style={styles.triageSub}>{TRIAGE.label} · Doctor review recommended</Text>
          </View>
          <Ionicons name="shield-outline" size={22} color={TRIAGE.color} style={{ marginLeft: 'auto' }} />
        </View>

        {/* Patient card */}
        <View style={[S.card, styles.patientCard]}>
          <View style={styles.patientRow}>
            <View style={styles.avatar}><Ionicons name="person" size={24} color={C.primary} /></View>
            <View>
              <Text style={styles.patientName}>Rahul Sharma</Text>
              <Text style={styles.patientMeta}>Age 34 · Male · #MED-2024-0847</Text>
            </View>
          </View>
        </View>

        {/* Symptoms */}
        <Text style={styles.sectionTitle}>Reported Symptoms</Text>
        <View style={[S.card, styles.section]}>
          {SYMPTOMS.map((s, i) => (
            <View key={i} style={styles.listItem}>
              <View style={styles.bullet} />
              <Text style={styles.listText}>{s}</Text>
            </View>
          ))}
        </View>

        {/* Timeline */}
        <Text style={styles.sectionTitle}>Symptom Timeline</Text>
        <View style={[S.card, styles.section]}>
          {TIMELINE.map((t, i) => (
            <View key={i} style={styles.timelineItem}>
              <View style={styles.timelineLine}>
                <View style={styles.timelineDot} />
                {i < TIMELINE.length - 1 && <View style={styles.timelineVert} />}
              </View>
              <View style={styles.timelineContent}>
                <Text style={styles.timelineDate}>{t.date}</Text>
                <Text style={styles.timelineEvent}>{t.event}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Medical history */}
        <Text style={styles.sectionTitle}>Medical History</Text>
        <View style={[S.card, styles.section]}>
          {HISTORY.map((h, i) => (
            <View key={i} style={styles.listItem}>
              <Ionicons name="medical" size={14} color={C.primary} />
              <Text style={styles.listText}>{h}</Text>
            </View>
          ))}
        </View>

        {/* AI note */}
        <View style={styles.aiNote}>
          <Ionicons name="information-circle-outline" size={16} color={C.primaryLight} />
          <Text style={styles.aiNoteText}>This summary was AI-assisted. Your doctor will review and verify all information.</Text>
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 16 }]} onPress={() => router.push('/allgood')}>
          <Text style={S.btnText}>Confirm & Submit</Text>
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
  triageCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderRadius: 16, padding: 14, marginBottom: 16 },
  triageDot: { width: 10, height: 10, borderRadius: 5 },
  triageLevel: { fontSize: 16, fontWeight: '800' },
  triageSub: { fontSize: 12, color: C.textGray },
  patientCard: { marginBottom: 20 },
  patientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  patientName: { fontSize: 16, fontWeight: '700', color: C.textDark },
  patientMeta: { fontSize: 12, color: C.textGray, marginTop: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: C.textDark, marginBottom: 8, marginTop: 4 },
  section: { marginBottom: 16, gap: 10 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
  listText: { fontSize: 14, color: C.textMid },
  timelineItem: { flexDirection: 'row', gap: 12 },
  timelineLine: { alignItems: 'center', width: 16 },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: C.primary, marginTop: 4 },
  timelineVert: { width: 2, flex: 1, backgroundColor: C.border, marginTop: 4, marginBottom: -4 },
  timelineContent: { flex: 1, paddingBottom: 12 },
  timelineDate: { fontSize: 11, color: C.textGray, fontWeight: '600', marginBottom: 2 },
  timelineEvent: { fontSize: 13, color: C.textMid },
  aiNote: { flexDirection: 'row', gap: 8, backgroundColor: C.primaryBg, borderRadius: 12, padding: 12, alignItems: 'flex-start' },
  aiNoteText: { flex: 1, fontSize: 12, color: C.textGray, lineHeight: 17 },
})
