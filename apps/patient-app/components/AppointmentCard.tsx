// Appointment card. Urgent (RED) appointments are visually distinct, never a normal card.
import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { APPOINTMENT_STATUS, C, TRIAGE } from '../constants/theme'
import type { Appointment, Level } from '../lib/api'
import { when } from '../lib/format'

const HEADLINE: Record<Level, string> = {
  RED: 'URGENT APPOINTMENT',
  YELLOW: 'Priority appointment',
  GREEN: 'Routine appointment',
}

export function TriageChip({ level }: { level: Level }) {
  const t = TRIAGE[level]
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.color }]}>
      <View style={[styles.dot, { backgroundColor: t.color }]} />
      <Text style={[styles.chipText, { color: t.text }]}>{level} · {t.label}</Text>
    </View>
  )
}

export default function AppointmentCard({ a, caseCode, compact = false }: { a: Appointment; caseCode?: string; compact?: boolean }) {
  const t = TRIAGE[a.triage_level]
  const red = a.triage_level === 'RED'
  const cancelled = a.status === 'cancelled'
  return (
    <View style={[styles.card, red && !cancelled ? { backgroundColor: t.color, borderColor: t.color } : { borderColor: t.color }, cancelled && styles.cancelled]}>
      <View style={styles.headRow}>
        <Ionicons name={red ? 'alert-circle' : 'calendar'} size={18} color={red && !cancelled ? C.white : t.color} />
        <Text style={[styles.headline, { color: red && !cancelled ? C.white : t.text }]}>{HEADLINE[a.triage_level]}</Text>
        <View style={[styles.status, red && !cancelled && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
          <Text style={[styles.statusText, red && !cancelled && { color: C.white }]}>{APPOINTMENT_STATUS[a.status] ?? a.status}</Text>
        </View>
      </View>
      <Text style={[styles.time, red && !cancelled && { color: C.white }]}>{when(a.scheduled_at)}</Text>
      {red && !cancelled && <Text style={styles.redSub}>Earliest available consultation</Text>}
      {!compact && (
        <View style={styles.rows}>
          <Row icon="person-outline" label="Doctor" value={a.doctor ? `${a.doctor.name}${a.doctor.specialization ? ` · ${a.doctor.specialization}` : ''}` : '—'} light={red && !cancelled} />
          {a.distance_km != null && <Row icon="navigate-outline" label="Distance" value={`${a.distance_km} km`} light={red && !cancelled} />}
          <Row icon="flag-outline" label="Priority" value={`${a.priority} · ${a.priority_label}`} light={red && !cancelled} />
          {caseCode && <Row icon="document-text-outline" label="Case ID" value={caseCode} light={red && !cancelled} />}
        </View>
      )}
      {compact && a.doctor && <Text style={[styles.compactDoctor, red && !cancelled && { color: C.white }]}>{a.doctor.name}{a.distance_km != null ? ` · ${a.distance_km} km` : ''}</Text>}
    </View>
  )
}

function Row({ icon, label, value, light }: { icon: string; label: string; value: string; light: boolean }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon as any} size={15} color={light ? 'rgba(255,255,255,0.85)' : C.textGray} />
      <Text style={[styles.rowLabel, light && { color: 'rgba(255,255,255,0.85)' }]}>{label}</Text>
      <Text style={[styles.rowValue, light && { color: C.white }]} numberOfLines={2}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 6 },
  cancelled: { opacity: 0.55 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headline: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  status: { backgroundColor: C.primaryBg, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700', color: C.primary },
  time: { fontSize: 22, fontWeight: '800', color: C.textDark, marginTop: 2 },
  redSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  rows: { marginTop: 6, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { width: 64, fontSize: 12, color: C.textGray },
  rowValue: { flex: 1, fontSize: 13, fontWeight: '600', color: C.textDark },
  compactDoctor: { fontSize: 13, color: C.textMid, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 3 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipText: { fontSize: 11, fontWeight: '800' },
})
