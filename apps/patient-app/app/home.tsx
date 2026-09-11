// Patient Home: persistent ID + QR, appointments, previous cases, documents, profile.
// Everything shown here is loaded from the backend (Supabase), so it survives reloads.
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Image, Modal, RefreshControl, ActivityIndicator, Pressable } from 'react-native'
import { Redirect, useFocusEffect, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useCallback, useRef, useState } from 'react'
import AppointmentCard, { TriageChip } from '../components/AppointmentCard'
import { APPOINTMENT_STATUS, C, S } from '../constants/theme'
import { api, Appointment, errorText, PatientCase, UploadedDocument } from '../lib/api'
import { isUpcoming, shortDate, when } from '../lib/format'
import { useIntake } from '../lib/intake'
import { useSession } from '../lib/session'

type Section = 'appointments' | 'cases' | 'documents' | 'profile'

const SEX = { male: 'Male', female: 'Female', other: 'Other' } as const
const DOC_STATUS = { processed: 'Read', partial: 'Text only', empty: 'Unreadable', failed: 'Not read' } as const

export default function Home() {
  const router = useRouter()
  const { ready, session, profile, refreshProfile, signOut } = useSession()
  const { reset, language } = useIntake()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [cases, setCases] = useState<PatientCase[]>([])
  const [docs, setDocs] = useState<UploadedDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const scroll = useRef<ScrollView>(null)
  const offsets = useRef<Partial<Record<Section, number>>>({})

  const load = useCallback(async () => {
    if (!session) return
    setError(null)
    try {
      const [, a, c, d] = await Promise.all([refreshProfile(), api.appointments(session), api.cases(session), api.documents(session)])
      setAppointments(a)
      setCases(c)
      setDocs(d)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }, [session, refreshProfile])

  useFocusEffect(useCallback(() => { load() }, [load]))

  if (ready && !session) return <Redirect href="/" />
  if (!profile) {
    return (
      <SafeAreaView style={[S.screen, styles.center]}>
        {error ? <ErrorBox text={error} onRetry={load} /> : <ActivityIndicator color={C.primary} />}
      </SafeAreaView>
    )
  }

  const upcoming = appointments.filter(isUpcoming).sort((x, y) => x.scheduled_at.localeCompare(y.scheduled_at))
  const next = upcoming[0]
  const past = appointments.filter(a => !isUpcoming(a))
  const caseCodeOf = (a: Appointment) => cases.find(c => c.id === a.case_id)?.case_code

  const startConsultation = () => {
    reset(profile.language || language)
    router.push('/language')
  }
  const jump = (s: Section) => {
    setMenu(false)
    scroll.current?.scrollTo({ y: Math.max(0, (offsets.current[s] ?? 0) - 12), animated: true })
  }
  const mark = (s: Section) => (e: { nativeEvent: { layout: { y: number } } }) => { offsets.current[s] = e.nativeEvent.layout.y }

  return (
    <SafeAreaView style={S.screen}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setMenu(true)} style={styles.iconBtn} accessibilityLabel="Menu">
          <Ionicons name="menu" size={24} color={C.textDark} />
        </TouchableOpacity>
        <Text style={styles.brand}>Medi<Text style={{ color: C.primaryLight }}>Bridge</Text></Text>
        <TouchableOpacity onPress={() => setQrOpen(true)} style={styles.iconBtn} accessibilityLabel="Show my QR code">
          <Ionicons name="qr-code-outline" size={22} color={C.textDark} />
        </TouchableOpacity>
      </View>

      <ScrollView
        ref={scroll}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Patient card */}
        <View style={styles.idCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.hello}>Hello,</Text>
            <Text style={styles.name} numberOfLines={1}>{profile.name || 'Patient'}</Text>
            <Text style={styles.meta}>
              {[profile.age != null ? `${profile.age} yrs` : null, profile.sex ? SEX[profile.sex] : null].filter(Boolean).join(' · ')}
            </Text>
            <View style={styles.idPill}>
              <Ionicons name="finger-print-outline" size={14} color={C.white} />
              <Text style={styles.idText}>{profile.patient_code}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setQrOpen(true)} style={styles.qrBox} accessibilityLabel="Enlarge QR code">
            {profile.qr ? <Image source={{ uri: profile.qr }} style={styles.qrSmall} /> : <Ionicons name="qr-code" size={56} color={C.primary} />}
            <Text style={styles.qrHint}>Tap to enlarge</Text>
          </TouchableOpacity>
        </View>

        {error && <ErrorBox text={error} onRetry={load} />}

        {/* Current / next appointment */}
        <Text style={styles.sectionTitle}>{next?.status === 'in_progress' ? 'Current appointment' : 'Upcoming appointment'}</Text>
        {loading ? (
          <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />
        ) : next ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => next.case_id && router.push(`/case/${next.case_id}`)}>
            <AppointmentCard a={next} caseCode={caseCodeOf(next)} />
          </TouchableOpacity>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="calendar-clear-outline" size={22} color={C.textGray} />
            <Text style={styles.emptyText}>No upcoming appointment. Start a consultation and we will book the right doctor for you.</Text>
          </View>
        )}

        {/* Start consultation */}
        <TouchableOpacity style={[S.btn, styles.startBtn]} onPress={startConsultation}>
          <Ionicons name="chatbubbles-outline" size={20} color={C.white} />
          <Text style={S.btnText}>Start new consultation</Text>
        </TouchableOpacity>
        <Text style={styles.startSub}>Speak or type in your language · add reports or prescriptions</Text>

        {/* Appointments */}
        <View onLayout={mark('appointments')}>
          <Text style={styles.sectionTitle}>Appointments</Text>
          {upcoming.length > 1 && upcoming.slice(1).map(a => (
            <View key={a.id} style={{ marginBottom: 10 }}><AppointmentCard a={a} compact /></View>
          ))}
          {past.length === 0 && upcoming.length <= 1 && <Text style={styles.muted}>No other appointments yet.</Text>}
          {past.map(a => (
            <TouchableOpacity key={a.id} style={styles.listRow} onPress={() => a.case_id && router.push(`/case/${a.case_id}`)}>
              <Ionicons name={a.status === 'cancelled' ? 'close-circle-outline' : 'checkmark-circle-outline'} size={20} color={C.textGray} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{when(a.scheduled_at)}</Text>
                <Text style={styles.rowSub}>{a.doctor?.name ?? '—'} · {APPOINTMENT_STATUS[a.status] ?? a.status}</Text>
              </View>
              <TriageChip level={a.triage_level} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Previous cases */}
        <View onLayout={mark('cases')}>
          <Text style={styles.sectionTitle}>Previous cases</Text>
          {!loading && cases.length === 0 && <Text style={styles.muted}>Your consultations will appear here.</Text>}
          {cases.map(c => (
            <TouchableOpacity key={c.id} style={styles.caseCard} onPress={() => router.push(`/case/${c.id}`)}>
              <View style={styles.caseTop}>
                <Text style={styles.caseCode}>{c.case_code}</Text>
                <TriageChip level={c.triage_level} />
              </View>
              <Text style={styles.rowSub}>{shortDate(c.created_at)}{c.symptoms.length ? ` · ${c.symptoms.slice(0, 3).join(', ')}` : ''}</Text>
              <Text style={styles.rowSub}>
                {c.appointment
                  ? `${c.appointment.doctor?.name ?? 'Doctor'} · ${when(c.appointment.scheduled_at)} · ${APPOINTMENT_STATUS[c.appointment.status] ?? c.appointment.status}`
                  : 'No appointment booked'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Documents */}
        <View onLayout={mark('documents')}>
          <Text style={styles.sectionTitle}>Documents</Text>
          {!loading && docs.length === 0 && <Text style={styles.muted}>Reports and prescriptions you upload during a consultation appear here.</Text>}
          {docs.map(d => (
            <View key={d.id} style={styles.listRow}>
              <Ionicons name={d.name.toLowerCase().endsWith('.pdf') ? 'document-text-outline' : 'image-outline'} size={20} color={C.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{d.name}</Text>
                <Text style={styles.rowSub}>{d.doc_type ?? 'Document'} · {shortDate(d.created_at)} · {DOC_STATUS[d.status]}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Profile */}
        <View onLayout={mark('profile')}>
          <View style={styles.profileHead}>
            <Text style={styles.sectionTitle}>Profile</Text>
            <TouchableOpacity onPress={() => router.push('/auth?edit=1')}><Text style={styles.link}>Edit</Text></TouchableOpacity>
          </View>
          <View style={[S.card, { padding: 16, gap: 8 }]}>
            <ProfileRow label="Patient ID" value={profile.patient_code} />
            <ProfileRow label="Name" value={profile.name} />
            <ProfileRow label="Phone" value={profile.phone} />
            <ProfileRow label="Age" value={profile.age != null ? String(profile.age) : null} />
            <ProfileRow label="Sex" value={profile.sex ? SEX[profile.sex] : null} />
            <ProfileRow label="Member since" value={shortDate(profile.created_at)} />
          </View>
        </View>
        <Text style={styles.footer}>Urgency is set by a rule-based safety check, not AI. Your doctor makes the final decision.</Text>
      </ScrollView>

      {/* Menu */}
      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenu(false)}>
          <Pressable style={styles.drawer} onPress={() => {}}>
            <Text style={styles.drawerName}>{profile.name}</Text>
            <Text style={styles.drawerId}>{profile.patient_code}</Text>
            <MenuItem icon="home-outline" label="Home" onPress={() => { setMenu(false); scroll.current?.scrollTo({ y: 0, animated: true }) }} />
            <MenuItem icon="chatbubbles-outline" label="Start consultation" onPress={() => { setMenu(false); startConsultation() }} />
            <MenuItem icon="calendar-outline" label="Appointments" onPress={() => jump('appointments')} />
            <MenuItem icon="time-outline" label="Previous cases" onPress={() => jump('cases')} />
            <MenuItem icon="folder-open-outline" label="Documents" onPress={() => jump('documents')} />
            <MenuItem icon="person-outline" label="Profile" onPress={() => jump('profile')} />
            <MenuItem icon="qr-code-outline" label="My QR code" onPress={() => { setMenu(false); setQrOpen(true) }} />
            <View style={styles.drawerDivider} />
            <MenuItem icon="log-out-outline" label="Remove patient from this device" danger onPress={async () => { setMenu(false); await signOut(); router.replace('/') }} />
            <Text style={styles.drawerNote}>Your records stay safe on the server. On this device you would need to register again.</Text>
          </Pressable>
        </Pressable>
      </Modal>

      {/* QR */}
      <Modal visible={qrOpen} transparent animationType="fade" onRequestClose={() => setQrOpen(false)}>
        <Pressable style={[styles.backdrop, styles.center]} onPress={() => setQrOpen(false)}>
          <View style={styles.qrModal}>
            <Text style={styles.qrTitle}>My Patient ID</Text>
            {profile.qr ? <Image source={{ uri: profile.qr }} style={styles.qrLarge} /> : <Ionicons name="qr-code" size={160} color={C.primary} />}
            <Text style={styles.qrCode}>{profile.patient_code}</Text>
            <Text style={styles.qrNote}>Show this at reception. It contains only your patient ID, no medical information.</Text>
            <TouchableOpacity style={[S.btn, { alignSelf: 'stretch', marginTop: 8 }]} onPress={() => setQrOpen(false)}>
              <Text style={S.btnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  )
}

function ErrorBox({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={styles.errorBox}>
      <Ionicons name="cloud-offline-outline" size={18} color="#C62828" />
      <Text style={styles.errorText}>{text}</Text>
      <TouchableOpacity onPress={onRetry}><Text style={styles.link}>Retry</Text></TouchableOpacity>
    </View>
  )
}

function MenuItem({ icon, label, onPress, danger }: { icon: string; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress}>
      <Ionicons name={icon as any} size={20} color={danger ? '#C62828' : C.textDark} />
      <Text style={[styles.menuLabel, danger && { color: '#C62828' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

function ProfileRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={{ width: 110, fontSize: 13, color: C.textGray }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: C.textDark }}>{value || '—'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  iconBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 18, fontWeight: '800', color: C.textDark },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  idCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.primary, borderRadius: 22, padding: 18, marginTop: 4 },
  hello: { color: 'rgba(255,255,255,0.8)', fontSize: 13 },
  name: { color: C.white, fontSize: 22, fontWeight: '800' },
  meta: { color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 2 },
  idPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, marginTop: 10 },
  idText: { color: C.white, fontWeight: '800', letterSpacing: 1, fontSize: 13 },
  qrBox: { backgroundColor: C.white, borderRadius: 14, padding: 6, alignItems: 'center' },
  qrSmall: { width: 84, height: 84 },
  qrHint: { fontSize: 9, color: C.textGray, marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: C.textDark, marginTop: 22, marginBottom: 10 },
  empty: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: C.white, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  emptyText: { flex: 1, color: C.textGray, fontSize: 13, lineHeight: 19 },
  startBtn: { marginTop: 18 },
  startSub: { textAlign: 'center', color: C.textGray, fontSize: 12, marginTop: 8 },
  muted: { color: C.textGray, fontSize: 13 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: C.textDark },
  rowSub: { fontSize: 12, color: C.textGray, marginTop: 2 },
  caseCard: { backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border, marginBottom: 8 },
  caseTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  caseCode: { fontSize: 14, fontWeight: '800', color: C.textDark, letterSpacing: 0.5 },
  profileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  link: { color: C.primary, fontWeight: '700', fontSize: 14 },
  footer: { textAlign: 'center', color: C.textGray, fontSize: 11, marginTop: 24, lineHeight: 16 },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFEBEE', borderRadius: 14, padding: 12, marginTop: 14 },
  errorText: { flex: 1, color: '#B71C1C', fontSize: 12, lineHeight: 17 },
  backdrop: { flex: 1, backgroundColor: 'rgba(13,27,62,0.45)' },
  drawer: { width: '80%', maxWidth: 340, height: '100%', backgroundColor: C.white, paddingTop: 48, paddingHorizontal: 20 },
  drawerName: { fontSize: 20, fontWeight: '800', color: C.textDark },
  drawerId: { fontSize: 13, color: C.primary, fontWeight: '700', marginBottom: 18, letterSpacing: 1 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  menuLabel: { fontSize: 15, fontWeight: '600', color: C.textDark },
  drawerDivider: { height: 1, backgroundColor: C.border, marginVertical: 8 },
  drawerNote: { fontSize: 11, color: C.textGray, lineHeight: 16 },
  qrModal: { backgroundColor: C.white, borderRadius: 24, padding: 24, alignItems: 'center', gap: 10, width: '100%', maxWidth: 340 },
  qrTitle: { fontSize: 18, fontWeight: '800', color: C.textDark },
  qrLarge: { width: 220, height: 220 },
  qrCode: { fontSize: 20, fontWeight: '800', color: C.primary, letterSpacing: 2 },
  qrNote: { fontSize: 12, color: C.textGray, textAlign: 'center', lineHeight: 17 },
})
