# Streaming Search + Stale-While-Revalidate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wait-for-all REST search with per-vendor SSE streaming and stale-while-revalidate caching so users see results as each vendor responds, and repeat searches return instantly.

**Architecture:** A new `GET /vendors/search/stream` SSE endpoint fans out to all vendors in parallel and emits each vendor's results as an SSE event the moment that vendor responds. Per-vendor Redis cache keys (`search:<slug>:<query>`) allow each vendor's cache to be fresh (≤5 min, serve immediately), stale (5–15 min, serve + background refresh), or expired (>15 min, fetch live). The mobile app opens an EventSource connection on search, appends results to state as each event arrives, and shows a "Loading more…" footer until the `done` event fires.

**Tech Stack:** NestJS SSE (`@Sse`, `Observable` from `rxjs`), Redis (ioredis — already wired), `react-native-sse` (new mobile dep), TypeScript

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Create | `backend/src/vendors/vendors.service.spec.ts` | Unit tests for `searchVendorSwr` and `searchStream` |
| Modify | `backend/src/vendors/vendors.service.ts` | Add `FRESH_TTL`/`STALE_TTL` constants, `searchVendorSwr`, `refreshInBackground`, `searchStream` |
| Modify | `backend/src/vendors/vendors.controller.ts` | Add `@Sse('search/stream')` route |
| Create | `mobile/services/searchStream.ts` | Isolated `openSearchStream` function (focused for testability) |
| Create | `mobile/services/searchStream.test.ts` | Unit tests for `openSearchStream` |
| Modify | `mobile/services/api.ts` | Re-export `openSearchStream` from `searchStream.ts` |
| Modify | `mobile/app/(tabs)/index.tsx` | Wire SSE, update loading UI to show progressive results |

---

### Task 1: Backend — SWR cache logic (tests + implementation)

**Files:**
- Create: `backend/src/vendors/vendors.service.spec.ts`
- Modify: `backend/src/vendors/vendors.service.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/vendors/vendors.service.spec.ts` with this full content:

```typescript
import { VendorsService } from './vendors.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

const NOW = 1_716_000_000_000;

function makeRedis(overrides: Partial<Pick<RedisService, 'get' | 'setex'>> = {}) {
  return {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue(undefined),
    del: jest.fn(),
    keys: jest.fn(),
    ...overrides,
  } as unknown as RedisService;
}

function makeService(redis: RedisService) {
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const stub: any = {
    search: jest.fn().mockResolvedValue([]),
    getPrices: jest.fn().mockResolvedValue([]),
    getPrice: jest.fn(),
    vendorSlug: 's',
    vendorName: 'S',
  };
  return new VendorsService(redis, config, stub, stub, stub, stub, stub);
}

describe('VendorsService.searchVendorSwr', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('fresh hit: returns cached data without calling fetchFn', async () => {
    const cachedData = [{ name: 'Relay X' }];
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({ results: cachedData, cachedAt: NOW - 60_000 }),
      ),
    });
    const service = makeService(redis);
    const fetchFn = jest.fn();

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(cachedData);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stale hit: returns cached data and triggers refreshInBackground', async () => {
    const cachedData = [{ name: 'Relay Y' }];
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({ results: cachedData, cachedAt: NOW - 400_000 }), // 400s old, stale
      ),
    });
    const service = makeService(redis);
    jest.spyOn(service as any, 'refreshInBackground').mockImplementation(() => {});
    const fetchFn = jest.fn();

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(cachedData);
    expect((service as any).refreshInBackground).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('cache miss: fetches live and writes cache with current timestamp', async () => {
    const fresh = [{ name: 'Relay Z' }];
    const redis = makeRedis();
    const service = makeService(redis);
    const fetchFn = jest.fn().mockResolvedValue(fresh);

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(fresh);
    expect(redis.setex).toHaveBeenCalledWith(
      'search:digikey:relay',
      900,
      JSON.stringify({ results: fresh, cachedAt: NOW }),
    );
  });

  it('beyond stale TTL: treats as miss and fetches live', async () => {
    const fresh = [{ name: 'Fresh' }];
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({ results: [{ name: 'Old' }], cachedAt: NOW - 1_000_000 }), // 1000s, expired
      ),
    });
    const service = makeService(redis);
    const fetchFn = jest.fn().mockResolvedValue(fresh);

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(fresh);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('Redis throws on get: falls through to live fetch without throwing', async () => {
    const fresh = [{ name: 'Live Part' }];
    const redis = makeRedis({ get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    const service = makeService(redis);
    const fetchFn = jest.fn().mockResolvedValue(fresh);

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(fresh);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npm test -- --testPathPattern=vendors.service.spec
```

Expected: 5 failures — `TypeError: (service as any).searchVendorSwr is not a function`

- [ ] **Step 3: Add constants and SWR methods to `vendors.service.ts`**

At the top of `backend/src/vendors/vendors.service.ts`, change the `@nestjs/common` import line and add the rxjs import:

```typescript
import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, EMPTY } from 'rxjs';
```

Add these two constants immediately before the `@Injectable()` decorator (after all imports):

```typescript
const FRESH_TTL = 300;  // seconds — serve from cache, no refresh
const STALE_TTL = 900;  // seconds — serve from cache + background refresh; beyond this is a miss
```

Add these two private methods inside the class, immediately before the existing `private async cachedPrice` method:

```typescript
private async searchVendorSwr(
  slug: string,
  query: string,
  fetchFn: () => Promise<SearchResult[]>,
): Promise<SearchResult[]> {
  const key = `search:${slug}:${query.toLowerCase().replace(/\W+/g, '_')}`;
  try {
    const raw = await this.redis.get(key);
    if (raw) {
      const { results, cachedAt } = JSON.parse(raw) as { results: SearchResult[]; cachedAt: number };
      const ageSeconds = (Date.now() - cachedAt) / 1000;
      if (ageSeconds < FRESH_TTL) return results;
      if (ageSeconds < STALE_TTL) {
        this.refreshInBackground(key, fetchFn);
        return results;
      }
    }
  } catch {
    // Redis down — fall through to live fetch
  }
  const results = await fetchFn();
  await this.redis.setex(key, STALE_TTL, JSON.stringify({ results, cachedAt: Date.now() }));
  return results;
}

private refreshInBackground(key: string, fetchFn: () => Promise<SearchResult[]>): void {
  fetchFn()
    .then(results =>
      this.redis.setex(key, STALE_TTL, JSON.stringify({ results, cachedAt: Date.now() }))
    )
    .catch(() => {});
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npm test -- --testPathPattern=vendors.service.spec
```

Expected: 5 passing

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/vendors/vendors.service.spec.ts backend/src/vendors/vendors.service.ts && git commit -m "feat: add per-vendor SWR cache with fresh/stale/miss TTL logic

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Backend — SSE stream endpoint (tests + implementation)

**Files:**
- Modify: `backend/src/vendors/vendors.service.spec.ts`
- Modify: `backend/src/vendors/vendors.service.ts`
- Modify: `backend/src/vendors/vendors.controller.ts`

- [ ] **Step 1: Add SSE tests to `vendors.service.spec.ts`**

Append this entire block to the bottom of `backend/src/vendors/vendors.service.spec.ts` (after the closing `});` of the existing describe block):

```typescript
describe('VendorsService.searchStream', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  function collectStream(service: VendorsService, query: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const events: any[] = [];
      service.searchStream(query).subscribe({
        next: (e) => events.push(e.data),
        complete: () => resolve(events),
        error: reject,
      });
    });
  }

  it('emits a vendor event per vendor and a done event last', async () => {
    const service = makeService(makeRedis());
    const events = await collectStream(service, 'relay');

    expect(events.at(-1)).toEqual({ done: true });
    const vendorEvents = events.slice(0, -1);
    expect(vendorEvents.length).toBeGreaterThan(0);
    vendorEvents.forEach(e => {
      expect(e).toHaveProperty('vendor');
      expect(Array.isArray(e.results)).toBe(true);
    });
  }, 10_000);

  it('completes immediately for empty query without emitting any events', async () => {
    const service = makeService(makeRedis());
    const events = await collectStream(service, '');
    expect(events).toHaveLength(0);
  });

  it('emits results:[] for a vendor that throws and still emits done', async () => {
    const service = makeService(makeRedis());
    jest.spyOn((service as any).digikey, 'search').mockRejectedValue(new Error('DK API down'));

    const events = await collectStream(service, 'relay');

    expect(events.at(-1)).toEqual({ done: true });
    const dkEvent = events.find(e => e.vendor === 'digikey');
    expect(dkEvent?.results).toEqual([]);
  }, 10_000);
});
```

- [ ] **Step 2: Run to confirm new tests fail**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npm test -- --testPathPattern=vendors.service.spec
```

Expected: first 5 pass, the 3 new ones fail with `TypeError: service.searchStream is not a function`

- [ ] **Step 3: Add `searchStream` method to `vendors.service.ts`**

Add this method to the class immediately after the `searchAll` method:

```typescript
searchStream(query: string): Observable<MessageEvent> {
  if (!query?.trim()) return EMPTY;

  return new Observable<MessageEvent>(subscriber => {
    const vendors: { slug: string; fetch: () => Promise<SearchResult[]> }[] = [
      { slug: 'digikey',    fetch: () => this.digikey.search(query) },
      { slug: 'oemsecrets', fetch: () => this.oemSecrets.search(query) },
      { slug: 'grainger',   fetch: () => this.grainger.search(query) },
      { slug: 'motion',     fetch: () => this.motion.search(query) },
      { slug: 'mcmaster',   fetch: () => this.mcmaster.search(query) },
    ];

    let remaining = vendors.length;

    for (const vendor of vendors) {
      this.searchVendorSwr(vendor.slug, query, vendor.fetch)
        .then(results => {
          subscriber.next({ data: { vendor: vendor.slug, results } });
        })
        .catch(() => {
          subscriber.next({ data: { vendor: vendor.slug, results: [] } });
        })
        .finally(() => {
          if (--remaining === 0) {
            subscriber.next({ data: { done: true } });
            subscriber.complete();
          }
        });
    }
  });
}
```

- [ ] **Step 4: Add the SSE route to `vendors.controller.ts`**

Change the `@nestjs/common` import line to add `Sse` and `MessageEvent`, and add the `rxjs` import:

```typescript
import { Controller, Get, Query, Param, UseGuards, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Observable } from 'rxjs';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorsService } from './vendors.service';
```

Add this route immediately after the existing `search` route (after its closing `}`):

```typescript
@Throttle({ default: { ttl: 30000, limit: 5 } })
@Sse('search/stream')
searchStream(@Query('q') q: string): Observable<MessageEvent> {
  return this.svc.searchStream(q ?? '');
}
```

- [ ] **Step 5: Run all backend tests**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npm test
```

Expected: all tests pass (including the pre-existing scraper and other specs)

- [ ] **Step 6: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/vendors/vendors.service.spec.ts backend/src/vendors/vendors.service.ts backend/src/vendors/vendors.controller.ts && git commit -m "feat: add SSE streaming search endpoint with per-vendor fanout

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Mobile — `openSearchStream` (tests + implementation)

**Files:**
- Create: `mobile/services/searchStream.ts`
- Create: `mobile/services/searchStream.test.ts`
- Modify: `mobile/services/api.ts`

- [ ] **Step 1: Install `react-native-sse`**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npm install react-native-sse
```

Expected: package added to `node_modules` and `package.json`

- [ ] **Step 2: Write the failing tests**

Create `mobile/services/searchStream.test.ts` with this full content:

```typescript
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
```

- [ ] **Step 3: Run to confirm they fail**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npm test -- --testPathPattern=searchStream.test
```

Expected: 5 failures — `Cannot find module './searchStream'`

- [ ] **Step 4: Create `mobile/services/searchStream.ts`**

```typescript
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
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npm test -- --testPathPattern=searchStream.test
```

Expected: 5 passing. If the URL test fails due to `expect.stringContaining` matching, simplify it:
```typescript
expect(MockEventSource.mock.calls[0][0]).toContain('search/stream?q=10hp%20motor');
expect(MockEventSource.mock.calls[0][1].headers.Authorization).toBe('Bearer test-token');
```

- [ ] **Step 6: Re-export `openSearchStream` from `mobile/services/api.ts`**

Add this line at the very end of `mobile/services/api.ts` (after the `export default api;` line):

```typescript
export { openSearchStream } from './searchStream';
```

- [ ] **Step 7: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add mobile/services/searchStream.ts mobile/services/searchStream.test.ts mobile/services/api.ts mobile/package.json mobile/package-lock.json && git commit -m "feat: add openSearchStream with react-native-sse

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Mobile — wire SSE into the search screen

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`

No new test file — the behavior is verified by running the app and confirming results appear progressively.

- [ ] **Step 1: Update imports at the top of `index.tsx`**

Change this line:
```typescript
import { useState, useEffect } from 'react';
```
To:
```typescript
import { useState, useEffect, useRef } from 'react';
```

Change this line:
```typescript
import { searchParts } from '../../services/api';
```
To:
```typescript
import { openSearchStream } from '../../services/api';
```

- [ ] **Step 2: Add `cleanupRef` after the `showFilters` state**

Add this line immediately after `const [showFilters, setShowFilters] = useState(false);`:

```typescript
const cleanupRef = useRef<(() => void) | null>(null);
```

- [ ] **Step 3: Replace `triggerSearch` with the SSE version**

Replace the entire `triggerSearch` function (lines 44–59 in the original) with:

```typescript
const triggerSearch = (q: string) => {
  if (!q.trim()) return;
  cleanupRef.current?.();
  setResults([]);
  setLoading(true);
  setSearched(true);
  setInStockFirst(true);
  addToSearchHistory(q.trim()).then(() => getSearchHistory().then(setSearchHistory));

  cleanupRef.current = openSearchStream(
    q.trim(),
    (_vendor, incoming) => {
      setResults(prev => [...prev, ...incoming]);
    },
    () => setLoading(false),
    () => setLoading(false),
  );
};
```

- [ ] **Step 4: Add stream cleanup on unmount**

Add this `useEffect` immediately after the existing `useEffect(() => { getSearchHistory()... }, []);` block:

```typescript
useEffect(() => () => { cleanupRef.current?.(); }, []);
```

- [ ] **Step 5: Update the three render conditionals**

**Change 1** — full-screen loading spinner: only show when no results have arrived yet.

Find this block:
```typescript
{loading && (
  <View style={s.center}>
    <ActivityIndicator size="large" color={THEME.colors.accent} />
    <Text style={s.loadingText}>Searching all vendors...</Text>
  </View>
)}
```
Replace with:
```typescript
{loading && results.length === 0 && (
  <View style={s.center}>
    <ActivityIndicator size="large" color={THEME.colors.accent} />
    <Text style={s.loadingText}>Searching all vendors...</Text>
  </View>
)}
```

**Change 2** — empty state: add `!loading` guard so it only shows after the stream finishes.

Find:
```typescript
{!loading && searched && displayedResults.length === 0 && (
```
This line is already correct — no change needed.

**Change 3** — FlatList: remove the `!loading &&` prefix and add a footer spinner.

Find:
```typescript
{!loading && displayedResults.length > 0 && (
  <FlatList
    data={displayedResults}
    keyExtractor={(item, i) => `${item.vendorSlug}-${i}`}
    renderItem={renderItem}
    contentContainerStyle={{ padding: 16 }}
    showsVerticalScrollIndicator={false}
  />
)}
```
Replace with:
```typescript
{displayedResults.length > 0 && (
  <FlatList
    data={displayedResults}
    keyExtractor={(item, i) => `${item.vendorSlug}-${i}`}
    renderItem={renderItem}
    contentContainerStyle={{ padding: 16 }}
    showsVerticalScrollIndicator={false}
    ListFooterComponent={
      loading ? (
        <View style={{ alignItems: 'center', paddingVertical: 16 }}>
          <ActivityIndicator size="small" color={THEME.colors.accent} />
          <Text style={[s.loadingText, { marginTop: 6 }]}>Loading more...</Text>
        </View>
      ) : null
    }
  />
)}
```

- [ ] **Step 6: Verify the app builds without TypeScript errors**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npx tsc --noEmit
```

Expected: no errors. If you see `Cannot find module 'react-native-sse'`, add a type declaration — create `mobile/types/react-native-sse.d.ts`:
```typescript
declare module 'react-native-sse' {
  export default class EventSource {
    constructor(url: string, options?: { headers?: Record<string, string> });
    addEventListener(type: string, listener: (event: { data: string }) => void): void;
    close(): void;
  }
}
```

- [ ] **Step 7: Run all mobile tests**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npm test
```

Expected: all tests pass (geo, quoteHtml, searchHistory, searchStream)

- [ ] **Step 8: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add mobile/app/'(tabs)'/index.tsx && git commit -m "feat: stream search results progressively via SSE with loading footer

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
