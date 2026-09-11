// Consultation step 3: conversational intake. One AI question at a time; the patient
// answers naturally by typing or speaking (Sarvam via the backend). Every turn gets a
// live deterministic safety check. Voice is optional: if it fails, typing still works.
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useRef, useState } from 'react'
import { C, LANGUAGES, S, TRIAGE } from '../constants/theme'
import { api, Message, Patient, SERVER_ERROR } from '../lib/api'
import { useIntake } from '../lib/intake'
import { useSession } from '../lib/session'
import { speak, stopSpeaking, useVoiceInput } from '../lib/voice'

export default function Chat() {
  const router = useRouter()
  const { session, profile } = useSession()
  const { language, messages, update } = useIntake()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [done, setDone] = useState(false)
  const [urgent, setUrgent] = useState<string | null>(null)
  const [voiceNote, setVoiceNote] = useState<string | null>(null)
  const [speakReplies, setSpeakReplies] = useState(false)
  const scroll = useRef<ScrollView>(null)
  const voice = useVoiceInput(session, language)

  const patient: Patient = {
    name: profile?.name,
    age: profile?.age,
    sex: profile?.sex,
    phone: profile?.phone,
    pregnant: profile?.pregnancy_status === 'pregnant' ? true : profile?.pregnancy_status === 'not_pregnant' ? false : null,
  }

  const ask = async (history: Message[]) => {
    setLoading(true)
    setError(false)
    try {
      const res = await api.nextQuestion({ patient, language, messages: history })
      update({ messages: [...history, { role: 'assistant', text: res.question }] })
      setDone(res.done)
      if (res.safety.urgent) setUrgent(res.safety.guidance)
      if (speakReplies) {
        speak(session, res.question, language).then(ok => {
          if (!ok) setVoiceNote('Voice replies are unavailable right now. You can keep reading and typing.')
        })
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (messages.length === 0) ask([])
    if (session) api.warmOcr(session).catch(() => {}) // wake the OCR service before documents are added
    return () => stopSpeaking()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const send = (text: string = input, via: 'text' | 'voice' = 'text') => {
    const t = text.trim()
    if (!t || loading) return
    setInput('')
    const history: Message[] = [...messages, { role: 'patient', text: t, via }]
    update({ messages: history, result: null }) // answers changed: any earlier submission is stale
    ask(history)
  }

  // Stop recording -> transcript -> send as the patient's answer
  const finishRecording = async () => {
    try {
      const transcript = await voice.stopAndTranscribe()
      send(transcript, 'voice')
    } catch (e) {
      setVoiceNote((e as Error).message)
    }
  }
  const finishRef = useRef(finishRecording)
  finishRef.current = finishRecording // the 30 s auto-stop always uses the latest conversation

  const onMic = async () => {
    setVoiceNote(null)
    if (voice.state === 'recording') return finishRecording()
    if (voice.state !== 'idle' || loading) return
    stopSpeaking()
    try {
      await voice.start(() => finishRef.current())
    } catch (e) {
      setVoiceNote((e as Error).message)
    }
  }

  const answered = messages.some(m => m.role === 'patient')
  const lang = LANGUAGES.find(l => l.code === language)?.label ?? 'English'
  const recording = voice.state === 'recording'
  const transcribing = voice.state === 'transcribing'

  return (
    <SafeAreaView style={S.screen}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Back">
            <Ionicons name="arrow-back" size={22} color={C.textDark} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <View style={styles.aiAvatar}><Ionicons name="hardware-chip-outline" size={16} color={C.white} /></View>
            <View>
              <Text style={styles.headerTitle}>MediBridge Assistant</Text>
              <Text style={styles.headerSub}>Step 3 of 5 · {lang}</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.speakerBtn, speakReplies && styles.speakerOn]}
            onPress={() => { setSpeakReplies(v => !v); stopSpeaking(); setVoiceNote(null) }}
            accessibilityLabel={speakReplies ? 'Turn off spoken replies' : 'Read questions aloud'}
          >
            <Ionicons name={speakReplies ? 'volume-high' : 'volume-mute-outline'} size={18} color={speakReplies ? C.white : C.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '60%' }]} /></View>

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
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((m, i) => (
            <View key={i} style={[styles.bubble, m.role === 'patient' ? styles.bubbleUser : styles.bubbleAI]}>
              {m.role === 'assistant' && (
                <View style={styles.aiBubbleIcon}>
                  <Ionicons name="hardware-chip-outline" size={12} color={C.white} />
                </View>
              )}
              <View style={[styles.bubbleInner, m.role === 'patient' ? styles.bubbleInnerUser : styles.bubbleInnerAI]}>
                {m.via === 'voice' && (
                  <View style={styles.viaRow}>
                    <Ionicons name="mic" size={11} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.viaText}>Voice</Text>
                  </View>
                )}
                <Text style={[styles.bubbleText, m.role === 'patient' && styles.bubbleTextUser]}>{m.text}</Text>
              </View>
              {m.role === 'assistant' && (
                <TouchableOpacity onPress={() => speak(session, m.text, language).then(ok => { if (!ok) setVoiceNote('Voice playback is unavailable right now.') })} accessibilityLabel="Read aloud">
                  <Ionicons name="volume-medium-outline" size={16} color={C.textGray} />
                </TouchableOpacity>
              )}
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

        {voiceNote && (
          <View style={styles.voiceNote}>
            <Ionicons name="information-circle-outline" size={16} color={C.textMid} />
            <Text style={styles.voiceNoteText}>{voiceNote}</Text>
          </View>
        )}

        {!done && (
          <>
            {(recording || transcribing) && (
              <Text style={[styles.recHint, recording && { color: TRIAGE.RED.color }]}>
                {recording ? '● Listening… tap the mic again when you finish (30 s max)' : 'Turning your voice into text…'}
              </Text>
            )}
            <View style={styles.inputRow}>
              <TouchableOpacity
                style={[styles.micBtn, recording && styles.micRecording]}
                onPress={onMic}
                disabled={transcribing || (loading && !recording)}
                accessibilityLabel={recording ? 'Stop recording' : 'Answer by voice'}
              >
                {transcribing ? <ActivityIndicator color={C.primary} /> : <Ionicons name={recording ? 'stop' : 'mic'} size={22} color={recording ? C.white : C.primary} />}
              </TouchableOpacity>
              <TextInput
                style={styles.input}
                placeholder={recording ? 'Listening…' : 'Type your answer…'}
                placeholderTextColor={C.textGray}
                value={input}
                onChangeText={setInput}
                onSubmitEditing={() => send()}
                returnKeyType="send"
                editable={!loading && !recording}
                multiline={false}
              />
              <TouchableOpacity style={[styles.sendBtn, (loading || !input.trim()) && { opacity: 0.5 }]} onPress={() => send()} disabled={loading || !input.trim()}>
                <Ionicons name="send" size={18} color={C.white} />
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Continue */}
        {done ? (
          <TouchableOpacity style={[S.btn, { marginHorizontal: 16, marginBottom: 12 }]} onPress={() => router.push('/upload')}>
            <Text style={S.btnText}>Continue</Text>
            <Ionicons name="arrow-forward" size={18} color={C.white} />
          </TouchableOpacity>
        ) : (
          answered && !loading && !recording && (
            <TouchableOpacity style={styles.doneCta} onPress={() => router.push('/upload')}>
              <Text style={styles.doneCtaText}>Done answering → add documents</Text>
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
  speakerBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  speakerOn: { backgroundColor: C.primary },
  progressBar: { height: 4, backgroundColor: C.border, marginHorizontal: 16 },
  progressFill: { height: 4, backgroundColor: C.primary, borderRadius: 2 },
  urgent: { flexDirection: 'row', gap: 10, margin: 16, marginBottom: 0, padding: 14, borderRadius: 14, backgroundColor: TRIAGE.RED.bg, borderWidth: 1.5, borderColor: TRIAGE.RED.color },
  urgentText: { flex: 1, color: TRIAGE.RED.text, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  msgs: { flex: 1 },
  bubble: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAI: { justifyContent: 'flex-start' },
  aiBubbleIcon: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  bubbleInner: { maxWidth: '76%', borderRadius: 18, padding: 12 },
  bubbleInnerAI: { backgroundColor: C.white, borderBottomLeftRadius: 4 },
  bubbleInnerUser: { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 14, color: C.textMid, lineHeight: 20 },
  bubbleTextUser: { color: C.white },
  viaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  viaText: { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },
  errorBox: { backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#FFCDD2', gap: 8 },
  errorText: { color: C.textMid, fontSize: 13, lineHeight: 18 },
  retry: { color: C.primary, fontWeight: '700', fontSize: 14 },
  voiceNote: { flexDirection: 'row', gap: 8, alignItems: 'center', marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 12, backgroundColor: '#FFF8E1' },
  voiceNoteText: { flex: 1, fontSize: 12, color: C.textMid, lineHeight: 17 },
  recHint: { textAlign: 'center', fontSize: 12, color: C.textGray, paddingBottom: 6, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, paddingTop: 4 },
  micBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.primary },
  micRecording: { backgroundColor: TRIAGE.RED.color, borderColor: TRIAGE.RED.color },
  input: { flex: 1, backgroundColor: C.white, borderRadius: 24, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: C.textDark },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  doneCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  doneCtaText: { color: C.primary, fontSize: 13, fontWeight: '600' },
})
