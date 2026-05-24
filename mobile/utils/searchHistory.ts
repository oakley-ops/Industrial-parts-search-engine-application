import AsyncStorage from '@react-native-async-storage/async-storage';

const HISTORY_KEY = 'search_history';
const MAX_HISTORY = 8;

export async function getSearchHistory(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

export async function addToSearchHistory(query: string): Promise<void> {
  const trimmed = query.trim();
  if (!trimmed) return;
  const history = await getSearchHistory();
  const deduped = [trimmed, ...history.filter(q => q !== trimmed)];
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(deduped.slice(0, MAX_HISTORY)));
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify([]));
}
