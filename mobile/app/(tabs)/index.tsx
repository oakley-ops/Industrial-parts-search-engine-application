import { useState, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { searchParts } from '../../services/api';
import { SearchResult } from '../../types';
import { getCountryCode, isDomestic } from '../../services/location';
import { theme } from '../../constants/theme';

export default function SearchScreen() {
  const params = useLocalSearchParams<{ query?: string }>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [findEquivalent, setFindEquivalent] = useState(false);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [domesticOnly, setDomesticOnly] = useState(false);

  useEffect(() => {
    if (params.query) {
      setQuery(params.query);
      triggerSearch(params.query);
    }
  }, [params.query]);

  useEffect(() => {
    setCountryCode(getCountryCode());
  }, []);

  const triggerSearch = async (q: string) => {
    if (!q.trim()) return;
    setLoading(true); setSearched(true);
    try { setResults(await searchParts(q.trim())); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
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
        <View style={[
          s.stockBadge,
          { backgroundColor: item.inStock ? theme.colors.successSubtle : theme.colors.warningSubtle },
        ]}>
          <Text style={{ color: item.inStock ? theme.colors.success : theme.colors.warning, fontSize: 11, fontWeight: '600' }}>
            {item.inStock ? 'In Stock' : 'Check Availability'}
          </Text>
        </View>
      </View>
      <View style={s.cardBody}>
        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={s.thumb} resizeMode="contain" />
        ) : (
          <View style={s.thumbPlaceholder}><Ionicons name="cube-outline" size={28} color={theme.colors.textDisabled} /></View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={s.name} numberOfLines={2}>{item.name}</Text>
          {item.vendorSku ? <Text style={s.sku}>SKU: {item.vendorSku}</Text> : null}
          <View style={s.cardBottom}>
            {item.price !== null
              ? <Text style={s.price}>${item.price.toFixed(2)}</Text>
              : <Text style={s.noPrice}>Price on request</Text>}
            <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.container}>
      <View style={s.searchRow}>
        <View style={s.searchBox}>
          <Ionicons name="search" size={20} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={s.searchInput}
            placeholder="Part number, name, keyword..."
            placeholderTextColor={theme.colors.textMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={doSearch}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setResults([]); setSearched(false); }}>
              <Ionicons name="close-circle" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.searchBtn} onPress={doSearch} disabled={loading}>
          {loading
            ? <ActivityIndicator color={theme.colors.white} size="small" />
            : <Text style={s.searchBtnText}>Search</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={s.cameraBtn} onPress={() => router.push('/camera')}>
          <Ionicons name="camera" size={22} color={theme.colors.white} />
        </TouchableOpacity>
      </View>

      <View style={s.chips}>
        {['Grainger', 'Motion', 'McMaster'].map(v => (
          <View key={v} style={s.chip}><Text style={s.chipText}>{v}</Text></View>
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
          style={[s.chip, findEquivalent && s.chipActive]}
          onPress={() => setFindEquivalent(v => !v)}
        >
          <Text style={[s.chipText, findEquivalent && s.chipTextActive]}>🔄 Find Equivalent</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={s.loadingText}>Searching all 3 vendors...</Text>
        </View>
      )}

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
              <Ionicons name="search-outline" size={16} color={theme.colors.secondary} />
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
        <FlatList
          data={domesticOnly && countryCode ? results.filter(r => isDomestic(r.vendorSlug, countryCode)) : results}
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
  container: { flex: 1, backgroundColor: theme.colors.background },

  // ── Search bar ──────────────────────────────────────────────
  searchRow: {
    flexDirection: 'row',
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: theme.colors.textPrimary },
  searchBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  searchBtnText: { color: theme.colors.white, fontWeight: '700', fontSize: 14 },
  cameraBtn: {
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ── Chips / filters ──────────────────────────────────────────
  chips: {
    flexDirection: 'row',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexWrap: 'wrap',
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceElevated,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chipText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  chipActive: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipTextActive: { color: theme.colors.white },

  // ── Result cards ─────────────────────────────────────────────
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardBody: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  thumb: {
    width: 64, height: 64,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
  },
  thumbPlaceholder: {
    width: 64, height: 64,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: { color: theme.colors.white, fontSize: 11, fontWeight: '700' },
  vendorBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  flagEmoji: { fontSize: 14 },
  stockBadge: { borderRadius: theme.radius.sm, paddingHorizontal: 8, paddingVertical: 3 },

  name: { fontSize: 15, fontWeight: '600', color: theme.colors.textPrimary, marginBottom: 4 },
  sku: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 20, fontWeight: '800', color: theme.colors.primary },
  noPrice: { fontSize: 14, color: theme.colors.textMuted, fontStyle: 'italic' },

  // ── Empty / hero states ───────────────────────────────────────
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  loadingText: { color: theme.colors.textSecondary, fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary },
  emptySub: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  broaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    backgroundColor: theme.colors.secondarySubtle,
    borderRadius: theme.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  broaderBtnText: { color: theme.colors.secondary, fontWeight: '600', fontSize: 14 },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  heroSub: { fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
});
