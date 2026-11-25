import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { derive } from '../character/engine';
import { useCharacters } from '../character/store';
import { Button, Row, Section, close, useStyles } from '../components/ui';
import { syncConfigured } from '../sync/client';
import { signIn, signOut, signUp, syncNow, useSync } from '../sync/sync';
import { Palette } from '../theme/colors';

const ago = (t: number | null) => {
  if (!t) return 'never';
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'just now' : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleString();
};

export default function Settings() {
  const characters = useCharacters((s) => s.characters);
  const activeId = useCharacters((s) => s.activeId);
  const setActive = useCharacters((s) => s.setActive);
  const sync = useSync();
  const [st, pal] = useStyles(styles);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const list = useMemo(() => Object.values(characters).sort((a, b) => b.updatedAt - a.updatedAt), [characters]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Settings', headerRight: () => <Pressable onPress={close} hitSlop={8}><Text style={st.done}>Done</Text></Pressable> }} />
      <ScrollView style={st.root} contentContainerStyle={st.content} keyboardShouldPersistTaps="handled">
        <Section title="Characters" footer="Tap to play as that character. Edit or delete from its sheet.">
          {list.map((c, i) => {
            const d = derive(c);
            return (
              <Row key={c.id} first={i === 0} label={c.name || 'Unnamed'} detail={`Level ${d.level} · ${d.summary}`}
                onPress={() => { setActive(c.id); close(); }}
                right={c.id === activeId ? <Text style={st.check}>✓</Text> : <View />} />
            );
          })}
          <Row first={list.length === 0} label="New character" valueStyle={{ color: pal.accent }} onPress={() => router.push('/character/edit')} />
        </Section>

        <Section
          title="Sync"
          footer={
            !syncConfigured
              ? 'Cloud sync is not set up in this build. Characters are saved on this device.'
              : 'Characters are saved on this device first and sync in the background, so the app works offline. If two devices edit the same character, the most recent edit wins.'
          }
        >
          {!syncConfigured ? (
            <Row first label="Status" value="Off" />
          ) : sync.email ? (
            <>
              <Row first label="Account" value={sync.email} />
              <Row label="Status" value={sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Error' : `Synced ${ago(sync.lastSync)}`}
                valueStyle={sync.status === 'error' ? { color: pal.red } : undefined} />
              {sync.error ? <Text style={st.error}>{sync.error}</Text> : null}
              <Row label="Sync now" valueStyle={{ color: pal.accent }} onPress={() => run(syncNow)} />
              <Row label="Sign out" valueStyle={{ color: pal.red }} onPress={() => run(signOut)} detail="Characters stay on this device." />
            </>
          ) : (
            <View style={st.form}>
              <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={pal.tertiaryLabel} style={st.input}
                autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" autoComplete="email" />
              <TextInput value={password} onChangeText={setPassword} placeholder="Password" placeholderTextColor={pal.tertiaryLabel} style={st.input}
                secureTextEntry textContentType="password" autoComplete="password" />
              {msg && <Text style={[st.msg, msg.error && { color: pal.red }]}>{msg.text}</Text>}
              <Button title={busy ? 'Signing in…' : 'Sign In'} disabled={busy || !email || password.length < 6}
                onPress={() => run(async () => {
                  const err = await signIn(email, password);
                  setMsg(err ? { text: err, error: true } : { text: 'Signed in. Syncing…' });
                })} />
              <Button kind="tinted" title="Create Account" style={{ marginTop: 10 }} disabled={busy || !email || password.length < 6}
                onPress={() => run(async () => {
                  const r = await signUp(email, password);
                  setMsg(r.error ? { text: r.error, error: true } : r.needsConfirm ? { text: 'Check your email to confirm the account, then sign in here.' } : { text: 'Account created. Syncing…' });
                })} />
              <Text style={st.hint}>Password needs at least 6 characters.</Text>
            </View>
          )}
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    content: { paddingTop: 16, paddingBottom: 60 },
    done: { fontSize: 17, color: c.accent, fontWeight: '600', paddingHorizontal: 8 },
    check: { fontSize: 17, color: c.accent, fontWeight: '700' },
    form: { padding: 14 },
    input: { height: 44, borderRadius: 10, backgroundColor: c.fill, paddingHorizontal: 12, fontSize: 17, color: c.label, marginBottom: 10, outlineStyle: 'none' } as object,
    msg: { fontSize: 14, color: c.secondaryLabel, marginBottom: 10 },
    error: { fontSize: 13, color: c.red, paddingHorizontal: 16, paddingBottom: 10 },
    hint: { fontSize: 12, color: c.tertiaryLabel, marginTop: 10, textAlign: 'center' },
  });
