// Voice input/output. Audio goes to our backend, which calls Sarvam (the key never
// reaches the app). Every failure returns a message and the patient keeps typing.
import {
  createAudioPlayer, RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder,
} from 'expo-audio'
import { useCallback, useRef, useState } from 'react'
import { Platform } from 'react-native'
import { api, errorText, fileFormData, Session } from './api'

export const MAX_RECORDING_MS = 30000

type RecState = 'idle' | 'recording' | 'transcribing'

/** Record -> stop -> transcribe. Returns the transcript or throws a patient-friendly Error. */
export function useVoiceInput(session: Session | null, language: string) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY)
  const [state, setState] = useState<RecState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = useCallback(async (onAutoStop: () => void) => {
    const perm = await requestRecordingPermissionsAsync()
    if (!perm.granted) throw new Error('Microphone permission was not given. You can type your answer instead.')
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true })
      await recorder.prepareToRecordAsync()
      recorder.record()
    } catch {
      throw new Error('Could not start recording on this device. Please type your answer.')
    }
    setState('recording')
    timer.current = setTimeout(onAutoStop, MAX_RECORDING_MS)
  }, [recorder])

  const stopAndTranscribe = useCallback(async (): Promise<string> => {
    if (timer.current) clearTimeout(timer.current)
    setState('transcribing')
    try {
      try {
        await recorder.stop()
      } catch {
        throw new Error('Recording failed. Please try again or type your answer.')
      }
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {})
      const uri = recorder.uri
      if (!uri) throw new Error('Nothing was recorded. Please try again or type your answer.')
      if (!session) throw new Error('Voice needs a registered patient. Please type your answer.')
      const web = Platform.OS === 'web'
      const form = await fileFormData(
        { uri, name: web ? 'voice.webm' : 'voice.m4a', type: web ? 'audio/webm' : 'audio/mp4' },
        { language },
      )
      try {
        const res = await api.transcribe(session, form)
        return res.transcript
      } catch (e) {
        throw new Error(errorText(e))
      }
    } finally {
      setState('idle')
    }
  }, [recorder, session, language])

  const cancel = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    try {
      if (recorder.isRecording) await recorder.stop()
    } catch {}
    setState('idle')
  }, [recorder])

  return { state, start, stopAndTranscribe, cancel }
}

let current: ReturnType<typeof createAudioPlayer> | null = null

/** Speak text with Sarvam TTS. Resolves false (never throws) if voice is unavailable. */
export async function speak(session: Session | null, text: string, language: string): Promise<boolean> {
  if (!session) return false
  try {
    const { audio_base64, mime } = await api.speak(session, text, language)
    stopSpeaking()
    if (Platform.OS === 'web') {
      const audio = new (globalThis as unknown as { Audio: new (src: string) => { play: () => Promise<void> } }).Audio(`data:${mime};base64,${audio_base64}`)
      await audio.play()
      return true
    }
    // Loaded lazily so the web bundle never touches the native file system module
    const { File, Paths } = require('expo-file-system') as typeof import('expo-file-system')
    const file = new File(Paths.cache, `tts-${Date.now()}.wav`)
    file.create()
    file.write(audio_base64, { encoding: 'base64' })
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {})
    current = createAudioPlayer({ uri: file.uri })
    current.play()
    return true
  } catch {
    return false
  }
}

export function stopSpeaking() {
  try {
    current?.pause()
    current?.remove()
  } catch {}
  current = null
}
