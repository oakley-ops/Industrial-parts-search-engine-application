import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Vendor {
  id: string;
  name: string;
  contactEmail: string;
  phone?: string;
}

interface Props {
  vendor: Vendor;
}

export function VendorCard({ vendor }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{vendor.name}</Text>
      <Text style={styles.detail}>{vendor.contactEmail}</Text>
      {vendor.phone && <Text style={styles.detail}>{vendor.phone}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13, color: '#666', marginTop: 2 },
});
