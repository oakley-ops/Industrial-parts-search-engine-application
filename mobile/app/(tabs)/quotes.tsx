import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getQuotes, createQuote, deleteQuote } from '../../services/api';
import { Quote } from '../../types';
import { theme } from '../../constants/theme';

export default function QuotesScreen() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [creating, setCreating] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    setLoading(true);
    try { setQuotes(await getQuotes()); } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try { await createQuote(newTitle.trim()); setShowModal(false); setNewTitle(''); load(); }
    finally { setCreating(false); }
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteQuote(id); load(); } },
    ]);
  };

  const getTotal = (q: Quote) => q.lineItems?.reduce((s, i) => s + Number(i.totalPrice), 0) || 0;

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.newBtn} onPress={() => setShowModal(true)}>
        <Ionicons name="add-circle" size={20} color={theme.colors.white} />
        <Text style={s.newBtnText}>New Quote</Text>
      </TouchableOpacity>

      {loading
        ? <ActivityIndicator style={{ marginTop: 48 }} size="large" color={theme.colors.primary} />
        : quotes.length === 0
          ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 64 }}>📋</Text>
              <Text style={s.emptyTitle}>No quotes yet</Text>
              <Text style={s.emptySub}>Create a quote and add parts from search</Text>
            </View>
          )
          : (
            <FlatList
              data={quotes}
              keyExtractor={q => q.id}
              onRefresh={load}
              refreshing={loading}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={s.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={s.cardTitle}>{item.title}</Text>
                    <View style={{ flexDirection: 'row', gap: 12 }}>
                      <TouchableOpacity onPress={() => router.push(`/quote-export/${item.id}`)}>
                        <Ionicons name="share-outline" size={18} color={theme.colors.secondary} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleDelete(item.id, item.title)}>
                        <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={s.cardMeta}>
                      {item.lineItems?.length || 0} items · {new Date(item.createdAt).toLocaleDateString()}
                    </Text>
                    <Text style={s.cardTotal}>${getTotal(item).toFixed(2)}</Text>
                  </View>
                  <View style={[
                    s.statusTag,
                    { backgroundColor: item.status === 'draft' ? theme.colors.warningSubtle : theme.colors.successSubtle },
                  ]}>
                    <Text style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: item.status === 'draft' ? theme.colors.warning : theme.colors.success,
                      letterSpacing: 1,
                    }}>
                      {item.status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              )}
            />
          )
      }

      <Modal visible={showModal} animationType="slide" presentationStyle="formSheet">
        <View style={s.modal}>
          <Text style={s.modalTitle}>New Quote</Text>
          <TextInput
            style={s.input}
            placeholder="Quote title (e.g. Pump Rebuild Q3)"
            placeholderTextColor={theme.colors.textMuted}
            value={newTitle}
            onChangeText={setNewTitle}
            autoFocus
          />
          <TouchableOpacity style={[s.createBtn, creating && { opacity: 0.5 }]} onPress={handleCreate} disabled={creating}>
            {creating
              ? <ActivityIndicator color={theme.colors.white} />
              : <Text style={{ color: theme.colors.white, fontWeight: '700', fontSize: 16 }}>Create Quote</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowModal(false)} style={{ alignItems: 'center', padding: 12 }}>
            <Text style={{ color: theme.colors.textMuted }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: 14,
    justifyContent: 'center',
    gap: 8,
  },
  newBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '700' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary, flex: 1, marginRight: 8 },
  cardMeta: { fontSize: 13, color: theme.colors.textMuted },
  cardTotal: { fontSize: 18, fontWeight: '800', color: theme.colors.primary },
  statusTag: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
  },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary },
  emptySub: { fontSize: 14, color: theme.colors.textMuted },

  // Modal
  modal: {
    padding: theme.spacing.xl,
    paddingTop: 40,
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  modalTitle: { fontSize: 22, fontWeight: '800', color: theme.colors.textPrimary, marginBottom: 20, letterSpacing: 0.5 },
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
  createBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
});
