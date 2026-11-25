import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CharacterBar } from '../components/CharacterBar';
import { DiceTray } from '../components/dice/DiceTray';
import { usePalette } from '../theme/colors';

export default function Home() {
  const c = usePalette();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
      <Pressable
        onPress={() => router.push('/compendium')}
        accessibilityRole="search"
        accessibilityLabel="Search the compendium"
        style={({ pressed }) => ({
          marginHorizontal: 16, marginTop: 4, marginBottom: 8, height: 36, borderRadius: 10,
          backgroundColor: c.fill, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, opacity: pressed ? 0.6 : 1,
        })}
      >
        <Text style={{ fontSize: 18, color: c.secondaryLabel, marginRight: 6, marginTop: -2 }}>⌕</Text>
        <Text style={{ fontSize: 17, color: c.secondaryLabel }}>Search spells, items, rules</Text>
      </Pressable>
      <CharacterBar />
      <DiceTray />
    </SafeAreaView>
  );
}
