import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getQuote } from '../../services/api';
import { Quote } from '../../types';
import { buildQuoteHtml } from '../../utils/quoteHtml';

export default function QuoteExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setQuote(await getQuote(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!quote) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildQuoteHtml(quote) });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: quote.title,
        UTI: 'com.adobe.pdf',
      });
    } catch {
      Alert.alert('Export Failed', 'Could not generate PDF. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Could not load quote.</Text>
        <TouchableOpacity style={s.retryBtn} onPress={load}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!quote || quote.lineItems.length === 0) {
    return (
      <View style={s.center}>
        <Text style={{ fontSize: 48 }}>📋</Text>
        <Text style={s.emptyText}>No items in this quote</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={s.backLinkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html: buildQuoteHtml(quote) }}
        style={{ flex: 1 }}
      />
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.shareBtn, sharing && s.shareBtnDisabled]}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.shareBtnText}>Share PDF</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', gap: 12 },
  bar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff',
  },
  backBtn: { padding: 10 },
  backBtnText: { color: '#1e40af', fontSize: 15, fontWeight: '600' },
  shareBtn: { backgroundColor: '#1e40af', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorText: { fontSize: 16, color: '#374151' },
  retryBtn: { borderWidth: 1, borderColor: '#1e40af', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#1e40af', fontWeight: '600' },
  emptyText: { fontSize: 16, color: '#374151' },
  backLinkText: { color: '#1e40af', fontSize: 15, fontWeight: '600' },
});
