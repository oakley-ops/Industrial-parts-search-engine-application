import { Injectable, Logger } from '@nestjs/common';
import { BaseScraper, PriceResult, SearchResult } from './base.scraper';

@Injectable()
export class GraingerScraper extends BaseScraper {
  readonly vendorSlug = 'grainger';
  readonly vendorName = 'Grainger';
  private readonly logger = new Logger(GraingerScraper.name);
  private readonly base = 'https://www.grainger.com';

  async search(query: string): Promise<SearchResult[]> {
    const browser = await this.createBrowser();
    const results: SearchResult[] = [];
    try {
      const page = await this.createPage(browser);
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
      await browser.close();
    }
    return results;
  }

  async getPrice(partNumber: string): Promise<PriceResult> {
    const browser = await this.createBrowser();
    const fallback: PriceResult = {
      vendorSlug: this.vendorSlug, vendorName: this.vendorName, vendorSku: partNumber,
      price: null, currency: 'USD', quantityOnHand: 0, source: 'UNKNOWN',
      leadTimeDays: null, minOrderQty: 1, unitOfMeasure: 'each',
      productUrl: '', inStock: false, scrapedAt: new Date().toISOString(),
    };
    try {
      const page = await this.createPage(browser);
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
      await browser.close();
    }
  }
}
