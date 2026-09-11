// Screen 5: Chat with AI
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { C, S } from '../constants/theme'

type Msg = { from: 'ai' | 'user'; text: string }

const INIT: Msg[] = [
  { from: 'ai', text: "Hello! I'm here to help collect your health information before your appointment. This usually takes about 5 minutes. Can you tell me what brings you in today?" },
]

export default function Chat() {
  const router = useRouter()
  const [msgs, setMsgs] = useState<Msg[]>(INIT)
  const [input, setInput] = useState('')

  const send = () => {
    if (!input.trim()) return
    const userMsg: Msg = { from: 'user', text: input.trim() }
    const aiReply: Msg = { from: 'ai', text: "Thank you for sharing that. Could you tell me more about when this started and how severe the pain is on a scale of 1–10?" }
    setMsgs(m => [...m, userMsg, aiReply])
    setInput('')
  }

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
          <TouchableOpacity onPress={() => router.push('/upload')}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Progress */}
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '50%' }]} /></View>

        {/* Messages */}
        <ScrollView style={styles.msgs} contentContainerStyle={{ padding: 16, gap: 14 }} showsVerticalScrollIndicator={false}>
          {msgs.map((m, i) => (
            <View key={i} style={[styles.bubble, m.from === 'user' ? styles.bubbleUser : styles.bubbleAI]}>
              {m.from === 'ai' && (
                <View style={styles.aiBubbleIcon}>
                  <Ionicons name="hardware-chip-outline" size={12} color={C.white} />
                </View>
              )}
              <View style={[styles.bubbleInner, m.from === 'user' ? styles.bubbleInnerUser : styles.bubbleInnerAI]}>
                <Text style={[styles.bubbleText, m.from === 'user' && styles.bubbleTextUser]}>{m.text}</Text>
              </View>
            </View>
          ))}
        </ScrollView>

        {/* Quick replies */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
          {["It started suddenly", "Mild pain", "It's getting worse", "I have fever too"].map(q => (
            <TouchableOpacity key={q} style={styles.quickChip} onPress={() => setInput(q)}>
              <Text style={styles.quickText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.micBtn}>
            <Ionicons name="mic-outline" size={22} color={C.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            placeholder="Type your response..."
            placeholderTextColor={C.textGray}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={send}
            returnKeyType="send"
          />
          <TouchableOpacity style={styles.sendBtn} onPress={send}>
            <Ionicons name="send" size={18} color={C.white} />
          </TouchableOpacity>
        </View>

        {/* Done CTA */}
        <TouchableOpacity style={styles.doneCta} onPress={() => router.push('/upload')}>
          <Text style={styles.doneCtaText}>Done answering → Continue to document upload</Text>
          <Ionicons name="arrow-forward" size={14} color={C.primary} />
        </TouchableOpacity>
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
  skipText: { color: C.primary, fontWeight: '600', fontSize: 14 },
  progressBar: { height: 4, backgroundColor: C.border, marginHorizontal: 16 },
  progressFill: { height: 4, backgroundColor: C.primary, borderRadius: 2 },
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
  quickRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  quickChip: { backgroundColor: C.primaryBg, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  quickText: { color: C.primary, fontSize: 13, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 8 },
  micBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, backgroundColor: C.white, borderRadius: 24, borderWidth: 1.5, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 11, fontSize: 14, color: C.textDark },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  doneCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  doneCtaText: { color: C.primary, fontSize: 13, fontWeight: '600' },
})
