import { router } from 'expo-router';
import { memo, useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { resolveLink } from '../../compendium/store';
import { parseInline } from '../../compendium/tags';
import { Palette, usePalette } from '../../theme/colors';
import { useQuickRoll } from '../QuickRoll';

/* 5etools entry trees are loosely typed JSON. */
type E = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const ABIL: Record<string, string> = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };

export function openEntry(id: string) {
  router.push({ pathname: '/compendium/[id]', params: { id } });
}

/** Run-in headings read "Name." like the book, unless the source already punctuates them. */
const runIn = (name?: string) => (name && !/[.:!?]$/.test(name.trim()) ? `${name.trim()}.` : name);

/** One paragraph of tagged text: links open entries, dice roll on tap. */
export const Inline = memo(function Inline({ text, style, prefix }: { text: string; style?: object; prefix?: string }) {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  const quickRoll = useQuickRoll();
  const segs = useMemo(() => parseInline(text), [text]);
  return (
    <Text style={[s.p, style]}>
      {prefix ? <Text style={s.inlineHead}>{prefix} </Text> : null}
      {segs.map((seg, i) => {
        if (seg.kind === 'text')
          return (
            <Text key={i} style={seg.style === 'bold' ? s.bold : seg.style === 'italic' ? s.italic : undefined}>
              {seg.text}
            </Text>
          );
        if (seg.kind === 'dice')
          return (
            <Text key={i} style={s.dice} onPress={() => quickRoll(seg.formula)} accessibilityRole="button" accessibilityHint="Rolls these dice">
              {seg.text}
            </Text>
          );
        const id = resolveLink(seg.tag, seg.ref);
        return id ? (
          <Text key={i} style={s.link} onPress={() => openEntry(id)} accessibilityRole="link">
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        );
      })}
    </Text>
  );
});

function Table({ e }: { e: E }) {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  const { width } = useWindowDimensions();
  const cols: number = e.colLabels?.length ?? (Array.isArray(e.rows?.[0]) ? e.rows[0].length : 1);
  // 5etools gives Bootstrap-like "col-N" widths out of 12; honour them, but never squeeze a column below 72pt.
  const tableW = Math.max(width - 32, cols * 72);
  const spans: number[] = Array.from({ length: cols }, (_, i) => Number(/col-(\d+)/.exec(e.colStyles?.[i] ?? '')?.[1] ?? 0));
  const known = spans.reduce((a, b) => a + b, 0);
  const free = spans.filter((x) => !x).length;
  const colW = spans.map((sp) => Math.max(72, ((sp || (known < 12 && free ? (12 - known) / free : 12 / cols)) / Math.max(12, known)) * tableW));
  const cell = (v: E): string =>
    typeof v === 'string' ? v : typeof v === 'number' ? String(v) : v?.roll ? (v.roll.exact !== undefined ? String(v.roll.exact) : `${v.roll.min}–${v.roll.max}`) : v?.entry ?? v?.entries?.join(' ') ?? '';
  return (
    <View style={s.block}>
      {e.caption ? <Text style={s.caption}>{e.caption}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.table}>
          {e.colLabels ? (
            <View style={[s.tr, s.thead]}>
              {e.colLabels.map((h: string, i: number) => (
                <Inline key={i} text={h} style={[s.td, s.th, { width: colW[i] }]} />
              ))}
            </View>
          ) : null}
          {(e.rows ?? []).map((row: E, r: number) => {
            const cells = Array.isArray(row) ? row : row.row ?? [];
            return (
              <View key={r} style={[s.tr, r % 2 === 1 && s.trAlt]}>
                {cells.map((v: E, i: number) => (
                  <Inline key={i} text={cell(v)} style={[s.td, { width: colW[i] }]} />
                ))}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/** Renders a 5etools `entries` array. Unknown node types are skipped rather than shown raw. */
export function Entries({ entries, depth = 0 }: { entries: E[]; depth?: number }) {
  return (
    <>
      {entries.map((e, i) => (
        <Node key={i} e={e} depth={depth} />
      ))}
    </>
  );
}

function Node({ e, depth }: { e: E; depth: number }) {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  if (e == null) return null;
  if (typeof e === 'string') return <Inline text={e} />;
  if (typeof e === 'number') return <Inline text={String(e)} />;
  switch (e.type) {
    case 'entries':
    case 'section':
    case 'variant':
    case 'variantSub': {
      const kids: E[] = e.entries ?? [];
      // Deep named blocks read like the book: bold-italic run-in heading.
      if (e.name && depth >= 1 && typeof kids[0] === 'string') {
        return (
          <View style={s.block}>
            <Inline text={kids[0]} prefix={`${e.name}.`} />
            <Entries entries={kids.slice(1)} depth={depth + 1} />
          </View>
        );
      }
      return (
        <View style={s.block}>
          {e.name ? <Text style={depth === 0 ? s.h2 : s.h3}>{e.name}</Text> : null}
          <Entries entries={kids} depth={depth + 1} />
        </View>
      );
    }
    case 'inset':
    case 'insetReadaloud':
    case 'quote':
      return (
        <View style={[s.block, s.inset]}>
          {e.name ? <Text style={s.h3}>{e.name}</Text> : null}
          <Entries entries={e.entries ?? []} depth={depth + 1} />
          {e.by ? <Text style={s.caption}>— {e.by}</Text> : null}
        </View>
      );
    case 'list':
      return (
        <View style={s.block}>
          {(e.items ?? []).map((it: E, i: number) => {
            const hang = e.style?.includes('hang');
            return (
              <View key={i} style={s.li}>
                {!hang && <Text style={s.bullet}>•</Text>}
                <View style={{ flex: 1 }}>
                  {typeof it === 'string' ? (
                    <Inline text={it} />
                  ) : it.type === 'item' || it.type === 'itemSub' || it.type === 'itemSpell' ? (
                    <>
                      <Inline text={it.entry ?? (typeof it.entries?.[0] === 'string' ? it.entries[0] : '')} prefix={runIn(it.name)} />
                      {it.entries && <Entries entries={typeof it.entries[0] === 'string' ? it.entries.slice(1) : it.entries} depth={depth + 1} />}
                    </>
                  ) : (
                    <Node e={it} depth={depth + 1} />
                  )}
                </View>
              </View>
            );
          })}
        </View>
      );
    case 'item':
    case 'itemSub':
      return <Inline text={e.entry ?? e.entries?.join(' ') ?? ''} prefix={runIn(e.name)} />;
    case 'table':
      return <Table e={e} />;
    case 'tableGroup':
      return <>{(e.tables ?? []).map((t: E, i: number) => <Table key={i} e={t} />)}</>;
    case 'options':
      return <Entries entries={e.entries ?? []} depth={depth} />;
    case 'inline':
    case 'inlineBlock':
      return <Inline text={(e.entries ?? []).map((x: E) => (typeof x === 'string' ? x : x.text ?? '')).join('')} />;
    case 'refClassFeature':
    case 'refSubclassFeature':
    case 'refOptionalfeature': {
      const ref: string = e.classFeature ?? e.subclassFeature ?? e.optionalfeature;
      const tag = e.type === 'refClassFeature' ? 'classFeature' : e.type === 'refSubclassFeature' ? 'subclassFeature' : 'optfeature';
      return <Inline text={`{@${tag} ${ref}}`} style={s.ref} />;
    }
    case 'abilityDc':
      return (
        <Text style={[s.p, s.formulaBox]}>
          <Text style={s.bold}>{e.name} save DC</Text> = 8 + your Proficiency Bonus + your {e.attributes.map((a: string) => ABIL[a]).join(' or ')} modifier
        </Text>
      );
    case 'abilityAttackMod':
      return (
        <Text style={[s.p, s.formulaBox]}>
          <Text style={s.bold}>{e.name} attack modifier</Text> = your Proficiency Bonus + your {e.attributes.map((a: string) => ABIL[a]).join(' or ')} modifier
        </Text>
      );
    case 'abilityGeneric':
      return <Inline text={e.text} style={s.formulaBox} />;
    case 'hr':
      return <View style={s.hr} />;
    case 'bonus':
      return <Text style={s.p}>{e.value >= 0 ? `+${e.value}` : e.value}</Text>;
    default:
      if (Array.isArray(e.entries)) return <Entries entries={e.entries} depth={depth} />;
      return null;
  }
}

const styles = (c: Palette) =>
  StyleSheet.create({
    p: { fontSize: 16, lineHeight: 23, color: c.label, marginBottom: 10 },
    bold: { fontWeight: '600' },
    italic: { fontStyle: 'italic' },
    inlineHead: { fontWeight: '700', fontStyle: 'italic' },
    link: { color: c.accent },
    dice: { color: c.accent, fontWeight: '600', fontVariant: ['tabular-nums'] },
    block: { marginBottom: 4 },
    h2: { fontSize: 20, fontWeight: '700', color: c.label, marginTop: 10, marginBottom: 8 },
    h3: { fontSize: 17, fontWeight: '600', color: c.label, marginTop: 6, marginBottom: 6 },
    inset: { backgroundColor: c.fill, borderRadius: 12, padding: 12, marginVertical: 6 },
    li: { flexDirection: 'row', gap: 8 },
    bullet: { fontSize: 16, lineHeight: 23, color: c.secondaryLabel },
    caption: { fontSize: 13, fontWeight: '600', color: c.secondaryLabel, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
    table: { borderRadius: 10, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: c.separator, marginBottom: 12 },
    tr: { flexDirection: 'row' },
    trAlt: { backgroundColor: c.fill },
    thead: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    th: { fontWeight: '600' },
    td: { fontSize: 14, lineHeight: 19, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 0 },
    ref: { fontWeight: '600' },
    formulaBox: { textAlign: 'center', backgroundColor: c.fill, borderRadius: 10, padding: 10 },
    hr: { height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginVertical: 12 },
  });
