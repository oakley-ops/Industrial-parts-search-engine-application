import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSearchHistory, addToSearchHistory, clearSearchHistory } from './searchHistory';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

const mockGet = AsyncStorage.getItem as jest.Mock;
const mockSet = AsyncStorage.setItem as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('getSearchHistory', () => {
  it('returns empty array when nothing stored', async () => {
    mockGet.mockResolvedValue(null);
    expect(await getSearchHistory()).toEqual([]);
  });

  it('returns parsed array when stored', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['motor', 'sensor']));
    expect(await getSearchHistory()).toEqual(['motor', 'sensor']);
  });

  it('returns empty array on parse error', async () => {
    mockGet.mockResolvedValue('not json');
    expect(await getSearchHistory()).toEqual([]);
  });
});

describe('addToSearchHistory', () => {
  it('prepends new query to empty history', async () => {
    mockGet.mockResolvedValue(null);
    await addToSearchHistory('motor');
    expect(mockSet).toHaveBeenCalledWith(
      'search_history',
      JSON.stringify(['motor']),
    );
  });

  it('prepends new query to existing history', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['sensor', 'pump']));
    await addToSearchHistory('motor');
    expect(mockSet).toHaveBeenCalledWith(
      'search_history',
      JSON.stringify(['motor', 'sensor', 'pump']),
    );
  });

  it('moves duplicate to front instead of adding again', async () => {
    mockGet.mockResolvedValue(JSON.stringify(['sensor', 'motor', 'pump']));
    await addToSearchHistory('motor');
    expect(mockSet).toHaveBeenCalledWith(
      'search_history',
      JSON.stringify(['motor', 'sensor', 'pump']),
    );
  });

  it('trims list to 8 items', async () => {
    const existing = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    mockGet.mockResolvedValue(JSON.stringify(existing));
    await addToSearchHistory('new');
    const saved = JSON.parse(
      (mockSet.mock.calls[0][1] as string),
    ) as string[];
    expect(saved.length).toBe(8);
    expect(saved[0]).toBe('new');
  });
});

describe('clearSearchHistory', () => {
  it('writes an empty array', async () => {
    await clearSearchHistory();
    expect(mockSet).toHaveBeenCalledWith('search_history', JSON.stringify([]));
  });
});
