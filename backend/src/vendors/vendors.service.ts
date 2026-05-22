import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';
import { GraingerScraper } from './scrapers/grainger.scraper';
import { MotionScraper } from './scrapers/motion.scraper';
import { McMasterScraper } from './scrapers/mcmaster.scraper';
import { PriceResult, SearchResult } from './scrapers/base.scraper';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private redis: RedisService,
    private config: ConfigService,
    private grainger: GraingerScraper,
    private motion: MotionScraper,
    private mcmaster: McMasterScraper,
  ) {}

  private get scrapers() { return [this.grainger, this.motion, this.mcmaster]; }

  getVendors() { return this.scrapers.map(s => ({ slug: s.vendorSlug, name: s.vendorName })); }

  async searchAll(query: string): Promise<SearchResult[]> {
    const key = `search:all:${query.toLowerCase().replace(/\W+/g, '_')}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    this.logger.log(`Searching all vendors: ${query}`);
    const settled = await Promise.allSettled(this.scrapers.map(s => s.search(query)));
    const results: SearchResult[] = [];
    settled.forEach(r => { if (r.status === 'fulfilled') results.push(...r.value); });

    const ttl = this.config.get<number>('scraper.searchTtlSeconds', 300);
    await this.redis.setex(key, ttl, JSON.stringify(results));
    return results;
  }

  async getPricesForPart(partNumber: string): Promise<PriceResult[]> {
    this.logger.log(`Getting prices: ${partNumber}`);
    const settled = await Promise.allSettled(
      this.scrapers.map(s => this.cachedPrice(s.vendorSlug, partNumber, () => s.getPrice(partNumber)))
    );
    return settled.filter(r => r.status === 'fulfilled').map(r => (r as PromiseFulfilledResult<PriceResult>).value);
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

  private async cachedPrice(vendorSlug: string, partNumber: string, fetchFn: () => Promise<PriceResult>): Promise<PriceResult> {
    const key = `price:${vendorSlug}:${partNumber.toLowerCase()}`;
    const cached = await this.redis.get(key);
    if (cached) { this.logger.log(`Cache hit: ${key}`); return JSON.parse(cached); }
    const result = await fetchFn();
    await this.redis.setex(key, this.config.get<number>('scraper.priceTtlSeconds', 900), JSON.stringify(result));
    return result;
  }
}
