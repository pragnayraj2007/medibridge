// Screen 5: Chat with AI — questions come from the backend; every turn gets a live safety check
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { C, S, TRIAGE } from '../constants/theme'
import { api, Message, SERVER_ERROR } from '../lib/api'
import { useIntake } from '../lib/intake'

const QUICK_REPLIES = ['It started suddenly', 'Mild pain', "It's getting worse", 'I have fever too']

export default function Chat() {
  const router = useRouter()
  const { patient, language, messages, update } = useIntake()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState(false)
  const [urgent, setUrgent] = useState<string | null>(null)
  const [micHint, setMicHint] = useState(false)
  const scroll = useRef<ScrollView>(null)

  const ask = async (history: Message[]) => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.nextQuestion({ patient, language, messages: history })
      update({ messages: [...history, { role: 'assistant', text: res.question }] })
      setDone(res.done)
      if (res.safety.urgent) setUrgent(res.safety.guidance)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (messages.length === 0) ask([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = (text: string = input) => {
    const t = text.trim()
    if (!t || loading) return
    setInput('')
    const history: Message[] = [...messages, { role: 'patient', text: t }]
    update({ messages: history, result: null }) // answers changed: any earlier submission is stale
    ask(history)
  }

  const answered = messages.some(m => m.role === 'patient')
  const lastIsPatient = messages[messages.length - 1]?.role === 'patient'

  return (
    <SafeAreaView style={S.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={C.textDark} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.aiAvatar}><Ionicons name="hardware-chip-outline" size={16} color={C.white} /></View>
            <View>
              <Text style={styles.headerTitle}>MediBridge AI</Text>
              <Text style={styles.headerSub}>Step 4 of 8 · Health Assessment</Text>
            </View>
          </View>
        </View>

        {/* Progress */}
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '50%' }]} /></View>

        {/* Urgent banner (Safety Engine, deterministic) */}
        {urgent && (
          <View style={styles.urgent}>
            <Ionicons name="alert-circle" size={22} color={TRIAGE.RED.color} />
            <Text style={styles.urgentText}>{urgent}</Text>
          </View>
        )}

        {/* Messages */}
        <ScrollView
          ref={scroll}
          style={styles.msgs}
          contentContainerStyle={{ padding: 16, gap: 14 }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })}
        >
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === 'patient' ? styles.bubbleUser : styles.bubbleAI]}>
              {m.role === 'assistant' && (
                <View style={styles.aiBubbleIcon}>
                  <Ionicons name="hardware-chip-outline" size={12} color={C.white} />
                </View>
              )}
              <View style={[styles.bubbleInner, m.role === 'patient' ? styles.bubbleInnerUser : styles.bubbleInnerAI]}>
                <Text style={[styles.bubbleText, m.role === 'patient' && styles.bubbleTextUser]}>{m.text}</Text>
              </View>
            </View>
          ))}
          {loading && <ActivityIndicator color={C.primary} style={{ alignSelf: 'flex-start', marginLeft: 32 }} />}
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{SERVER_ERROR}</Text>
              <TouchableOpacity onPress={() => ask(messages)}>
                <Text style={styles.retry}>Try again</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        {!done && (
          <>
            {/* Quick replies */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow} keyboardShouldPersistTaps="handled">
              {QUICK_REPLIES.map(q => (
                <TouchableOpacity key={q} style={styles.quickChip} onPress={() => send(q)} disabled={loading || lastIsPatient}>
                  <Text style={styles.quickText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Input */}
            <View style={styles.inputRow}>
              <TouchableOpacity style={styles.micBtn} onPress={() => setMicHint(h => !h)}>
                <Ionicons name="mic-outline" size={22} color={C.primary} />
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder="Type your response..."
                placeholderTextColor={C.textGray}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => send()}
                returnKeyType="send"
                editable={!loading}
              />
              <TouchableOpacity style={[styles.sendBtn, loading && { opacity: 0.5 }]} onPress={() => send()} disabled={loading}>
                <Ionicons name="send" size={18} color={C.white} />
              </TouchableOpacity>
            </View>
            {micHint && <Text style={styles.micHint}>Voice input is coming soon. Please type your answer for now.</Text>}
          </>
        )}

        {/* Continue */}
        {done ? (
          <TouchableOpacity style={[S.btn, { marginHorizontal: 16, marginBottom: 12 }]} onPress={() => router.push('/upload')}>
            <Text style={S.btnText}>Done answering</Text>
            <Ionicons name="arrow-forward" size={18} color={C.white} />
          </TouchableOpacity>
        ) : (
          answered && !loading && (
            <TouchableOpacity style={styles.doneCta} onPress={() => router.push('/upload')}>
              <Text style={styles.doneCtaText}>Done answering → Continue to document upload</Text>
              <Ionicons name="arrow-forward" size={14} color={C.primary} />
            </TouchableOpacity>
          )
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '700', color: C.textDark },
  headerSub: { fontSize: 11, color: C.textGray },
  progressBar: { height: 4, backgroundColor: C.border, marginHorizontal: 16 },
  progressFill: { height: 4, backgroundColor: C.primary, borderRadius: 2 },
  urgent: { flexDirection: 'row', gap: 10, margin: 16, marginBottom: 0, padding: 14, borderRadius: 14, backgroundColor: TRIAGE.RED.bg, borderWidth: 1.5, borderColor: TRIAGE.RED.color },
  urgentText: { flex: 1, color: TRIAGE.RED.text, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  msgs: { flex: 1 },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAI: { justifyContent: 'flex-start' },
  aiBubbleIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  bubbleInner: { maxWidth: '78%', borderRadius: 18, padding: 12 },
  bubbleInnerAI: { backgroundColor: C.white, borderBottomLeftRadius: 4 },
  bubbleInnerUser: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: C.textMid, lineHeight: 20 },
  bubbleTextUser: { color: C.white },
  errorBox: { backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FFCDD2', gap: 8 },
  errorText: { color: C.textMid, fontSize: 13, lineHeight: 18 },
  retry: { color: C.primary, fontWeight: '700', fontSize: 14 },
  quickRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  quickChip: { backgroundColor: C.primaryBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  quickText: { color: C.primary, fontSize: 13, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  micBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: C.white, borderRadius: 24, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: C.textDark },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  micHint: { color: C.textGray, fontSize: 12, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 6 },
  doneCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  doneCtaText: { color: C.primary, fontSize: 13, fontWeight: '600' },
})
