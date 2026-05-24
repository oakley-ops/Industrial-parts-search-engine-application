import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Switch, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAlerts, createAlert, toggleAlert, deleteAlert } from '../../services/api';
import { Alert as AlertType } from '../../types';
import { theme } from '../../constants/theme';

const TYPES = [
  { value: 'price_below', label: 'Price drops below $', icon: '💰' },
  { value: 'in_stock', label: 'Back in stock', icon: '✅' },
  { value: 'lead_time_above', label: 'Lead time exceeds X days', icon: '⏱️' },
];

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<AlertType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [partNumber, setPartNumber] = useState('');
  const [alertType, setAlertType] = useState('price_below');
  const [threshold, setThreshold] = useState('');
  const [saving, setSaving] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    setLoading(true);
    try { setAlerts(await getAlerts()); } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    if (!partNumber.trim()) return;
    setSaving(true);
    try {
      await createAlert({
        partNumber: partNumber.trim().toUpperCase(),
        alertType,
        thresholdValue: threshold ? parseFloat(threshold) : undefined,
      });
      setShowModal(false);
      setPartNumber('');
      setThreshold('');
      setAlertType('price_below');
      load();
    } finally { setSaving(false); }
  };

  const desc = (a: AlertType) => {
    if (a.alertType === 'price_below') return `Price < $${a.thresholdValue?.toFixed(2)}`;
    if (a.alertType === 'in_stock') return 'Back in stock at any vendor';
    if (a.alertType === 'lead_time_above') return `Lead time > ${a.thresholdValue} days`;
    return a.alertType;
  };

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.newBtn} onPress={() => setShowModal(true)}>
        <Ionicons name="add-circle" size={20} color={theme.colors.white} />
        <Text style={s.newBtnText}>New Alert</Text>
      </TouchableOpacity>

      {loading
        ? <ActivityIndicator style={{ marginTop: 48 }} size="large" color={theme.colors.primary} />
        : alerts.length === 0
          ? (
            <View style={s.empty}>
              <Text style={{ fontSize: 64 }}>🔔</Text>
              <Text style={s.emptyTitle}>No alerts set</Text>
              <Text style={s.emptySub}>Get notified when prices drop or parts come in stock</Text>
            </View>
          )
          : (
            <FlatList
              data={alerts}
              keyExtractor={a => a.id}
              onRefresh={load}
              refreshing={loading}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => (
                <View style={[s.card, !item.isActive && { opacity: 0.5 }]}>
                  <View style={s.cardLeft}>
                    <Text style={s.partNo}>{item.partNumber}</Text>
                    <Text style={s.alertDesc}>{desc(item)}</Text>
                    {item.lastTriggered && (
                      <Text style={s.lastTrig}>
                        Last: {new Date(item.lastTriggered).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Switch
                      value={item.isActive}
                      onValueChange={() => toggleAlert(item.id).then(load)}
                      trackColor={{ false: theme.colors.border, true: theme.colors.primarySubtle }}
                      thumbColor={item.isActive ? theme.colors.primary : theme.colors.textMuted}
                    />
                    <TouchableOpacity
                      onPress={() => Alert.alert('Delete', 'Remove?', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Delete', style: 'destructive', onPress: () => deleteAlert(item.id).then(load) },
                      ])}
                      style={{ marginTop: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            />
          )
      }

      <Modal visible={showModal} animationType="slide" presentationStyle="formSheet">
        <View style={s.modal}>
          <Text style={s.modalTitle}>New Alert</Text>
          <Text style={s.label}>Part Number</Text>
          <TextInput
            style={s.input}
            placeholder="e.g. 6205-2RS"
            placeholderTextColor={theme.colors.textMuted}
            value={partNumber}
            onChangeText={setPartNumber}
            autoCapitalize="characters"
          />
          <Text style={s.label}>Alert Type</Text>
          {TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[s.typeRow, alertType === t.value && s.typeRowActive]}
              onPress={() => setAlertType(t.value)}
            >
              <Text style={{ fontSize: 20 }}>{t.icon}</Text>
              <Text style={[
                { flex: 1, color: theme.colors.textSecondary },
                alertType === t.value && { color: theme.colors.primary, fontWeight: '600' },
              ]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
          {alertType !== 'in_stock' && (
            <>
              <Text style={[s.label, { marginTop: 16 }]}>
                {alertType === 'price_below' ? 'Price Threshold ($)' : 'Days Threshold'}
              </Text>
              <TextInput
                style={s.input}
                placeholder={alertType === 'price_below' ? '0.00' : '14'}
                placeholderTextColor={theme.colors.textMuted}
                value={threshold}
                onChangeText={setThreshold}
                keyboardType="decimal-pad"
              />
            </>
          )}
          <TouchableOpacity
            style={[s.createBtn, saving && { opacity: 0.5 }]}
            onPress={handleCreate}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={theme.colors.white} />
              : <Text style={{ color: theme.colors.white, fontWeight: '700', fontSize: 16 }}>Create Alert</Text>}
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardLeft: { flex: 1, marginRight: 12 },
  partNo: { fontSize: 16, fontWeight: '700', color: theme.colors.textPrimary, marginBottom: 4 },
  alertDesc: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 4 },
  lastTrig: { fontSize: 11, color: theme.colors.textMuted },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 8, padding: 32 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.textPrimary },
  emptySub: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },

  // Modal
  modal: {
    padding: theme.spacing.xl,
    paddingTop: 40,
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    marginBottom: 20,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: 14,
    fontSize: 15,
    marginBottom: 16,
    backgroundColor: theme.colors.surfaceElevated,
    color: theme.colors.textPrimary,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    marginBottom: 8,
    gap: 12,
    backgroundColor: theme.colors.surfaceElevated,
  },
  typeRowActive: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySubtle },
  createBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 10,
  },
});
