import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, Image, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPricesForPart, getQuotes, createQuote, addLineItem, analyzePrices } from '../../services/api';
import { PriceResult, Quote, PriceIntelResult, Branch, NearbyBranch } from '../../types';
import { getCountryCode, getCoords, isDomestic } from '../../services/location';
import { nearestBranches } from '../../utils/geo';
import branches from '../../assets/branches.json';
import { theme } from '../../constants/theme';

const SOURCE = {
  VENDOR_WAREHOUSE: { label: 'In Stock', color: theme.colors.success, icon: '✅' },
  MANUFACTURER_ORDER: { label: 'Order Required', color: theme.colors.warning, icon: '🔄' },
  BACKORDER: { label: 'Backorder', color: theme.colors.error, icon: '⚠️' },
  UNKNOWN: { label: 'Check Vendor', color: theme.colors.textMuted, icon: '❓' },
};

const CONF_COLORS: Record<string, string> = {
  high: theme.colors.success,
  medium: theme.colors.warning,
  low: theme.colors.textMuted,
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
    params: { partNumber: id },
  });

  const handleAnalyzePrices = async () => {
    setAnalyzingPrices(true);
    const gen = analyzeGenRef.current;
    try {
      const validPrices = prices
        .filter(p => p.price !== null && p.price > 0)
        .map(p => ({ vendorName: p.vendorName, price: p.price!, source: p.source }));
      const result = await analyzePrices(id, undefined, validPrices);
      if (gen === analyzeGenRef.current) setPriceIntel(result);
    } catch {
      Alert.alert('Error', 'Could not analyze prices');
    } finally { setAnalyzingPrices(false); }
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{id}</Text>
          <Text style={s.headerSub}>Live prices · {prices.length + (sourceResult ? 1 : 0)} vendors</Text>
        </View>
        <TouchableOpacity onPress={goToCrossref} style={{ padding: 4 }}>
          <Ionicons name="swap-horizontal-outline" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={22} color={theme.colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={s.loadingText}>Scraping all 3 vendors...</Text>
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>Takes 5–15 seconds</Text>
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
              <Text style={{ color: theme.colors.primaryLight, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
                💰 BEST PRICE
              </Text>
              <Text style={{ color: theme.colors.white, fontSize: 14, marginVertical: 2 }}>{best.vendorName}</Text>
              <Text style={{ color: theme.colors.white, fontSize: 28, fontWeight: '800' }}>
                ${best.price?.toFixed(2)}
              </Text>
            </View>
          )}

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary, letterSpacing: 0.3 }}>
              All Vendor Prices
            </Text>
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
            <View style={[s.card, { borderColor: theme.colors.primary, borderWidth: 1.5 }]}>
              <View style={s.sourceTag}>
                <Ionicons name="search" size={10} color={theme.colors.white} />
                <Text style={{ color: theme.colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>
                  FOUND IN SEARCH
                </Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={s.vendor}>{sourceResult.vendorName}</Text>
                <View style={[s.sourceBadge, { backgroundColor: theme.colors.successSubtle }]}>
                  <Text style={{ color: theme.colors.success, fontSize: 12, fontWeight: '600' }}>✅ In Stock</Text>
                </View>
              </View>
              {sourceResult.name ? (
                <Text style={{ fontSize: 13, color: theme.colors.textSecondary, marginBottom: 6 }} numberOfLines={2}>
                  {sourceResult.name}
                </Text>
              ) : null}
              {sourceResult.price != null
                ? <Text style={s.priceAmt}>${sourceResult.price.toFixed(2)}</Text>
                : <Text style={{ color: theme.colors.textMuted, fontStyle: 'italic' }}>Price on request</Text>}
              {sourceResult.vendorSku ? (
                <Text style={[s.detail, { marginVertical: 4 }]}>SKU: {sourceResult.vendorSku}</Text>
              ) : null}
              {sourceResult.productUrl ? (
                <TouchableOpacity
                  style={[s.viewBtn, { marginTop: 8 }]}
                  onPress={() => Linking.openURL(sourceResult.productUrl)}
                >
                  <Ionicons name="open-outline" size={16} color={theme.colors.secondary} />
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
                {isBest && (
                  <View style={s.bestTag}>
                    <Text style={{ color: theme.colors.background, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>
                      BEST PRICE
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={s.vendor}>{p.vendorName}</Text>
                  {countryCode && (
                    <View style={[s.domesticBadge, { backgroundColor: isDom ? theme.colors.successSubtle : theme.colors.surfaceElevated }]}>
                      <Text style={{ fontSize: 11, color: isDom ? theme.colors.success : theme.colors.textMuted }}>
                        {isDom ? '🇺🇸' : '🌍'}
                      </Text>
                    </View>
                  )}
                  <View style={[s.sourceBadge, { backgroundColor: cfg.color + '22' }]}>
                    <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '600' }}>
                      {cfg.icon} {cfg.label}
                    </Text>
                  </View>
                </View>
                {p.price !== null
                  ? (
                    <Text style={s.priceAmt}>
                      ${p.price.toFixed(2)}{' '}
                      <Text style={{ fontSize: 14, fontWeight: '400', color: theme.colors.textMuted }}>
                        / {p.unitOfMeasure}
                      </Text>
                    </Text>
                  )
                  : (
                    <Text style={{ color: theme.colors.textMuted, fontStyle: 'italic' }}>
                      {p.error ? 'Scrape failed' : 'Price not available'}
                    </Text>
                  )
                }
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 }}>
                  {p.leadTimeDays != null && <Text style={s.detail}>⏱ {p.leadTimeDays}d lead time</Text>}
                  {p.minOrderQty > 1 && <Text style={s.detail}>📦 Min {p.minOrderQty}</Text>}
                  {p.vendorSku && p.vendorSku !== id && <Text style={s.detail}>SKU: {p.vendorSku}</Text>}
                </View>
                <Text style={{ fontSize: 11, color: theme.colors.textDisabled, marginBottom: 10 }}>
                  Updated: {new Date(p.scrapedAt).toLocaleTimeString()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {p.productUrl ? (
                    <TouchableOpacity style={s.viewBtn} onPress={() => Linking.openURL(p.productUrl)}>
                      <Ionicons name="open-outline" size={16} color={theme.colors.secondary} />
                      <Text style={s.viewBtnText}>View on Site</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[s.addBtn, { flex: 1 }, !p.price && s.addBtnOff]}
                    onPress={() => p.price && openModal(p)}
                    disabled={!p.price}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={p.price ? theme.colors.white : theme.colors.textMuted} />
                    <Text style={[s.addBtnText, !p.price && { color: theme.colors.textMuted }]}>Add to Quote</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {prices.length === 0 && (
            <View style={s.center}>
              <Text style={{ fontSize: 48 }}>❌</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: theme.colors.textPrimary }}>
                No results from any vendor
              </Text>
            </View>
          )}

          {noStock && (
            <View style={s.noStockBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 18 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: theme.colors.warning, fontSize: 15 }}>
                    No stock found at any vendor
                  </Text>
                  <Text style={{ color: theme.colors.warning, fontSize: 13, marginTop: 2 }}>
                    Find a compatible replacement part?
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={s.crossrefBtn} onPress={goToCrossref}>
                <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.white} />
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
                    <ActivityIndicator size="small" color={theme.colors.secondary} />
                    <Text style={s.analyzeBtnText}>Analyzing prices...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="bulb-outline" size={18} color={theme.colors.secondary} />
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
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Ionicons name="close" size={24} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {selectedPrice && (
            <View style={s.selectedBanner}>
              <Text style={{ fontWeight: '700', color: theme.colors.primary }}>{selectedPrice.vendorName}</Text>
              <Text style={{ fontWeight: '700', color: theme.colors.textPrimary }}>
                ${selectedPrice.price?.toFixed(2)}
              </Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary }}>Quantity</Text>
            <TextInput style={s.qtyInput} value={qty} onChangeText={setQty} keyboardType="number-pad" />
          </View>
          {quotes.filter(q => q.status === 'draft').length > 0 && (
            <>
              <Text style={s.sectionLabel}>ADD TO EXISTING QUOTE</Text>
              {quotes.filter(q => q.status === 'draft').map(q => (
                <TouchableOpacity key={q.id} style={s.quoteRow} onPress={() => addToQuote(q.id)} disabled={saving}>
                  <Text style={{ fontWeight: '600', color: theme.colors.textPrimary }}>{q.title}</Text>
                  <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{q.lineItems?.length || 0} items</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>CREATE NEW QUOTE</Text>
          <TextInput
            style={s.input}
            placeholder="Quote title..."
            placeholderTextColor={theme.colors.textMuted}
            value={newTitle}
            onChangeText={setNewTitle}
          />
          <TouchableOpacity
            style={[s.createBtn, (!newTitle.trim() || saving) && { opacity: 0.5 }]}
            onPress={createAndAdd}
            disabled={!newTitle.trim() || saving}
          >
            {saving
              ? <ActivityIndicator color={theme.colors.white} />
              : <Text style={{ color: theme.colors.white, fontWeight: '700', fontSize: 16 }}>Create & Add</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: { color: theme.colors.textPrimary, fontSize: 18, fontWeight: '700', letterSpacing: 0.3 },
  headerSub: { color: theme.colors.textMuted, fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 16, fontWeight: '600', color: theme.colors.textPrimary },
  imageBanner: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  partImage: { width: '100%', height: 160 },
  bestBanner: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.lg,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  bestCard: { borderColor: theme.colors.primary, borderWidth: 2 },
  bestTag: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  vendor: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary },
  sourceBadge: { borderRadius: theme.radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  priceAmt: { fontSize: 26, fontWeight: '800', color: theme.colors.primary, marginBottom: 4 },
  detail: { fontSize: 12, color: theme.colors.textMuted },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 6,
  },
  addBtnOff: { backgroundColor: theme.colors.surfaceElevated },
  addBtnText: { color: theme.colors.white, fontWeight: '600', fontSize: 14 },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    borderRadius: theme.radius.md,
    padding: 12,
    gap: 6,
    paddingHorizontal: 14,
  },
  viewBtnText: { color: theme.colors.secondary, fontWeight: '600', fontSize: 14 },

  // Modal
  modal: { flex: 1, padding: 24, backgroundColor: theme.colors.surface },
  modalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary },
  selectedBanner: {
    backgroundColor: theme.colors.primarySubtle,
    borderRadius: theme.radius.xl,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  qtyInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 10,
    width: 80,
    textAlign: 'center',
    fontSize: 16,
    backgroundColor: theme.colors.surfaceElevated,
    color: theme.colors.textPrimary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textMuted,
    marginBottom: 8,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  quoteRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginBottom: 8,
    backgroundColor: theme.colors.surfaceElevated,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    backgroundColor: theme.colors.surfaceElevated,
    color: theme.colors.textPrimary,
  },
  createBtn: { backgroundColor: theme.colors.primary, borderRadius: theme.radius.md, padding: 16, alignItems: 'center' },

  // No stock banner
  noStockBanner: {
    backgroundColor: theme.colors.warningSubtle,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.warning,
  },
  crossrefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.warning,
    borderRadius: theme.radius.md,
    padding: 12,
  },
  crossrefBtnText: { color: theme.colors.background, fontWeight: '700', fontSize: 14 },

  // Price intelligence
  priceIntelCard: {
    backgroundColor: theme.colors.secondarySubtle,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.secondary,
  },
  priceIntelTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.secondary, flex: 1 },
  priceIntelText: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 22 },
  confDot: { width: 10, height: 10, borderRadius: 5 },
  confLabel: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  analyzeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.secondary,
    borderRadius: theme.radius.xl,
    padding: 14,
    marginBottom: 12,
    backgroundColor: theme.colors.secondarySubtle,
  },
  analyzeBtnText: { color: theme.colors.secondary, fontWeight: '600', fontSize: 15 },

  // Domestic chip
  domesticBadge: { borderRadius: theme.radius.xs, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6, justifyContent: 'center' },
  domesticChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: theme.colors.surfaceElevated,
  },
  domesticChipActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySubtle },
  domesticChipText: { fontSize: 12, color: theme.colors.textMuted, fontWeight: '600' },
  domesticChipTextActive: { color: theme.colors.primary },

  // Branches
  branchesCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  branchesSectionTitle: { fontSize: 14, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: 10 },
  branchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  branchRowBorder: { borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  branchName: { fontSize: 13, fontWeight: '600', color: theme.colors.textPrimary },
  branchSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  branchLink: { fontSize: 13, color: theme.colors.secondary, fontWeight: '600' },
});
