import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal, Image } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPricesForPart, getQuotes, createQuote, addLineItem } from '../../services/api';
import { PriceResult, Quote } from '../../types';

const SOURCE = {
  VENDOR_WAREHOUSE: { label: 'In Stock', color: '#16a34a', icon: '✅' },
  MANUFACTURER_ORDER: { label: 'Order Required', color: '#d97706', icon: '🔄' },
  BACKORDER: { label: 'Backorder', color: '#dc2626', icon: '⚠️' },
  UNKNOWN: { label: 'Check Vendor', color: '#6b7280', icon: '❓' },
};

export default function PartDetailScreen() {
  const { id, imageUrl } = useLocalSearchParams<{ id: string; imageUrl?: string }>();
  const [prices, setPrices] = useState<PriceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<PriceResult | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [qty, setQty] = useState('1');
  const [saving, setSaving] = useState(false);

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

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{id}</Text>
          <Text style={s.headerSub}>Live prices • 3 vendors</Text>
        </View>
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
                <TouchableOpacity style={[s.addBtn, !p.price && s.addBtnOff]} onPress={() => p.price && openModal(p)} disabled={!p.price}>
                  <Ionicons name="add-circle-outline" size={18} color={p.price ? '#fff' : '#9ca3af'} />
                  <Text style={[s.addBtnText, !p.price && { color: '#9ca3af' }]}>Add to Quote</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          {prices.length === 0 && (
            <View style={s.center}>
              <Text style={{ fontSize: 48 }}>❌</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: '#111827' }}>No results from any vendor</Text>
            </View>
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
  vendor: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sourceBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  priceAmt: { fontSize: 26, fontWeight: '800', color: '#111827', marginBottom: 4 },
  detail: { fontSize: 12, color: '#6b7280' },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e40af', borderRadius: 8, padding: 12, gap: 6 },
  addBtnOff: { backgroundColor: '#f3f4f6' },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  modal: { flex: 1, padding: 24, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  selectedBanner: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between' },
  qtyInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, width: 80, textAlign: 'center', fontSize: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, letterSpacing: 0.5 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 12 },
  createBtn: { backgroundColor: '#1e40af', borderRadius: 10, padding: 16, alignItems: 'center' },
});
