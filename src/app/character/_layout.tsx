import { Stack } from 'expo-router';
import { usePalette } from '../../theme/colors';

export default function CharacterLayout() {
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
      <Stack.Screen name="sheet" options={{ title: '' }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="hp" options={{ presentation: 'modal' }} />
      <Stack.Screen name="cast" options={{ presentation: 'modal' }} />
      <Stack.Screen name="spells" options={{ presentation: 'modal' }} />
    </Stack>
  );
}
