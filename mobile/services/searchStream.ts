import * as SecureStore from 'expo-secure-store';
import { SearchResult } from '../types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

interface IEventSource {
  addEventListener(type: string, listener: (event: { data: string }) => void): void;
  close(): void;
}

export function openSearchStream(
  query: string,
  onVendorResults: (vendor: string, results: SearchResult[]) => void,
  onDone: () => void,
  onError: () => void,
): () => void {
  // Lazy require so Jest can swap in the mock before construction
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const EventSource = (require('react-native-sse') as { default: new (url: string, options?: { headers?: Record<string, string> }) => IEventSource }).default;
  let es: IEventSource | null = null;

  SecureStore.getItemAsync('access_token').then(token => {
    es = new EventSource(
      `${API_URL}/vendors/search/stream?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${token ?? ''}` } },
    );

    es.addEventListener('message', (e: { data: string }) => {
      const payload = JSON.parse(e.data) as { done?: boolean; vendor?: string; results?: SearchResult[] };
      if (payload.done) {
        onDone();
        es?.close();
      } else {
        onVendorResults(payload.vendor!, payload.results!);
      }
    });

    es.addEventListener('error', () => {
      onError();
      es?.close();
    });
  });

  return () => es?.close();
}
