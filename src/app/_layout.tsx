import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QuickRollProvider } from '../components/QuickRoll';
import { usePalette } from '../theme/colors';

export default function RootLayout() {
  const c = usePalette();
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <QuickRollProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="compendium" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="character" />
          <Stack.Screen name="history" options={{ presentation: 'modal', headerShown: true }} />
        </Stack>
      </QuickRollProvider>
    </GestureHandlerRootView>
  );
}
