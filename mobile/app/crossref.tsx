import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { findEquivalents } from '../services/api';
import { CrossrefSuggestion } from '../types';

const CONFIDENCE = {
  high: { color: '#16a34a', label: 'High' },
  medium: { color: '#d97706', label: 'Medium' },
  low: { color: '#dc2626', label: 'Low' },
};

export default function CrossrefScreen() {
  const { partNumber, manufacturer, description } = useLocalSearchParams<{
    partNumber: string;
    manufacturer?: string;
    description?: string;
  }>();

  const [suggestions, setSuggestions] = useState<CrossrefSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [partNumber]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await findEquivalents(partNumber, manufacturer, description);
      setSuggestions(result.suggestions);
      if (result.error) setError(result.error);
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const searchPart = (suggestion: CrossrefSuggestion) => {
    router.push({
      pathname: '/part/[id]',
      params: { id: suggestion.partNumber },
    });
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>Find Equivalent</Text>
          <Text style={s.headerSub} numberOfLines={1}>{partNumber}</Text>
        </View>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={s.loadingTitle}>Searching for compatible parts...</Text>
          <Text style={s.loadingSub}>Analyzing specifications and cross-references</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <View style={s.infoBox}>
            <Ionicons name="swap-horizontal-outline" size={16} color="#1e40af" />
            <Text style={s.infoText}>
              AI-suggested equivalents for <Text style={{ fontWeight: '700' }}>{partNumber}</Text>
              {manufacturer ? ` (${manufacturer})` : ''}. Verify specs before ordering.
            </Text>
          </View>

          {suggestions.length === 0 ? (
            <View style={s.center}>
              <Text style={{ fontSize: 48 }}>🔍</Text>
              <Text style={s.emptyTitle}>No equivalents found</Text>
              <Text style={s.emptySub}>
                {error || 'This part may be too specialized or obscure for AI cross-referencing.'}
              </Text>
              <TouchableOpacity style={s.manualBtn} onPress={() => router.replace('/(tabs)')}>
                <Ionicons name="search-outline" size={16} color="#1e40af" />
                <Text style={s.manualBtnText}>Search Manually</Text>
              </TouchableOpacity>
            </View>
          ) : (
            suggestions.map((item, i) => {
              const cfg = CONFIDENCE[item.confidence] || CONFIDENCE.low;
              return (
                <View key={i} style={s.card}>
                  <View style={s.cardTop}>
                    <Text style={s.manufacturer}>{item.manufacturer}</Text>
                    <View style={s.confidenceDot}>
                      <View style={[s.dot, { backgroundColor: cfg.color }]} />
                      <Text style={[s.confidenceLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text style={s.partNumber}>{item.partNumber}</Text>
                  <Text style={s.matchReason}>{item.matchReason}</Text>
                  {item.keySpecs.length > 0 && (
                    <View style={s.specRow}>
                      {item.keySpecs.map((spec, j) => (
                        <View key={j} style={s.specChip}>
                          <Text style={s.specText}>{spec}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity style={s.searchBtn} onPress={() => searchPart(item)}>
                    <Text style={s.searchBtnText}>Search This Part</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e40af',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, gap: 12,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#93c5fd', fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  loadingTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  loadingSub: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  infoBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#eff6ff',
    borderRadius: 10, padding: 12, marginBottom: 16, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 18 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6', elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  manufacturer: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  confidenceDot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  confidenceLabel: { fontSize: 12, fontWeight: '600' },
  partNumber: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 6 },
  matchReason: { fontSize: 13, color: '#4b5563', lineHeight: 18, marginBottom: 10 },
  specRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  specChip: { backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  specText: { fontSize: 12, color: '#374151' },
  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1e40af', borderRadius: 8, padding: 12,
  },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  manualBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 16,
    paddingVertical: 10, borderWidth: 1, borderColor: '#bfdbfe', marginTop: 8,
  },
  manualBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 14 },
});
