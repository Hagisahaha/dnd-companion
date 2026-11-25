import { ScrollView, Text, View } from 'react-native';

/**
 * Last-resort error screen. Shows the message and stack so a crash on a device
 * (where there is no console) can be screenshotted and fixed.
 * Plain styles only: it must render even if the theme or router failed to load.
 */
export function CrashScreen({ error }: { error: unknown }) {
  const e = error as { name?: string; message?: string; stack?: string; componentStack?: string };
  return (
    <View style={{ flex: 1, backgroundColor: '#1c1c1e', paddingTop: 60, paddingHorizontal: 16 }}>
      <Text style={{ color: '#ff453a', fontSize: 20, fontWeight: '700' }}>App crashed</Text>
      <Text style={{ color: '#fff', fontSize: 15, marginTop: 8 }} selectable>
        {e?.name ?? 'Error'}: {e?.message ?? String(error)}
      </Text>
      <ScrollView style={{ marginTop: 12 }} contentContainerStyle={{ paddingBottom: 60 }}>
        <Text style={{ color: '#aaa', fontSize: 11, fontFamily: 'Menlo' }} selectable>
          {e?.stack ?? ''}
          {e?.componentStack ? `\n\nComponent stack:${e.componentStack}` : ''}
        </Text>
      </ScrollView>
    </View>
  );
}
