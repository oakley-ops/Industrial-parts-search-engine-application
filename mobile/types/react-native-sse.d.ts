declare module 'react-native-sse' {
  export default class EventSource {
    constructor(url: string, options?: { headers?: Record<string, string> });
    addEventListener(type: string, listener: (event: { data: string }) => void): void;
    close(): void;
  }
}
