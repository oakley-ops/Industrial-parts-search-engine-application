import { Injectable, Logger } from '@nestjs/common';
import { BaseScraper, PriceResult, SearchResult } from './base.scraper';

@Injectable()
export class McMasterScraper extends BaseScraper {
  readonly vendorSlug = 'mcmaster';
  readonly vendorName = 'McMaster-Carr';
  private readonly logger = new Logger(McMasterScraper.name);
  private readonly base = 'https://www.mcmaster.com';

  async search(query: string): Promise<SearchResult[]> {
    const browser = await this.createBrowser();
    const results: SearchResult[] = [];
    try {
      const page = await this.createPage(browser);
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
      productUrl: `${this.base}/${partNumber}/`, inStock: false, scrapedAt: new Date().toISOString(),
    };
    try {
      const page = await this.createPage(browser);
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
      await browser.close();
    }
  }
}
