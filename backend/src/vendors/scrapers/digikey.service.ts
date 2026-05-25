import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { SearchResult, PriceResult } from './base.scraper';

interface DkToken { access_token: string; expires_at: number; }

interface DkVariation {
  DigiKeyProductNumber: string;
  QuantityAvailableforPackageType: number;
  MinimumOrderQuantity: number;
  PackageType: { Id: number; Name: string };
  StandardPricing: { BreakQuantity: number; UnitPrice: number }[];
}

interface DkProduct {
  ManufacturerProductNumber: string;
  Manufacturer: { Id: number; Name: string };
  Description: { ProductDescription: string };
  QuantityAvailable: number;
  ProductUrl: string;
  ManufacturerLeadWeeks: string;
  ProductVariations: DkVariation[];
}

// Keyword search returns a flatter structure
interface DkKeywordProduct {
  ManufacturerProductNumber: string;
  DigiKeyPartNumber: string;
  Manufacturer: { Name: string };
  Description: { ProductDescription: string; DetailedDescription: string };
  QuantityAvailable: number;
  UnitPrice: number;
  ProductUrl: string;
  ManufacturerLeadWeeks: string;
  MinimumOrderQuantity: number;
  PrimaryPhoto: string;
}

interface DkKeywordResponse {
  Products: DkKeywordProduct[];
  ProductsCount: number;
  FilteredProductsCount: number;
}

interface DkPricingResponse {
  ProductPricings: DkProduct[];
  ProductsCount: number;
}

interface DkProductDetailsResponse {
  Products?: DkKeywordProduct[];
  Product?: DkKeywordProduct;
  ProductsCount?: number;
}

@Injectable()
export class DigiKeyService {
  private readonly logger = new Logger(DigiKeyService.name);
  private readonly tokenUrl = 'https://api.digikey.com/v1/oauth2/token';
  private readonly apiBase = 'https://api.digikey.com/products/v4/search';
  private token: DkToken | null = null;

  constructor(private config: ConfigService) {}

  private get clientId(): string { return this.config.get<string>('DIGIKEY_CLIENT_ID', ''); }
  private get clientSecret(): string { return this.config.get<string>('DIGIKEY_CLIENT_SECRET', ''); }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expires_at) return this.token.access_token;
    const { data } = await axios.post(this.tokenUrl,
      `grant_type=client_credentials&client_id=${this.clientId}&client_secret=${this.clientSecret}`,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    this.token = { access_token: data.access_token, expires_at: Date.now() + (data.expires_in - 60) * 1000 };
    return this.token.access_token;
  }

  private authHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
      'X-DIGIKEY-Client-Id': this.clientId,
      'X-DIGIKEY-Locale-Site': 'US',
      'X-DIGIKEY-Locale-Language': 'en',
      'X-DIGIKEY-Locale-Currency': 'USD',
    };
  }

  private qty1Price(variation: DkVariation): number | null {
    const pricing = variation.StandardPricing;
    if (!pricing?.length) return null;
    const qty1 = pricing.find(p => p.BreakQuantity === 1) ?? pricing[0];
    return qty1.UnitPrice ?? null;
  }

  private scoreRelevance(query: string, name: string): number {
    const queryWords = query.toLowerCase().split(/\W+/).filter(Boolean);
    const nameWords = new Set(name.toLowerCase().split(/\W+/).filter(Boolean));
    return queryWords.filter(w => nameWords.has(w)).length;
  }

  private async productDetailsSearch(query: string, token: string): Promise<DkKeywordProduct[]> {
    try {
      const { data } = await axios.get<DkProductDetailsResponse>(
        `${this.apiBase}/${encodeURIComponent(query)}/productdetails`,
        { headers: this.authHeaders(token), timeout: 10000 },
      );
      if (Array.isArray(data?.Products)) return data.Products;
      if (data?.Product) return [data.Product];
      return [];
    } catch (err) {
      this.logger.warn(`productDetailsSearch failed for "${query}": ${err?.message}`);
      return [];
    }
  }

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

  async lookupBarcode(barcode: string): Promise<SearchResult | null> {
    if (!this.clientId || !this.clientSecret) return null;
    try {
      const token = await this.getToken();
      const { data } = await axios.get(
        `https://api.digikey.com/barcoding/v4/product/${encodeURIComponent(barcode)}`,
        { headers: this.authHeaders(token), timeout: 10000 },
      );
      const p = data.Product;
      if (!p) return null;
      return {
        vendorSlug: 'digikey',
        vendorName: 'DigiKey',
        partNumber: p.ManufacturerProductNumber ?? barcode,
        vendorSku: p.DigiKeyPartNumber ?? '',
        name: `${p.Manufacturer?.Name ?? ''} ${p.ManufacturerProductNumber ?? ''}`.trim(),
        description: p.Description?.DetailedDescription || p.Description?.ProductDescription || '',
        price: p.UnitPrice ?? null,
        inStock: (p.QuantityAvailable ?? 0) > 0,
        productUrl: p.ProductUrl ?? '',
        imageUrl: p.PrimaryPhoto || undefined,
      };
    } catch (err) {
      this.logger.error(`DigiKey barcode lookup failed: ${err.message}`);
      return null;
    }
  }

  async getPrices(partNumber: string): Promise<PriceResult[]> {
    if (!this.clientId || !this.clientSecret) return [];
    try {
      const token = await this.getToken();
      const { data } = await axios.get<DkPricingResponse>(
        `${this.apiBase}/${encodeURIComponent(partNumber)}/pricing`,
        { headers: this.authHeaders(token), params: { limit: 5 }, timeout: 10000 },
      );
      if (!data?.ProductPricings) return [];

      return data.ProductPricings.flatMap(p =>
        (p.ProductVariations ?? []).map(variation => ({
          vendorSlug: 'digikey',
          vendorName: 'DigiKey',
          vendorSku: variation.DigiKeyProductNumber,
          price: this.qty1Price(variation),
          currency: 'USD',
          quantityOnHand: variation.QuantityAvailableforPackageType ?? p.QuantityAvailable ?? 0,
          source: (variation.QuantityAvailableforPackageType > 0 || p.QuantityAvailable > 0)
            ? 'VENDOR_WAREHOUSE' as const : 'UNKNOWN' as const,
          leadTimeDays: p.ManufacturerLeadWeeks ? parseInt(p.ManufacturerLeadWeeks) * 7 : null,
          minOrderQty: variation.MinimumOrderQuantity || 1,
          unitOfMeasure: variation.PackageType?.Name || 'each',
          productUrl: p.ProductUrl,
          inStock: p.QuantityAvailable > 0,
          scrapedAt: new Date().toISOString(),
        }))
      );
    } catch (err) {
      this.logger.error(`DigiKey prices failed: ${err.message}`);
      return [];
    }
  }
}
