import { Injectable, Logger, MessageEvent } from '@nestjs/common';
import { Observable, EMPTY } from 'rxjs';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { GraingerScraper } from './scrapers/grainger.scraper';
import { MotionScraper } from './scrapers/motion.scraper';
import { McMasterScraper } from './scrapers/mcmaster.scraper';
import { OemSecretsService } from './scrapers/oemsecrets.service';
import { DigiKeyService } from './scrapers/digikey.service';
import { PriceResult, SearchResult } from './scrapers/base.scraper';
import { DEMO_SEARCH_RESULTS, DEMO_PRICE_RESULTS } from './demo-data';

const FRESH_TTL = 300;  // seconds — serve from cache, no refresh
const STALE_TTL = 900;  // seconds — serve from cache + background refresh; beyond this is a miss

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private redis: RedisService,
    private config: ConfigService,
    private grainger: GraingerScraper,
    private motion: MotionScraper,
    private mcmaster: McMasterScraper,
    private oemSecrets: OemSecretsService,
    private digikey: DigiKeyService,
  ) {}

  private get scrapers() { return [this.grainger, this.motion, this.mcmaster]; }

  getVendors() { return this.scrapers.map(s => ({ slug: s.vendorSlug, name: s.vendorName })); }

  private get demoMode(): boolean {
    return process.env.DEMO_MODE === 'true';
  }

  async searchAll(query: string): Promise<SearchResult[]> {
    if (this.demoMode) {
      this.logger.log(`[DEMO] Returning demo results for: ${query}`);
      return DEMO_SEARCH_RESULTS.map(r => ({ ...r, partNumber: query }));
    }

    const key = `search:all:${query.toLowerCase().replace(/\W+/g, '_')}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    this.logger.log(`Searching all vendors: ${query}`);
    const [settled, oemResults, dkResults] = await Promise.all([
      Promise.allSettled(this.scrapers.map(s => s.search(query))),
      this.oemSecrets.search(query),
      this.digikey.search(query),
    ]);
    const results: SearchResult[] = [...oemResults, ...dkResults];
    settled.forEach((r, i) => {
      if (r.status === 'rejected') this.logger.error(`${this.scrapers[i].vendorSlug} search failed: ${r.reason}`);
      else results.push(...r.value);
    });

    const ttl = this.config.get<number>('scraper.searchTtlSeconds', 300);
    await this.redis.setex(key, ttl, JSON.stringify(results));
    return results;
  }

  async getPricesForPart(partNumber: string): Promise<PriceResult[]> {
    if (this.demoMode) {
      this.logger.log(`[DEMO] Returning demo prices for: ${partNumber}`);
      return DEMO_PRICE_RESULTS.map(r => ({ ...r, scrapedAt: new Date().toISOString() }));
    }

    this.logger.log(`Getting prices: ${partNumber}`);
    const [settled, oemPrices, dkPrices] = await Promise.all([
      Promise.allSettled(
        this.scrapers.map(s => this.cachedPrice(s.vendorSlug, partNumber, () => s.getPrice(partNumber)))
      ),
      this.oemSecrets.getPrices(partNumber),
      this.digikey.getPrices(partNumber),
    ]);
    const scraperPrices = settled
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as PromiseFulfilledResult<PriceResult>).value);
    return [...oemPrices, ...dkPrices, ...scraperPrices];
  }

  async getPriceFromVendor(vendorSlug: string, partNumber: string): Promise<PriceResult | null> {
    const scraper = this.scrapers.find(s => s.vendorSlug === vendorSlug);
    if (!scraper) return null;
    return this.cachedPrice(vendorSlug, partNumber, () => scraper.getPrice(partNumber));
  }

  async clearCache(partNumber?: string) {
    const pattern = partNumber ? `price:*:${partNumber.toLowerCase()}` : 'price:*';
    const keys = await this.redis.keys(pattern);
    for (const key of keys) await this.redis.del(key);
    return { cleared: keys.length };
  }

  private async searchVendorSwr(
    slug: string,
    query: string,
    fetchFn: () => Promise<SearchResult[]>,
  ): Promise<SearchResult[]> {
    const key = `search:${slug}:${query.trim().toLowerCase().replace(/\W+/g, '_')}`;
    try {
      const raw = await this.redis.get(key);
      if (raw) {
        const { results, cachedAt } = JSON.parse(raw) as { results: SearchResult[]; cachedAt: number };
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
    try {
      await this.redis.setex(key, STALE_TTL, JSON.stringify({ results, cachedAt: Date.now() }));
    } catch {
      // Redis down — results still returned, cache write skipped
    }
    return results;
  }

  private refreshInBackground(key: string, fetchFn: () => Promise<SearchResult[]>): void {
    fetchFn()
      .then(results =>
        this.redis.setex(key, STALE_TTL, JSON.stringify({ results, cachedAt: Date.now() }))
      )
      .catch(() => {});
  }

  private async cachedPrice(vendorSlug: string, partNumber: string, fetchFn: () => Promise<PriceResult>): Promise<PriceResult> {
    const key = `price:${vendorSlug}:${partNumber.toLowerCase()}`;
    const cached = await this.redis.get(key);
    if (cached) { this.logger.log(`Cache hit: ${key}`); return JSON.parse(cached); }
    const result = await fetchFn();
    await this.redis.setex(key, this.config.get<number>('scraper.priceTtlSeconds', 900), JSON.stringify(result));
    return result;
  }
}
