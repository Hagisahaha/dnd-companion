import { Stack } from 'expo-router';
import { usePalette } from '../../theme/colors';

export default function CompendiumLayout() {
  const c = usePalette();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.background },
        headerTintColor: c.accent,
        headerTitleStyle: { color: c.label },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Search', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
