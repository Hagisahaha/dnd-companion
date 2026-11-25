import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getEntry } from '../../compendium/store';
import { usePalette } from '../../theme/colors';
import { Entries, Inline } from './Entries';

/** A compendium entry in a sheet, for reading about an option without leaving the picker. */
export function EntrySheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const c = usePalette();
  const e = id ? getEntry(id) : null;
  return (
    <Modal visible={!!e} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', padding: 16, paddingBottom: 0 }}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={{ fontSize: 17, color: c.accent, fontWeight: '600' }}>Done</Text>
          </Pressable>
        </View>
        {e && (
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }}>
            <Text style={{ fontSize: 26, fontWeight: '700', color: c.label }}>{e.name}</Text>
            <Text style={{ fontSize: 15, color: c.secondaryLabel, marginBottom: 14 }}>{e.subtitle}</Text>
            {e.fields?.map(([k, v]) => (
              <View key={k} style={{ flexDirection: 'row', gap: 10, marginBottom: 6 }}>
                <Text style={{ width: 110, color: c.secondaryLabel, fontSize: 15 }}>{k}</Text>
                <Inline text={v} style={{ flex: 1, fontSize: 15, marginBottom: 0 }} />
              </View>
            ))}
            <View style={{ height: 8 }} />
            <Entries entries={e.entries} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}
