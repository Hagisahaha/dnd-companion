-- Characters synced between a player's devices.
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.

create table if not exists public.characters (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The whole character as the app stores it (see src/character/types.ts).
  data jsonb not null,
  -- Character.updatedAt in ms; the newest edit wins when two devices disagree.
  updated_ms bigint not null,
  -- Tombstone, so a deletion on one device reaches the others.
  deleted boolean not null default false
);

create index if not exists characters_user_id_idx on public.characters (user_id);

-- Newer Supabase projects don't expose new tables to the API roles automatically.
-- Signed-in players get table access; the policies below narrow it to their own rows.
-- The anonymous role gets nothing.
grant select, insert, update on public.characters to authenticated;

-- Each player can only see and change their own characters.
alter table public.characters enable row level security;

drop policy if exists "characters: read own" on public.characters;
create policy "characters: read own" on public.characters
  for select using (auth.uid() = user_id);

drop policy if exists "characters: insert own" on public.characters;
create policy "characters: insert own" on public.characters
  for insert with check (auth.uid() = user_id);

drop policy if exists "characters: update own" on public.characters;
create policy "characters: update own" on public.characters
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
