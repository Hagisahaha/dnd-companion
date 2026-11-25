import { Image, Text, View } from 'react-native';
import { usePalette } from '../theme/colors';

/** Round portrait, or initials when the character has no picture. */
export function Avatar({ uri, name, size }: { uri: string | null | undefined; name: string; size: number }) {
  const c = usePalette();
  const initials = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.fill }} accessibilityIgnoresInvertColors />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.accent, fontWeight: '700', fontSize: size * 0.38 }}>{initials}</Text>
    </View>
  );
}
