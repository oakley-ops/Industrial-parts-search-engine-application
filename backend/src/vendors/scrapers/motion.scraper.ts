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
