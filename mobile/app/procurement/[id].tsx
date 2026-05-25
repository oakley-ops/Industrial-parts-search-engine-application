import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
  Image, ActionSheetIOS,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Ionicons } from '@expo/vector-icons';
import {
  getConversation, sendProcurementMessage,
  getQuotes, createQuote, addLineItem, getPricesForPart,
} from '../../services/api';
import { ProcurementConversation, ProcurementMessage, ProcurementPart, Quote, PriceResult } from '../../types';
import { THEME } from '../../constants/theme';

function PartCard({
  part,
  prices,
  loadingPrice,
  onAddToQuote,
}: {
  part: ProcurementPart;
  prices: PriceResult[];
  loadingPrice: boolean;
  onAddToQuote: (part: ProcurementPart, price: PriceResult | null) => void;
}) {
  const best = prices.filter(p => p.price !== null && p.price > 0).sort((a, b) => a.price! - b.price!)[0] || null;

  return (
    <View style={ps.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text style={ps.partNumber} numberOfLines={1}>{part.partNumber}</Text>
        <Text style={ps.qty}>Qty: {part.quantity}</Text>
      </View>
      <Text style={ps.description}>{part.description}</Text>
      {part.notes ? <Text style={ps.notes}>{part.notes}</Text> : null}
      {loadingPrice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <ActivityIndicator size="small" color={THEME.colors.accent} />
          <Text style={{ color: THEME.colors.textSecondary, fontSize: 12 }}>Fetching prices...</Text>
        </View>
      ) : best ? (
        <Text style={ps.price}>${best.price!.toFixed(2)} <Text style={ps.priceVendor}>({best.vendorName})</Text></Text>
      ) : (
        <Text style={ps.noPrice}>Price unavailable</Text>
      )}
      <TouchableOpacity style={ps.addBtn} onPress={() => onAddToQuote(part, best)}>
        <Ionicons name="add-circle-outline" size={16} color={THEME.colors.accent} />
        <Text style={ps.addBtnText}>Add to Quote</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProcurementChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<ProcurementConversation | null>(null);
  const [messages, setMessages] = useState<ProcurementMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [pendingImageUri, setPendingImageUri] = useState<string | null>(null);
  const [imageCache, setImageCache] = useState<Record<string, string>>({});

  // Price state lifted to parent so "Add All to Quote" can access all resolved prices
  const [partPrices, setPartPrices] = useState<Record<string, PriceResult[]>>({});
  const [partPricesLoading, setPartPricesLoading] = useState<Record<string, boolean>>({});

  // Quote modal state
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<ProcurementPart | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<PriceResult | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [newQuoteTitle, setNewQuoteTitle] = useState('');
  const [savingQuote, setSavingQuote] = useState(false);
  const [qty, setQty] = useState('1');
  // When non-null, the quote modal is in "add all" mode
  const [addAllParts, setAddAllParts] = useState<ProcurementPart[] | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { load(); }, [id]);

  // Fetch prices for all parts in parts_list messages whenever messages change
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.messageType === 'parts_list' && msg.parts) {
        msg.parts.forEach(part => {
          if (partPrices[part.partNumber] === undefined && !partPricesLoading[part.partNumber]) {
            setPartPricesLoading(prev => ({ ...prev, [part.partNumber]: true }));
            getPricesForPart(part.partNumber)
              .then(p => setPartPrices(prev => ({ ...prev, [part.partNumber]: p })))
              .catch(() => setPartPrices(prev => ({ ...prev, [part.partNumber]: [] })))
              .finally(() => setPartPricesLoading(prev => ({ ...prev, [part.partNumber]: false })));
          }
        });
      }
    });
  }, [messages]);

  const load = async () => {
    setLoading(true);
    try {
      const conv = await getConversation(id);
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch {
      Alert.alert('Error', 'Could not load conversation');
    } finally {
      setLoading(false);
    }
  };

  const pickImage = async (useCamera: boolean) => {
    try {
      let result: ImagePicker.ImagePickerResult;
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Camera access required', 'Enable it in Settings.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
      }
      if (result.canceled || !result.assets?.[0]) return;
      await processImage(result.assets[0].uri);
    } catch {
      Alert.alert('Error', 'Could not access image source. Try again.');
    }
  };

  const processImage = async (uri: string) => {
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 1024 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      if (!manipulated.base64) throw new Error('No base64');
      setPendingImage(manipulated.base64);
      setPendingImageUri(manipulated.uri);
    } catch {
      Alert.alert('Could not process image. Try again.');
    }
  };

  const openImagePicker = () => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (idx) => {
          if (idx === 1) pickImage(true);
          if (idx === 2) pickImage(false);
        },
      );
    } else {
      Alert.alert('Attach Photo', 'Select source', [
        { text: 'Take Photo', onPress: () => pickImage(true) },
        { text: 'Choose from Library', onPress: () => pickImage(false) },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && !pendingImage) || sending) return;
    const text = input.trim();
    const imageToSend = pendingImage;
    const imageUriToShow = pendingImageUri;
    setInput('');
    setPendingImage(null);
    setPendingImageUri(null);
    setSending(true);

    const tempId = `temp-${Date.now()}`;
    const optimistic: ProcurementMessage = {
      id: tempId,
      role: 'user',
      messageType: 'text',
      content: text,
      parts: null,
      hasImage: !!imageToSend,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    if (imageUriToShow) {
      setImageCache(prev => ({ ...prev, [tempId]: imageUriToShow }));
    }

    try {
      const reply = await sendProcurementMessage(id, text, imageToSend ?? undefined);
      setMessages(prev => [...prev, reply]);
      if (reply.messageType === 'parts_list' || conversation?.title === 'New Conversation') {
        const updated = await getConversation(id);
        setConversation(updated);
      }
    } catch {
      Alert.alert('Error', 'Could not send message');
      setMessages(prev => prev.filter(m => m.id !== tempId));
      setImageCache(prev => { const next = { ...prev }; delete next[tempId]; return next; });
      if (imageToSend) setPendingImage(imageToSend);
      if (imageUriToShow) setPendingImageUri(imageUriToShow);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const openQuoteModal = async (part: ProcurementPart, price: PriceResult | null) => {
    setAddAllParts(null);
    setSelectedPart(part);
    setSelectedPrice(price);
    setQty(String(part.quantity));
    setNewQuoteTitle('');
    try { setQuotes(await getQuotes()); } catch {}
    setShowQuoteModal(true);
  };

  const addToExistingQuote = async (quoteId: string) => {
    if (addAllParts) {
      setShowQuoteModal(false);
      await addAllToQuote(addAllParts, quoteId);
      return;
    }
    if (!selectedPart || !selectedPrice) return;
    setSavingQuote(true);
    try {
      await addLineItem(quoteId, {
        partNumber: selectedPart.partNumber,
        vendorSlug: selectedPrice.vendorSlug,
        vendorName: selectedPrice.vendorName,
        vendorSku: selectedPrice.vendorSku,
        quantity: parseInt(qty) || 1,
        unitPrice: selectedPrice.price || 0,
        availability: selectedPrice.source,
        productUrl: selectedPrice.productUrl,
      });
      setShowQuoteModal(false);
      Alert.alert('Added!', 'Part added to quote.');
    } catch {
      Alert.alert('Error', 'Could not add to quote');
    } finally { setSavingQuote(false); }
  };

  const createAndAdd = async () => {
    if (!newQuoteTitle.trim()) return;
    setSavingQuote(true);
    try {
      const q = await createQuote(newQuoteTitle.trim());
      setShowQuoteModal(false);
      if (addAllParts) {
        await addAllToQuote(addAllParts, q.id).catch(() => Alert.alert('Error', 'Could not add all parts'));
      } else if (selectedPart && selectedPrice) {
        await addLineItem(q.id, {
          partNumber: selectedPart.partNumber,
          vendorSlug: selectedPrice.vendorSlug,
          vendorName: selectedPrice.vendorName,
          vendorSku: selectedPrice.vendorSku,
          quantity: parseInt(qty) || 1,
          unitPrice: selectedPrice.price || 0,
          availability: selectedPrice.source,
          productUrl: selectedPrice.productUrl,
        });
        Alert.alert('Done', 'Part added to new quote.');
      } else {
        Alert.alert('Quote created', 'No price available — part not added automatically.');
      }
    } catch {
      Alert.alert('Error', 'Could not create quote');
    } finally {
      setSavingQuote(false);
    }
  };

  const addAllToQuote = async (parts: ProcurementPart[], quoteId: string) => {
    setSavingQuote(true);
    let added = 0;
    try {
      for (const part of parts) {
        const prices = partPrices[part.partNumber] || [];
        const best = prices.filter(p => p.price !== null && p.price > 0).sort((a, b) => a.price! - b.price!)[0];
        if (!best) continue;
        await addLineItem(quoteId, {
          partNumber: part.partNumber,
          vendorSlug: best.vendorSlug,
          vendorName: best.vendorName,
          vendorSku: best.vendorSku,
          quantity: part.quantity,
          unitPrice: best.price || 0,
          availability: best.source,
          productUrl: best.productUrl,
        });
        added++;
      }
      Alert.alert('Done', `${added} of ${parts.length} parts added to quote.`);
    } catch {
      Alert.alert('Error', 'Could not add all parts');
    } finally {
      setSavingQuote(false);
    }
  };

  const openAddAllModal = async (parts: ProcurementPart[]) => {
    setAddAllParts(parts);
    setNewQuoteTitle('');
    try { setQuotes(await getQuotes()); } catch {}
    setShowQuoteModal(true);
  };

  const renderMessage = (msg: ProcurementMessage, index: number) => {
    const isUser = msg.role === 'user';

    if (msg.messageType === 'parts_list' && msg.parts) {
      const allLoaded = msg.parts.every(p => !partPricesLoading[p.partNumber] && partPrices[p.partNumber] !== undefined);
      return (
        <View key={msg.id} style={s.assistantBubble}>
          <Text style={s.bubbleText}>{msg.content}</Text>
          <TouchableOpacity
            style={[s.addAllBtn, !allLoaded && { opacity: 0.5 }]}
            onPress={() => openAddAllModal(msg.parts!)}
            disabled={!allLoaded}
          >
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={s.addAllBtnText}>{allLoaded ? 'Add All to Quote' : 'Loading prices...'}</Text>
          </TouchableOpacity>
          <View style={s.partsList}>
            {msg.parts.map((part) => (
              <PartCard
                key={part.partNumber}
                part={part}
                prices={partPrices[part.partNumber] || []}
                loadingPrice={partPricesLoading[part.partNumber] ?? true}
                onAddToQuote={openQuoteModal}
              />
            ))}
          </View>
        </View>
      );
    }

    const cachedImage = imageCache[msg.id];

    return (
      <View key={msg.id} style={[s.bubble, isUser ? s.userBubble : s.assistantBubble]}>
        {isUser && cachedImage && (
          <Image
            source={{ uri: cachedImage }}
            style={s.msgImage}
            resizeMode="cover"
          />
        )}
        {isUser && !cachedImage && msg.hasImage && (
          <View style={s.photoBadge}>
            <Text style={s.photoBadgeText}>📷 Photo attached</Text>
          </View>
        )}
        {msg.content ? <Text style={[s.bubbleText, isUser && s.userBubbleText]}>{msg.content}</Text> : null}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={THEME.colors.accent} />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color={THEME.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{conversation?.title || 'Assistant'}</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <View style={s.emptyChat}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🔧</Text>
              <Text style={s.emptyChatTitle}>Describe your repair job</Text>
              <Text style={s.emptyChatSub}>Tell me what equipment needs repair and I'll help you identify the parts you need.</Text>
            </View>
          )}
          {messages.map((msg, i) => renderMessage(msg, i))}
          {sending && (
            <View style={s.assistantBubble}>
              <ActivityIndicator size="small" color={THEME.colors.accent} />
            </View>
          )}
        </ScrollView>

        <View>
          {pendingImage && pendingImageUri && (
            <View style={s.previewStrip}>
              <Image
                source={{ uri: pendingImageUri }}
                style={s.previewThumb}
                resizeMode="cover"
              />
              <TouchableOpacity onPress={() => { setPendingImage(null); setPendingImageUri(null); }} style={s.previewDismiss}>
                <Ionicons name="close-circle" size={20} color={THEME.colors.textMuted} />
              </TouchableOpacity>
            </View>
          )}
          <View style={s.inputBar}>
            <TouchableOpacity onPress={openImagePicker} style={s.cameraBtn} disabled={sending}>
              <Ionicons name="camera-outline" size={24} color={sending ? THEME.colors.border : THEME.colors.textMuted} />
            </TouchableOpacity>
            <TextInput
              style={s.input}
              placeholder="Describe the repair job..."
              placeholderTextColor={THEME.colors.placeholderText}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={500}
              editable={!sending}
              keyboardAppearance="dark"
            />
            <TouchableOpacity
              style={[s.sendBtn, ((!input.trim() && !pendingImage) || sending) && s.sendBtnOff]}
              onPress={handleSend}
              disabled={(!input.trim() && !pendingImage) || sending}
            >
              <Ionicons name="send" size={20} color={(input.trim() || pendingImage) && !sending ? '#fff' : THEME.colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showQuoteModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={s.modalTitle}>Add to Quote</Text>
            <TouchableOpacity onPress={() => setShowQuoteModal(false)}>
              <Ionicons name="close" size={24} color={THEME.colors.textPrimary} />
            </TouchableOpacity>
          </View>
          {addAllParts ? (
            <View style={s.selectedBanner}>
              <Text style={{ fontWeight: '700', color: THEME.colors.accent }}>Adding {addAllParts.length} parts to quote</Text>
            </View>
          ) : selectedPart ? (
            <View style={s.selectedBanner}>
              <Text style={{ fontWeight: '700', color: THEME.colors.accent }}>{selectedPart.partNumber}</Text>
              <Text style={{ fontWeight: '700', color: THEME.colors.textPrimary }}>
                {selectedPrice ? `$${selectedPrice.price?.toFixed(2)}` : 'No price'}
              </Text>
            </View>
          ) : null}
          {!addAllParts && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: THEME.colors.textPrimary }}>Quantity</Text>
              <TextInput style={s.qtyInput} value={qty} onChangeText={setQty} keyboardType="number-pad" keyboardAppearance="dark" />
            </View>
          )}
          {quotes.filter(q => q.status === 'draft').length > 0 && (
            <>
              <Text style={s.sectionLabel}>ADD TO EXISTING QUOTE</Text>
              {quotes.filter(q => q.status === 'draft').map(q => (
                <TouchableOpacity key={q.id} style={s.quoteRow} onPress={() => addToExistingQuote(q.id)} disabled={savingQuote}>
                  <Text style={{ fontWeight: '600', color: THEME.colors.textPrimary }}>{q.title}</Text>
                  <Text style={{ color: THEME.colors.textSecondary, fontSize: 13 }}>{q.lineItems?.length || 0} items</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>CREATE NEW QUOTE</Text>
          <TextInput style={s.textInput} placeholder="Quote title..." placeholderTextColor={THEME.colors.placeholderText} value={newQuoteTitle} onChangeText={setNewQuoteTitle} keyboardAppearance="dark" />
          <TouchableOpacity
            style={[s.createBtn, (!newQuoteTitle.trim() || savingQuote) && { opacity: 0.5 }]}
            onPress={createAndAdd}
            disabled={!newQuoteTitle.trim() || savingQuote}
          >
            {savingQuote ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create & Add</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const ps = StyleSheet.create({
  card: { backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.card, padding: 12, marginTop: 10, borderWidth: 1, borderColor: THEME.colors.border },
  partNumber: { fontSize: 15, fontWeight: '800', color: THEME.colors.textPrimary, flex: 1, fontVariant: ['tabular-nums'] },
  qty: { fontSize: 13, color: THEME.colors.textSecondary, fontWeight: '600' },
  description: { fontSize: 13, color: THEME.colors.textPrimary, marginBottom: 2 },
  notes: { fontSize: 12, color: THEME.colors.textSecondary, fontStyle: 'italic', marginBottom: 4 },
  price: { fontSize: 16, fontWeight: '800', color: THEME.colors.accent, marginTop: 6, fontVariant: ['tabular-nums'] },
  priceVendor: { fontSize: 12, fontWeight: '400', color: THEME.colors.textSecondary },
  noPrice: { fontSize: 13, color: THEME.colors.textMuted, fontStyle: 'italic', marginTop: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, borderWidth: 1.5, borderColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 8, justifyContent: 'center' },
  addBtnText: { color: THEME.colors.accent, fontWeight: '600', fontSize: 13 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: THEME.colors.background, paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: THEME.colors.border,
  },
  headerTitle: { color: THEME.colors.textPrimary, fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyChatTitle: { fontSize: 20, fontWeight: '700', color: THEME.colors.textPrimary, marginBottom: 8 },
  emptyChatSub: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  bubble: { maxWidth: '80%', borderRadius: 8, padding: 12, marginBottom: 10 },
  userBubble: { backgroundColor: THEME.colors.accent, alignSelf: 'flex-end', borderBottomRightRadius: 2 },
  assistantBubble: { backgroundColor: THEME.colors.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 2, borderWidth: 1, borderColor: THEME.colors.border, padding: 14, borderRadius: 8, marginBottom: 10, maxWidth: '92%' },
  bubbleText: { fontSize: 15, color: THEME.colors.textPrimary, lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  addAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 10, justifyContent: 'center', marginTop: 10 },
  addAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  partsList: { marginTop: 4 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12,
    backgroundColor: THEME.colors.surface, borderTopWidth: 1, borderTopColor: THEME.colors.border,
  },
  input: { flex: 1, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.input, padding: 12, fontSize: 15, maxHeight: 100, backgroundColor: THEME.colors.background, color: THEME.colors.textPrimary },
  sendBtn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sendBtnOff: { backgroundColor: THEME.colors.surface },
  cameraBtn: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  previewStrip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: THEME.colors.surface, borderTopWidth: 1, borderTopColor: THEME.colors.border,
  },
  previewThumb: { width: 80, height: 80, borderRadius: THEME.radius.badge },
  previewDismiss: { marginLeft: 8 },
  msgImage: { width: '100%', height: 200, borderRadius: THEME.radius.badge, marginBottom: 8 },
  photoBadge: { backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.badge, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 6, alignSelf: 'flex-start' },
  photoBadgeText: { fontSize: 12, color: THEME.colors.textSecondary },
  modal: { flex: 1, padding: 24, backgroundColor: THEME.colors.surface },
  modalTitle: { fontSize: 20, fontWeight: '700', color: THEME.colors.textPrimary },
  selectedBanner: { backgroundColor: THEME.colors.surfaceElevated, borderRadius: THEME.radius.card, padding: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between' },
  qtyInput: { borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.input, padding: 10, width: 80, textAlign: 'center', fontSize: 16, backgroundColor: THEME.colors.background, color: THEME.colors.textPrimary },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: THEME.colors.textSecondary, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.input, marginBottom: 8, backgroundColor: THEME.colors.background },
  textInput: { borderWidth: 1, borderColor: THEME.colors.border, borderRadius: THEME.radius.input, padding: 14, fontSize: 15, marginBottom: 12, backgroundColor: THEME.colors.background, color: THEME.colors.textPrimary },
  createBtn: { backgroundColor: THEME.colors.accent, borderRadius: THEME.radius.button, padding: 16, alignItems: 'center' },
});
