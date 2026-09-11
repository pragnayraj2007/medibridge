// Screen 9: All Good (green shield)
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, S } from '../constants/theme'

export default function AllGood() {
  const router = useRouter()
  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.container}>
        {/* Shield animation placeholder */}
        <View style={styles.outerRing}>
          <View style={styles.innerRing}>
            <View style={styles.shieldCircle}>
              <Ionicons name="shield-checkmark" size={52} color={C.white} />
            </View>
          </View>
        </View>

        <Text style={styles.title}>Information Submitted!</Text>
        <Text style={styles.subtitle}>
          Your health information has been securely sent to your doctor. They'll review it before your appointment.
        </Text>

        {/* Info cards */}
        <View style={styles.cards}>
          <View style={styles.infoCard}>
            <Ionicons name="time-outline" size={20} color={C.primary} />
            <View>
              <Text style={styles.infoTitle}>Estimated Wait</Text>
              <Text style={styles.infoValue}>~15 minutes</Text>
            </View>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="location-outline" size={20} color={C.primary} />
            <View>
              <Text style={styles.infoTitle}>Queue Position</Text>
              <Text style={styles.infoValue}>#3 in line</Text>
            </View>
          </View>
        </View>

        {/* Triage */}
        <View style={styles.triageBadge}>
          <View style={styles.triageDot} />
          <Text style={styles.triageText}>Priority: YELLOW · Moderate</Text>
          <Ionicons name="information-circle-outline" size={16} color={C.textGray} />
        </View>

        <Text style={styles.note}>
          💡 You can relax. The doctor has everything they need. We'll notify you when it's your turn.
        </Text>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 20 }]} onPress={() => router.push('/complete')}>
          <Text style={S.btnText}>See Full Summary</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.homeBtn}>
          <Ionicons name="home-outline" size={16} color={C.textGray} />
          <Text style={styles.homeBtnText}>Return to Home</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  outerRing: { width: 180, height: 180, borderRadius: 90, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  innerRing: { width: 144, height: 144, borderRadius: 72, backgroundColor: '#C8E6C9', alignItems: 'center', justifyContent: 'center' },
  shieldCircle: { width: 108, height: 108, borderRadius: 54, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: C.textGray, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
  cards: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 20 },
  infoCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: C.border },
  infoTitle: { fontSize: 11, color: C.textGray },
  infoValue: { fontSize: 14, fontWeight: '700', color: C.textDark },
  triageBadge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFDE7', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#F9A825', marginBottom: 20 },
  triageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F9A825' },
  triageText: { fontSize: 13, fontWeight: '600', color: '#F57F17' },
  note: { fontSize: 13, color: C.textGray, textAlign: 'center', lineHeight: 20, backgroundColor: C.primaryBg, borderRadius: 12, padding: 14 },
  homeBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 16 },
  homeBtnText: { color: C.textGray, fontSize: 14 },
})
