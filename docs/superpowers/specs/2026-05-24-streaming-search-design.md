# Streaming Search + Stale-While-Revalidate Design

**Date:** 2026-05-24
**Status:** Approved

## Goal

Eliminate the blank loading screen during search and scale cleanly as new vendors are added. Two complementary strategies: SSE streaming (results appear as each vendor responds) and stale-while-revalidate caching (repeat searches return instantly from cache while a background refresh keeps data fresh).

---

## Architecture Overview

```
Mobile App                     Backend                        Vendors
──────────────────────────────────────────────────────────────────────
[User searches "relay"]
     │
     └─── SSE connection ──────→ GET /vendors/search/stream?q=relay
                                         │
                                    Check Redis per-vendor cache
                                         │
                              ┌──────────┴──────────┐
                         Cache hit?              Cache miss?
                        (serve immediately)    (call vendor API)
                              │                     │
                    [Fresh] → emit now         DigiKey API ──────────→ DigiKey
                    [Stale] → emit now +       OEMSecrets API ─────→ OEMSecrets
                              background        Scrapers ───────────→ Grainger...
                              refresh           │
                                                └─ as each finishes:
                                                   emit SSE event
                                                   write to Redis
     ↑ results appear in UI as each vendor finishes
     ↑ "done" event closes the stream
```

**Key architectural change:** Replace the single `search:all:${query}` Redis key with per-vendor keys (`search:digikey:${query}`, `search:oemsecrets:${query}`, etc.). This lets each vendor's cache be fresh, stale, or empty independently — enabling both SSE and SWR to work correctly.

The existing REST search endpoint (`GET /vendors/search`) is kept in place and unchanged.

---

## Backend

### New endpoint

`GET /vendors/search/stream?q=<query>` — protected by `JwtAuthGuard`, same as the existing search route.

**`vendors.controller.ts`**

```typescript
@Sse('search/stream')
@UseGuards(JwtAuthGuard)
searchStream(@Query('q') q: string): Observable<MessageEvent> {
  return this.vendorsService.searchStream(q);
}
```

### `searchStream` method (`vendors.service.ts`)

```typescript
searchStream(query: string): Observable<MessageEvent> {
  if (!query?.trim()) return EMPTY;

  return new Observable(subscriber => {
    const vendors = [
      { slug: 'digikey',    fetch: () => this.digikey.search(query) },
      { slug: 'oemsecrets', fetch: () => this.oemSecrets.search(query) },
      { slug: 'grainger',   fetch: () => this.grainger.search(query) },
      // new vendors: add one entry here, nothing else changes
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

### SWR cache logic

TTL constants:
- `FRESH_TTL = 300` seconds (5 min) — serve from cache, skip refresh
- `STALE_TTL = 900` seconds (15 min) — serve from cache, kick off background refresh; beyond this treat as miss

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
      const { results, cachedAt } = JSON.parse(raw);
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

private refreshInBackground(key: string, fetchFn: () => Promise<SearchResult[]>) {
  fetchFn()
    .then(results =>
      this.redis.setex(key, STALE_TTL, JSON.stringify({ results, cachedAt: Date.now() }))
    )
    .catch(() => {});
}
```

Cache key format: `search:<vendorSlug>:<normalized_query>`
Normalization: lowercase, non-word characters replaced with `_`.

---

## Mobile

### New dependency

```
react-native-sse
```

### `mobile/services/api.ts` — new function

Follows the existing pattern: reads the token from `SecureStore` internally via the already-exported `getToken()`, so callers don't manage tokens themselves.

```typescript
import EventSource from 'react-native-sse';

export function openSearchStream(
  query: string,
  onVendorResults: (vendor: string, results: SearchResult[]) => void,
  onDone: () => void,
  onError: () => void,
): () => void {
  let es: EventSource | null = null;

  getToken().then(token => {
    es = new EventSource(
      `${API_URL}/vendors/search/stream?q=${encodeURIComponent(query)}`,
      { headers: { Authorization: `Bearer ${token ?? ''}` } },
    );

    es.addEventListener('message', (e) => {
      const payload = JSON.parse(e.data);
      if (payload.done) { onDone(); es?.close(); }
      else onVendorResults(payload.vendor, payload.results);
    });

    es.addEventListener('error', () => { onError(); es?.close(); });
  });

  es.addEventListener('message', (e) => {
    const payload = JSON.parse(e.data);
    if (payload.done) {
      onDone();
      es.close();
    } else {
      onVendorResults(payload.vendor, payload.results);
    }
  });

  es.addEventListener('error', () => { onError(); es.close(); });

  return () => es?.close();
}
```

### `mobile/app/(tabs)/index.tsx` — replace axios search call

```typescript
const cleanupRef = useRef<(() => void) | null>(null);

function triggerSearch(q: string) {
  cleanupRef.current?.();        // cancel any in-flight stream

  setResults([]);
  setSearching(true);
  setSearched(true);

  cleanupRef.current = openSearchStream(
    q,
    (vendor, incoming) => {
      setResults(prev => [...prev, ...incoming]);  // append per-vendor batch
    },
    () => setSearching(false),                     // done
    () => setSearching(false),                     // error — show what arrived
  );
}

useEffect(() => () => cleanupRef.current?.(), []); // cleanup on unmount
```

### UI changes

- Spinner stays visible until the `done` event, not just until first results appear
- A **"Loading more…"** line below the last result card while `searching` is true
- Existing sort/filter logic (in-stock-first, price sort, vendor chips) runs over `results` as it grows — no changes needed there

---

## Error Handling

| Scenario | Behavior |
|---|---|
| One vendor API fails | That vendor emits `results: []`, `remaining` decrements — other vendors unaffected, `done` still fires |
| All vendors fail | `done` fires with empty list — mobile shows existing "No results found" empty state |
| Redis is down | `redis.get` throws → catch, fall through to live fetch |
| SSE connection drops mid-stream | `onError` fires → spinner stops, user sees results that arrived |
| User navigates away before `done` | `useEffect` cleanup calls `es.close()` — stream torn down |
| Background refresh fails | Error swallowed — stale data stays in Redis until beyond `STALE_TTL` |
| Empty query | `if (!query?.trim()) return EMPTY` — stream closes immediately |
| Vendor takes > 10s | Existing `timeout: 10000` on axios calls handles this — vendor emits `results: []` at timeout |

---

## Testing

### Backend unit tests — `searchVendorSwr`

- Fresh cache hit → returns cached data, `fetchFn` never called
- Stale cache hit → returns cached data, background refresh called once
- Beyond stale TTL → fetches live, writes new cache entry with current `cachedAt`
- Redis throws on `get` → falls through to live fetch without rethrowing

### Backend integration — SSE endpoint

- Stream emits one event per vendor, each with correct `vendor` slug and `results` array
- `{ done: true }` event fires last, after all vendor events
- Stream completes even when one vendor throws

### Mobile unit tests

- `openSearchStream` calls `onVendorResults` once per vendor event
- `onDone` called on the `done` event, `es.close()` called immediately after
- Cleanup function closes the EventSource; no further callbacks fire after cleanup
- Calling `triggerSearch` twice cancels the first stream before opening the second

---

## What This Is Not

- No change to the existing `GET /vendors/search` REST endpoint
- No change to the price-fetching flow (`getPricesForPart`, `getPriceFromVendor`)
- No per-user cache — cache is shared across all users for the same query
- No cache invalidation on demand beyond the existing `clearCache` endpoint
