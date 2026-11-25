import { useDeferredValue, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FACETS, Filters, SORTS, activeCount, arrange, facetCounts, matches } from '../../compendium/facets';
import { CATEGORIES, Category, IndexEntry, getIndex, search, sourceName } from '../../compendium/store';
import { openEntry } from '../../components/compendium/Entries';
import { Segmented, close } from '../../components/ui';
import { Palette, usePalette } from '../../theme/colors';

type CatKey = Category | 'all';
const ROW_H = 60;
const COLLAPSED = 12;
const NO_FILTERS: Filters = {};
const catLabel = (c: Category) => CATEGORIES.find((x) => x.key === c)?.label ?? c;

export default function CompendiumSearch() {
  const c = usePalette();
  const s = useMemo(() => styles(c), [c]);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState<CatKey>('all');
  // Filters and sort are remembered per category while the screen is open.
  const [filtersByCat, setFiltersByCat] = useState<Partial<Record<CatKey, Filters>>>({});
  const [sortByCat, setSortByCat] = useState<Partial<Record<CatKey, string>>>({});
  const [panel, setPanel] = useState(false);
  const q = useDeferredValue(query);

  const filters = filtersByCat[cat] ?? NO_FILTERS;
  const sortKey = sortByCat[cat] ?? 'name';
  const setFilters = (f: Filters) => setFiltersByCat((x) => ({ ...x, [cat]: f }));
  const toggle = (key: string, value: string) => {
    const cur = filters[key] ?? [];
    setFilters({ ...filters, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };

  const results = useMemo(
    () => search(q, cat === 'all' ? null : cat, Infinity, (e) => matches(e, filters)),
    [q, cat, filters],
  );
  // With a query, relevance order matters more than grouping.
  const sections = useMemo(() => (q ? [{ title: null, data: results }] : arrange(results, cat, sortKey, catLabel)), [q, results, cat, sortKey]);
  const pills = Object.entries(filters).flatMap(([key, vals]) => vals.map((v) => ({ key, v })));
  const n = activeCount(filters);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.searchRow}>
        <View style={s.field}>
          <Text style={s.glass}>⌕</Text>
          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder="Spells, items, features, rules"
            placeholderTextColor={c.secondaryLabel}
            style={s.input}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable onPress={close} hitSlop={8}>
          <Text style={s.cancel}>Done</Text>
        </Pressable>
      </View>

      <View style={{ height: 40 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
          {[{ key: 'all' as CatKey, label: 'All' }, ...CATEGORIES].map((x) => {
            const on = cat === x.key;
            return (
              <Pressable key={x.label} onPress={() => setCat(x.key)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{x.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={s.toolbar}>
        <Pressable onPress={() => setPanel(true)} style={({ pressed }) => [s.tool, n > 0 && s.toolOn, pressed && { opacity: 0.6 }]} accessibilityLabel="Filters">
          <Text style={[s.toolText, n > 0 && s.toolTextOn]}>{n ? `Filters · ${n}` : 'Filters'}</Text>
        </Pressable>
        {SORTS[cat].length > 1 && !q && (
          <Pressable
            onPress={() => {
              const list = SORTS[cat];
              const i = list.findIndex((x) => x.key === sortKey);
              setSortByCat((x) => ({ ...x, [cat]: list[(i + 1) % list.length].key }));
            }}
            style={({ pressed }) => [s.tool, pressed && { opacity: 0.6 }]}
            accessibilityLabel="Change sort"
          >
            <Text style={s.toolText}>Sort: {SORTS[cat].find((x) => x.key === sortKey)?.label ?? 'Name'}</Text>
          </Pressable>
        )}
        <Text style={s.count}>{results.length} result{results.length === 1 ? '' : 's'}</Text>
      </View>

      {pills.length > 0 && (
        <View style={{ height: 38 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} keyboardShouldPersistTaps="handled">
            {pills.map((p) => {
              const def = FACETS[cat].find((f) => f.key === p.key);
              return (
                <Pressable key={`${p.key}:${p.v}`} onPress={() => toggle(p.key, p.v)} style={s.pill} accessibilityLabel={`Remove filter ${p.v}`}>
                  <Text style={s.pillText}>{def?.format ? def.format(p.v) : p.v} ✕</Text>
                </Pressable>
              );
            })}
            <Pressable onPress={() => setFilters({})} style={s.pillClear}>
              <Text style={s.pillClearText}>Clear all</Text>
            </Pressable>
          </ScrollView>
        </View>
      )}

      <SectionList
        sections={sections as { title: string | null; data: IndexEntry[] }[]}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        stickySectionHeadersEnabled
        initialNumToRender={16}
        windowSize={11}
        renderSectionHeader={({ section }) => (section.title ? <Text style={s.section}>{section.title} · {section.data.length}</Text> : null)}
        renderItem={({ item }) => <Row e={item} s={s} />}
        ListEmptyComponent={<Text style={s.empty}>{n ? 'Nothing matches these filters.' : 'No matches'}</Text>}
      />

      <FilterPanel visible={panel} cat={cat} filters={filters} onToggle={toggle} onReset={() => setFilters({})} onClose={() => setPanel(false)}
        sortKey={sortKey} onSort={(k) => setSortByCat((x) => ({ ...x, [cat]: k }))} resultCount={results.length} s={s} />
    </SafeAreaView>
  );
}

function FilterPanel({ visible, cat, filters, onToggle, onReset, onClose, sortKey, onSort, resultCount, s }: {
  visible: boolean; cat: CatKey; filters: Filters; onToggle: (k: string, v: string) => void; onReset: () => void; onClose: () => void;
  sortKey: string; onSort: (k: string) => void; resultCount: number; s: ReturnType<typeof styles>;
}) {
  const c = usePalette();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const pool = useMemo(() => getIndex().filter((e) => cat === 'all' || e.cat === cat), [cat]);
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }} edges={['top', 'bottom']}>
        <View style={s.panelHead}>
          <Pressable onPress={onReset} hitSlop={8}><Text style={s.reset}>Reset</Text></Pressable>
          <Text style={s.panelTitle}>Filters</Text>
          <Pressable onPress={onClose} hitSlop={8}><Text style={s.cancel}>Done</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {SORTS[cat].length > 1 && (
            <View style={s.facet}>
              <Text style={s.facetTitle}>Sort by</Text>
              <Segmented options={SORTS[cat].map((x) => ({ value: x.key, label: x.label }))} value={sortKey} onChange={onSort} />
            </View>
          )}
          {FACETS[cat].map((def) => {
            const values = facetCounts(pool, def, filters);
            if (values.length < 2 && !(filters[def.key]?.length)) return null;
            const many = values.length > COLLAPSED + 2;
            const shown = many && !expanded[def.key] ? values.slice(0, COLLAPSED) : values;
            return (
              <View key={def.key} style={s.facet}>
                <Text style={s.facetTitle}>{def.label}</Text>
                <View style={s.wrap}>
                  {shown.map(({ value, count }) => {
                    const on = filters[def.key]?.includes(value);
                    return (
                      <Pressable key={value} onPress={() => onToggle(def.key, value)} style={[s.fchip, on && s.fchipOn]} accessibilityState={{ selected: !!on }}>
                        <Text style={[s.fchipText, on && s.fchipTextOn]}>
                          {def.key === 'source' ? value : def.format ? def.format(value) : value}
                          <Text style={[s.fcount, on && s.fchipTextOn]}> {count}</Text>
                        </Text>
                      </Pressable>
                    );
                  })}
                  {many && (
                    <Pressable onPress={() => setExpanded((x) => ({ ...x, [def.key]: !x[def.key] }))} style={s.more}>
                      <Text style={s.moreText}>{expanded[def.key] ? 'Show less' : `Show all ${values.length}`}</Text>
                    </Pressable>
                  )}
                </View>
                {def.key === 'source' && filters.source?.length ? (
                  <Text style={s.sourceNames}>{filters.source.map(sourceName).join(' · ')}</Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
        <View style={s.panelFoot}>
          <Pressable onPress={onClose} style={s.showBtn}>
            <Text style={s.showText}>Show {resultCount} result{resultCount === 1 ? '' : 's'}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Row({ e, s }: { e: IndexEntry; s: ReturnType<typeof styles> }) {
  return (
    <Pressable onPress={() => openEntry(e.id)} style={({ pressed }) => [s.row, pressed && s.rowPressed]}>
      <View style={{ flex: 1 }}>
        <Text style={s.name} numberOfLines={1}>{e.name}</Text>
        <Text style={s.sub} numberOfLines={1}>{e.subtitle}</Text>
      </View>
      <Text style={s.src}>{e.source}</Text>
    </Pressable>
  );
}

const styles = (c: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8 },
    field: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: c.fill, borderRadius: 10, paddingHorizontal: 8, height: 36 },
    glass: { fontSize: 18, color: c.secondaryLabel, marginRight: 4, marginTop: -2 },
    input: { flex: 1, fontSize: 17, color: c.label, paddingVertical: 0, outlineStyle: 'none' } as object,
    cancel: { fontSize: 17, color: c.accent, fontWeight: '600' },
    chips: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
    chip: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: c.fill, justifyContent: 'center' },
    chipOn: { backgroundColor: c.accent },
    chipText: { fontSize: 14, color: c.label, fontWeight: '500' },
    chipTextOn: { color: c.onAccent },
    toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
    tool: { height: 30, paddingHorizontal: 12, borderRadius: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: c.separator, justifyContent: 'center' },
    toolOn: { backgroundColor: c.accent, borderColor: c.accent },
    toolText: { fontSize: 14, color: c.accent, fontWeight: '600' },
    toolTextOn: { color: c.onAccent },
    count: { marginLeft: 'auto', fontSize: 13, color: c.secondaryLabel },
    pill: { height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: c.fillStrong, justifyContent: 'center' },
    pillText: { fontSize: 13, color: c.label, fontWeight: '500' },
    pillClear: { height: 28, paddingHorizontal: 8, justifyContent: 'center' },
    pillClearText: { fontSize: 13, color: c.red },
    section: { fontSize: 13, fontWeight: '600', color: c.secondaryLabel, textTransform: 'uppercase', backgroundColor: c.background, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
    row: { height: ROW_H, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.separator },
    rowPressed: { backgroundColor: c.fill },
    name: { fontSize: 17, color: c.label },
    sub: { fontSize: 13, color: c.secondaryLabel, marginTop: 2 },
    src: { fontSize: 12, color: c.tertiaryLabel, marginLeft: 12, fontWeight: '500' },
    empty: { textAlign: 'center', color: c.secondaryLabel, marginTop: 40, fontSize: 15 },
    panelHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
    panelTitle: { fontSize: 17, fontWeight: '700', color: c.label },
    reset: { fontSize: 17, color: c.red },
    facet: { paddingHorizontal: 16, paddingTop: 14 },
    facetTitle: { fontSize: 13, fontWeight: '600', color: c.secondaryLabel, textTransform: 'uppercase', marginBottom: 8 },
    wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    fchip: { paddingHorizontal: 12, height: 32, borderRadius: 16, backgroundColor: c.fill, justifyContent: 'center' },
    fchipOn: { backgroundColor: c.accent },
    fchipText: { fontSize: 14, color: c.label, fontWeight: '500' },
    fchipTextOn: { color: c.onAccent },
    fcount: { fontSize: 12, color: c.secondaryLabel, fontWeight: '400' },
    more: { height: 32, paddingHorizontal: 8, justifyContent: 'center' },
    moreText: { fontSize: 14, color: c.accent, fontWeight: '600' },
    sourceNames: { fontSize: 12, color: c.secondaryLabel, marginTop: 6 },
    panelFoot: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator },
    showBtn: { height: 50, borderRadius: 14, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' },
    showText: { color: c.onAccent, fontSize: 17, fontWeight: '600' },
  });
