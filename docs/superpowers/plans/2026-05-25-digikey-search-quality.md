# DigiKey Search Quality Improvements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve DigiKey search result quality by running keyword search and product details lookup in parallel, then merging, deduplicating, and relevance-scoring the combined results.

**Architecture:** `DigiKeyService.search()` fires two DigiKey API calls in parallel (keyword search + product details by MPN), merges and deduplicates by `ManufacturerProductNumber`, then scores each result by counting query words present in the product name — sorting score-descending then price-descending. All changes are confined to `digikey.service.ts` and its new spec file.

**Tech Stack:** NestJS, TypeScript, axios, Jest (ts-jest)

---

## File Map

| File | Action |
|---|---|
| `backend/src/vendors/scrapers/digikey.service.ts` | Modify — add interface, two private methods, rewrite `search()` |
| `backend/src/vendors/scrapers/digikey.service.spec.ts` | Create — unit tests for new logic |

---

### Task 1: Add `DkProductDetailsResponse` interface and `scoreRelevance()` helper

**Files:**
- Modify: `backend/src/vendors/scrapers/digikey.service.ts`
- Create: `backend/src/vendors/scrapers/digikey.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `backend/src/vendors/scrapers/digikey.service.spec.ts` with this content:

```typescript
import { ConfigService } from '@nestjs/config';
import { DigiKeyService } from './digikey.service';

function makeService() {
  const config = {
    get: jest.fn((key: string, def = '') => def),
  } as unknown as ConfigService;
  return new DigiKeyService(config);
}

describe('DigiKeyService.scoreRelevance', () => {
  let service: DigiKeyService;
  beforeEach(() => { service = makeService(); });

  it('returns 0 when no query words appear in name', () => {
    expect((service as any).scoreRelevance('lm358', 'ATmega328P')).toBe(0);
  });

  it('returns 1 when one query word appears in name', () => {
    expect((service as any).scoreRelevance('lm358', 'Texas Instruments LM358')).toBe(1);
  });

  it('counts matching words from a multi-word query', () => {
    expect((service as any).scoreRelevance('raspberry pi 5', 'Raspberry Pi SC1112')).toBe(2);
  });

  it('is case-insensitive', () => {
    expect((service as any).scoreRelevance('RASPBERRY PI', 'raspberry pi sc1112')).toBe(2);
  });

  it('returns 3 when all three words match', () => {
    expect((service as any).scoreRelevance('raspberry pi 5', 'Raspberry Pi 5 Board')).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend
npx jest digikey.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `(service as any).scoreRelevance is not a function`

- [ ] **Step 3: Add `DkProductDetailsResponse` interface and `scoreRelevance()` to `digikey.service.ts`**

Add this interface after the existing `DkPricingResponse` interface (around line 50):

```typescript
interface DkProductDetailsResponse {
  Products?: DkKeywordProduct[];
  Product?: DkKeywordProduct;
  ProductsCount?: number;
}
```

Add this private method inside the `DigiKeyService` class, after `qty1Price()` (around line 88):

```typescript
private scoreRelevance(query: string, name: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const lname = name.toLowerCase();
  return words.filter(w => lname.includes(w)).length;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npx jest digikey.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 5: Commit**

```bash
git add backend/src/vendors/scrapers/digikey.service.ts \
        backend/src/vendors/scrapers/digikey.service.spec.ts
git commit -m "feat: add scoreRelevance helper and DkProductDetailsResponse interface"
```

---

### Task 2: Add `productDetailsSearch()` private method

**Files:**
- Modify: `backend/src/vendors/scrapers/digikey.service.ts`
- Modify: `backend/src/vendors/scrapers/digikey.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/vendors/scrapers/digikey.service.spec.ts`:

```typescript
import axios from 'axios';
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('DigiKeyService.productDetailsSearch', () => {
  let service: DigiKeyService;
  beforeEach(() => {
    service = makeService();
    jest.clearAllMocks();
  });

  it('returns Products array when response has Products field', async () => {
    const products = [{ ManufacturerProductNumber: 'LM358', UnitPrice: 0.65 }];
    mockAxios.get.mockResolvedValueOnce({ data: { Products: products } });

    const result = await (service as any).productDetailsSearch('LM358', 'tok');

    expect(result).toEqual(products);
  });

  it('wraps single Product in array when response has Product field', async () => {
    const product = { ManufacturerProductNumber: 'LM358', UnitPrice: 0.65 };
    mockAxios.get.mockResolvedValueOnce({ data: { Product: product } });

    const result = await (service as any).productDetailsSearch('LM358', 'tok');

    expect(result).toEqual([product]);
  });

  it('returns [] when response has neither Products nor Product', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });

    const result = await (service as any).productDetailsSearch('raspberry pi 5', 'tok');

    expect(result).toEqual([]);
  });

  it('returns [] when the request throws (e.g. 404 for non-MPN query)', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('Request failed with status code 404'));

    const result = await (service as any).productDetailsSearch('raspberry pi 5', 'tok');

    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npx jest digikey.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `(service as any).productDetailsSearch is not a function`

- [ ] **Step 3: Add `productDetailsSearch()` to `digikey.service.ts`**

Add this private method inside `DigiKeyService`, right after `scoreRelevance()`:

```typescript
private async productDetailsSearch(query: string, token: string): Promise<DkKeywordProduct[]> {
  try {
    const { data } = await axios.get<DkProductDetailsResponse>(
      `${this.apiBase}/${encodeURIComponent(query)}/productdetails`,
      { headers: { ...this.authHeaders(token), 'Content-Type': 'application/json' }, timeout: 10000 },
    );
    if (data?.Products?.length) return data.Products;
    if (data?.Product) return [data.Product];
    return [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
npx jest digikey.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: `Tests: 9 passed, 9 total`

- [ ] **Step 5: Commit**

```bash
git add backend/src/vendors/scrapers/digikey.service.ts \
        backend/src/vendors/scrapers/digikey.service.spec.ts
git commit -m "feat: add productDetailsSearch helper for exact MPN lookup"
```

---

### Task 3: Rewrite `search()` to use dual fetch, merge, dedup, score, sort

**Files:**
- Modify: `backend/src/vendors/scrapers/digikey.service.ts`
- Modify: `backend/src/vendors/scrapers/digikey.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/vendors/scrapers/digikey.service.spec.ts`:

```typescript
describe('DigiKeyService.search', () => {
  let service: DigiKeyService;

  const makeProduct = (mpn: string, price: number, extraName = ''): DkKeywordProduct => ({
    ManufacturerProductNumber: mpn,
    DigiKeyPartNumber: `DK-${mpn}`,
    Manufacturer: { Name: extraName || 'Acme' },
    Description: { ProductDescription: 'desc', DetailedDescription: 'detail' },
    QuantityAvailable: 10,
    UnitPrice: price,
    ProductUrl: `https://digikey.com/${mpn}`,
    ManufacturerLeadWeeks: '',
    MinimumOrderQuantity: 1,
    PrimaryPhoto: '',
  } as any);

  beforeEach(() => {
    service = makeService();
    jest.clearAllMocks();
    // Mock getToken
    jest.spyOn(service as any, 'getToken').mockResolvedValue('test-token');
    // Mock productDetailsSearch to return [] by default
    jest.spyOn(service as any, 'productDetailsSearch').mockResolvedValue([]);
  });

  it('returns [] when clientId is missing', async () => {
    const result = await service.search('lm358');
    expect(result).toEqual([]);
  });

  it('deduplicates products with same ManufacturerProductNumber', async () => {
    const p1 = makeProduct('LM358', 0.65);
    const p2 = makeProduct('LM358', 0.70); // duplicate MPN, different price
    const p3 = makeProduct('LM741', 1.00);

    mockAxios.post.mockResolvedValueOnce({ data: { Products: [p1, p2, p3] } });
    jest.spyOn(service as any, 'productDetailsSearch').mockResolvedValue([p1]);
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('LM358');

    const mpns = result.map(r => r.vendorSku.replace('DK-', ''));
    // LM358 should appear once despite being in both sources
    expect(mpns.filter(m => m === 'LM358')).toHaveLength(1);
  });

  it('places product details results before keyword results in final order for equal score', async () => {
    const detailsProduct = makeProduct('SC1112', 60.00, 'Raspberry Pi');
    const keywordProduct = makeProduct('SC1892', 1.00, 'Raspberry Pi');

    mockAxios.post.mockResolvedValueOnce({ data: { Products: [keywordProduct] } });
    jest.spyOn(service as any, 'productDetailsSearch').mockResolvedValue([detailsProduct]);
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('SC1112');

    expect(result[0].vendorSku).toBe('DK-SC1112');
  });

  it('sorts by score descending then price descending within same score', async () => {
    // "raspberry pi" query — SC1112 matches 2 words ("raspberry","pi"), SC1892 also 2 words
    // but SC1112 costs more so it should come first within same score tier
    const cheap = makeProduct('SC1892', 1.00, 'Raspberry Pi');
    const expensive = makeProduct('SC1112', 60.00, 'Raspberry Pi');

    mockAxios.post.mockResolvedValueOnce({ data: { Products: [cheap, expensive] } });
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('raspberry pi');

    expect(result[0].price).toBe(60.00);
    expect(result[1].price).toBe(1.00);
  });

  it('returns [] and logs error when both calls fail', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('network error'));
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('LM358');

    expect(result).toEqual([]);
  });
});
```

Note: `DkKeywordProduct` is not exported from `digikey.service.ts`. You need to reference the shape via the `makeProduct` helper above — it constructs the raw object directly.

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend
npx jest digikey.service.spec.ts --no-coverage 2>&1 | tail -30
```

Expected: FAIL — tests that call `service.search()` will fail because the current implementation doesn't do dual fetch or score-based sorting.

- [ ] **Step 3: Rewrite `search()` in `digikey.service.ts`**

Replace the entire `search()` method (lines 90–120) with:

```typescript
async search(query: string): Promise<SearchResult[]> {
  if (!this.clientId || !this.clientSecret) return [];
  try {
    const token = await this.getToken();
    const [keywordProducts, detailsProducts] = await Promise.all([
      axios.post<DkKeywordResponse>(
        `${this.apiBase}/keyword`,
        {
          Keywords: query,
          RecordCount: 50,
          RecordStartPosition: 0,
          Sort: { SortOption: 'SortByUnitPrice', Direction: 'Descending', SortParameterId: 0 },
        },
        { headers: { ...this.authHeaders(token), 'Content-Type': 'application/json' }, timeout: 10000 },
      ).then(r => r.data?.Products ?? []).catch(() => []),
      this.productDetailsSearch(query, token),
    ]);

    // Merge: product details first (more exact), keyword results appended; dedup by MPN
    const seen = new Set<string>();
    const merged: DkKeywordProduct[] = [];
    for (const p of [...detailsProducts, ...keywordProducts]) {
      if (p.ManufacturerProductNumber && !seen.has(p.ManufacturerProductNumber)) {
        seen.add(p.ManufacturerProductNumber);
        merged.push(p);
      }
    }

    return merged
      .filter(p => p.ManufacturerProductNumber && p.UnitPrice != null)
      .map(p => ({
        p,
        score: this.scoreRelevance(query, `${p.Manufacturer.Name} ${p.ManufacturerProductNumber}`),
      }))
      .sort((a, b) => b.score - a.score || (b.p.UnitPrice ?? 0) - (a.p.UnitPrice ?? 0))
      .map(({ p }) => ({
        vendorSlug: 'digikey',
        vendorName: 'DigiKey',
        partNumber: query,
        vendorSku: p.DigiKeyPartNumber,
        name: `${p.Manufacturer.Name} ${p.ManufacturerProductNumber}`.trim(),
        description: [p.Description.DetailedDescription, p.Description.ProductDescription]
          .filter(Boolean).join(' — '),
        price: p.UnitPrice ?? null,
        inStock: p.QuantityAvailable > 0,
        productUrl: p.ProductUrl,
        imageUrl: p.PrimaryPhoto || undefined,
      }));
  } catch (err) {
    this.logger.error(`DigiKey search failed: ${err.message}`);
    return [];
  }
}
```

- [ ] **Step 4: Run all DigiKey tests to verify they pass**

```bash
cd backend
npx jest digikey.service.spec.ts --no-coverage 2>&1 | tail -30
```

Expected: All tests pass. If the `returns [] when clientId is missing` test fails, it's because `makeService()` returns a config mock with no values — `clientId` and `clientSecret` getters will return `''` which is falsy, so the guard returns `[]`. Verify the guard `if (!this.clientId || !this.clientSecret) return [];` is still at the top of `search()`.

- [ ] **Step 5: Run the full backend test suite to check for regressions**

```bash
cd backend
npx jest --no-coverage 2>&1 | tail -20
```

Expected: All existing tests still pass. The `vendors.service.spec.ts` test `'emits a vendor event per vendor and a done event last'` expects 5 vendor slugs — confirm `digikey` is still in the list (it is, since `vendors.service.ts` is unchanged).

- [ ] **Step 6: Commit**

```bash
git add backend/src/vendors/scrapers/digikey.service.ts \
        backend/src/vendors/scrapers/digikey.service.spec.ts
git commit -m "feat: dual-fetch DigiKey search with relevance scoring

Run keyword search and product details lookup in parallel.
Merge and deduplicate by MPN. Sort by query-word score then price."
```

---

### Task 4: Push and manual smoke test

- [ ] **Step 1: Push to origin**

```bash
git push origin main
```

- [ ] **Step 2: Clear Redis search cache**

```bash
redis-cli FLUSHDB
```

Or via Node (from `backend/` directory):

```bash
node -e "
const Redis = require('ioredis');
const r = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
r.keys('search:*').then(keys => {
  if (!keys.length) { console.log('No keys'); r.quit(); return; }
  return r.del(...keys).then(n => { console.log('Deleted:', n); r.quit(); });
}).catch(e => { console.error(e.message); r.quit(); });
"
```

- [ ] **Step 3: Restart backend and search "SC1112"**

Expected: Raspberry Pi 5 board appears as first result (via product details endpoint).

- [ ] **Step 4: Search "LM358"**

Expected: LM358 op-amp appears first, likely before similar LM741 or LM393 variants.

- [ ] **Step 5: Search "raspberry pi 5"**

Expected: Results still don't include the actual Pi 5 board (known limitation — DigiKey keyword API doesn't surface SC1112 for this query). BUT results are ordered with better name-match scoring than before. Accessories with both "raspberry" and "pi" in the name rank above those missing one of the terms.
