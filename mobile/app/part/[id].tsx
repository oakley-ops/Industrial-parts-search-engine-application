import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, Image, Linking } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPricesForPart, getQuotes, createQuote, addLineItem, analyzePrices } from '../../services/api';
import { PriceResult, Quote, PriceIntelResult } from '../../types';

const SOURCE = {
  VENDOR_WAREHOUSE: { label: 'In Stock', color: '#16a34a', icon: '✅' },
  MANUFACTURER_ORDER: { label: 'Order Required', color: '#d97706', icon: '🔄' },
  BACKORDER: { label: 'Backorder', color: '#dc2626', icon: '⚠️' },
  UNKNOWN: { label: 'Check Vendor', color: '#6b7280', icon: '❓' },
};

const CONF_COLORS: Record<string, string> = {
  high: '#16a34a',
  medium: '#d97706',
  low: '#9ca3af',
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

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
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

  const best = prices.filter(p => p.price !== null).sort((a, b) => (a.price || 0) - (b.price || 0))[0];

  const noStock = !loading && prices.length > 0 && prices.every(
    p => p.price === null || p.source === 'BACKORDER' || !!p.error,
  );

  const goToCrossref = () => router.push({
    pathname: '/crossref',
    params: {
      partNumber: id,
    },
  });

  const handleAnalyzePrices = async () => {
    setAnalyzingPrices(true);
    try {
      const validPrices = prices
        .filter(p => p.price !== null)
        .map(p => ({ vendorName: p.vendorName, price: p.price!, source: p.source }));
      const result = await analyzePrices(id, undefined, validPrices);
      setPriceIntel(result);
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
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{id}</Text>
          <Text style={s.headerSub}>Live prices • {prices.length + (sourceResult ? 1 : 0)} vendors</Text>
        </View>
        <TouchableOpacity onPress={goToCrossref} style={{ padding: 4 }}>
          <Ionicons name="swap-horizontal-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={s.loadingText}>Scraping all 3 vendors...</Text>
          <Text style={{ color: '#9ca3af', fontSize: 13 }}>Takes 5–15 seconds</Text>
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
              <Text style={{ color: '#93c5fd', fontSize: 12, fontWeight: '600' }}>💰 BEST PRICE</Text>
              <Text style={{ color: '#fff', fontSize: 14, marginVertical: 2 }}>{best.vendorName}</Text>
              <Text style={{ color: '#fff', fontSize: 28, fontWeight: '800' }}>${best.price?.toFixed(2)}</Text>
            </View>
          )}

          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 }}>All Vendor Prices</Text>

          {/* Source vendor card — from search results */}
          {sourceResult && (
            <View style={[s.card, { borderColor: '#1e40af', borderWidth: 1.5 }]}>
              <View style={s.sourceTag}>
                <Ionicons name="search" size={10} color="#fff" />
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>FOUND IN SEARCH</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={s.vendor}>{sourceResult.vendorName}</Text>
                <View style={[s.sourceBadge, { backgroundColor: '#dcfce7' }]}>
                  <Text style={{ color: '#16a34a', fontSize: 12, fontWeight: '600' }}>✅ In Stock</Text>
                </View>
              </View>
              {sourceResult.name ? <Text style={{ fontSize: 13, color: '#4b5563', marginBottom: 6 }} numberOfLines={2}>{sourceResult.name}</Text> : null}
              {sourceResult.price != null
                ? <Text style={s.priceAmt}>${sourceResult.price.toFixed(2)}</Text>
                : <Text style={{ color: '#9ca3af', fontStyle: 'italic' }}>Price on request</Text>}
              {sourceResult.vendorSku ? <Text style={[s.detail, { marginVertical: 4 }]}>SKU: {sourceResult.vendorSku}</Text> : null}
              {sourceResult.productUrl ? (
                <TouchableOpacity style={[s.viewBtn, { marginTop: 8 }]} onPress={() => Linking.openURL(sourceResult.productUrl)}>
                  <Ionicons name="open-outline" size={16} color="#1e40af" />
                  <Text style={s.viewBtnText}>View on Site</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {prices.map((p, i) => {
            const cfg = SOURCE[p.source] || SOURCE.UNKNOWN;
            const isBest = best?.vendorSlug === p.vendorSlug;
            return (
              <View key={i} style={[s.card, isBest && s.bestCard]}>
                {isBest && <View style={s.bestTag}><Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>BEST PRICE</Text></View>}
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={s.vendor}>{p.vendorName}</Text>
                  <View style={[s.sourceBadge, { backgroundColor: cfg.color + '20' }]}>
                    <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '600' }}>{cfg.icon} {cfg.label}</Text>
                  </View>
                </View>
                {p.price !== null
                  ? <Text style={s.priceAmt}>${p.price.toFixed(2)} <Text style={{ fontSize: 14, fontWeight: '400', color: '#6b7280' }}>/ {p.unitOfMeasure}</Text></Text>
                  : <Text style={{ color: '#9ca3af', fontStyle: 'italic' }}>{p.error ? 'Scrape failed' : 'Price not available'}</Text>}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 8 }}>
                  {p.leadTimeDays != null && <Text style={s.detail}>⏱ {p.leadTimeDays}d lead time</Text>}
                  {p.minOrderQty > 1 && <Text style={s.detail}>📦 Min {p.minOrderQty}</Text>}
                  {p.vendorSku && p.vendorSku !== id && <Text style={s.detail}>SKU: {p.vendorSku}</Text>}
                </View>
                <Text style={{ fontSize: 11, color: '#d1d5db', marginBottom: 10 }}>
                  Updated: {new Date(p.scrapedAt).toLocaleTimeString()}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {p.productUrl ? (
                    <TouchableOpacity style={s.viewBtn} onPress={() => Linking.openURL(p.productUrl)}>
                      <Ionicons name="open-outline" size={16} color="#1e40af" />
                      <Text style={s.viewBtnText}>View on Site</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={[s.addBtn, { flex: 1 }, !p.price && s.addBtnOff]} onPress={() => p.price && openModal(p)} disabled={!p.price}>
                    <Ionicons name="add-circle-outline" size={18} color={p.price ? '#fff' : '#9ca3af'} />
                    <Text style={[s.addBtnText, !p.price && { color: '#9ca3af' }]}>Add to Quote</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          {prices.length === 0 && (
            <View style={s.center}>
              <Text style={{ fontSize: 48 }}>❌</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>No results from any vendor</Text>
            </View>
          )}
          {noStock && (
            <View style={s.noStockBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 18 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#92400e', fontSize: 15 }}>No stock found at any vendor</Text>
                  <Text style={{ color: '#92400e', fontSize: 13, marginTop: 2 }}>Find a compatible replacement part?</Text>
                </View>
              </View>
              <TouchableOpacity style={s.crossrefBtn} onPress={goToCrossref}>
                <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
                <Text style={s.crossrefBtnText}>Find Equivalent Parts</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loading && prices.some(p => p.price !== null) && (
            priceIntel ? (
              <View style={s.priceIntelCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={[s.confDot, { backgroundColor: CONF_COLORS[priceIntel.confidence] }]} />
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
                    <ActivityIndicator size="small" color="#1e40af" />
                    <Text style={s.analyzeBtnText}>Analyzing prices...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="bulb-outline" size={18} color="#1e40af" />
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
            <TouchableOpacity onPress={() => setShowModal(false)}><Ionicons name="close" size={24} color="#111827" /></TouchableOpacity>
          </View>
          {selectedPrice && (
            <View style={s.selectedBanner}>
              <Text style={{ fontWeight: '700', color: '#1e40af' }}>{selectedPrice.vendorName}</Text>
              <Text style={{ fontWeight: '700' }}>${selectedPrice.price?.toFixed(2)}</Text>
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600' }}>Quantity</Text>
            <TextInput style={s.qtyInput} value={qty} onChangeText={setQty} keyboardType="number-pad" />
          </View>
          {quotes.filter(q => q.status === 'draft').length > 0 && (
            <>
              <Text style={s.sectionLabel}>ADD TO EXISTING QUOTE</Text>
              {quotes.filter(q => q.status === 'draft').map(q => (
                <TouchableOpacity key={q.id} style={s.quoteRow} onPress={() => addToQuote(q.id)} disabled={saving}>
                  <Text style={{ fontWeight: '600', color: '#111827' }}>{q.title}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 13 }}>{q.lineItems?.length || 0} items</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>CREATE NEW QUOTE</Text>
          <TextInput style={s.input} placeholder="Quote title..." value={newTitle} onChangeText={setNewTitle} />
          <TouchableOpacity style={[s.createBtn, (!newTitle.trim() || saving) && { opacity: 0.5 }]} onPress={createAndAdd} disabled={!newTitle.trim() || saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create & Add</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e40af', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, gap: 12 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#93c5fd', fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  loadingText: { fontSize: 16, fontWeight: '600', color: '#111827' },
  imageBanner: { backgroundColor: '#fff', borderRadius: 12, padding: 12, alignItems: 'center', marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6' },
  partImage: { width: '100%', height: 160 },
  bestBanner: { backgroundColor: '#1e40af', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6', elevation: 2 },
  bestCard: { borderColor: '#1e40af', borderWidth: 2 },
  bestTag: { backgroundColor: '#1e40af', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
  sourceTag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1e40af', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start', marginBottom: 8 },
  vendor: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sourceBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priceAmt: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 4 },
  detail: { fontSize: 12, color: '#6b7280' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e40af', borderRadius: 8, padding: 12, gap: 6 },
  addBtnOff: { backgroundColor: '#f3f4f6' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  viewBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#1e40af', borderRadius: 8, padding: 12, gap: 6, paddingHorizontal: 14 },
  viewBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 14 },
  modal: { flex: 1, padding: 24, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  selectedBanner: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between' },
  qtyInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, width: 80, textAlign: 'center', fontSize: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, letterSpacing: 0.5 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 12 },
  createBtn: { backgroundColor: '#1e40af', borderRadius: 10, padding: 16, alignItems: 'center' },
  noStockBanner: {
    backgroundColor: '#fef3c7', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#fcd34d',
  },
  crossrefBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#d97706', borderRadius: 8, padding: 12,
  },
  crossrefBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  priceIntelCard: {
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#bfdbfe',
  },
  priceIntelTitle: { fontSize: 14, fontWeight: '700', color: '#1e40af', flex: 1 },
  priceIntelText: { fontSize: 14, color: '#1e3a8a', lineHeight: 22 },
  confDot: { width: 10, height: 10, borderRadius: 5 },
  confLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderColor: '#1e40af', borderRadius: 10,
    padding: 14, marginBottom: 12, backgroundColor: '#fff',
  },
  analyzeBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 15 },
});
