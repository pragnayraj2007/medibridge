// Result: triage (Safety Engine) + the appointment the backend booked. RED looks urgent.
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import AppointmentCard from '../components/AppointmentCard'
import { C, S, TRIAGE } from '../constants/theme'
import { api, errorText } from '../lib/api'
import { clock, dateLabel } from '../lib/format'
import { useIntake } from '../lib/intake'
import { useSession } from '../lib/session'

const TITLE = { RED: 'Urgent: Please Act Now', YELLOW: 'Priority Appointment Booked', GREEN: 'Appointment Booked' }
const NO_APPOINTMENT: Record<string, string> = {
  no_doctor_available: 'No doctor is available to take a new patient right now, so no appointment was booked. The clinic team can see your case.',
  slot_conflict: 'The slot we found was taken at the same moment and no other slot could be secured. Please try again.',
  booking_failed: 'Your case was saved, but the appointment could not be booked because of a server problem.',
}

// Routine (GREEN) patients may pick a later time; urgent cases stay on the earliest slot.
function laterOptions(): { label: string; at: Date }[] {
  const t = new Date()
  const at = (days: number, h: number) => new Date(t.getFullYear(), t.getMonth(), t.getDate() + days, h, 0)
  return [at(1, 10), at(1, 17), at(2, 10)].map(d => ({ label: `${dateLabel(d)} ${clock(d)}`, at: d }))
}

export default function Complete() {
  const router = useRouter()
  const { session } = useSession()
  const { result, update } = useIntake()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  if (!result) {
    return (
      <SafeAreaView style={[S.screen, styles.center]}>
        <Text style={styles.title}>No consultation yet</Text>
        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 20 }]} onPress={() => router.replace('/home')}>
          <Text style={S.btnText}>Back to Home</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const level = result.triage_level
  const t = TRIAGE[level]
  const red = level === 'RED'
  const a = result.appointment

  const rebook = async (at: Date) => {
    if (!session) return
    setBusy(true)
    setNote(null)
    try {
      const moved = await api.rebook(session, result.id, at)
      update({ result: { ...result, appointment: moved } })
      setNote('Your appointment time was changed.')
    } catch (e) {
      setNote(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <SafeAreaView style={[S.screen, red && { backgroundColor: '#FFF5F5' }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.badge, { backgroundColor: red ? t.color : t.bg }]}>
          <Ionicons name={red ? 'alert' : a ? 'calendar-outline' : 'information-circle-outline'} size={44} color={red ? C.white : t.color} />
        </View>
        <Text style={[styles.title, red && { color: t.text }]}>{TITLE[level]}</Text>

        {/* Safety Engine guidance */}
        <View style={[styles.guidance, { backgroundColor: t.bg, borderColor: t.color }]}>
          <Text style={[styles.guidanceLevel, { color: t.text }]}>{level} · {t.label}</Text>
          <Text style={[styles.guidanceText, { color: red ? t.text : C.textMid }]}>{result.guidance}</Text>
          {result.triage.reasons.length > 0 && (
            <Text style={styles.reasons}>Flagged for medical review: {result.triage.reasons.map(r => r.label).join('; ')}</Text>
          )}
        </View>

        {/* Appointment */}
        {a ? (
          <>
            <Text style={styles.section}>{red ? 'Urgent appointment confirmed' : 'Your appointment'}</Text>
            <AppointmentCard a={a} caseCode={result.case_code} />
            <Text style={styles.why}>
              {red
                ? 'Chosen because it is the earliest consultation available among doctors who are free now.'
                : level === 'YELLOW'
                  ? 'Booked ahead of routine appointments, with the earliest suitable doctor near you.'
                  : 'A routine slot with the nearest available doctor. You can choose a later time below.'}
            </Text>
            {level === 'GREEN' && (
              <View style={styles.rebook}>
                <Text style={styles.rebookTitle}>Prefer a different time?</Text>
                <View style={styles.rebookRow}>
                  {laterOptions().map(o => (
                    <TouchableOpacity key={o.label} style={styles.rebookBtn} onPress={() => rebook(o.at)} disabled={busy}>
                      <Text style={styles.rebookText}>{o.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {busy && <ActivityIndicator color={C.primary} />}
              </View>
            )}
            {note && <Text style={styles.note}>{note}</Text>}
          </>
        ) : (
          <View style={styles.noAppt}>
            <Ionicons name="alert-circle-outline" size={20} color="#EF6C00" />
            <Text style={styles.noApptText}>
              {NO_APPOINTMENT[result.appointment_error ?? ''] ?? 'No appointment was booked.'} Case ID: {result.case_code}.
              {red ? ' Because your answers need urgent attention, please go to the nearest emergency department or call 108 / 112 now.' : ''}
            </Text>
          </View>
        )}

        <View style={styles.summary}>
          <Row icon="document-text-outline" label="Case ID" value={result.case_code} />
          <Row icon="chatbubbles-outline" label="Answers given" value={String(result.messages.filter(m => m.role === 'patient').length)} />
          <Row icon="mic-outline" label="Voice answers" value={String(result.messages.filter(m => m.via === 'voice').length)} />
          <Row icon="folder-open-outline" label="Documents" value={String(result.documents.length)} />
        </View>

        <Text style={styles.footnote}>
          Urgency comes from a rule-based safety check, not AI. Your information has been shared with the doctor, who makes the final clinical decision.
        </Text>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 16 }]} onPress={() => router.replace('/home')}>
          <Ionicons name="home-outline" size={18} color={C.white} />
          <Text style={S.btnText}>Back to Home</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function Row({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon as any} size={16} color={C.primary} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  scroll: { paddingHorizontal: 22, paddingTop: 28, paddingBottom: 32 },
  badge: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 },
  title: { fontSize: 24, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 16 },
  guidance: { borderRadius: 16, borderWidth: 1.5, padding: 14, gap: 6 },
  guidanceLevel: { fontSize: 13, fontWeight: '800' },
  guidanceText: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  reasons: { fontSize: 12, color: C.textMid, lineHeight: 17 },
  section: { fontSize: 15, fontWeight: '800', color: C.textDark, marginTop: 20, marginBottom: 10 },
  why: { fontSize: 12, color: C.textGray, marginTop: 8, lineHeight: 17 },
  rebook: { marginTop: 14, backgroundColor: C.white, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: C.border },
  rebookTitle: { fontSize: 13, fontWeight: '700', color: C.textDark },
  rebookRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rebookBtn: { borderWidth: 1.5, borderColor: C.primary, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7 },
  rebookText: { color: C.primary, fontSize: 12, fontWeight: '700' },
  note: { fontSize: 12, color: C.textMid, marginTop: 8 },
  noAppt: { flexDirection: 'row', gap: 10, marginTop: 20, backgroundColor: '#FFF3E0', borderRadius: 14, padding: 14 },
  noApptText: { flex: 1, fontSize: 13, color: '#8D4A00', lineHeight: 19 },
  summary: { backgroundColor: C.white, borderRadius: 16, padding: 16, gap: 10, marginTop: 20, borderWidth: 1, borderColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowLabel: { flex: 1, fontSize: 13, color: C.textGray },
  rowValue: { fontSize: 13, fontWeight: '700', color: C.textDark },
  footnote: { fontSize: 11, color: C.textGray, textAlign: 'center', marginTop: 18, lineHeight: 16 },
})
