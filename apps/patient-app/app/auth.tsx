// Registration (creates the persistent patient ID) and profile editing (?edit=1).
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { ComponentProps, useState } from 'react'
import { C, S } from '../constants/theme'
import { api, errorText, Sex } from '../lib/api'
import { useSession } from '../lib/session'

export default function Auth() {
  const router = useRouter()
  const { edit } = useLocalSearchParams<{ edit?: string }>()
  const { session, profile, signIn, setProfile } = useSession()
  const editing = edit === '1' && !!session && !!profile

  const [name, setName] = useState(editing ? profile!.name ?? '' : '')
  const [phone, setPhone] = useState(editing ? profile!.phone ?? '' : '')
  const [age, setAge] = useState(editing && profile!.age != null ? String(profile!.age) : '')
  const [sex, setSex] = useState<Sex | null>(editing ? profile!.sex : null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const ageNum = Number(age)

  const submit = async () => {
    if (!name.trim()) return setError('Please enter your name.')
    if (age === '' || !Number.isInteger(ageNum) || ageNum < 0 || ageNum > 120) return setError('Please enter your age in years.')
    setError(null)
    setSaving(true)
    const fields = {
      name: name.trim(),
      phone: phone.trim() || null,
      age: ageNum,
      sex,
    }
    try {
      if (editing) {
        setProfile(await api.updatePatient(session!, fields))
        router.back()
      } else {
        const res = await api.registerPatient({ ...fields, language: 'en' })
        await signIn({ code: res.patient.patient_code, token: res.token }, res.patient)
        router.replace('/home')
      }
    } catch (e) {
      setError(errorText(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.textDark} />
        </TouchableOpacity>

        <View style={styles.iconCircle}>
          <Ionicons name="person-circle" size={40} color={C.primary} />
        </View>
        <Text style={styles.title}>{editing ? 'Edit Profile' : 'Create Your Patient ID'}</Text>
        <Text style={styles.subtitle}>
          {editing
            ? 'Keep your details up to date for your doctor.'
            : 'One ID for all your visits. Your appointments and past consultations stay linked to it.'}
        </Text>

        <View style={styles.form}>
          <Field icon="person-outline" placeholder="Full name" value={name} onChangeText={setName} />
          <Field icon="call-outline" placeholder="Phone number (optional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field
            icon="calendar-outline"
            placeholder="Age (years)"
            value={age}
            onChangeText={t => { setAge(t.replace(/[^0-9]/g, '')); setError(null) }}
            keyboardType="number-pad"
            maxLength={3}
          />

          <Text style={styles.label}>Sex</Text>
          <View style={styles.chipRow}>
            {(['female', 'male', 'other'] as Sex[]).map(o => (
              <TouchableOpacity key={o} style={[styles.chip, sex === o && styles.chipActive]} onPress={() => setSex(o)}>
                <Text style={[styles.chipText, sex === o && styles.chipTextActive]}>{o[0].toUpperCase() + o.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>

        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.note}>
          <Ionicons name="shield-checkmark-outline" size={14} color={C.green} />
          <Text style={styles.noteText}>Your details are stored securely and shared only with your doctor.</Text>
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 20, opacity: saving ? 0.6 : 1 }]} onPress={submit} disabled={saving}>
          {saving ? <ActivityIndicator color={C.white} /> : <Text style={S.btnText}>{editing ? 'Save' : 'Create Patient ID'}</Text>}
          {!saving && <Ionicons name="arrow-forward" size={18} color={C.white} />}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function Field({ icon, ...props }: { icon: string } & ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.inputWrap}>
      <Ionicons name={icon as any} size={18} color={C.textGray} style={styles.inputIcon} />
      <TextInput style={styles.input} placeholderTextColor={C.textGray} {...props} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  back: { marginBottom: 16 },
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.textGray, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
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
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  noteText: { color: C.textGray, fontSize: 12, flex: 1 },
})
