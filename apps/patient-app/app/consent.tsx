// Screen 4: Consent
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { C, S } from '../constants/theme'

const POINTS = [
  { icon: 'lock-closed-outline', title: 'Your data is encrypted', sub: 'All health info is stored securely and never shared without permission.' },
  { icon: 'eye-off-outline', title: 'Private by default', sub: 'Only you and your treating doctor can view your information.' },
  { icon: 'close-circle-outline', title: 'You can withdraw anytime', sub: 'Delete your data or opt out at any point, no questions asked.' },
  { icon: 'document-text-outline', title: 'Used for care only', sub: 'Your information will only be used to assist your medical consultation.' },
]

export default function Consent() {
  const router = useRouter()
  const [agreed, setAgreed] = useState(false)

  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Back */}
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.textDark} />
        </TouchableOpacity>

        <View style={styles.stepBadge}><Text style={styles.stepText}>3 of 8</Text></View>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '37.5%' }]} /></View>

        {/* Shield icon */}
        <View style={styles.shieldWrap}>
          <View style={styles.shieldCircle}>
            <Ionicons name="shield-checkmark" size={40} color={C.primary} />
          </View>
        </View>
        <Text style={styles.title}>Your Consent Matters</Text>
        <Text style={styles.subtitle}>Before we proceed, please understand how we use your information</Text>

        {/* Points */}
        <View style={styles.points}>
          {POINTS.map((p, i) => (
            <View key={i} style={styles.pointCard}>
              <View style={styles.pointIcon}>
                <Ionicons name={p.icon as any} size={20} color={C.primary} />
              </View>
              <View style={styles.pointText}>
                <Text style={styles.pointTitle}>{p.title}</Text>
                <Text style={styles.pointSub}>{p.sub}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Agree checkbox */}
        <TouchableOpacity style={styles.checkRow} onPress={() => setAgreed(!agreed)}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed && <Ionicons name="checkmark" size={14} color={C.white} />}
          </View>
          <Text style={styles.checkLabel}>I understand and agree to share my health information for this consultation</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.btn, { width: '100%', marginTop: 20, opacity: agreed ? 1 : 0.5 }]}
          onPress={() => agreed && router.push('/chat')}
          disabled={!agreed}
        >
          <Text style={S.btnText}>I Agree & Continue</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  back: { marginBottom: 16 },
  stepBadge: { alignSelf: 'flex-start', backgroundColor: C.primaryBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  stepText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  progressBar: { height: 6, backgroundColor: C.border, borderRadius: 3, marginBottom: 28 },
  progressFill: { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  shieldWrap: { alignItems: 'center', marginBottom: 16 },
  shieldCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.textGray, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  points: { gap: 12, marginBottom: 24 },
  pointCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, backgroundColor: C.white, borderRadius: 16, padding: 16, ...S.card },
  pointIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  pointText: { flex: 1 },
  pointTitle: { fontSize: 14, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  pointSub: { fontSize: 13, color: C.textGray, lineHeight: 18 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: C.primary, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkboxChecked: { backgroundColor: C.primary },
  checkLabel: { flex: 1, fontSize: 13, color: C.textMid, lineHeight: 20 },
})
