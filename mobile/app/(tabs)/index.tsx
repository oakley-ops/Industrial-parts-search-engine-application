import { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Image, Modal } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { openSearchStream } from '../../services/api';
import { SearchResult } from '../../types';
import { getCountryCode, isDomestic } from '../../services/location';
import { ACTIVE_VENDORS } from '../../utils/searchConfig';
import { getSearchHistory, addToSearchHistory, clearSearchHistory } from '../../utils/searchHistory';
import { THEME, vendorColor } from '../../constants/theme';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [findEquivalent, setFindEquivalent] = useState(false);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [domesticOnly, setDomesticOnly] = useState(false);
  const [activeVendors, setActiveVendors] = useState<Set<string>>(
    () => new Set(ACTIVE_VENDORS.map(v => v.slug))
  );
  const [inStockFirst, setInStockFirst] = useState(true);
  const [priceSort, setPriceSort] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (params.query) {
      setQuery(params.query);
      triggerSearch(params.query);
    }
  }, [params.query]);

  useEffect(() => {
    setCountryCode(getCountryCode());
  }, []);

  useEffect(() => {
    getSearchHistory().then(setSearchHistory);
  }, []);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  const triggerSearch = (q: string) => {
    if (!q.trim()) return;
    cleanupRef.current?.();
    setResults([]);
    setLoading(true);
    setSearched(true);
    setInStockFirst(true);
    addToSearchHistory(q.trim()).then(() => getSearchHistory().then(setSearchHistory));

    cleanupRef.current = openSearchStream(
      q.trim(),
      (_vendor, incoming) => {
        setResults(prev => [...prev, ...incoming]);
      },
      () => setLoading(false),
      () => setLoading(false),
    );
  };

  const doSearch = async () => {
    if (!query.trim()) return;
    if (findEquivalent) {
      router.push({
        pathname: '/crossref',
        params: { partNumber: query.trim() },
      });
      return;
    }
    triggerSearch(query);
  };

  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={s.card} onPress={() => router.push({
      pathname: '/part/[id]',
      params: {
        id: item.vendorSku || item.partNumber,
        imageUrl: item.imageUrl || '',
        sourceVendor: item.vendorName,
        sourceSlug: item.vendorSlug,
        sourcePrice: item.price != null ? item.price.toString() : '',
        sourceUrl: item.productUrl || '',
        sourceSku: item.vendorSku || '',
        sourceName: item.name,
      },
    })}>
      <View style={s.cardTop}>
        <View style={s.vendorBadgeRow}>
          <View style={[s.badge, { backgroundColor: vendorColor(item.vendorSlug) }]}><Text style={s.badgeText}>{item.vendorName}</Text></View>
          {countryCode && (
            <Text style={s.flagEmoji}>
              {isDomestic(item.vendorSlug, countryCode) ? '🇺🇸' : '🌍'}
            </Text>
          )}
        </View>
        <View style={[s.stockBadge, { backgroundColor: item.inStock ? THEME.colors.successSubtle : THEME.colors.dangerSubtle }]}>
          <Text style={{ color: item.inStock ? THEME.colors.success : THEME.colors.danger, fontSize: 11, fontWeight: '600' }}>
            {item.inStock ? 'IN STOCK' : 'OUT OF STOCK'}
          </Text>
        </View>
      </View>
      <View style={s.cardBody}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={s.thumb} resizeMode="contain" />
        ) : (
          <View style={s.thumbPlaceholder}><Ionicons name="cube-outline" size={28} color={THEME.colors.textMuted} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
          {item.vendorSku ? <Text style={s.sku}>SKU: {item.vendorSku}</Text> : null}
          <View style={s.cardBottom}>
            {item.price !== null
              ? <Text style={s.price}>${item.price.toFixed(2)}</Text>
              : <Text style={s.noPrice}>Price on request</Text>}
            <Ionicons name="chevron-forward" size={20} color={THEME.colors.textMuted} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  const sortedResults = [...results].sort((a, b) => {
    if (inStockFirst && a.inStock !== b.inStock) return a.inStock ? -1 : 1;
    if (priceSort) {
      if (a.price === null && b.price === null) return 0;
      if (a.price === null) return 1;
      if (b.price === null) return -1;
      return a.price - b.price;
    }
    return 0;
  });

  const displayedResults = sortedResults.filter(r => {
    if (!activeVendors.has(r.vendorSlug)) return false;
    if (domesticOnly && countryCode && !isDomestic(r.vendorSlug, countryCode)) return false;
    return true;
  });

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={20} color={THEME.colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput style={s.searchInput} placeholder="Part number, name, keyword..." placeholderTextColor={THEME.colors.placeholderText} value={query}
            onChangeText={setQuery} onSubmitEditing={doSearch} returnKeyType="search" autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" />
          {query.length > 0 && <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
            <Ionicons name="close-circle" size={20} color={THEME.colors.textMuted} /></TouchableOpacity>}
        </View>
        <TouchableOpacity style={s.searchBtn} onPress={doSearch} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.searchBtnText}>Search</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cameraBtn} onPress={() => router.push('/camera')}>
          <Ionicons name="camera" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Filter bar */}
      {(() => {
        const activeCount =
          (activeVendors.size < ACTIVE_VENDORS.length ? ACTIVE_VENDORS.length - activeVendors.size : 0) +
          (domesticOnly ? 1 : 0) + (priceSort ? 1 : 0) + (findEquivalent ? 1 : 0);
        const hints = [
          inStockFirst && 'In Stock First',
          priceSort && 'Price ↑',
          domesticOnly && '🇺🇸 Domestic',
          findEquivalent && 'Find Equivalent',
          activeVendors.size < ACTIVE_VENDORS.length && `${activeVendors.size}/${ACTIVE_VENDORS.length} Vendors`,
        ].filter(Boolean) as string[];
        return (
          <View style={s.filterBar}>
            <TouchableOpacity style={s.filterBtn} onPress={() => setShowFilters(true)}>
              <Ionicons name="options-outline" size={17} color={activeCount > 0 ? THEME.colors.accent : THEME.colors.textSecondary} />
              <Text style={[s.filterBtnText, activeCount > 0 && { color: THEME.colors.accent }]}>
                Filters{activeCount > 0 ? ` · ${activeCount}` : ''}
              </Text>
              <Ionicons name="chevron-down" size={14} color={activeCount > 0 ? THEME.colors.accent : THEME.colors.textMuted} />
            </TouchableOpacity>
            {hints.length > 0 && (
              <Text style={s.filterHints} numberOfLines={1}>{hints.join('  ·  ')}</Text>
            )}
          </View>
        );
      })()}

      {/* Filter bottom sheet */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <View style={sheet.overlay}>
          <TouchableOpacity style={sheet.backdrop} activeOpacity={1} onPress={() => setShowFilters(false)} />
          <View style={sheet.panel}>
            <View style={sheet.handle} />
            <Text style={sheet.title}>Filters & Sort</Text>

            <Text style={sheet.sectionLabel}>VENDORS</Text>
            {ACTIVE_VENDORS.map(v => (
              <TouchableOpacity
                key={v.slug}
                style={sheet.row}
                onPress={() => setActiveVendors(prev => {
                  const next = new Set(prev);
                  next.has(v.slug) ? next.delete(v.slug) : next.add(v.slug);
                  return next;
                })}
              >
                <Text style={sheet.rowLabel}>{v.name}</Text>
                <Ionicons
                  name={activeVendors.has(v.slug) ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={activeVendors.has(v.slug) ? THEME.colors.accent : THEME.colors.textMuted}
                />
              </TouchableOpacity>
            ))}

            <Text style={sheet.sectionLabel}>SORT</Text>
            <TouchableOpacity style={sheet.row} onPress={() => setInStockFirst(v => !v)}>
              <Text style={sheet.rowLabel}>In Stock First</Text>
              <Ionicons
                name={inStockFirst ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={inStockFirst ? THEME.colors.accent : THEME.colors.textMuted}
              />
            </TouchableOpacity>
            <TouchableOpacity style={sheet.row} onPress={() => setPriceSort(v => !v)}>
              <Text style={sheet.rowLabel}>Price Low → High</Text>
              <Ionicons
                name={priceSort ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={priceSort ? THEME.colors.accent : THEME.colors.textMuted}
              />
            </TouchableOpacity>

            <Text style={sheet.sectionLabel}>OPTIONS</Text>
            {countryCode && (
              <TouchableOpacity style={sheet.row} onPress={() => setDomesticOnly(v => !v)}>
                <Text style={sheet.rowLabel}>🇺🇸 Domestic Only</Text>
                <Ionicons
                  name={domesticOnly ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={domesticOnly ? THEME.colors.accent : THEME.colors.textMuted}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={sheet.row} onPress={() => setFindEquivalent(v => !v)}>
              <Text style={sheet.rowLabel}>🔄 Find Equivalent</Text>
              <Ionicons
                name={findEquivalent ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={findEquivalent ? THEME.colors.accent : THEME.colors.textMuted}
              />
            </TouchableOpacity>

            <TouchableOpacity style={sheet.doneBtn} onPress={() => setShowFilters(false)}>
              <Text style={sheet.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading && results.length === 0 && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={THEME.colors.accent} />
          <Text style={s.loadingText}>Searching all vendors...</Text>
        </View>
      )}

      {!loading && searched && displayedResults.length === 0 && (
        <View style={s.center}>
          <Text style={{ fontSize: 48 }}>🔍</Text>
          <Text style={s.emptyTitle}>No results found</Text>
          <Text style={s.emptySub}>Try shorter or broader search terms</Text>
          {query.trim().split(' ').length > 2 && (
            <TouchableOpacity
              style={s.broaderBtn}
              onPress={() => {
                const shorter = query.trim().split(' ').slice(0, 2).join(' ');
                setQuery(shorter);
                triggerSearch(shorter);
              }}
            >
              <Ionicons name="search-outline" size={16} color={THEME.colors.accent} />
              <Text style={s.broaderBtnText}>
                Try "{query.trim().split(' ').slice(0, 2).join(' ')}"
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!loading && !searched && (
        searchHistory.length > 0 ? (
          <View style={s.historyContainer}>
            <View style={s.historyHeader}>
              <Text style={s.historyTitle}>Recent Searches</Text>
              <TouchableOpacity onPress={() => { clearSearchHistory(); setSearchHistory([]); }}>
                <Text style={s.historyClear}>Clear</Text>
              </TouchableOpacity>
            </View>
            {searchHistory.map((item, i) => (
              <TouchableOpacity
                key={i}
                style={s.historyRow}
                onPress={() => { setQuery(item); triggerSearch(item); }}
              >
                <Ionicons name="time-outline" size={16} color={THEME.colors.textMuted} />
                <Text style={s.historyItem}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={s.center}>
            <Text style={{ fontSize: 72, marginBottom: 16 }}>⚙️</Text>
            <Text style={s.heroTitle}>Search Industrial Parts</Text>
            <Text style={s.heroSub}>Compare real-time pricing across vendors</Text>
          </View>
        )
      )}

      {displayedResults.length > 0 && (
        <FlatList
          data={displayedResults}
          keyExtractor={(item, i) => `${item.vendorSlug}-${i}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={
            loading ? (
              <View style={{ alignItems: 'center', paddingVertical: 16 }}>
                <ActivityIndicator size="small" color={THEME.colors.accent} />
                <Text style={[s.loadingText, { marginTop: 6 }]}>Loading more...</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  searchRow: { flexDirection: 'row', padding: 16, backgroundColor: THEME.colors.background, gap: 10, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.input, paddingHorizontal: 12, borderWidth: 1, borderColor: THEME.colors.border },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: THEME.colors.textPrimary },
  searchBtn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cameraBtn: { backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.button, width: 44, height: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: THEME.colors.border },
  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: THEME.colors.border, gap: 10 },
  filterBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.button, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: THEME.colors.border },
  filterBtnText: { color: THEME.colors.textSecondary, fontSize: 13, fontWeight: '600' },
  filterHints: { flex: 1, fontSize: 12, color: THEME.colors.textMuted },
  historyContainer: { padding: 16 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  historyTitle: { fontSize: 15, fontWeight: '700', color: THEME.colors.textPrimary },
  historyClear: { fontSize: 13, color: THEME.colors.textSecondary, fontWeight: '600' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  historyItem: { fontSize: 15, color: THEME.colors.textPrimary },
  card: { backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: THEME.colors.border },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardBody: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: THEME.radius.badge, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surfaceElevated },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: THEME.radius.badge, borderWidth: 1, borderColor: THEME.colors.border, backgroundColor: THEME.colors.surfaceElevated, justifyContent: 'center', alignItems: 'center' },
  badge: { borderRadius: THEME.radius.badge, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  vendorBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  flagEmoji: { fontSize: 14 },
  stockBadge: { borderRadius: THEME.radius.badge, paddingHorizontal: 8, paddingVertical: 3 },
  name: { fontSize: 15, fontWeight: '600', color: THEME.colors.textPrimary, marginBottom: 4 },
  sku: { fontSize: 12, color: THEME.colors.textSecondary, marginBottom: 8, fontVariant: ['tabular-nums'] },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 20, fontWeight: '800', color: THEME.colors.accent, fontVariant: ['tabular-nums'] },
  noPrice: { fontSize: 14, color: THEME.colors.textMuted, fontStyle: 'italic' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { color: THEME.colors.textSecondary, fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: THEME.colors.textPrimary },
  emptySub: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center' },
  broaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.button, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: THEME.colors.border },
  broaderBtnText: { color: THEME.colors.accent, fontWeight: '600', fontSize: 14 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: THEME.colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  heroSub: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});

const sheet = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  panel: { backgroundColor: THEME.colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40, borderTopWidth: 1, borderColor: THEME.colors.border },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: THEME.colors.border, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: 18, fontWeight: '700', color: THEME.colors.textPrimary, marginBottom: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: THEME.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4, marginTop: 16 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  rowLabel: { fontSize: 15, color: THEME.colors.textPrimary, fontWeight: '500' },
  doneBtn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 16, alignItems: 'center', marginTop: 24 },
  doneBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
