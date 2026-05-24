import { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Image, ScrollView } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { searchParts } from '../../services/api';
import { SearchResult } from '../../types';
import { getCountryCode, isDomestic } from '../../services/location';
import { ACTIVE_VENDORS } from '../../utils/searchConfig';
import { getSearchHistory, addToSearchHistory, clearSearchHistory } from '../../utils/searchHistory';

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

  const triggerSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);
    setInStockFirst(true);
    try {
      const data = await searchParts(q.trim());
      setResults(data);
      await addToSearchHistory(q.trim());
      setSearchHistory(await getSearchHistory());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
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
          <View style={s.badge}><Text style={s.badgeText}>{item.vendorName}</Text></View>
          {countryCode && (
            <Text style={s.flagEmoji}>
              {isDomestic(item.vendorSlug, countryCode) ? '🇺🇸' : '🌍'}
            </Text>
          )}
        </View>
        <View style={[s.stockBadge, { backgroundColor: item.inStock ? '#dcfce7' : '#fef3c7' }]}>
          <Text style={{ color: item.inStock ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: '600' }}>
            {item.inStock ? 'In Stock' : 'Check Availability'}
          </Text>
        </View>
      </View>
      <View style={s.cardBody}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={s.thumb} resizeMode="contain" />
        ) : (
          <View style={s.thumbPlaceholder}><Ionicons name="cube-outline" size={28} color="#d1d5db" /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
          {item.vendorSku ? <Text style={s.sku}>SKU: {item.vendorSku}</Text> : null}
          <View style={s.cardBottom}>
            {item.price !== null
              ? <Text style={s.price}>${item.price.toFixed(2)}</Text>
              : <Text style={s.noPrice}>Price on request</Text>}
            <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
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
          <Ionicons name="search" size={20} color="#6b7280" style={{ marginRight: 8 }} />
          <TextInput style={s.searchInput} placeholder="Part number, name, keyword..." value={query}
            onChangeText={setQuery} onSubmitEditing={doSearch} returnKeyType="search" autoCapitalize="none" autoCorrect={false} />
          {query.length > 0 && <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
            <Ionicons name="close-circle" size={20} color="#9ca3af" /></TouchableOpacity>}
        </View>
        <TouchableOpacity style={s.searchBtn} onPress={doSearch} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.searchBtnText}>Search</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cameraBtn} onPress={() => router.push('/camera')}>
          <Ionicons name="camera" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.chipsScroll}
        contentContainerStyle={s.chips}
      >
        {ACTIVE_VENDORS.map(v => (
          <TouchableOpacity
            key={v.slug}
            style={[s.chip, activeVendors.has(v.slug) && s.chipActive]}
            onPress={() => setActiveVendors(prev => {
              const next = new Set(prev);
              next.has(v.slug) ? next.delete(v.slug) : next.add(v.slug);
              return next;
            })}
          >
            <Text style={[s.chipText, activeVendors.has(v.slug) && s.chipTextActive]}>
              {v.name}
            </Text>
          </TouchableOpacity>
        ))}
        {countryCode && (
          <TouchableOpacity
            style={[s.chip, domesticOnly && s.chipActive]}
            onPress={() => setDomesticOnly(v => !v)}
          >
            <Text style={[s.chipText, domesticOnly && s.chipTextActive]}>🇺🇸 Domestic</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.chip, inStockFirst && s.chipActive]}
          onPress={() => setInStockFirst(v => !v)}
        >
          <Text style={[s.chipText, inStockFirst && s.chipTextActive]}>In Stock First</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.chip, priceSort && s.chipActive]}
          onPress={() => setPriceSort(v => !v)}
        >
          <Text style={[s.chipText, priceSort && s.chipTextActive]}>Price ↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.chip, findEquivalent && s.chipActive]}
          onPress={() => setFindEquivalent(v => !v)}
        >
          <Text style={[s.chipText, findEquivalent && s.chipTextActive]}>🔄 Find Equivalent</Text>
        </TouchableOpacity>
      </ScrollView>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1e40af" />
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
              <Ionicons name="search-outline" size={16} color="#1e40af" />
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
                <Ionicons name="time-outline" size={16} color="#9ca3af" />
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

      {!loading && displayedResults.length > 0 && (
        <FlatList
          data={displayedResults}
          keyExtractor={(item, i) => `${item.vendorSlug}-${i}`}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16 }}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  searchRow: { flexDirection: 'row', padding: 16, backgroundColor: '#1e40af', gap: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 12 },
  searchInput: { flex: 1, height: 44, fontSize: 15 },
  searchBtn: { backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cameraBtn: { backgroundColor: '#1e3a8a', borderRadius: 10, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  chips: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#eff6ff', borderRadius: 20, borderWidth: 1, borderColor: '#bfdbfe' },
  chipText: { color: '#1e40af', fontSize: 12, fontWeight: '600' },
  chipActive: { backgroundColor: '#1e40af', borderColor: '#1e40af' },
  chipTextActive: { color: '#fff' },
  chipsScroll: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', maxHeight: 52 },
  historyContainer: { padding: 16 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  historyTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  historyClear: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  historyItem: { fontSize: 15, color: '#374151' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardBody: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fafafa' },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fafafa', justifyContent: 'center', alignItems: 'center' },
  badge: { backgroundColor: '#1e40af', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  vendorBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  flagEmoji: { fontSize: 14 },
  stockBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  name: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 4 },
  sku: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 20, fontWeight: '800', color: '#1e40af' },
  noPrice: { fontSize: 14, color: '#9ca3af', fontStyle: 'italic' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { color: '#6b7280', fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  broaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: '#bfdbfe' },
  broaderBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 14 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  heroSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
});
