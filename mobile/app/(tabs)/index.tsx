import { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { searchParts } from '../../services/api';
import { SearchResult } from '../../types';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (params.query) {
      setQuery(params.query);
      triggerSearch(params.query);
    }
  }, [params.query]);

  const triggerSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true); setSearched(true);
    try { setResults(await searchParts(q.trim())); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const doSearch = async () => triggerSearch(query);

  const renderItem = ({ item }: { item: SearchResult }) => (
    <TouchableOpacity style={s.card} onPress={() => router.push({
      pathname: '/part/[id]',
      params: { id: item.vendorSku || item.partNumber, imageUrl: item.imageUrl || '' },
    })}>
      <View style={s.cardTop}>
        <View style={s.badge}><Text style={s.badgeText}>{item.vendorName}</Text></View>
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

      <View style={s.chips}>
        {['Grainger', 'Motion', 'McMaster'].map(v => (
          <View key={v} style={s.chip}><Text style={s.chipText}>{v}</Text></View>
        ))}
      </View>

      {loading && <View style={s.center}><ActivityIndicator size="large" color="#1e40af" /><Text style={s.loadingText}>Searching all 3 vendors...</Text></View>}

      {!loading && searched && results.length === 0 && (
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
        <View style={s.center}>
          <Text style={{ fontSize: 72, marginBottom: 16 }}>⚙️</Text>
          <Text style={s.heroTitle}>Search Industrial Parts</Text>
          <Text style={s.heroSub}>Compare real-time pricing across Grainger, Motion Industries, and McMaster-Carr</Text>
        </View>
      )}

      {!loading && results.length > 0 && (
        <FlatList data={results} keyExtractor={(item, i) => `${item.vendorSlug}-${i}`}
          renderItem={renderItem} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false} />
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
  chips: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, gap: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  chip: { paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#eff6ff', borderRadius: 20, borderWidth: 1, borderColor: '#bfdbfe' },
  chipText: { color: '#1e40af', fontSize: 12, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardBody: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fafafa' },
  thumbPlaceholder: { width: 64, height: 64, borderRadius: 8, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#fafafa', justifyContent: 'center', alignItems: 'center' },
  badge: { backgroundColor: '#1e40af', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
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
