import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, Image, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPricesForPart, getQuotes, createQuote, addLineItem, analyzePrices } from '../../services/api';
import { PriceResult, Quote, PriceIntelResult, Branch, NearbyBranch } from '../../types';
import { getCountryCode, getCoords, isDomestic } from '../../services/location';
import { nearestBranches } from '../../utils/geo';
import branches from '../../assets/branches.json';
import { THEME } from '../../constants/theme';

const SOURCE = {
  VENDOR_WAREHOUSE: { label: 'In Stock', color: THEME.colors.success, icon: '✅' },
  MANUFACTURER_ORDER: { label: 'Order Required', color: THEME.colors.warning, icon: '🔄' },
  BACKORDER: { label: 'Backorder', color: THEME.colors.danger, icon: '⚠️' },
  UNKNOWN: { label: 'Check Vendor', color: THEME.colors.textMuted, icon: '❓' },
};

const CONF_COLORS: Record<string, string> = {
  high: THEME.colors.success,
  medium: THEME.colors.warning,
  low: THEME.colors.textMuted,
};

export default function PartDetailScreen() {
  const { id, imageUrl, sourceVendor, sourceSlug, sourcePrice, sourceUrl, sourceSku, sourceName } =
    useLocalSearchParams<{
      id: string; imageUrl?: string;
      sourceVendor?: string; sourceSlug?: string; sourcePrice?: string;
      sourceUrl?: string; sourceSku?: string; sourceName?: string;
    }>();
  const sourceResult = sourceVendor ? {
    vendorName: sourceVendor,
    vendorSlug: sourceSlug || '',
    price: sourcePrice ? parseFloat(sourcePrice) : null,
    productUrl: sourceUrl || '',
    vendorSku: sourceSku || '',
    name: sourceName || '',
  } : null;
  const [prices, setPrices] = useState<PriceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<PriceResult | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [qty, setQty] = useState('1');
  const [saving, setSaving] = useState(false);
  const [priceIntel, setPriceIntel] = useState<PriceIntelResult | null>(null);
  const [analyzingPrices, setAnalyzingPrices] = useState(false);
  const analyzeGenRef = useRef(0);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [domesticOnly, setDomesticOnly] = useState(false);
  const [nearbyBranches, setNearbyBranches] = useState<NearbyBranch[]>([]);

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    setCountryCode(getCountryCode());
    getCoords().then(c => {
      if (c) setNearbyBranches(nearestBranches(c, branches as Branch[], 50, 3));
    });
  }, []);

  const load = async () => {
    setLoading(true);
    setPriceIntel(null);
    analyzeGenRef.current += 1;
    try { setPrices(await getPricesForPart(id)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const openModal = async (p: PriceResult) => {
    setSelectedPrice(p);
    try { setQuotes(await getQuotes()); } catch {}
    setShowModal(true);
  };

  const addToQuote = async (quoteId: string) => {
    if (!selectedPrice) return;
    setSaving(true);
    try {
      await addLineItem(quoteId, {
        partNumber: id, vendorSlug: selectedPrice.vendorSlug, vendorName: selectedPrice.vendorName,
        vendorSku: selectedPrice.vendorSku, quantity: parseInt(qty) || 1,
        unitPrice: selectedPrice.price || 0, availability: selectedPrice.source,
        leadTimeDays: selectedPrice.leadTimeDays ?? undefined, productUrl: selectedPrice.productUrl,
      });
      setShowModal(false);
      Alert.alert('Added!', 'Item added to quote.');
    } catch { Alert.alert('Error', 'Could not add to quote'); }
    finally { setSaving(false); }
  };

  const createAndAdd = async () => {
    if (!newTitle.trim() || !selectedPrice) return;
    setSaving(true);
    try { const q = await createQuote(newTitle.trim()); await addToQuote(q.id); }
    catch { Alert.alert('Error', 'Could not create quote'); setSaving(false); }
  };

  const best = prices.filter(p => p.price !== null && p.price > 0).sort((a, b) => a.price! - b.price!)[0];

  const displayedPrices = domesticOnly
    ? prices.filter(p => isDomestic(p.vendorSlug, countryCode))
    : prices;

  const noStock = !loading && displayedPrices.length > 0 && displayedPrices.every(
    p => p.price === null || p.price === 0 || p.source === 'BACKORDER' || !!p.error,
  );

  const goToCrossref = () => router.push({
    pathname: '/crossref',
    params: {
      partNumber: id,
    },
  });

  const handleAnalyzePrices = async () => {
    setAnalyzingPrices(true);
    const gen = analyzeGenRef.current;
    try {
      const validPrices = prices
        .filter(p => p.price !== null && p.price > 0)
        .map(p => ({ vendorName: p.vendorName, price: p.price!, source: p.source }));
      const result = await analyzePrices(id, undefined, validPrices);
      if (gen === analyzeGenRef.current) {
        setPriceIntel(result);
      }
    } catch {
      Alert.alert('Error', 'Could not analyze prices');
    } finally {
      setAnalyzingPrices(false);
    }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{id}</Text>
          <Text style={s.headerSub}>Live prices • {prices.length + (sourceResult ? 1 : 0)} vendors</Text>
        </View>
        <TouchableOpacity onPress={goToCrossref} style={{ padding: 4 }}>
          <Ionicons name="swap-horizontal-outline" size={22} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={22} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={THEME.colors.accent} />
          <Text style={s.loadingText}>Scraping all 3 vendors...</Text>
          <Text style={{ color: THEME.colors.textMuted, fontSize: 13 }}>Takes 5–15 seconds</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {imageUrl ? (
            <View style={s.imageBanner}>
              <Image source={{ uri: imageUrl }} style={s.partImage} resizeMode="contain" />
            </View>
          ) : null}
          {best && (
            <View style={s.bestBanner}>
              <Text style={{ color: THEME.colors.textSecondary, fontSize: 12, fontWeight: '600' }}>💰 BEST PRICE</Text>
              <Text style={{ color: THEME.colors.textPrimary, fontSize: 14, marginVertical: 2 }}>{best.vendorName}</Text>
              <Text style={{ color: THEME.colors.accent, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] }}>${best.price?.toFixed(2)}</Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: THEME.colors.textPrimary }}>All Vendor Prices</Text>
            {countryCode && (
              <TouchableOpacity
                style={[s.domesticChip, domesticOnly && s.domesticChipActive]}
                onPress={() => setDomesticOnly(v => !v)}
              >
                <Text style={[s.domesticChipText, domesticOnly && s.domesticChipTextActive]}>
                  🇺🇸 Domestic only
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Source vendor card — from search results */}
          {sourceResult && (!domesticOnly || isDomestic(sourceResult.vendorSlug, countryCode)) && (
            <View style={[s.card, { borderColor: THEME.colors.accent, borderWidth: 1.5 }]}>
              <View style={s.sourceTag}>
                <Ionicons name="search" size={10} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>FOUND IN SEARCH</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={s.vendor}>{sourceResult.vendorName}</Text>
                <View style={[s.sourceBadge, { backgroundColor: THEME.colors.successSubtle }]}>
                  <Text style={{ color: THEME.colors.success, fontSize: 12, fontWeight: '600' }}>✅ In Stock</Text>
                </View>
              </View>
              {sourceResult.name ? <Text style={{ fontSize: 13, color: THEME.colors.textSecondary, marginBottom: 6 }} numberOfLines={2}>{sourceResult.name}</Text> : null}
              {sourceResult.price != null
                ? <Text style={s.priceAmt}>${sourceResult.price.toFixed(2)}</Text>
                : <Text style={{ color: THEME.colors.textMuted, fontStyle: 'italic' }}>Price on request</Text>}
              {sourceResult.vendorSku ? <Text style={[s.detail, { marginVertical: 4 }]}>SKU: {sourceResult.vendorSku}</Text> : null}
              {sourceResult.productUrl ? (
                <TouchableOpacity style={[s.viewBtn, { marginTop: 8 }]} onPress={() => Linking.openURL(sourceResult.productUrl)}>
                  <Ionicons name="open-outline" size={16} color={THEME.colors.accent} />
                  <Text style={s.viewBtnText}>View on Site</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {displayedPrices.map((p, i) => {
            const cfg = SOURCE[p.source] || SOURCE.UNKNOWN;
            const isBest = best?.vendorSlug === p.vendorSlug;
            const isDom = isDomestic(p.vendorSlug, countryCode);
            return (
              <View key={i} style={[s.card, isBest && s.bestCard]}>
                {isBest && <View style={s.bestTag}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>BEST PRICE</Text></View>}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={s.vendor}>{p.vendorName}</Text>
                  {countryCode && (
                    <View style={[s.domesticBadge, { backgroundColor: isDom ? THEME.colors.successSubtle : THEME.colors.surface }]}>
                      <Text style={{ fontSize: 11, color: isDom ? THEME.colors.success : THEME.colors.textMuted }}>
                        {isDom ? '🇺🇸' : '🌍'}
                      </Text>
                    </View>
                  )}
                  <View style={[s.sourceBadge, { backgroundColor: cfg.color + '20' }]}>
                    <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '600' }}>{cfg.icon} {cfg.label}</Text>
                  </View>
                </View>
                {p.price !== null
                  ? <Text style={s.priceAmt}>${p.price.toFixed(2)} <Text style={{ fontSize: 14, fontWeight: '400', color: THEME.colors.textSecondary }}>/ {p.unitOfMeasure}</Text></Text>
                  : <Text style={{ color: THEME.colors.textMuted, fontStyle: 'italic' }}>{p.error ? 'Scrape failed' : 'Price not available'}</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 }}>
                  {p.leadTimeDays != null && <Text style={s.detail}>⏱ {p.leadTimeDays}d lead time</Text>}
                  {p.minOrderQty > 1 && <Text style={s.detail}>📦 Min {p.minOrderQty}</Text>}
                  {p.vendorSku && p.vendorSku !== id && <Text style={s.detail}>SKU: {p.vendorSku}</Text>}
                </View>
                <Text style={{ fontSize: 11, color: THEME.colors.textMuted, marginBottom: 10 }}>
                  Updated: {new Date(p.scrapedAt).toLocaleTimeString()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {p.productUrl ? (
                    <TouchableOpacity style={s.viewBtn} onPress={() => Linking.openURL(p.productUrl)}>
                      <Ionicons name="open-outline" size={16} color={THEME.colors.accent} />
                      <Text style={s.viewBtnText}>View on Site</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={[s.addBtn, { flex: 1 }, !p.price && s.addBtnOff]} onPress={() => p.price && openModal(p)} disabled={!p.price}>
                    <Ionicons name="add-circle-outline" size={18} color={p.price ? '#fff' : THEME.colors.textMuted} />
                    <Text style={[s.addBtnText, !p.price && { color: THEME.colors.textMuted }]}>Add to Quote</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {prices.length === 0 && (
            <View style={s.center}>
              <Text style={{ fontSize: 48 }}>❌</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: THEME.colors.textPrimary }}>No results from any vendor</Text>
            </View>
          )}
          {noStock && (
            <View style={s.noStockBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 18 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: THEME.colors.warning, fontSize: 15 }}>No stock found at any vendor</Text>
                  <Text style={{ color: THEME.colors.warning, fontSize: 13, marginTop: 2 }}>Find a compatible replacement part?</Text>
                </View>
              </View>
              <TouchableOpacity style={s.crossrefBtn} onPress={goToCrossref}>
                <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
                <Text style={s.crossrefBtnText}>Find Equivalent Parts</Text>
              </TouchableOpacity>
            </View>
          )}
          {nearbyBranches.length > 0 && (
            <View style={s.branchesCard}>
              <Text style={s.branchesSectionTitle}>Nearby Pickup</Text>
              {nearbyBranches.map((b, i) => (
                <View key={b.url} style={[s.branchRow, i < nearbyBranches.length - 1 && s.branchRowBorder]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.branchName}>📍 {b.name}</Text>
                    <Text style={s.branchSub}>{b.city}, {b.state} · {b.distance.toFixed(1)} mi</Text>
                  </View>
                  <TouchableOpacity onPress={() => Linking.openURL(b.url)}>
                    <Text style={s.branchLink}>View Branch →</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
          {!loading && prices.some(p => p.price !== null && p.price > 0) && (
            priceIntel ? (
              <View style={s.priceIntelCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={[s.confDot, { backgroundColor: CONF_COLORS[priceIntel.confidence] ?? CONF_COLORS.low }]} />
                  <Text style={s.priceIntelTitle}>Price Analysis</Text>
                  <Text style={s.confLabel}>
                    {priceIntel.confidence.charAt(0).toUpperCase() + priceIntel.confidence.slice(1)} conf
                  </Text>
                </View>
                <Text style={s.priceIntelText}>{priceIntel.recommendation}</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.analyzeBtn} onPress={handleAnalyzePrices} disabled={analyzingPrices}>
                {analyzingPrices ? (
                  <>
                    <ActivityIndicator size="small" color={THEME.colors.accent} />
                    <Text style={s.analyzeBtnText}>Analyzing prices...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="bulb-outline" size={18} color={THEME.colors.accent} />
                    <Text style={s.analyzeBtnText}>Analyze Prices</Text>
                  </>
                )}
              </TouchableOpacity>
            )
          )}
        </ScrollView>
      )}

      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={s.modalTitle}>Add to Quote</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color={THEME.colors.textPrimary} /></TouchableOpacity>
          </View>
          {selectedPrice && (
            <View style={s.selectedBanner}>
              <Text style={{ fontWeight: '700', color: THEME.colors.accent }}>{selectedPrice.vendorName}</Text>
              <Text style={{ fontWeight: '700', color: THEME.colors.textPrimary }}>${selectedPrice.price?.toFixed(2)}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: THEME.colors.textPrimary }}>Quantity</Text>
            <TextInput style={s.qtyInput} value={qty} onChangeText={setQty} keyboardType="number-pad" keyboardAppearance="dark" />
          </View>
          {quotes.filter(q => q.status === 'draft').length > 0 && (
            <>
              <Text style={s.sectionLabel}>ADD TO EXISTING QUOTE</Text>
              {quotes.filter(q => q.status === 'draft').map(q => (
                <TouchableOpacity key={q.id} style={s.quoteRow} onPress={() => addToQuote(q.id)} disabled={saving}>
                  <Text style={{ fontWeight: '600', color: THEME.colors.textPrimary }}>{q.title}</Text>
                  <Text style={{ color: THEME.colors.textSecondary, fontSize: 13 }}>{q.lineItems?.length || 0} items</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>CREATE NEW QUOTE</Text>
          <TextInput style={s.input} placeholder="Quote title..." placeholderTextColor={THEME.colors.placeholderText} value={newTitle} onChangeText={setNewTitle} keyboardAppearance="dark" />
          <TouchableOpacity style={[s.createBtn, (!newTitle.trim() || saving) && { opacity: 0.5 }]} onPress={createAndAdd} disabled={!newTitle.trim() || saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create & Add</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.colors.background, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, gap: 12, borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  headerTitle: { color: THEME.colors.textPrimary, fontSize: 18, fontWeight: '700' },
  headerSub: { color: THEME.colors.textSecondary, fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 16, fontWeight: '600', color: THEME.colors.textPrimary },
  imageBanner: { backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: THEME.colors.border },
  partImage: { width: '100%', height: 160 },
  bestBanner: { backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.card, padding: 16, alignItems: 'center', marginBottom: 16, borderWidth: 1, borderColor: THEME.colors.border },
  card: { backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: THEME.colors.border },
  bestCard: { borderColor: THEME.colors.accent, borderWidth: 2 },
  bestTag: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.badge, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
  sourceTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.badge, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
  vendor: { fontSize: 16, fontWeight: '700', color: THEME.colors.textPrimary },
  sourceBadge: { borderRadius: THEME.radius.badge, paddingHorizontal: 8, paddingVertical: 3 },
  priceAmt: { fontSize: 26, fontWeight: '800', color: THEME.colors.textPrimary, marginBottom: 4, fontVariant: ['tabular-nums'] },
  detail: { fontSize: 12, color: THEME.colors.textSecondary },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 12, gap: 6 },
  addBtnOff: { backgroundColor: THEME.colors.surfaceElevated },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 12, gap: 6, paddingHorizontal: 14 },
  viewBtnText: { color: THEME.colors.accent, fontWeight: '600', fontSize: 14 },
  modal: { flex: 1, padding: 24, backgroundColor: THEME.colors.background },
  modalTitle: { fontSize: 20, fontWeight: '700', color: THEME.colors.textPrimary },
  selectedBanner: { backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.card, padding: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between', borderWidth: 1, borderColor: THEME.colors.border },
  qtyInput: { borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.button, padding: 10, width: 80, textAlign: 'center', fontSize: 16, color: THEME.colors.textPrimary, backgroundColor: THEME.colors.surface },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.button, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.button, padding: 14, fontSize: 15, marginBottom: 12, color: THEME.colors.textPrimary, backgroundColor: THEME.colors.surface },
  createBtn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 16, alignItems: 'center' },
  noStockBanner: {
    backgroundColor: THEME.colors.warningSubtle, borderRadius: THEME.radius.card, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: THEME.colors.warning,
  },
  crossrefBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 12,
  },
  crossrefBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  priceIntelCard: {
    backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.card, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: THEME.colors.border,
  },
  priceIntelTitle: { fontSize: 14, fontWeight: '700', color: THEME.colors.textPrimary, flex: 1 },
  priceIntelText: { fontSize: 14, color: THEME.colors.textSecondary, lineHeight: 22 },
  confDot: { width: 10, height: 10, borderRadius: 5 },
  confLabel: { fontSize: 12, color: THEME.colors.textMuted, fontWeight: '600' },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderColor: THEME.colors.accent, borderRadius: THEME.radius.button,
    padding: 14, marginBottom: 12, backgroundColor: THEME.colors.surface,
  },
  analyzeBtnText: { color: THEME.colors.accent, fontWeight: '600', fontSize: 15 },
  domesticBadge: { borderRadius: THEME.radius.badge, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6, justifyContent: 'center' },
  domesticChip: { borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.chip, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: THEME.colors.surface },
  domesticChipActive: { borderColor: THEME.colors.accent, backgroundColor: THEME.colors.accentSubtle },
  domesticChipText: { fontSize: 12, color: THEME.colors.textSecondary, fontWeight: '600' },
  domesticChipTextActive: { color: THEME.colors.accent },
  branchesCard: { backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: THEME.colors.border },
  branchesSectionTitle: { fontSize: 14, fontWeight: '700', color: THEME.colors.textPrimary, marginBottom: 10 },
  branchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  branchRowBorder: { borderBottomWidth: 1, borderBottomColor: THEME.colors.border },
  branchName: { fontSize: 13, fontWeight: '600', color: THEME.colors.textPrimary },
  branchSub: { fontSize: 12, color: THEME.colors.textSecondary, marginTop: 2 },
  branchLink: { fontSize: 13, color: THEME.colors.accent, fontWeight: '600' },
});
