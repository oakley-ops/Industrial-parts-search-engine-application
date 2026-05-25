import EventSource from 'react-native-sse';
import * as SecureStore from 'expo-secure-store';
import { SearchResult } from '../types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export function openSearchStream(
  query: string,
  onVendorResults: (vendor: string, results: SearchResult[]) => void,
  onDone: () => void,
  onError: () => void,
): () => void {
  let es: InstanceType<typeof EventSource> | null = null;
  let closed = false;

  SecureStore.getItemAsync('access_token')
    .then(token => {
      if (closed) return;
      es = new EventSource(
        `${API_URL}/vendors/search/stream?q=${encodeURIComponent(query)}`,
        { headers: { Authorization: `Bearer ${token ?? ''}` } },
      );

      es.addEventListener('message', (e: { data: string }) => {
        let payload: { done?: boolean; vendor?: string; results?: SearchResult[] };
        try {
          payload = JSON.parse(e.data);
        } catch {
          onError();
          es?.close();
          return;
        }
        if (payload.done) {
          onDone();
          es?.close();
        } else if (payload.vendor && payload.results) {
          onVendorResults(payload.vendor, payload.results);
        }
      });

      es.addEventListener('error', () => {
        onError();
        es?.close();
      });
    })
    .catch(() => { if (!closed) onError(); });

  return () => { closed = true; es?.close(); };
}
