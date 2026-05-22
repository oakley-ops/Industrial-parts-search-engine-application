import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, Modal } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getQuotes, createQuote, deleteQuote } from '../../services/api';
import { Quote } from '../../types';

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
        <Ionicons name="add-circle" size={20} color="#fff" />
        <Text style={s.newBtnText}>New Quote</Text>
      </TouchableOpacity>

      {loading
        ? <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#1e40af" />
        : quotes.length === 0
          ? <View style={s.empty}><Text style={{ fontSize: 64 }}>📋</Text><Text style={s.emptyTitle}>No quotes yet</Text><Text style={s.emptySub}>Create a quote and add parts from search</Text></View>
          : <FlatList data={quotes} keyExtractor={q => q.id} onRefresh={load} refreshing={loading}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={s.card}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                    <Text style={s.cardTitle}>{item.title}</Text>
                    <TouchableOpacity onPress={() => handleDelete(item.id, item.title)}>
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={s.cardMeta}>{item.lineItems?.length || 0} items · {new Date(item.createdAt).toLocaleDateString()}</Text>
                    <Text style={s.cardTotal}>${getTotal(item).toFixed(2)}</Text>
                  </View>
                  <View style={[s.statusTag, { backgroundColor: item.status === 'draft' ? '#fef3c7' : '#dcfce7' }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: '#92400e' }}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
              )}
            />
      }

      <Modal visible={showModal} animationType="slide" presentationStyle="formSheet">
        <View style={s.modal}>
          <Text style={s.modalTitle}>New Quote</Text>
          <TextInput style={s.input} placeholder="Quote title (e.g. Pump Rebuild Q3)" value={newTitle} onChangeText={setNewTitle} autoFocus />
          <TouchableOpacity style={[s.createBtn, creating && { opacity: 0.5 }]} onPress={handleCreate} disabled={creating}>
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create Quote</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowModal(false)} style={{ alignItems: 'center', padding: 12 }}>
            <Text style={{ color: '#6b7280' }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  newBtn: { flexDirection: 'row', alignItems: 'center', margin: 16, backgroundColor: '#1e40af', borderRadius: 10, padding: 14, justifyContent: 'center', gap: 8 },
  newBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  cardMeta: { fontSize: 13, color: '#6b7280' },
  cardTotal: { fontSize: 18, fontWeight: '800', color: '#1e40af' },
  statusTag: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 14, color: '#6b7280' },
  modal: { padding: 24, paddingTop: 40, flex: 1, backgroundColor: '#fff' },
  modalTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 20 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 12 },
  createBtn: { backgroundColor: '#1e40af', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 10 },
});
