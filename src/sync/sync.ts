import { AppState } from 'react-native';
import { create } from 'zustand';
import { useCharacters } from '../character/store';
import { supabase } from './client';
import { merge, RemoteRow } from './merge';

export type SyncStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'error';

interface SyncState {
  status: SyncStatus;
  email: string | null;
  lastSync: number | null;
  error: string | null;
}

export const useSync = create<SyncState>(() => ({ status: supabase ? 'signed-out' : 'off', email: null, lastSync: null, error: null }));

let running: Promise<void> | null = null;
let again = false;

/** Pull everything for this user, merge, push what the server is missing. Safe to call any time. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce() {
  if (!supabase) return;
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    useSync.setState({ status: 'signed-out', email: null });
    return;
  }
  useSync.setState({ status: 'syncing', email: session.session.user.email ?? null, error: null });
  const { data, error } = await supabase.from('characters').select('id, data, updated_ms, deleted');
  if (error) return fail(error.message);
  const st = useCharacters.getState();
  const result = merge(st.characters, st.tombstones, (data ?? []) as RemoteRow[]);
  if (result.push.length) {
    const { error: upErr } = await supabase.from('characters').upsert(result.push.map((r) => ({ ...r, user_id: session.session!.user.id })));
    if (upErr) return fail(upErr.message);
  }
  // Only apply if nothing changed locally while we were on the network; otherwise go round again.
  if (useCharacters.getState().characters !== st.characters || useCharacters.getState().tombstones !== st.tombstones) {
    again = true;
    return;
  }
  useCharacters.getState().applySync(result.characters, result.tombstones);
  useSync.setState({ status: 'synced', lastSync: Date.now() });
}

/** Supabase surfaces fetch failures verbatim ("Failed to fetch", "Network request failed"). */
export const friendly = (message: string) =>
  /failed to fetch|network request failed|load failed/i.test(message) ? 'Can’t reach the sync server. Check your connection and try again.' : message;

function fail(message: string) {
  useSync.setState({ status: 'error', error: friendly(message) });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

/** Starts background sync: on launch, on sign-in, when the app comes back, and 2 s after local edits. */
export function startSync() {
  if (!supabase || started) return;
  started = true;
  const kick = () => {
    clearTimeout(timer);
    timer = setTimeout(() => void syncNow(), 2000);
  };
  supabase.auth.onAuthStateChange((_event, session) => {
    useSync.setState({ email: session?.user.email ?? null, status: session ? useSync.getState().status : 'signed-out' });
    if (session) void syncNow();
  });
  useCharacters.subscribe((s, prev) => {
    if (s.hydrated && (s.characters !== prev.characters || s.tombstones !== prev.tombstones) && useSync.getState().status !== 'syncing') kick();
  });
  AppState.addEventListener('change', (state) => state === 'active' && void syncNow());
  void syncNow();
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'Sync is not configured';
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? friendly(error.message) : null;
}

export async function signUp(email: string, password: string): Promise<{ error: string | null; needsConfirm: boolean }> {
  if (!supabase) return { error: 'Sync is not configured', needsConfirm: false };
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  return { error: error ? friendly(error.message) : null, needsConfirm: !error && !data.session };
}

export async function signOut() {
  await supabase?.auth.signOut();
  useSync.setState({ status: 'signed-out', email: null, lastSync: null });
}
