# Scraper Browser Pool Design

**Date:** 2026-05-22
**Cluster:** D — Scraper Performance
**Scope:** Backend only — `BaseScraper` and three vendor scrapers

---

## Problem

Every `search()` and `getPrice()` call on each scraper launches a new Chromium browser process and closes it when the call completes. Chromium startup takes 1–3 seconds. A single `getPricesForPart()` call fires all three scrapers in parallel, spawning three Chromium instances simultaneously. This dominates request latency.

---

## Decision

| Decision | Choice | Reason |
|----------|--------|--------|
| Strategy | Persistent browser per scraper | One browser instance lives for the lifetime of the NestJS process; startup cost paid once |
| Request isolation | New `BrowserContext` per request | Fresh cookies/storage per call; no cross-request state contamination |
| Crash recovery | Re-launch on `!browser.isConnected()` | Transparent recovery without external health checks |
| Concurrency | None needed | Single-user app; no queuing or pool management required |

---

## Architecture

All changes are confined to `BaseScraper`. The three concrete scrapers only swap two lines per method. No module wiring, no new dependencies, no API contract changes.

```
BaseScraper (modified)
  _browser: Browser | null          ← persistent across requests
  getPage(): Promise<Page>          ← lazy-init browser, new context, new page
  closePage(page): Promise<void>    ← closes context (not browser)
  onApplicationShutdown()           ← closes browser on process stop

GraingerScraper / MotionScraper / McMasterScraper (modified)
  search()    before: createBrowser() … browser.close()
              after:  getPage()      … closePage(page)
  getPrice()  same swap
```

---

## Section 1: BaseScraper Changes

### New private field

```ts
private _browser: Browser | null = null;
```

### getPage()

```ts
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
```

### closePage()

```ts
protected async closePage(page: Page): Promise<void> {
  await page.context().close();
}
```

Closing the context disposes the page and all associated resources. The browser process remains running.

### onApplicationShutdown()

`BaseScraper` implements `OnApplicationShutdown`:

```ts
async onApplicationShutdown(): Promise<void> {
  await this._browser?.close();
  this._browser = null;
}
```

NestJS calls this automatically during graceful shutdown. No manual wiring required.

### Removed methods

- `createBrowser()` — replaced by the lazy-init logic inside `getPage()`
- `createPage(browser: Browser)` — replaced by `getPage()`

---

## Section 2: Scraper Changes

The same mechanical change is applied to every `search()` and `getPrice()` in all three scrapers.

**Before:**
```ts
const browser = await this.createBrowser();
try {
  const page = await this.createPage(browser);
  // ... scraping logic
} finally {
  await browser.close();
}
```

**After:**
```ts
const page = await this.getPage();
try {
  // ... scraping logic (untouched)
} finally {
  await this.closePage(page);
}
```

Six call sites total (2 methods × 3 scrapers). Scraping logic inside each method is not modified.

---

## Section 3: Tests

**File:** `backend/src/vendors/scrapers/base.scraper.spec.ts`

Playwright's `chromium` is mocked — no real browser is launched. A minimal concrete subclass exercises the abstract base:

```ts
class TestScraper extends BaseScraper {
  readonly vendorSlug = 'test';
  readonly vendorName = 'Test';
  async search() { return []; }
  async getPrice() { return {} as PriceResult; }
  async callGetPage() { return this.getPage(); }
  async callClosePage(p: Page) { return this.closePage(p); }
}
```

**Test cases:**
1. `getPage()` launches a browser on first call
2. `getPage()` reuses the same browser instance on subsequent calls
3. `getPage()` re-launches when `browser.isConnected()` returns `false`
4. `closePage(page)` closes the context but not the browser
5. `onApplicationShutdown()` closes the browser

---

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/src/vendors/scrapers/base.scraper.ts` | Persistent browser, `getPage()`, `closePage()`, shutdown hook |
| Create | `backend/src/vendors/scrapers/base.scraper.spec.ts` | Browser lifecycle unit tests |
| Modify | `backend/src/vendors/scrapers/grainger.scraper.ts` | `getPage()`/`closePage()` swap |
| Modify | `backend/src/vendors/scrapers/motion.scraper.ts` | `getPage()`/`closePage()` swap |
| Modify | `backend/src/vendors/scrapers/mcmaster.scraper.ts` | `getPage()`/`closePage()` swap |

---

## What This Does NOT Change

- Scraping logic (selectors, page evaluation, delays) — untouched
- Redis caching — untouched
- VendorsService — untouched
- API contracts — untouched
- Module wiring — untouched
- No new dependencies
