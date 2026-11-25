import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useCharacters } from '../character/store';
import { QuickRollProvider } from '../components/QuickRoll';
import { startSync } from '../sync/sync';
import { usePalette } from '../theme/colors';

export default function RootLayout() {
  const c = usePalette();
  const hydrated = useCharacters((s) => s.hydrated);
  // Sync starts once local data is loaded, so a fresh device never uploads an empty list over a full one.
  useEffect(() => {
    if (hydrated) startSync();
  }, [hydrated]);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: c.background }}>
      <QuickRollProvider>
        <StatusBar style="auto" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="compendium" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="character" />
          <Stack.Screen name="history" options={{ presentation: 'modal', headerShown: true }} />
          <Stack.Screen name="settings" options={{ presentation: 'modal', headerShown: true, headerStyle: { backgroundColor: c.background }, headerTitleStyle: { color: c.label }, headerTintColor: c.accent, headerShadowVisible: false }} />
        </Stack>
      </QuickRollProvider>
    </GestureHandlerRootView>
  );
}
