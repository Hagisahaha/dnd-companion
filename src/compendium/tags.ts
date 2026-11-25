/**
 * Parser for 5etools inline tags: "{@spell fireball|XPHB}", "{@damage 8d6}", "{@b bold {@i nested}}".
 * Produces flat segments the renderer can style, link, or make tappable for rolling.
 */

export type Segment =
  | { kind: 'text'; text: string; style?: 'bold' | 'italic' }
  | { kind: 'link'; text: string; tag: string; ref: string }
  | { kind: 'dice'; text: string; formula: string };

const ABIL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

/** Tags whose content is "name|source|display" and that point at a compendium entry. */
export const LINK_TAGS = new Set([
  'spell', 'item', 'feat', 'background', 'race', 'condition', 'disease', 'status', 'action',
  'variantrule', 'optfeature', 'classFeature', 'subclassFeature',
]);

function display(tag: string, parts: string[]): string {
  switch (tag) {
    case 'classFeature':
      return parts[4] || parts[0];
    case 'subclassFeature':
      return parts[6] || parts[0];
    case 'class':
    case 'subclass':
      return parts[parts.length > 4 ? 4 : 2] || parts[0];
    default:
      return parts[2] || parts[0];
  }
}

const ATK: Record<string, string> = {
  mw: 'Melee Weapon Attack:', rw: 'Ranged Weapon Attack:', 'mw,rw': 'Melee or Ranged Weapon Attack:',
  ms: 'Melee Spell Attack:', rs: 'Ranged Spell Attack:', 'ms,rs': 'Melee or Ranged Spell Attack:',
  m: 'Melee Attack Roll:', r: 'Ranged Attack Roll:', 'm,r': 'Melee or Ranged Attack Roll:',
};

function tagToSegments(tag: string, body: string): Segment[] {
  const parts = body.split('|');
  switch (tag) {
    case 'b':
    case 'bold':
      return parseInline(body).map((s) => (s.kind === 'text' ? { ...s, style: 'bold' } : s));
    case 'i':
    case 'italic':
      return parseInline(body).map((s) => (s.kind === 'text' ? { ...s, style: 'italic' } : s));
    case 'dice':
    case 'damage':
    case 'autodice':
      return [{ kind: 'dice', text: parts[1] || parts[0], formula: parts[0].replace(/\s/g, '') }];
    case 'scaledamage':
    case 'scaledice':
      return [{ kind: 'dice', text: parts[2], formula: parts[2].replace(/\s/g, '') }];
    case 'hit': {
      const n = Number(parts[0]);
      const t = parts[1] || (n >= 0 ? `+${n}` : String(n));
      return [{ kind: 'dice', text: t, formula: `1d20${n >= 0 ? '+' : ''}${n}` }];
    }
    case 'd20': {
      const n = Number(parts[0]);
      return [{ kind: 'dice', text: parts[1] || (n >= 0 ? `+${n}` : String(n)), formula: `1d20${n >= 0 ? '+' : ''}${n}` }];
    }
    case 'dc':
      return [{ kind: 'text', text: `DC ${parts[1] || parts[0]}` }];
    case 'chance':
      return [{ kind: 'text', text: parts[1] || `${parts[0]} percent` }];
    case 'recharge':
      return [{ kind: 'text', text: `(Recharge ${parts[0] ? `${parts[0]}–6` : '6'})`, style: 'bold' }];
    case 'atk':
    case 'atkr':
      return [{ kind: 'text', text: ATK[parts[0]] ?? 'Attack:', style: 'italic' }];
    case 'h':
      return [{ kind: 'text', text: 'Hit: ', style: 'italic' }];
    case 'm':
      return [{ kind: 'text', text: 'Miss: ', style: 'italic' }];
    case 'hom':
      return [{ kind: 'text', text: 'Hit or Miss: ', style: 'italic' }];
    case 'actSave':
      return [{ kind: 'text', text: `${ABIL[parts[0]] ?? parts[0]} Saving Throw:`, style: 'italic' }];
    case 'actSaveFail':
      return [{ kind: 'text', text: parts[0] ? `${ordinalWord(parts[0])} Failure:` : 'Failure:', style: 'italic' }];
    case 'actSaveSuccess':
      return [{ kind: 'text', text: 'Success:', style: 'italic' }];
    case 'actSaveSuccessOrFail':
      return [{ kind: 'text', text: 'Failure or Success:', style: 'italic' }];
    case 'actTrigger':
      return [{ kind: 'text', text: 'Trigger:', style: 'italic' }];
    case 'actResponse':
      return [{ kind: 'text', text: 'Response:', style: 'italic' }];
    case 'note':
      return parseInline(body).map((s) => (s.kind === 'text' ? { ...s, style: 'italic' } : s));
    default:
      if (LINK_TAGS.has(tag)) return [{ kind: 'link', text: display(tag, parts), tag, ref: body }];
      return [{ kind: 'text', text: display(tag, parts) }];
  }
}

function ordinalWord(n: string) {
  return ({ '1': 'First', '2': 'Second', '3': 'Third' } as Record<string, string>)[n] ?? n;
}

/** Splits a string with 5etools tags into segments. Handles nesting and stray braces. */
export function parseInline(src: string): Segment[] {
  const out: Segment[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) out.push({ kind: 'text', text: buf });
    buf = '';
  };
  while (i < src.length) {
    if (src.startsWith('{@', i)) {
      // Find the matching close brace, respecting nested tags.
      let depth = 0;
      let j = i;
      for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}' && --depth === 0) break;
      }
      if (j >= src.length) {
        buf += src.slice(i);
        break;
      }
      const inner = src.slice(i + 2, j);
      const space = inner.indexOf(' ');
      const tag = space < 0 ? inner : inner.slice(0, space);
      const body = space < 0 ? '' : inner.slice(space + 1);
      flush();
      out.push(...tagToSegments(tag, body));
      i = j + 1;
    } else {
      buf += src[i++];
    }
  }
  flush();
  // Merge adjacent plain text so the renderer emits fewer nodes.
  return out.reduce<Segment[]>((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.kind === 'text' && s.kind === 'text' && prev.style === s.style) prev.text += s.text;
    else acc.push({ ...s });
    return acc;
  }, []);
}

/** Plain text of a tagged string (for search snippets and accessibility). */
export function plainText(src: string): string {
  return parseInline(src).map((s) => s.text).join('');
}
