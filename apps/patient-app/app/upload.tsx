// Consultation step 4: documents. Each file goes to the backend: upload -> OCR (PaddleOCR)
// -> multimodal analysis (Gemini). The patient sees the real status of every stage and can
// always continue; a failed document never blocks the consultation.
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useEffect, useState } from 'react'
import { C, S } from '../constants/theme'
import { api, errorText, fileFormData, readBase64, UploadedDocument } from '../lib/api'
import { useIntake } from '../lib/intake'
import { useSession } from '../lib/session'

const DOC_TYPES = [
  { icon: 'document-text-outline', label: 'Prescription', color: '#1565C0' },
  { icon: 'flask-outline', label: 'Lab Report', color: '#43A047' },
  { icon: 'scan-outline', label: 'X-Ray / Scan', color: '#8E24AA' },
  { icon: 'medical-outline', label: 'Other', color: '#F57C00' },
]
// Phones send the file as base64 (a third larger), so keep them under the 4.5 MB request limit
const MAX_BYTES = Platform.OS === 'web' ? 4 * 1024 * 1024 : 3 * 1024 * 1024
const MAX_LABEL = Platform.OS === 'web' ? '4 MB' : '3 MB'
class FileProblem extends Error {}
const STAGES = ['Uploading', 'Reading text (OCR)', 'Multimodal analysis', 'Saving to your case']
const STAGE_STATUS: Record<string, string> = { done: 'done', empty: 'no text found', not_configured: 'not available', failed: 'failed' }

export default function Upload() {
  const router = useRouter()
  const { session } = useSession()
  const { documents, update } = useIntake()
  const [docType, setDocType] = useState('Lab Report')
  const [busy, setBusy] = useState(false)
  const [stage, setStage] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Stage labels advance while the single request runs; the real per-stage result is shown after
  useEffect(() => {
    if (!busy) return
    setStage(0)
    const t = setInterval(() => setStage(s => Math.min(s + 1, STAGES.length - 1)), 2500)
    return () => clearInterval(t)
  }, [busy])

  const pick = async () => {
    setError(null)
    const res = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true, multiple: false })
    if (res.canceled || !res.assets?.length) return
    const f = res.assets[0]
    if (f.size && f.size > MAX_BYTES) return setError(`That file is larger than ${MAX_LABEL}. Please choose a smaller file or photo.`)
    if (!session) return setError('Please register first.')
    setBusy(true)
    try {
      let doc: UploadedDocument
      if (Platform.OS === 'web') {
        const form = await fileFormData(
          { uri: f.uri, name: f.name || 'document', type: f.mimeType || 'application/octet-stream', webFile: (f as { file?: Blob }).file ?? null },
          { doc_type: docType },
        )
        doc = await api.uploadDocument(session, form)
      } else {
        let data: string
        try {
          data = await readBase64(f.uri)
        } catch {
          throw new FileProblem('Could not read that file. Please choose it again.')
        }
        if (data.length > MAX_BYTES * 1.37) throw new FileProblem(`That file is larger than ${MAX_LABEL}. Please choose a smaller file or photo.`)
        doc = await api.uploadDocumentJson(session, { file_base64: data, filename: f.name || 'document', mime: f.mimeType || null, doc_type: docType })
      }
      update(s => ({ documents: [...s.documents, doc], result: null }))
    } catch (e) {
      setError(e instanceof FileProblem ? e.message : errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = (id: string) => update(s => ({ documents: s.documents.filter(d => d.id !== id), result: null }))

  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={22} color={C.textDark} />
        </TouchableOpacity>
        <View style={styles.stepBadge}><Text style={styles.stepText}>4 of 5</Text></View>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '80%' }]} /></View>

        <Text style={styles.title}>Add Medical Documents</Text>
        <Text style={styles.subtitle}>Prescriptions, lab reports or scan reports help your doctor prepare. Optional.</Text>

        <Text style={styles.sectionLabel}>Document type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {DOC_TYPES.map(d => (
            <TouchableOpacity key={d.label} style={[styles.typePill, docType === d.label && { borderColor: d.color, backgroundColor: C.primaryBg }]} onPress={() => setDocType(d.label)}>
              <Ionicons name={d.icon as any} size={16} color={d.color} />
              <Text style={[styles.typePillText, { color: d.color }]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <TouchableOpacity style={[styles.dropZone, busy && { opacity: 0.8 }]} onPress={pick} disabled={busy}>
          {busy ? (
            <>
              <ActivityIndicator color={C.primary} />
              <Text style={styles.dropTitle}>{STAGES[stage]}…</Text>
              <View style={styles.stageRow}>
                {STAGES.map((s, i) => <View key={s} style={[styles.stageDot, i <= stage && { backgroundColor: C.primary }]} />)}
              </View>
            </>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={32} color={C.primary} />
              <Text style={styles.dropTitle}>Tap to choose a file or photo</Text>
              <Text style={styles.dropSub}>PDF, JPG, PNG, WEBP · up to {MAX_LABEL}</Text>
            </>
          )}
        </TouchableOpacity>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color="#C62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {documents.length > 0 && <Text style={styles.sectionLabel}>Added to this consultation ({documents.length})</Text>}
        <View style={styles.fileList}>
          {documents.map(d => <DocRow key={d.id} d={d} onRemove={() => remove(d.id)} />)}
        </View>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 8, opacity: busy ? 0.5 : 1 }]} onPress={() => router.push('/processing')} disabled={busy}>
          <Text style={S.btnText}>{documents.length ? 'Continue' : 'Continue without documents'}</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function DocRow({ d, onRemove }: { d: UploadedDocument; onRemove: () => void }) {
  const ok = d.status === 'processed' || d.status === 'partial'
  return (
    <View style={styles.fileRow}>
      <View style={[styles.fileIcon, !ok && { backgroundColor: '#FFF3E0' }]}>
        <Ionicons name={ok ? 'checkmark-circle' : 'alert-circle'} size={20} color={ok ? C.green : '#EF6C00'} />
      </View>
      <View style={styles.fileMeta}>
        <Text style={styles.fileName} numberOfLines={1}>{d.name}</Text>
        <Text style={styles.fileSub}>{d.doc_type ?? 'Document'} · OCR {STAGE_STATUS[d.ocr_status ?? 'failed']} · analysis {STAGE_STATUS[d.analysis_status ?? 'failed']}</Text>
        <Text style={styles.fileMsg}>{d.message}</Text>
      </View>
      <TouchableOpacity onPress={onRemove} accessibilityLabel="Remove from this consultation">
        <Ionicons name="close-circle" size={22} color={C.textGray} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  back: { marginBottom: 16 },
  stepBadge: { alignSelf: 'flex-start', backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4, marginBottom: 10 },
  stepText: { color: C.primary, fontSize: 12, fontWeight: '600' },
  progressBar: { height: 6, backgroundColor: C.border, borderRadius: 3, marginBottom: 24 },
  progressFill: { height: 6, backgroundColor: C.primary, borderRadius: 3 },
  title: { fontSize: 24, fontWeight: '800', color: C.textDark, marginBottom: 6 },
  subtitle: { fontSize: 14, color: C.textGray, marginBottom: 20, lineHeight: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.textDark, marginBottom: 10 },
  typeRow: { gap: 10, marginBottom: 16 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1.5, borderColor: C.border },
  typePillText: { fontSize: 13, fontWeight: '600' },
  dropZone: { borderWidth: 2, borderColor: C.primary, borderStyle: 'dashed', borderRadius: 20, padding: 28, alignItems: 'center', gap: 8, backgroundColor: C.white, marginBottom: 16 },
  dropTitle: { fontSize: 15, fontWeight: '700', color: C.primary },
  dropSub: { fontSize: 12, color: C.textGray },
  stageRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  stageDot: { width: 28, height: 4, borderRadius: 2, backgroundColor: C.border },
  errorBox: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: '#FFEBEE', borderRadius: 12, padding: 12, marginBottom: 14 },
  errorText: { flex: 1, color: '#B71C1C', fontSize: 13, lineHeight: 18 },
  fileList: { gap: 10, marginBottom: 16 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.greenLight, alignItems: 'center', justifyContent: 'center' },
  fileMeta: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: C.textDark },
  fileSub: { fontSize: 11, color: C.textGray, marginTop: 2 },
  fileMsg: { fontSize: 12, color: C.textMid, marginTop: 4, lineHeight: 16 },
})
