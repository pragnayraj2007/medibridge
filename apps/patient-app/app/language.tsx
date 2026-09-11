// Consultation step 1: language for the conversation, voice and replies
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { C, LANGUAGES as LANGS, S } from '../constants/theme'
import { useIntake } from '../lib/intake'

export default function Language() {
  const router = useRouter()
  const { language: selected, update } = useIntake()
  const setSelected = (language: string) => update({ language })

  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={{ marginBottom: 12 }} onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={C.textDark} />
          </TouchableOpacity>
          <View style={styles.stepBadge}><Text style={styles.stepText}>1 of 5</Text></View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: '20%' }]} />
          </View>
        </View>

        {/* Title */}
        <View style={styles.iconCircle}>
          <Ionicons name="globe" size={36} color={C.primary} />
        </View>
        <Text style={styles.title}>Choose Your Language</Text>
        <Text style={styles.subtitle}>You can speak or type in this language</Text>

        {/* Language grid */}
        <View style={styles.grid}>
          {LANGS.map(l => (
            <TouchableOpacity
              key={l.code}
              style={[styles.langCard, selected === l.code && styles.langCardSelected]}
              onPress={() => setSelected(l.code)}
            >
              {selected === l.code && (
                <View style={styles.checkmark}>
                  <Ionicons name="checkmark" size={12} color={C.white} />
                </View>
              )}
              <Text style={[styles.langNative, selected === l.code && styles.langNativeSelected]}>{l.native}</Text>
              <Text style={[styles.langLabel, selected === l.code && styles.langLabelSelected]}>{l.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Continue */}
        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 16 }]} onPress={() => router.push('/consent')}>
          <Text style={S.btnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
  header: { marginBottom: 24 },
  stepBadge: { alignSelf: 'flex-start', backgroundColor: C.primaryBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  stepText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  progressBar: { height: 6, backgroundColor: C.border, borderRadius: 3 },
  progressFill: { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.textGray, textAlign: 'center', marginBottom: 28 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center', marginBottom: 20 },
  langCard: { width: '44%', borderRadius: 16, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.white, padding: 16, alignItems: 'center', position: 'relative' },
  langCardSelected: { borderColor: C.primary, backgroundColor: C.primaryBg },
  checkmark: { position: 'absolute', top: 8, right: 8, width: 20, height: 20, borderRadius: 10, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  langNative: { fontSize: 20, fontWeight: '700', color: C.textDark, marginBottom: 4 },
  langNativeSelected: { color: C.primary },
  langLabel: { fontSize: 12, color: C.textGray },
  langLabelSelected: { color: C.primaryLight },
  listenBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12 },
  listenText: { color: C.primary, fontSize: 14, fontWeight: '600' },
})
