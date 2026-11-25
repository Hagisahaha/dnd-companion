import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useActiveCharacter } from '../character/store';
import { Avatar } from '../components/Avatar';
import { CharacterBar } from '../components/CharacterBar';
import { DiceTray } from '../components/dice/DiceTray';
import { useSync } from '../sync/sync';
import { usePalette } from '../theme/colors';

export default function Home() {
  const c = usePalette();
  const active = useActiveCharacter();
  const status = useSync((s) => s.status);
  const initials = (active?.name ?? '').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '⋯';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 8 }}>
        <Pressable
          onPress={() => router.push('/compendium')}
          accessibilityRole="search"
          accessibilityLabel="Search the compendium"
          style={({ pressed }) => ({
            flex: 1, height: 36, borderRadius: 10,
            backgroundColor: c.fill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 18, color: c.secondaryLabel, marginRight: 6, marginTop: -2 }}>⌕</Text>
          <Text style={{ fontSize: 17, color: c.secondaryLabel }}>Search spells, items, rules</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityLabel="Characters and settings"
          style={({ pressed }) => ({ width: 36, height: 36, borderRadius: 18, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
        >
          {active?.avatar ? <Avatar uri={active.avatar} name={active.name} size={36} /> : <Text style={{ fontSize: 14, fontWeight: '700', color: c.accent }}>{initials}</Text>}
          {status === 'synced' || status === 'error' || status === 'syncing' ? (
            <View style={{ position: 'absolute', right: 0, bottom: 0, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: c.background, backgroundColor: status === 'error' ? c.red : status === 'syncing' ? c.secondaryLabel : c.green }} />
          ) : null}
        </Pressable>
      </View>
      <CharacterBar />
      <DiceTray />
    </SafeAreaView>
  );
}
