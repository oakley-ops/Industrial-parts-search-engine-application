import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SearchResult, PriceResult } from './base.scraper';

interface OemStock {
  sku: string;
  manufacturer: string;
  source_manufacturer: string;
  part_number: string;
  source_part_number: string;
  description: string;
  packaging: string;
  moq: number;
  quantity_in_stock: number;
  lead_time_weeks: string;
  buy_now_url: string;
  image_url: string;
  prices: { USD?: { unit_break: number; unit_price: string }[] };
  distributor: {
    distributor_name: string;
    distributor_common_name: string;
  };
}

interface OemResponse {
  status: string;
  search_term: string;
  parts_returned: number;
  stock: OemStock[];
}

@Injectable()
export class OemSecretsService {
  private readonly logger = new Logger(OemSecretsService.name);
  private readonly baseUrl = 'https://oemsecretsapi.com/partsearch';

  constructor(private config: ConfigService) {}

  private get apiKey(): string {
    return this.config.get<string>('OEMSECRETS_API_KEY', '');
  }

  private vendorSlug(distributor: OemStock['distributor']): string {
    return distributor.distributor_common_name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  private unitPrice(prices: OemStock['prices']): number | null {
    const usd = prices.USD;
    if (!usd || usd.length === 0) return null;
    const val = parseFloat(usd[0].unit_price);
    return isNaN(val) ? null : val;
  }

  private parseLeadWeeks(weeks: string): number | null {
    const n = parseInt(weeks);
    return isNaN(n) ? null : n * 7;
  }

  private validImageUrl(url: string): string | undefined {
    if (!url) return undefined;
    try {
      new URL(url);
      // Skip malformed URLs and bare no-image placeholders
      if (url.includes('comf_auto') || /\/no_image\.png$/.test(url)) return undefined;
      return url;
    } catch {
      return undefined;
    }
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.apiKey) return [];
    try {
      const { data } = await axios.get<OemResponse>(this.baseUrl, {
        params: { apiKey: this.apiKey, searchTerm: query, countryCode: 'US' },
        timeout: 10000,
      });
      if (!data?.stock) return [];

      // Group by distributor: keep cheapest item + best available image per distributor
      const byDistributor = new Map<string, OemStock>();
      const bestImage = new Map<string, string>();
      for (const item of data.stock) {
        const slug = this.vendorSlug(item.distributor);
        const existing = byDistributor.get(slug);
        const price = this.unitPrice(item.prices);
        const existingPrice = existing ? this.unitPrice(existing.prices) : null;
        if (!existing || (price !== null && (existingPrice === null || price < existingPrice))) {
          byDistributor.set(slug, item);
        }
        if (!bestImage.has(slug)) {
          const img = this.validImageUrl(item.image_url);
          if (img) bestImage.set(slug, img);
        }
      }

      return Array.from(byDistributor.values()).map(item => ({
        vendorSlug: 'oemsecrets',
        vendorName: item.distributor.distributor_name,
        partNumber: query,
        vendorSku: item.sku,
        name: `${item.source_manufacturer} ${item.part_number}`.trim(),
        description: item.description,
        price: this.unitPrice(item.prices),
        inStock: item.quantity_in_stock > 0,
        productUrl: item.buy_now_url,
        imageUrl: bestImage.get(this.vendorSlug(item.distributor)),
      }));
    } catch (err) {
      this.logger.error(`OEMSecrets search failed: ${err.message}`);
      return [];
    }
  }

  async getPrices(partNumber: string): Promise<PriceResult[]> {
    if (!this.apiKey) return [];
    try {
      const { data } = await axios.get<OemResponse>(this.baseUrl, {
        params: { apiKey: this.apiKey, searchTerm: partNumber, countryCode: 'US' },
        timeout: 10000,
      });
      if (!data?.stock) return [];

      const byDistributor = new Map<string, OemStock>();
      for (const item of data.stock) {
        const slug = this.vendorSlug(item.distributor);
        const existing = byDistributor.get(slug);
        const price = this.unitPrice(item.prices);
        const existingPrice = existing ? this.unitPrice(existing.prices) : null;
        if (!existing || (price !== null && (existingPrice === null || price < existingPrice))) {
          byDistributor.set(slug, item);
        }
      }

      return Array.from(byDistributor.values()).map(item => ({
        vendorSlug: this.vendorSlug(item.distributor),
        vendorName: item.distributor.distributor_name,
        vendorSku: item.sku,
        price: this.unitPrice(item.prices),
        currency: 'USD',
        quantityOnHand: item.quantity_in_stock ?? 0,
        source: item.quantity_in_stock > 0 ? 'VENDOR_WAREHOUSE' : 'UNKNOWN' as const,
        leadTimeDays: this.parseLeadWeeks(item.lead_time_weeks),
        minOrderQty: item.moq ?? 1,
        unitOfMeasure: item.packaging || 'each',
        productUrl: item.buy_now_url,
        inStock: item.quantity_in_stock > 0,
        scrapedAt: new Date().toISOString(),
      }));
    } catch (err) {
      this.logger.error(`OEMSecrets prices failed: ${err.message}`);
      return [];
    }
  }
}
