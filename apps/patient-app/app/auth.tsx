// Screen 3: Login / Sign Up
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { C, S } from '../constants/theme'

export default function Auth() {
  const router = useRouter()
  const [tab, setTab] = useState<'login' | 'signup'>('login')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')

  return (
    <SafeAreaView style={S.screen}>
      <View style={styles.container}>
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
        <Text style={styles.title}>Welcome Back</Text>
        <Text style={styles.subtitle}>Let's verify who you are before we begin</Text>

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
              <TextInput
                style={styles.input}
                placeholder="Full Name"
                placeholderTextColor={C.textGray}
                value={name}
                onChangeText={setName}
              />
            </View>
          )}
          <View style={styles.inputWrap}>
            <Ionicons name="call-outline" size={18} color={C.textGray} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              placeholderTextColor={C.textGray}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>
        </View>

        {/* OTP note */}
        <View style={styles.otpNote}>
          <Ionicons name="shield-checkmark-outline" size={14} color={C.green} />
          <Text style={styles.otpNoteText}>We'll send a one-time code to verify</Text>
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 24 }]} onPress={() => router.push('/consent')}>
          <Text style={S.btnText}>{tab === 'login' ? 'Send OTP' : 'Create Account'}</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>

        {/* Guest */}
        <TouchableOpacity style={styles.guestBtn} onPress={() => router.push('/consent')}>
          <Text style={styles.guestText}>Continue as Guest</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 12 },
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
  otpNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  otpNoteText: { color: C.textGray, fontSize: 13 },
  guestBtn: { alignItems: 'center', paddingVertical: 16 },
  guestText: { color: C.textGray, fontSize: 14 },
})
