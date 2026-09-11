// Screen 6: Upload Documents
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { useRouter } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useState } from 'react'
import { C, S } from '../constants/theme'

type DocFile = { name: string; size: string; type: string }

const DOC_TYPES = [
  { icon: 'document-text-outline', label: 'Prescription', color: '#1565C0' },
  { icon: 'flask-outline', label: 'Lab Report', color: '#43A047' },
  { icon: 'scan-outline', label: 'X-Ray / Scan', color: '#8E24AA' },
  { icon: 'medical-outline', label: 'Other', color: '#F57C00' },
]

export default function Upload() {
  const router = useRouter()
  const [files, setFiles] = useState<DocFile[]>([
    { name: 'blood_test_june.pdf', size: '1.2 MB', type: 'Lab Report' },
  ])

  const removeFile = (i: number) => setFiles(f => f.filter((_, idx) => idx !== i))

  return (
    <SafeAreaView style={S.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.textDark} />
        </TouchableOpacity>
        <View style={styles.stepBadge}><Text style={styles.stepText}>5 of 8</Text></View>
        <View style={styles.progressBar}><View style={[styles.progressFill, { width: '62.5%' }]} /></View>

        {/* Icon */}
        <View style={styles.iconCircle}>
          <Ionicons name="cloud-upload-outline" size={38} color={C.primary} />
        </View>
        <Text style={styles.title}>Upload Documents</Text>
        <Text style={styles.subtitle}>Share any recent medical records to help your doctor prepare</Text>

        {/* Drop zone */}
        <TouchableOpacity style={styles.dropZone}>
          <Ionicons name="cloud-upload-outline" size={32} color={C.primary} />
          <Text style={styles.dropTitle}>Tap to upload</Text>
          <Text style={styles.dropSub}>PDF, JPG, PNG · Max 10MB each</Text>
        </TouchableOpacity>

        {/* Doc type pills */}
        <Text style={styles.sectionLabel}>Document Type</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeRow}>
          {DOC_TYPES.map(d => (
            <TouchableOpacity key={d.label} style={styles.typePill}>
              <Ionicons name={d.icon as any} size={16} color={d.color} />
              <Text style={[styles.typePillText, { color: d.color }]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Uploaded files */}
        {files.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Uploaded ({files.length})</Text>
            <View style={styles.fileList}>
              {files.map((f, i) => (
                <View key={i} style={styles.fileRow}>
                  <View style={styles.fileIcon}>
                    <Ionicons name="document-text" size={20} color={C.primary} />
                  </View>
                  <View style={styles.fileMeta}>
                    <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                    <Text style={styles.fileSize}>{f.type} · {f.size}</Text>
                  </View>
                  <TouchableOpacity onPress={() => removeFile(i)}>
                    <Ionicons name="close-circle" size={22} color={C.textGray} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Skip note */}
        <Text style={styles.skipNote}>Don't have documents with you? That's okay — you can skip this step.</Text>

        <TouchableOpacity style={[S.btn, { width: '100%', marginTop: 8 }]} onPress={() => router.push('/processing')}>
          <Text style={S.btnText}>Continue</Text>
          <Ionicons name="arrow-forward" size={18} color={C.white} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={() => router.push('/processing')}>
          <Text style={styles.skipBtnText}>Skip for now</Text>
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
  iconCircle: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center', marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '800', color: C.textDark, textAlign: 'center', marginBottom: 8 },
  subtitle: { fontSize: 14, color: C.textGray, textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  dropZone: { borderWidth: 2, borderColor: C.primary, borderStyle: 'dashed', borderRadius: 20, padding: 32, alignItems: 'center', gap: 8, backgroundColor: C.primaryBg, marginBottom: 20 },
  dropTitle: { fontSize: 16, fontWeight: '700', color: C.primary },
  dropSub: { fontSize: 12, color: C.textGray },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: C.textDark, marginBottom: 10 },
  typeRow: { gap: 10, marginBottom: 20 },
  typePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  typePillText: { fontSize: 13, fontWeight: '600' },
  fileList: { gap: 10, marginBottom: 20 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: C.border },
  fileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryBg, alignItems: 'center', justifyContent: 'center' },
  fileMeta: { flex: 1 },
  fileName: { fontSize: 14, fontWeight: '600', color: C.textDark },
  fileSize: { fontSize: 12, color: C.textGray, marginTop: 2 },
  skipNote: { fontSize: 13, color: C.textGray, textAlign: 'center', marginBottom: 16, lineHeight: 19 },
  skipBtn: { alignItems: 'center', paddingVertical: 14 },
  skipBtnText: { color: C.textGray, fontSize: 14 },
})
