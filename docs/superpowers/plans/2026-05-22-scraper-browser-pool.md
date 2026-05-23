# Scraper Browser Pool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate per-request Chromium startup by keeping one persistent browser per scraper, opening a fresh context per request.

**Architecture:** `BaseScraper` gains a lazy `_browser` field, a `getPage()` method that reuses it (re-launching on crash), and a `closePage()` method that closes only the context. The three concrete scrapers swap two lines each. No module, cache, or API changes.

**Tech Stack:** Playwright (`chromium`), NestJS `OnApplicationShutdown`

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/src/vendors/scrapers/base.scraper.ts` | Persistent browser, `getPage()`, `closePage()`, `onApplicationShutdown()` |
| Create | `backend/src/vendors/scrapers/base.scraper.spec.ts` | Browser lifecycle unit tests |
| Modify | `backend/src/vendors/scrapers/grainger.scraper.ts` | Swap `createBrowser`/`browser.close` → `getPage`/`closePage` |
| Modify | `backend/src/vendors/scrapers/motion.scraper.ts` | Same swap |
| Modify | `backend/src/vendors/scrapers/mcmaster.scraper.ts` | Same swap |

---

### Task 1: BaseScraper — persistent browser lifecycle

**Files:**
- Modify: `backend/src/vendors/scrapers/base.scraper.ts`
- Create: `backend/src/vendors/scrapers/base.scraper.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/vendors/scrapers/base.scraper.spec.ts`:

```ts
import { chromium } from 'playwright';
import { BaseScraper, PriceResult, SearchResult } from './base.scraper';

jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() },
}));

const mockLaunch = chromium.launch as jest.Mock;

class TestScraper extends BaseScraper {
  readonly vendorSlug = 'test';
  readonly vendorName = 'Test';
  async search(): Promise<SearchResult[]> { return []; }
  async getPrice(): Promise<PriceResult> { return {} as PriceResult; }
  async callGetPage() { return this.getPage(); }
  async callClosePage(p: any) { return this.closePage(p); }
}

describe('BaseScraper browser lifecycle', () => {
  let scraper: TestScraper;
  let mockBrowser: any;
  let mockContext: any;
  let mockPage: any;

  beforeEach(() => {
    mockPage = { context: jest.fn() };
    mockContext = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockPage.context.mockReturnValue(mockContext);
    mockBrowser = {
      isConnected: jest.fn().mockReturnValue(true),
      newContext: jest.fn().mockResolvedValue(mockContext),
      close: jest.fn().mockResolvedValue(undefined),
    };
    mockLaunch.mockResolvedValue(mockBrowser);
    scraper = new TestScraper();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('launches a browser on the first getPage() call', async () => {
    await scraper.callGetPage();
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it('reuses the same browser on subsequent calls', async () => {
    const page1 = await scraper.callGetPage();
    await scraper.callClosePage(page1);
    await scraper.callGetPage();
    expect(mockLaunch).toHaveBeenCalledTimes(1);
  });

  it('re-launches the browser when disconnected', async () => {
    await scraper.callGetPage();
    mockBrowser.isConnected.mockReturnValue(false);
    await scraper.callGetPage();
    expect(mockLaunch).toHaveBeenCalledTimes(2);
  });

  it('closePage() closes the context but not the browser', async () => {
    const page = await scraper.callGetPage();
    await scraper.callClosePage(page);
    expect(mockContext.close).toHaveBeenCalledTimes(1);
    expect(mockBrowser.close).not.toHaveBeenCalled();
  });

  it('onApplicationShutdown() closes the browser', async () => {
    await scraper.callGetPage();
    await scraper.onApplicationShutdown();
    expect(mockBrowser.close).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npm test -- --testPathPattern="base.scraper.spec"
```

Expected: FAIL — `getPage is not a function` / cannot find module

- [ ] **Step 3: Implement BaseScraper changes**

Full file `backend/src/vendors/scrapers/base.scraper.ts`:

```ts
import { chromium, Browser, Page } from 'playwright';
import { OnApplicationShutdown } from '@nestjs/common';

export interface PriceResult {
  vendorSlug: string;
  vendorName: string;
  vendorSku: string;
  price: number | null;
  currency: string;
  quantityOnHand: number;
  source: 'VENDOR_WAREHOUSE' | 'MANUFACTURER_ORDER' | 'BACKORDER' | 'UNKNOWN';
  leadTimeDays: number | null;
  minOrderQty: number;
  unitOfMeasure: string;
  productUrl: string;
  inStock: boolean;
  scrapedAt: string;
  error?: string;
}

export interface SearchResult {
  vendorSlug: string;
  vendorName: string;
  partNumber: string;
  vendorSku: string;
  name: string;
  description: string;
  price: number | null;
  inStock: boolean;
  productUrl: string;
}

export abstract class BaseScraper implements OnApplicationShutdown {
  abstract readonly vendorSlug: string;
  abstract readonly vendorName: string;

  private _browser: Browser | null = null;

  protected userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
  ];

  protected randomAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  protected delay(min = 1500, max = 3500): Promise<void> {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(r => setTimeout(r, ms));
  }

  protected async getPage(): Promise<Page> {
    if (!this._browser || !this._browser.isConnected()) {
      this._browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    }
    const context = await this._browser.newContext({
      userAgent: this.randomAgent(),
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    return context.newPage();
  }

  protected async closePage(page: Page): Promise<void> {
    await page.context().close();
  }

  async onApplicationShutdown(): Promise<void> {
    await this._browser?.close();
    this._browser = null;
  }

  protected extractPrice(text: string): number | null {
    if (!text) return null;
    const m = text.match(/[\d,]+\.?\d*/);
    if (!m) return null;
    const v = parseFloat(m[0].replace(',', ''));
    return isNaN(v) ? null : v;
  }

  protected extractLeadDays(text: string): number | null {
    if (!text) return null;
    const m = text.match(/(\d+)\s*(day|business)/i);
    return m ? parseInt(m[1]) : null;
  }

  protected determineSource(text: string): PriceResult['source'] {
    const t = text.toLowerCase();
    if (t.includes('in stock') || t.includes('available') || t.includes('ships today') || t.includes('same day'))
      return 'VENDOR_WAREHOUSE';
    if (t.includes('backorder') || t.includes('back order'))
      return 'BACKORDER';
    if (t.includes('factory') || t.includes('order') || t.includes('special order'))
      return 'MANUFACTURER_ORDER';
    return 'UNKNOWN';
  }

  abstract search(query: string): Promise<SearchResult[]>;
  abstract getPrice(partNumber: string): Promise<PriceResult>;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npm test -- --testPathPattern="base.scraper.spec"
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/vendors/scrapers/base.scraper.ts backend/src/vendors/scrapers/base.scraper.spec.ts && git commit -m "feat: persistent browser per scraper with context-per-request isolation"
```

---

### Task 2: Update scraper call sites

**Files:**
- Modify: `backend/src/vendors/scrapers/grainger.scraper.ts`
- Modify: `backend/src/vendors/scrapers/motion.scraper.ts`
- Modify: `backend/src/vendors/scrapers/mcmaster.scraper.ts`

Each scraper has two methods (`search` and `getPrice`). In both, swap:
- `const browser = await this.createBrowser();` → `const page = await this.getPage();`
- `const page = await this.createPage(browser);` → _(remove this line)_
- `await browser.close();` → `await this.closePage(page);`

The `page` variable moves from inside `try` to before it. Everything inside `try` is untouched.

- [ ] **Step 1: Update GraingerScraper**

Full file `backend/src/vendors/scrapers/grainger.scraper.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { BaseScraper, PriceResult, SearchResult } from './base.scraper';

@Injectable()
export class GraingerScraper extends BaseScraper {
  readonly vendorSlug = 'grainger';
  readonly vendorName = 'Grainger';
  private readonly logger = new Logger(GraingerScraper.name);
  private readonly base = 'https://www.grainger.com';

  async search(query: string): Promise<SearchResult[]> {
    const page = await this.getPage();
    const results: SearchResult[] = [];
    try {
      await page.goto(`${this.base}/search?searchQuery=${encodeURIComponent(query)}`, {
        waitUntil: 'domcontentloaded', timeout: 30000,
      });
      await this.delay();
      await page.waitForSelector('[data-testid="product-list-item"], .search-product-card', { timeout: 10000 }).catch(() => {});

      const items = await page.evaluate(() => {
        const selectors = ['[data-testid="product-list-item"]', '.search-product-card', '[class*="ProductCard"]'];
        let cards: NodeListOf<Element> | null = null;
        for (const s of selectors) { const f = document.querySelectorAll(s); if (f.length) { cards = f; break; } }
        if (!cards) return [];
        return Array.from(cards).slice(0, 8).map(card => {
          const name = card.querySelector('[data-testid="product-title"], [class*="ProductTitle"], h2, h3')?.textContent?.trim();
          const priceText = card.querySelector('[data-testid="price"], [class*="Price"]')?.textContent?.trim();
          const sku = card.querySelector('[data-testid="item-number"], [class*="ItemNumber"]')?.textContent?.trim();
          const href = card.querySelector('a')?.getAttribute('href');
          const stockText = card.querySelector('[class*="availability"], [class*="Availability"]')?.textContent?.toLowerCase() || '';
          const m = priceText?.match(/[\d,]+\.?\d*/);
          return { name, sku: sku || '', price: m ? parseFloat(m[0].replace(',', '')) : null, inStock: stockText.includes('in stock'), href: href || '' };
        }).filter(i => i.name);
      });

      items.forEach(item => results.push({
        vendorSlug: this.vendorSlug, vendorName: this.vendorName,
        partNumber: query, vendorSku: item.sku, name: item.name!,
        description: '', price: item.price, inStock: item.inStock,
        productUrl: item.href.startsWith('http') ? item.href : `${this.base}${item.href}`,
      }));
    } catch (err) {
      this.logger.error(`Grainger search error: ${err.message}`);
    } finally {
      await this.closePage(page);
    }
    return results;
  }

  async getPrice(partNumber: string): Promise<PriceResult> {
    const page = await this.getPage();
    const fallback: PriceResult = {
      vendorSlug: this.vendorSlug, vendorName: this.vendorName, vendorSku: partNumber,
      price: null, currency: 'USD', quantityOnHand: 0, source: 'UNKNOWN',
      leadTimeDays: null, minOrderQty: 1, unitOfMeasure: 'each',
      productUrl: '', inStock: false, scrapedAt: new Date().toISOString(),
    };
    try {
      await page.goto(`${this.base}/search?searchQuery=${encodeURIComponent(partNumber)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay();
      const link = await page.$('[data-testid="product-list-item"] a, .search-product-card a');
      if (!link) return fallback;
      const href = await link.getAttribute('href');
      await page.goto(href!.startsWith('http') ? href! : `${this.base}${href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(1000, 2000);
      const data = await page.evaluate(() => {
        const priceEl = document.querySelector('[data-testid="price"], [itemprop="price"], [class*="PriceValue"]');
        const stockEl = document.querySelector('[data-testid="availability-message"], [class*="Availability"]');
        const skuEl = document.querySelector('[data-testid="item-number"]');
        const leadEl = document.querySelector('[class*="LeadTime"], [class*="lead-time"]');
        return {
          priceText: priceEl?.getAttribute('content') || priceEl?.textContent || '',
          stockText: stockEl?.textContent || '',
          sku: skuEl?.textContent?.trim() || '',
          leadText: leadEl?.textContent || '',
          url: window.location.href,
        };
      });
      const price = this.extractPrice(data.priceText);
      const source = this.determineSource(data.stockText);
      return { ...fallback, vendorSku: data.sku || partNumber, price, source, inStock: source === 'VENDOR_WAREHOUSE', leadTimeDays: this.extractLeadDays(data.leadText), productUrl: data.url, scrapedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.error(`Grainger getPrice error: ${err.message}`);
      return { ...fallback, error: err.message };
    } finally {
      await this.closePage(page);
    }
  }
}
```

- [ ] **Step 2: Update MotionScraper**

Full file `backend/src/vendors/scrapers/motion.scraper.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { BaseScraper, PriceResult, SearchResult } from './base.scraper';

@Injectable()
export class MotionScraper extends BaseScraper {
  readonly vendorSlug = 'motion';
  readonly vendorName = 'Motion Industries';
  private readonly logger = new Logger(MotionScraper.name);
  private readonly base = 'https://www.motion.com';

  async search(query: string): Promise<SearchResult[]> {
    const page = await this.getPage();
    const results: SearchResult[] = [];
    try {
      await page.goto(`${this.base}/en/search?term=${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay();
      await page.waitForSelector('[class*="ProductCard"], [class*="product-card"], .product-item', { timeout: 10000 }).catch(() => {});

      const items = await page.evaluate(() => {
        const selectors = ['[class*="ProductCard"]', '[class*="product-card"]', '.product-item'];
        let cards: NodeListOf<Element> | null = null;
        for (const s of selectors) { const f = document.querySelectorAll(s); if (f.length) { cards = f; break; } }
        if (!cards) return [];
        return Array.from(cards).slice(0, 8).map(card => {
          const name = card.querySelector('[class*="title"], [class*="Title"], [class*="name"], h2, h3')?.textContent?.trim();
          const priceText = card.querySelector('[class*="price"], [class*="Price"]')?.textContent?.trim();
          const sku = card.querySelector('[class*="part"], [class*="Part"], [class*="item-no"]')?.textContent?.trim();
          const href = card.querySelector('a')?.getAttribute('href');
          const stockText = card.querySelector('[class*="stock"], [class*="availability"]')?.textContent?.toLowerCase() || '';
          const m = priceText?.match(/[\d,]+\.?\d*/);
          return { name, sku: sku || '', price: m ? parseFloat(m[0].replace(',', '')) : null, inStock: stockText.includes('in stock'), href: href || '' };
        }).filter(i => i.name);
      });

      items.forEach(item => results.push({
        vendorSlug: this.vendorSlug, vendorName: this.vendorName,
        partNumber: query, vendorSku: item.sku, name: item.name!,
        description: '', price: item.price, inStock: item.inStock,
        productUrl: item.href.startsWith('http') ? item.href : `${this.base}${item.href}`,
      }));
    } catch (err) {
      this.logger.error(`Motion search error: ${err.message}`);
    } finally {
      await this.closePage(page);
    }
    return results;
  }

  async getPrice(partNumber: string): Promise<PriceResult> {
    const page = await this.getPage();
    const fallback: PriceResult = {
      vendorSlug: this.vendorSlug, vendorName: this.vendorName, vendorSku: partNumber,
      price: null, currency: 'USD', quantityOnHand: 0, source: 'UNKNOWN',
      leadTimeDays: null, minOrderQty: 1, unitOfMeasure: 'each',
      productUrl: '', inStock: false, scrapedAt: new Date().toISOString(),
    };
    try {
      await page.goto(`${this.base}/en/search?term=${encodeURIComponent(partNumber)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay();
      const link = await page.$('[class*="ProductCard"] a, [class*="product-card"] a');
      if (!link) return fallback;
      const href = await link.getAttribute('href');
      await page.goto(href!.startsWith('http') ? href! : `${this.base}${href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay(1000, 2000);
      const data = await page.evaluate(() => {
        const priceEl = document.querySelector('[class*="price-value"], [class*="PriceValue"], [itemprop="price"]');
        const stockEl = document.querySelector('[class*="availability"], [class*="Availability"], [class*="stock"]');
        const skuEl = document.querySelector('[class*="part-number"], [class*="PartNumber"]');
        const leadEl = document.querySelector('[class*="lead-time"], [class*="LeadTime"]');
        return {
          priceText: priceEl?.getAttribute('content') || priceEl?.textContent || '',
          stockText: stockEl?.textContent || '',
          sku: skuEl?.textContent?.trim() || '',
          leadText: leadEl?.textContent || '',
          url: window.location.href,
        };
      });
      const price = this.extractPrice(data.priceText);
      const source = this.determineSource(data.stockText);
      return { ...fallback, vendorSku: data.sku || partNumber, price, source, inStock: source === 'VENDOR_WAREHOUSE', leadTimeDays: this.extractLeadDays(data.leadText), productUrl: data.url, scrapedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.error(`Motion getPrice error: ${err.message}`);
      return { ...fallback, error: err.message };
    } finally {
      await this.closePage(page);
    }
  }
}
```

- [ ] **Step 3: Update McMasterScraper**

Full file `backend/src/vendors/scrapers/mcmaster.scraper.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { BaseScraper, PriceResult, SearchResult } from './base.scraper';

@Injectable()
export class McMasterScraper extends BaseScraper {
  readonly vendorSlug = 'mcmaster';
  readonly vendorName = 'McMaster-Carr';
  private readonly logger = new Logger(McMasterScraper.name);
  private readonly base = 'https://www.mcmaster.com';

  async search(query: string): Promise<SearchResult[]> {
    const page = await this.getPage();
    const results: SearchResult[] = [];
    try {
      await page.goto(`${this.base}/${encodeURIComponent(query)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay();
      await page.waitForSelector('[class*="ResultItem"], [class*="result-row"]', { timeout: 10000 }).catch(() => {});

      const items = await page.evaluate(() => {
        const rows = document.querySelectorAll('[class*="ResultItem"], [class*="result-row"], tr[class*="Grid"]');
        return Array.from(rows).slice(0, 8).map(row => {
          const desc = row.querySelector('[class*="Description"], [class*="desc"]')?.textContent?.trim();
          const partNo = row.querySelector('[class*="PartNumber"], [class*="part-number"]')?.textContent?.trim();
          const priceText = row.querySelector('[class*="Price"], [class*="price"]')?.textContent?.trim();
          const href = row.querySelector('a')?.getAttribute('href');
          const stockText = row.querySelector('[class*="Avail"], [class*="stock"]')?.textContent?.toLowerCase() || '';
          const m = priceText?.match(/[\d,]+\.?\d*/);
          return { name: desc || partNo || '', sku: partNo || '', price: m ? parseFloat(m[0].replace(',', '')) : null, inStock: stockText.includes('ships') || stockText.includes('in stock'), href: href || '' };
        }).filter(i => i.name || i.sku);
      });

      items.forEach(item => results.push({
        vendorSlug: this.vendorSlug, vendorName: this.vendorName,
        partNumber: query, vendorSku: item.sku, name: item.name,
        description: '', price: item.price, inStock: item.inStock,
        productUrl: item.href.startsWith('http') ? item.href : `${this.base}${item.href}`,
      }));
    } catch (err) {
      this.logger.error(`McMaster search error: ${err.message}`);
    } finally {
      await this.closePage(page);
    }
    return results;
  }

  async getPrice(partNumber: string): Promise<PriceResult> {
    const page = await this.getPage();
    const fallback: PriceResult = {
      vendorSlug: this.vendorSlug, vendorName: this.vendorName, vendorSku: partNumber,
      price: null, currency: 'USD', quantityOnHand: 0, source: 'UNKNOWN',
      leadTimeDays: null, minOrderQty: 1, unitOfMeasure: 'each',
      productUrl: `${this.base}/${partNumber}/`, inStock: false, scrapedAt: new Date().toISOString(),
    };
    try {
      await page.goto(`${this.base}/${partNumber}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await this.delay();
      const hasPrice = await page.$('[class*="Price"], [itemprop="price"]');
      if (!hasPrice) {
        await page.goto(`${this.base}/${encodeURIComponent(partNumber)}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await this.delay();
        const link = await page.$('[class*="ResultItem"] a, [class*="PartNumber"] a');
        if (link) {
          const href = await link.getAttribute('href');
          await page.goto(href!.startsWith('http') ? href! : `${this.base}${href}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await this.delay(1000, 2000);
        }
      }
      const data = await page.evaluate(() => {
        const priceEl = document.querySelector('[itemprop="price"], [class*="PriceSection"] [class*="Price"], [class*="price-amount"]');
        const stockEl = document.querySelector('[class*="AvailMsg"], [class*="avail-msg"], [class*="ShipMsg"]');
        const skuEl = document.querySelector('[class*="PartNum"], [class*="part-num"]');
        const leadEl = document.querySelector('[class*="ShipDate"], [class*="ship-date"]');
        const minQtyEl = document.querySelector('[class*="MinQty"], [name="Quantity"]');
        const uomEl = document.querySelector('[class*="UnitOfMeasure"], [class*="unit"]');
        return {
          priceText: priceEl?.getAttribute('content') || priceEl?.textContent || '',
          stockText: stockEl?.textContent || '',
          sku: skuEl?.textContent?.trim() || '',
          leadText: leadEl?.textContent || '',
          minQtyText: minQtyEl?.getAttribute('value') || '1',
          uom: uomEl?.textContent?.trim() || 'each',
          url: window.location.href,
        };
      });
      const price = this.extractPrice(data.priceText);
      const source = this.determineSource(data.stockText);
      return { ...fallback, vendorSku: data.sku || partNumber, price, source, inStock: source === 'VENDOR_WAREHOUSE', leadTimeDays: this.extractLeadDays(data.leadText), minOrderQty: parseInt(data.minQtyText.match(/\d+/)?.[0] || '1'), unitOfMeasure: data.uom, productUrl: data.url, scrapedAt: new Date().toISOString() };
    } catch (err) {
      this.logger.error(`McMaster getPrice error: ${err.message}`);
      return { ...fallback, error: err.message };
    } finally {
      await this.closePage(page);
    }
  }
}
```

- [ ] **Step 4: Verify TypeScript compilation**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Run all tests**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npm test
```

Expected: all tests pass (existing 30 + new 5 = 35 total)

- [ ] **Step 6: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/vendors/scrapers/grainger.scraper.ts backend/src/vendors/scrapers/motion.scraper.ts backend/src/vendors/scrapers/mcmaster.scraper.ts && git commit -m "feat: use persistent browser context in all scrapers"
```

---

## Self-Review

**Spec coverage:**
- ✅ Persistent browser per scraper — `private _browser: Browser | null` in BaseScraper, lazy-initialized in `getPage()`
- ✅ New context per request — `this._browser.newContext(...)` called on every `getPage()` invocation
- ✅ Crash recovery — `!this._browser.isConnected()` check in `getPage()` triggers re-launch
- ✅ `closePage()` closes context not browser — `page.context().close()`
- ✅ `onApplicationShutdown()` — closes browser on NestJS shutdown
- ✅ `createBrowser()` and `createPage(browser)` removed
- ✅ All 6 call sites updated (2 methods × 3 scrapers)
- ✅ Tests cover all 5 specified scenarios

**Placeholder scan:** None found. All code blocks are complete.

**Type consistency:** `getPage(): Promise<Page>` and `closePage(page: Page): Promise<void>` used consistently across BaseScraper and all test helpers. `Page` type from `playwright` throughout.
