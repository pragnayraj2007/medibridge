import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { Platform, View } from 'react-native'
import { IntakeProvider } from '../lib/intake'
import { SessionProvider } from '../lib/session'

export default function RootLayout() {
  const stack = <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  return (
    <SessionProvider>
      <IntakeProvider>
        <StatusBar style="dark" />
        {Platform.OS === 'web' ? (
          // On desktop browsers keep the phone-sized layout centred
          <View style={{ flex: 1, backgroundColor: '#DCE7F7' }}>
            <View style={{ flex: 1, width: '100%', maxWidth: 480, alignSelf: 'center' }}>{stack}</View>
          </View>
        ) : (
          stack
        )}
      </IntakeProvider>
    </SessionProvider>
  )
}
