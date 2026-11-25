import type { Character } from '../character/types';

export interface RemoteRow {
  id: string;
  data: Character;
  updated_ms: number;
  deleted: boolean;
}

export interface MergeResult {
  characters: Record<string, Character>;
  /** Local deletions still to remember (id -> deleted at). */
  tombstones: Record<string, number>;
  /** Rows to upsert on the server. */
  push: RemoteRow[];
}

/**
 * Last-write-wins merge of local characters with the server copy.
 * Pure, so every conflict case is unit tested; the network layer only moves rows.
 */
export function merge(local: Record<string, Character>, tombstones: Record<string, number>, remote: RemoteRow[]): MergeResult {
  const characters = { ...local };
  const stones = { ...tombstones };
  const push: RemoteRow[] = [];
  const seen = new Set<string>();

  for (const row of remote) {
    seen.add(row.id);
    const mine = characters[row.id];
    const deletedAt = stones[row.id];
    if (deletedAt !== undefined) {
      if (row.updated_ms > deletedAt && !row.deleted) {
        // Edited elsewhere after we deleted it: the edit wins, bring it back.
        characters[row.id] = row.data;
        delete stones[row.id];
      } else {
        if (!row.deleted) push.push({ ...row, deleted: true, updated_ms: deletedAt });
        delete stones[row.id];
      }
      continue;
    }
    if (row.deleted) {
      if (!mine || mine.updatedAt <= row.updated_ms) delete characters[row.id];
      else push.push({ id: mine.id, data: mine, updated_ms: mine.updatedAt, deleted: false });
      continue;
    }
    if (!mine || row.updated_ms > mine.updatedAt) characters[row.id] = row.data;
    else if (mine.updatedAt > row.updated_ms) push.push({ id: mine.id, data: mine, updated_ms: mine.updatedAt, deleted: false });
  }

  for (const c of Object.values(characters)) {
    if (!seen.has(c.id)) push.push({ id: c.id, data: c, updated_ms: c.updatedAt, deleted: false });
  }
  // Deleted locally before it ever reached the server: nothing to tell anyone.
  for (const id of Object.keys(stones)) if (!seen.has(id)) delete stones[id];

  return { characters, tombstones: stones, push };
}
