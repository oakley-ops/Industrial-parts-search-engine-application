import { chromium, Browser, Page } from 'playwright';

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

export abstract class BaseScraper {
  abstract readonly vendorSlug: string;
  abstract readonly vendorName: string;

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

  protected async createBrowser(): Promise<Browser> {
    return chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  }

  protected async createPage(browser: Browser): Promise<Page> {
    const ctx = await browser.newContext({
      userAgent: this.randomAgent(),
      viewport: { width: 1280, height: 800 },
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    });
    return ctx.newPage();
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
