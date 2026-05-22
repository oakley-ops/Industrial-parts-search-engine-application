import React, { useState } from 'react';
import { View, TextInput, FlatList, StyleSheet } from 'react-native';
import { PartCard } from '../components/PartCard';
import { partsService } from '../services/partsService';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (text.length > 1) {
      const data = await partsService.search(text);
      setResults(data);
    } else {
      setResults([]);
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={handleSearch}
        placeholder="Search parts..."
      />
      <FlatList
        data={results}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }) => <PartCard part={item} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
});
