import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getConversations, createConversation, deleteProcurementConversation } from '../../services/api';
import { ProcurementConversation } from '../../types';
import { THEME } from '../../constants/theme';

export default function ProcureScreen() {
  const [conversations, setConversations] = useState<ProcurementConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    setLoading(true);
    try { setConversations(await getConversations()); } finally { setLoading(false); }
  };

  const handleNew = async () => {
    setCreating(true);
    try {
      const conv = await createConversation();
      router.push({ pathname: '/procurement/[id]' as any, params: { id: conv.id } });
    } finally { setCreating(false); }
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteProcurementConversation(id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.newBtn} onPress={handleNew} disabled={creating}>
        {creating
          ? <ActivityIndicator color="#fff" size="small" />
          : <Ionicons name="add-circle" size={20} color="#fff" />}
        <Text style={s.newBtnText}>New Conversation</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color={THEME.colors.accent} />
      ) : conversations.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 64 }}>🤖</Text>
          <Text style={s.emptyTitle}>No conversations yet</Text>
          <Text style={s.emptySub}>Describe a repair job and Claude will build your parts list</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={c => c.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push({ pathname: '/procurement/[id]' as any, params: { id: item.id } })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.cardMeta}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(item.id, item.title)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
              <Ionicons name="chevron-forward" size={16} color={THEME.colors.textMuted} style={{ alignSelf: 'flex-end', marginTop: 4 }} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.background },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: THEME.colors.accent,
    margin: 16, borderRadius: THEME.radius.button, padding: 14, justifyContent: 'center',
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: THEME.colors.textPrimary },
  emptySub: { fontSize: 14, color: THEME.colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: THEME.colors.surface, borderRadius: THEME.radius.card, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: THEME.colors.border,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: THEME.colors.textPrimary, marginBottom: 4 },
  cardMeta: { fontSize: 13, color: THEME.colors.textSecondary },
});
