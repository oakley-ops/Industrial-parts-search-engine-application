// Controllable mock EventSource — must be declared before imports
let capturedListeners: Record<string, (e: { data: string }) => void> = {};
const mockClose = jest.fn();
const MockEventSource = jest.fn().mockImplementation(() => ({
  addEventListener: (type: string, cb: (e: { data: string }) => void) => {
    capturedListeners[type] = cb;
  },
  close: mockClose,
}));

jest.mock('react-native-sse', () => ({ default: MockEventSource }));
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('test-token'),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

// Flush microtask queue so the getItemAsync().then(...) inside openSearchStream resolves
const flushPromises = () => new Promise<void>(resolve => setImmediate(resolve));

import { openSearchStream } from './searchStream';

beforeEach(() => {
  capturedListeners = {};
  mockClose.mockClear();
  MockEventSource.mockClear();
});

describe('openSearchStream', () => {
  it('calls onVendorResults when a vendor message event fires', async () => {
    const onVendorResults = jest.fn();
    openSearchStream('relay', onVendorResults, jest.fn(), jest.fn());
    await flushPromises();

    capturedListeners['message']({
      data: JSON.stringify({ vendor: 'digikey', results: [{ name: 'Relay A' }] }),
    });

    expect(onVendorResults).toHaveBeenCalledWith('digikey', [{ name: 'Relay A' }]);
  });

  it('calls onDone and closes EventSource when done:true fires', async () => {
    const onDone = jest.fn();
    openSearchStream('relay', jest.fn(), onDone, jest.fn());
    await flushPromises();

    capturedListeners['message']({ data: JSON.stringify({ done: true }) });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('calls onError and closes EventSource on error event', async () => {
    const onError = jest.fn();
    openSearchStream('relay', jest.fn(), jest.fn(), onError);
    await flushPromises();

    capturedListeners['error']({ data: '' });

    expect(onError).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('cleanup function closes the EventSource', async () => {
    const cleanup = openSearchStream('relay', jest.fn(), jest.fn(), jest.fn());
    await flushPromises();

    cleanup();

    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it('opens EventSource with correct URL encoding and Bearer token', async () => {
    openSearchStream('10hp motor', jest.fn(), jest.fn(), jest.fn());
    await flushPromises();

    const [url, options] = MockEventSource.mock.calls[0];
    expect(url).toContain('/vendors/search/stream?q=10hp%20motor');
    expect(options.headers.Authorization).toBe('Bearer test-token');
  });
});
