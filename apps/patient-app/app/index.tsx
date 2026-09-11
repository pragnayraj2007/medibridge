// Screen 1: Welcome
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, S } from '../constants/theme'
import { useIntake } from '../lib/intake'

export default function Welcome() {
  const router = useRouter()
  const { reset } = useIntake()
  // Always start a clean intake, even if a previous demo run was abandoned midway
  const start = () => {
    reset()
    router.push('/language')
  }
  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.container}>
        {/* Logo */}
        <View style={styles.logoRow}>
          <View style={styles.logoIcon}>
            <Ionicons name="heart" size={22} color={C.white} />
          </View>
          <View>
            <Text style={styles.logoText}>Medi<Text style={{ color: C.primaryLight }}>Bridge</Text></Text>
            <Text style={styles.logoSub}>Your Health, Our Bridge</Text>
          </View>
        </View>

        {/* Illustration placeholder */}
        <View style={styles.illustration}>
          <Ionicons name="hand-left" size={80} color={C.primaryLight} />
          <View style={styles.heartBadge}>
            <Ionicons name="heart" size={20} color={C.white} />
          </View>
        </View>

        {/* Text */}
        <Text style={styles.title}>Welcome</Text>
        <Text style={styles.subtitle}>
          Your health story matters. We'll help collect your information before you meet your doctor.
        </Text>

        {/* Buttons */}
        <TouchableOpacity style={[S.btn, styles.btnPrimary]} onPress={start}>
          <Text style={S.btnText}>Get Started</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.btnSecondary} onPress={start}>
          <Ionicons name="mic-outline" size={18} color={C.primary} />
          <Text style={styles.btnSecondaryText}>Talk to us</Text>
        </TouchableOpacity>

        <View style={styles.langNote}>
          <Ionicons name="globe-outline" size={14} color={C.textGray} />
          <Text style={styles.langNoteText}>Available in multiple languages</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoIcon: { width: 38, height: 38, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  logoText: { fontSize: 20, fontWeight: '800', color: C.textDark },
  logoSub: { fontSize: 11, color: C.textGray },
  illustration: { width: 160, height: 160, backgroundColor: C.white, borderRadius: 80, alignItems: 'center', justifyContent: 'center', marginBottom: 28, shadowColor: C.primary, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.12, shadowRadius: 20, elevation: 8 },
  heartBadge: { position: 'absolute', top: 10, right: 10, width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '800', color: C.textDark, marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 15, color: C.textGray, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  btnPrimary: { width: '100%', marginBottom: 14 },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderColor: C.primary, borderRadius: 30, paddingVertical: 13, paddingHorizontal: 32, marginBottom: 20 },
  btnSecondaryText: { color: C.primary, fontSize: 15, fontWeight: '600' },
  langNote: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  langNoteText: { color: C.textGray, fontSize: 13 },
})
