import { VendorsService } from './vendors.service';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service';

const NOW = 1_716_000_000_000;

function makeRedis(overrides: Partial<Pick<RedisService, 'get' | 'setex'>> = {}) {
  return {
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue(undefined),
    del: jest.fn(),
    keys: jest.fn(),
    ...overrides,
  } as unknown as RedisService;
}

function makeService(redis: RedisService) {
  const config = { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService;
  const stub: any = { search: jest.fn().mockResolvedValue([]), getPrices: jest.fn().mockResolvedValue([]), getPrice: jest.fn(), vendorSlug: 's', vendorName: 'S' };
  return new VendorsService(redis, config, stub, stub, stub, stub, stub);
}

describe('VendorsService.searchVendorSwr', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  it('fresh hit: returns cached data without calling fetchFn', async () => {
    const cachedData = [{ name: 'Relay X' }];
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({ results: cachedData, cachedAt: NOW - 60_000 }),
      ),
    });
    const service = makeService(redis);
    const fetchFn = jest.fn();

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(cachedData);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('stale hit: returns cached data and triggers refreshInBackground', async () => {
    const cachedData = [{ name: 'Relay Y' }];
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({ results: cachedData, cachedAt: NOW - 400_000 }),
      ),
    });
    const service = makeService(redis);
    jest.spyOn(service as any, 'refreshInBackground').mockImplementation(() => {});
    const fetchFn = jest.fn();

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(cachedData);
    expect((service as any).refreshInBackground).toHaveBeenCalledTimes(1);
    expect((service as any).refreshInBackground).toHaveBeenCalledWith(
      'search:digikey:relay',
      fetchFn,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('cache miss: fetches live and writes cache with current timestamp', async () => {
    const fresh = [{ name: 'Relay Z' }];
    const redis = makeRedis();
    const service = makeService(redis);
    const fetchFn = jest.fn().mockResolvedValue(fresh);

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(fresh);
    expect(redis.setex).toHaveBeenCalledWith(
      'search:digikey:relay',
      900,
      JSON.stringify({ results: fresh, cachedAt: NOW }),
    );
  });

  it('beyond stale TTL: treats as miss and fetches live', async () => {
    const fresh = [{ name: 'Fresh' }];
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(
        JSON.stringify({ results: [{ name: 'Old' }], cachedAt: NOW - 1_000_000 }),
      ),
    });
    const service = makeService(redis);
    const fetchFn = jest.fn().mockResolvedValue(fresh);

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(fresh);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('Redis throws on get: falls through to live fetch without throwing', async () => {
    const fresh = [{ name: 'Live Part' }];
    const redis = makeRedis({ get: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) });
    const service = makeService(redis);
    const fetchFn = jest.fn().mockResolvedValue(fresh);

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(fresh);
  });

  it('Redis throws on setex: returns live results without throwing', async () => {
    const fresh = [{ name: 'Cached After Failure' }];
    const redis = makeRedis({
      get: jest.fn().mockResolvedValue(null),
      setex: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    });
    const service = makeService(redis);
    const fetchFn = jest.fn().mockResolvedValue(fresh);

    const result = await (service as any).searchVendorSwr('digikey', 'relay', fetchFn);

    expect(result).toEqual(fresh);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe('VendorsService.searchStream', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());

  function collectStream(service: VendorsService, query: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const events: any[] = [];
      service.searchStream(query).subscribe({
        next: (e) => events.push(e.data),
        complete: () => resolve(events),
        error: reject,
      });
    });
  }

  it('emits a vendor event per vendor and a done event last', async () => {
    const service = makeService(makeRedis());
    const events = await collectStream(service, 'relay');

    expect(events.at(-1)).toEqual({ done: true });
    const vendorEvents = events.slice(0, -1);
    expect(vendorEvents.length).toBeGreaterThan(0);
    vendorEvents.forEach(e => {
      expect(e).toHaveProperty('vendor');
      expect(Array.isArray(e.results)).toBe(true);
    });
  }, 10_000);

  it('completes immediately for empty query without emitting any events', async () => {
    const service = makeService(makeRedis());
    const events = await collectStream(service, '');
    expect(events).toHaveLength(0);
  });

  it('emits results:[] for a vendor that throws and still emits done', async () => {
    const service = makeService(makeRedis());
    jest.spyOn((service as any).digikey, 'search').mockRejectedValue(new Error('DK API down'));

    const events = await collectStream(service, 'relay');

    expect(events.at(-1)).toEqual({ done: true });
    const dkEvent = events.find((e: any) => e.vendor === 'digikey');
    expect(dkEvent?.results).toEqual([]);
  }, 10_000);
});
