import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Part {
  id: string;
  name: string;
  partNumber: string;
  description?: string;
}

interface Props {
  part: Part;
}

export function PartCard({ part }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.name}>{part.name}</Text>
      <Text style={styles.partNumber}>#{part.partNumber}</Text>
      {part.description && <Text style={styles.description}>{part.description}</Text>}
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
  partNumber: { fontSize: 13, color: '#666', marginTop: 2 },
  description: { fontSize: 13, color: '#444', marginTop: 4 },
});
