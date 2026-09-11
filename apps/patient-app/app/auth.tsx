// Screen 3: Login / Sign Up + basic details the Safety Engine needs (age, sex, pregnancy)
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { C, S } from '../constants/theme'
import { useIntake } from '../lib/intake'

type Sex = 'male' | 'female' | 'other'

export default function Auth() {
  const router = useRouter()
  const { patient, update } = useIntake()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [phone, setPhone] = useState(patient.phone ?? '')
  const [name, setName] = useState(patient.name ?? '')
  const [age, setAge] = useState(patient.age != null ? String(patient.age) : '')
  const [sex, setSex] = useState<Sex | null>(patient.sex ?? null)
  const [pregnant, setPregnant] = useState<boolean | null>(patient.pregnant ?? null)
  const [error, setError] = useState<string | null>(null)

  const ageNum = Number(age)
  const canBePregnant = sex === 'female' && age !== '' && ageNum >= 12 && ageNum <= 55

  const next = () => {
    if (age === '' || !Number.isInteger(ageNum) || ageNum < 0 || ageNum > 120) {
      setError('Please enter your age in years.')
      return
    }
    update({
      patient: {
        name: name.trim() || null,
        phone: phone.trim() || null,
        age: ageNum,
        sex,
        pregnant: canBePregnant ? pregnant : null,
      },
      result: null, // details changed: any earlier submission is stale
    })
    router.push('/consent')
  }

  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Back */}
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.textDark} />
        </TouchableOpacity>

        {/* Progress */}
        <View style={styles.stepBadge}><Text style={styles.stepText}>2 of 8</Text></View>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '25%' }]} /></View>

        {/* Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="person-circle" size={40} color={C.primary} />
        </View>
        <Text style={styles.title}>{tab === 'login' ? 'Welcome Back' : 'Create Account'}</Text>
        <Text style={styles.subtitle}>A few details so your doctor knows who you are</Text>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, tab === 'login' && styles.tabActive]} onPress={() => setTab('login')}>
            <Text style={[styles.tabText, tab === 'login' && styles.tabTextActive]}>Login</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'signup' && styles.tabActive]} onPress={() => setTab('signup')}>
            <Text style={[styles.tabText, tab === 'signup' && styles.tabTextActive]}>Sign Up</Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {tab === 'signup' && (
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={C.textGray} style={styles.inputIcon} />
              <TextInput style={styles.input} placeholder="Full Name" placeholderTextColor={C.textGray} value={name} onChangeText={setName} />
            </View>
          )}
          <View style={styles.inputWrap}>
            <Ionicons name="call-outline" size={18} color={C.textGray} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Phone Number" placeholderTextColor={C.textGray} keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
          </View>
          <View style={styles.inputWrap}>
            <Ionicons name="calendar-outline" size={18} color={C.textGray} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Age (years)"
              placeholderTextColor={C.textGray}
              keyboardType="number-pad"
              maxLength={3}
              value={age}
              onChangeText={t => { setAge(t.replace(/[^0-9]/g, '')); setError(null) }}
            />
          </View>

          <Text style={styles.label}>Sex</Text>
          <View style={styles.chipRow}>
            {(['female', 'male', 'other'] as Sex[]).map(o => (
              <TouchableOpacity key={o} style={[styles.chip, sex === o && styles.chipActive]} onPress={() => setSex(o)}>
                <Text style={[styles.chipText, sex === o && styles.chipTextActive]}>{o[0].toUpperCase() + o.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {canBePregnant && (
            <>
              <Text style={styles.label}>Are you pregnant?</Text>
              <View style={styles.chipRow}>
                {([['Yes', true], ['No', false], ['Not sure', null]] as [string, boolean | null][]).map(([label, val]) => (
                  <TouchableOpacity key={label} style={[styles.chip, pregnant === val && styles.chipActive]} onPress={() => setPregnant(val)}>
                    <Text style={[styles.chipText, pregnant === val && styles.chipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        {/* OTP note */}
        <View style={styles.otpNote}>
          <Ionicons name="shield-checkmark-outline" size={14} color={C.green} />
          <Text style={styles.otpNoteText}>We'll send a one-time code to verify</Text>
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 24 }]} onPress={next}>
          <Text style={S.btnText}>{tab === 'login' ? 'Continue' : 'Create Account'}</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  back: { marginBottom: 16 },
  stepBadge: { alignSelf: 'flex-start', backgroundColor: C.primaryBg, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  stepText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  progressBar: { height: 6, backgroundColor: C.border, borderRadius: 3, marginBottom: 28 },
  progressFill: { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.textGray, textAlign: 'center', marginBottom: 24 },
  tabs: { flexDirection: 'row', backgroundColor: C.border, borderRadius: 30, padding: 4, marginBottom: 24 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 26 },
  tabActive: { backgroundColor: C.white, shadowColor: C.primary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  tabText: { color: C.textGray, fontWeight: '600', fontSize: 14 },
  tabTextActive: { color: C.primary },
  form: { gap: 14 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 15, color: C.textDark },
  label: { fontSize: 13, fontWeight: '700', color: C.textDark, marginTop: 4 },
  chipRow: { flexDirection: 'row', gap: 10 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 14, borderWidth: 1.5, borderColor: C.border, backgroundColor: C.white },
  chipActive: { borderColor: C.primary, backgroundColor: C.primaryBg },
  chipText: { color: C.textMid, fontWeight: '600', fontSize: 14 },
  chipTextActive: { color: C.primary },
  error: { color: '#D32F2F', fontSize: 13, marginTop: 12 },
  otpNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  otpNoteText: { color: C.textGray, fontSize: 13 },
})
