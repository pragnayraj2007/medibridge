import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { IntakeProvider } from '../lib/intake'

export default function RootLayout() {
  return (
    <IntakeProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
    </IntakeProvider>
  )
}
