// Screen 10: You're All Set
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, S } from '../constants/theme'
import { useIntake } from '../lib/intake'

export default function Complete() {
  const router = useRouter()
  const { result, reset } = useIntake()

  const answers = result?.messages.filter(m => m.role === 'patient').length ?? 0
  const docs = result?.documents.length ?? 0
  const findings = result?.triage.reasons.length ?? 0
  const items = [
    { icon: 'chatbubbles-outline', label: 'Answers given', value: String(answers) },
    { icon: 'document-text-outline', label: 'Documents uploaded', value: String(docs) },
    { icon: 'medkit-outline', label: 'Safety findings', value: findings ? String(findings) : 'None' },
    { icon: 'shield-checkmark-outline', label: 'Safety check', value: result ? 'Done' : '—' },
  ]

  const home = () => {
    reset()
    router.replace('/')
  }

  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.starWrap}>
          <View style={styles.starOuter}>
            <View style={styles.starInner}>
              <Ionicons name="star" size={48} color={C.white} />
            </View>
          </View>
          {[...Array(6)].map((_, i) => (
            <View key={i} style={[styles.confettiDot, { top: 10 + Math.sin(i) * 40, left: 40 + i * 24, backgroundColor: i % 2 === 0 ? C.primary : C.green }]} />
          ))}
        </View>

        <Text style={styles.title}>You're All Set! 🎉</Text>
        <Text style={styles.subtitle}>
          Thank you for completing your health intake. Your doctor will have your summary before your visit.
        </Text>

        <View style={[S.card, styles.summaryCard]}>
          <Text style={styles.summaryTitle}>What We Collected</Text>
          {items.map(item => (
            <View key={item.label} style={styles.summaryRow}>
              <View style={styles.summaryIcon}>
                <Ionicons name={item.icon as any} size={16} color={C.primary} />
              </View>
              <Text style={styles.summaryLabel}>{item.label}</Text>
              <Text style={styles.summaryValue}>{item.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.nextBox}>
          <Text style={styles.nextTitle}>What happens next?</Text>
          <View style={styles.nextStep}>
            <View style={[styles.nextNum, { backgroundColor: C.primary }]}><Text style={styles.nextNumText}>1</Text></View>
            <Text style={styles.nextText}>Your doctor reviews your summary</Text>
          </View>
          <View style={styles.nextStep}>
            <View style={[styles.nextNum, { backgroundColor: C.green }]}><Text style={styles.nextNumText}>2</Text></View>
            <Text style={styles.nextText}>You're called in for your consultation</Text>
          </View>
          <View style={styles.nextStep}>
            <View style={[styles.nextNum, { backgroundColor: '#8E24AA' }]}><Text style={styles.nextNumText}>3</Text></View>
            <Text style={styles.nextText}>Tell staff straight away if you feel worse while waiting</Text>
          </View>
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 20 }]} onPress={home}>
          <Ionicons name="home-outline" size={18} color={C.white} />
          <Text style={S.btnText}>Back to Home</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>MediBridge · Your Health, Our Bridge</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, alignItems: 'center' },
  starWrap: { width: 160, height: 160, alignItems: 'center', justifyContent: 'center', marginBottom: 24, position: 'relative' },
  starOuter: { width: 140, height: 140, borderRadius: 70, backgroundColor: '#FFF9C4', alignItems: 'center', justifyContent: 'center' },
  starInner: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#FDD835', alignItems: 'center', justifyContent: 'center' },
  confettiDot: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  title: { fontSize: 28, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 12 },
  subtitle: { fontSize: 15, color: C.textGray, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  summaryCard: { width: '100%', marginBottom: 16, gap: 12 },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryIcon: { width: 30, height: 30, borderRadius: 8, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  summaryLabel: { flex: 1, fontSize: 13, color: C.textGray },
  summaryValue: { fontSize: 13, fontWeight: '700', color: C.textDark },
  nextBox: { backgroundColor: C.white, borderRadius: 16, padding: 16, width: '100%', borderWidth: 1, borderColor: C.border, gap: 14 },
  nextTitle: { fontSize: 14, fontWeight: '700', color: C.textDark },
  nextStep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  nextNumText: { color: C.white, fontSize: 12, fontWeight: '700' },
  nextText: { flex: 1, fontSize: 13, color: C.textMid },
  footer: { marginTop: 24, fontSize: 12, color: C.textGray },
})
