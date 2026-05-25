import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Modal,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as Print from 'expo-print';
import { Ionicons } from '@expo/vector-icons';
import {
  getQuote, updateQuote, updateQuoteStatus, duplicateQuote,
  removeLineItem, updateLineItemQty, updateLineItemPrice,
  getDigiKeyPriceForQuantity, deleteQuote, getQuotePdfUri,
} from '../../services/api';
import { buildQuoteHtml } from '../../utils/quoteHtml';
import { Quote, QuoteLineItem } from '../../types';
import { THEME } from '../../constants/theme';

const STATUS_ORDER = ['draft', 'sent', 'accepted'];
const STATUS_LABELS: Record<string, string> = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected' };
const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:    { bg: THEME.colors.warningSubtle,  text: THEME.colors.warning },
  sent:     { bg: '#1e3a5f',                   text: '#60a5fa' },
  accepted: { bg: THEME.colors.successSubtle,  text: THEME.colors.success },
  rejected: { bg: THEME.colors.dangerSubtle,   text: THEME.colors.danger },
};

export default function QuoteDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Edit title modal
  const [showTitleModal, setShowTitleModal] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');

  // Notes
  const [notes, setNotes] = useState('');
  const [notesDirty, setNotesDirty] = useState(false);

  // Inline qty editing
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState('');

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    try {
      const q: Quote = await getQuote(id);
      setQuote(q);
      setNotes(q.notes || '');
      setNotesDirty(false);
    } catch {
      Alert.alert('Error', 'Could not load quote');
    } finally {
      setLoading(false);
    }
  };

  const total = quote?.lineItems.reduce((s, i) => s + Number(i.totalPrice), 0) || 0;

  const handleRenameOpen = () => {
    setDraftTitle(quote?.title || '');
    setShowTitleModal(true);
  };

  const handleRenameConfirm = async () => {
    if (!draftTitle.trim() || !quote) return;
    setSaving(true);
    try {
      const updated = await updateQuote(quote.id, { title: draftTitle.trim() });
      setQuote(updated);
      setShowTitleModal(false);
    } catch {
      Alert.alert('Error', 'Could not rename quote');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNotes = async () => {
    if (!quote) return;
    setSaving(true);
    try {
      const updated = await updateQuote(quote.id, { notes });
      setQuote(updated);
      setNotesDirty(false);
    } catch {
      Alert.alert('Error', 'Could not save notes');
    } finally {
      setSaving(false);
    }
  };

  const handleStatus = async (status: string) => {
    if (!quote) return;
    setSaving(true);
    try {
      const updated = await updateQuoteStatus(quote.id, status);
      setQuote(updated);
    } catch {
      Alert.alert('Error', 'Could not update status');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!quote) return;
    setSaving(true);
    try {
      const copy = await duplicateQuote(quote.id);
      Alert.alert('Duplicated', `"${copy.title}" created.`, [
        { text: 'Open Copy', onPress: () => router.replace(`/quote/${copy.id}`) },
        { text: 'Stay Here', style: 'cancel' },
      ]);
    } catch {
      Alert.alert('Error', 'Could not duplicate quote');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveItem = (item: QuoteLineItem) => {
    Alert.alert('Remove Item', `Remove ${item.partNumber}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await removeLineItem(quote!.id, item.id);
            load();
          } catch {
            Alert.alert('Error', 'Could not remove item');
          }
        },
      },
    ]);
  };

  const startQtyEdit = (item: QuoteLineItem) => {
    setEditingItemId(item.id);
    setEditQty(String(item.quantity));
  };

  const commitQtyEdit = async (item: QuoteLineItem) => {
    const qty = parseInt(editQty);
    setEditingItemId(null);
    if (!qty || qty === item.quantity || qty < 1) return;
    try {
      const updated = await updateLineItemQty(quote!.id, item.id, qty);
      setQuote(updated);
    } catch {
      Alert.alert('Error', 'Could not update quantity');
      return;
    }
    if (item.vendorSlug === 'digikey' && item.partNumber) {
      const qId = quote!.id;
      const iId = item.id;
      getDigiKeyPriceForQuantity(item.partNumber, qty)
        .then(async (newPrice) => {
          if (newPrice !== null) {
            await updateLineItemPrice(qId, iId, newPrice);
            load();
          }
        })
        .catch(() => {});
    }
  };

  const handleExport = async () => {
    if (!quote) return;
    setExporting(true);
    try {
      let uri: string;
      try {
        uri = await getQuotePdfUri(id);
      } catch {
        // Server PDF unavailable — fall back to local rendering
        const { uri: localUri } = await Print.printToFileAsync({ html: buildQuoteHtml(quote) });
        uri = localUri;
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: quote.title,
        UTI: 'com.adobe.pdf',
      });
    } catch {
      Alert.alert('Export Failed', 'Could not generate PDF. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert('Delete Quote', `Delete "${quote?.title}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteQuote(id);
          router.replace('/(tabs)/quotes');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={THEME.colors.accent} />
      </View>
    );
  }

  if (!quote) return null;

  const sc = STATUS_COLORS[quote.status] || STATUS_COLORS.draft;
  const nextStatus = quote.status === 'draft' ? 'sent' : quote.status === 'sent' ? 'accepted' : null;
  const canReject = quote.status === 'sent';
  const canReopen = quote.status === 'accepted' || quote.status === 'rejected';

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={{ flex: 1 }} onPress={handleRenameOpen}>
          <Text style={s.headerTitle} numberOfLines={1}>{quote.title}</Text>
          <Text style={s.headerSub}>Tap to rename</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDuplicate} style={{ padding: 4 }}>
          <Ionicons name="copy-outline" size={20} color={THEME.colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={handleDelete} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={20} color={THEME.colors.danger} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.exportBtn, exporting && { opacity: 0.5 }]}
          onPress={handleExport}
          disabled={exporting}
        >
          {exporting
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Ionicons name="share-outline" size={16} color="#fff" /><Text style={s.exportBtnText}>PDF</Text></>
          }
        </TouchableOpacity>
      </View>

      {/* Status bar */}
      <View style={s.statusBar}>
        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[s.statusBadgeText, { color: sc.text }]}>{STATUS_LABELS[quote.status] || quote.status}</Text>
        </View>
        <View style={{ flex: 1 }} />
        {nextStatus && (
          <TouchableOpacity
            style={s.statusBtn}
            onPress={() => handleStatus(nextStatus)}
            disabled={saving}
          >
            <Text style={s.statusBtnText}>Mark {STATUS_LABELS[nextStatus]} →</Text>
          </TouchableOpacity>
        )}
        {canReject && (
          <TouchableOpacity
            style={[s.statusBtn, { backgroundColor: THEME.colors.dangerSubtle, borderColor: THEME.colors.danger }]}
            onPress={() => handleStatus('rejected')}
            disabled={saving}
          >
            <Text style={[s.statusBtnText, { color: THEME.colors.danger }]}>Reject</Text>
          </TouchableOpacity>
        )}
        {canReopen && (
          <TouchableOpacity
            style={s.statusBtn}
            onPress={() => handleStatus('draft')}
            disabled={saving}
          >
            <Text style={s.statusBtnText}>↩ Reopen</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        {/* Line items */}
        <Text style={s.sectionLabel}>LINE ITEMS</Text>

        {quote.lineItems.length === 0 ? (
          <View style={s.emptyItems}>
            <Text style={s.emptyItemsText}>No items yet. Add parts from the Search tab.</Text>
          </View>
        ) : (
          quote.lineItems.map(item => (
            <View key={item.id} style={s.itemCard}>
              <View style={s.itemTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemPart}>{item.partNumber}</Text>
                  {item.vendorSku && item.vendorSku !== item.partNumber && (
                    <Text style={s.itemSku}>SKU: {item.vendorSku}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => handleRemoveItem(item)} style={{ padding: 4 }}>
                  <Ionicons name="close-circle" size={20} color={THEME.colors.textMuted} />
                </TouchableOpacity>
              </View>
              <Text style={s.itemVendor}>{item.vendorName}</Text>
              {item.description ? (
                <Text style={s.itemDesc} numberOfLines={2}>{item.description}</Text>
              ) : null}
              <View style={s.itemBottom}>
                <View style={s.qtyRow}>
                  <Text style={s.qtyLabel}>Qty</Text>
                  {editingItemId === item.id ? (
                    <TextInput
                      style={s.qtyInput}
                      value={editQty}
                      onChangeText={setEditQty}
                      keyboardType="number-pad"
                      keyboardAppearance="dark"
                      autoFocus
                      onBlur={() => commitQtyEdit(item)}
                      onSubmitEditing={() => commitQtyEdit(item)}
                    />
                  ) : (
                    <TouchableOpacity onPress={() => startQtyEdit(item)} style={s.qtyValue}>
                      <Text style={s.qtyValueText}>{item.quantity}</Text>
                      <Ionicons name="pencil" size={11} color={THEME.colors.accent} />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.itemUnitPrice}>{`$${Number(item.unitPrice).toFixed(2)} / ea`}</Text>
                  <Text style={s.itemTotal}>${Number(item.totalPrice).toFixed(2)}</Text>
                </View>
              </View>
            </View>
          ))
        )}

        {/* Notes */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>NOTES</Text>
        <TextInput
          style={s.notesInput}
          multiline
          numberOfLines={4}
          placeholder="Add notes, special instructions, or context..."
          placeholderTextColor={THEME.colors.placeholderText}
          value={notes}
          onChangeText={v => { setNotes(v); setNotesDirty(true); }}
          keyboardAppearance="dark"
          textAlignVertical="top"
        />
        {notesDirty && (
          <TouchableOpacity style={s.saveNotesBtn} onPress={handleSaveNotes} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.saveNotesBtnText}>Save Notes</Text>}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Sticky total footer */}
      <View style={s.footer}>
        <View>
          <Text style={s.footerLabel}>{quote.lineItems.length} {quote.lineItems.length === 1 ? 'item' : 'items'}</Text>
          <Text style={s.footerDate}>Created {new Date(quote.createdAt).toLocaleDateString()}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={s.footerTotalLabel}>Total</Text>
          <Text style={s.footerTotal}>${total.toFixed(2)}</Text>
        </View>
      </View>

      {/* Rename modal */}
      <Modal visible={showTitleModal} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalBox}>
            <Text style={s.modalTitle}>Rename Quote</Text>
            <TextInput
              style={s.modalInput}
              value={draftTitle}
              onChangeText={setDraftTitle}
              autoFocus
              keyboardAppearance="dark"
              placeholderTextColor={THEME.colors.placeholderText}
              returnKeyType="done"
              onSubmitEditing={handleRenameConfirm}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowTitleModal(false)}>
                <Text style={s.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modalConfirmBtn, !draftTitle.trim() && { opacity: 0.4 }]}
                onPress={handleRenameConfirm}
                disabled={!draftTitle.trim() || saving}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.modalConfirmText}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.colors.background },

  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.colors.background,
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, gap: 10,
    borderBottomWidth: 1, borderBottomColor: THEME.colors.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: THEME.colors.textPrimary },
  headerSub: { fontSize: 11, color: THEME.colors.textMuted, marginTop: 1 },
  exportBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  exportBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  statusBar: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: THEME.colors.surface, borderBottomWidth: 1, borderBottomColor: THEME.colors.border, gap: 8,
  },
  statusBadge: { borderRadius: THEME.radius.badge, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusBtn: {
    borderWidth: 1, borderColor: THEME.colors.accent, borderRadius: THEME.radius.button,
    paddingHorizontal: 12, paddingVertical: 6, backgroundColor: THEME.colors.accentSubtle,
  },
  statusBtnText: { fontSize: 12, fontWeight: '700', color: THEME.colors.accent },

  sectionLabel: { fontSize: 11, fontWeight: '700', color: THEME.colors.textMuted, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },

  itemCard: {
    backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card,
    padding: 14, marginBottom: 10, borderWidth: 1, borderColor: THEME.colors.border,
  },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  itemPart: { fontSize: 15, fontWeight: '700', color: THEME.colors.textPrimary, fontVariant: ['tabular-nums'] },
  itemSku: { fontSize: 11, color: THEME.colors.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] },
  itemVendor: { fontSize: 12, color: THEME.colors.textSecondary, fontWeight: '600', marginBottom: 4 },
  itemDesc: { fontSize: 12, color: THEME.colors.textSecondary, lineHeight: 17, marginBottom: 8 },
  itemBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyLabel: { fontSize: 12, color: THEME.colors.textMuted, fontWeight: '600' },
  qtyValue: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.badge, paddingHorizontal: 10, paddingVertical: 5 },
  qtyValueText: { fontSize: 14, fontWeight: '700', color: THEME.colors.textPrimary, fontVariant: ['tabular-nums'] },
  qtyInput: {
    width: 64, backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.badge,
    paddingHorizontal: 10, paddingVertical: 5, fontSize: 14, fontWeight: '700',
    color: THEME.colors.textPrimary, borderWidth: 1, borderColor: THEME.colors.accent, textAlign: 'center',
  },
  itemUnitPrice: { fontSize: 12, color: THEME.colors.textMuted, fontVariant: ['tabular-nums'] },
  itemTotal: { fontSize: 18, fontWeight: '800', color: THEME.colors.accent, fontVariant: ['tabular-nums'] },

  emptyItems: { backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: THEME.colors.border },
  emptyItemsText: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center' },

  notesInput: {
    backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, borderWidth: 1,
    borderColor: THEME.colors.border, padding: 14, fontSize: 14, color: THEME.colors.textPrimary,
    minHeight: 100,
  },
  saveNotesBtn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 12, alignItems: 'center', marginTop: 8 },
  saveNotesBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, backgroundColor: THEME.colors.surface,
    borderTopWidth: 1, borderTopColor: THEME.colors.border,
  },
  footerLabel: { fontSize: 13, color: THEME.colors.textSecondary, fontWeight: '600' },
  footerDate: { fontSize: 11, color: THEME.colors.textMuted, marginTop: 2 },
  footerTotalLabel: { fontSize: 11, color: THEME.colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  footerTotal: { fontSize: 24, fontWeight: '800', color: THEME.colors.accent, fontVariant: ['tabular-nums'] },

  // Rename modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 },
  modalBox: { backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 24, borderWidth: 1, borderColor: THEME.colors.border },
  modalTitle: { fontSize: 18, fontWeight: '700', color: THEME.colors.textPrimary, marginBottom: 16 },
  modalInput: {
    borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.input,
    padding: 14, fontSize: 15, marginBottom: 16, backgroundColor: THEME.colors.background,
    color: THEME.colors.textPrimary,
  },
  modalCancelBtn: { flex: 1, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.button },
  modalCancelText: { color: THEME.colors.textSecondary, fontWeight: '600' },
  modalConfirmBtn: { flex: 1, padding: 14, alignItems: 'center', backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button },
  modalConfirmText: { color: '#fff', fontWeight: '700' },
});
