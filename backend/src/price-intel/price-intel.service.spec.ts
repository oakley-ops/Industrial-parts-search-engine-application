import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PriceIntelService } from './price-intel.service';
import { RedisService } from '../redis/redis.service';

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue(undefined),
};

const SAMPLE_PRICES = [
  { vendorName: 'Grainger', price: 4.50, source: 'VENDOR_WAREHOUSE' },
  { vendorName: 'McMaster-Carr', price: 6.20, source: 'VENDOR_WAREHOUSE' },
];

describe('PriceIntelService', () => {
  let service: PriceIntelService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceIntelService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PriceIntelService>(PriceIntelService);
  });

  it('returns parsed recommendation from Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"recommendation":"Buy at Grainger now — $4.50 is at the low end of the typical range.","confidence":"high"}',
      }],
    });

    const result = await service.analyze('6203-2RS', SAMPLE_PRICES);
    expect(result.recommendation).toContain('Grainger');
    expect(result.confidence).toBe('high');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'price-intel:6203-2rs',
      86400,
      expect.any(String),
    );
  });

  it('returns cached result without calling Claude', async () => {
    const cached = { recommendation: 'Cached recommendation.', confidence: 'medium' };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.analyze('6203-2RS', SAMPLE_PRICES);
    expect(result.recommendation).toBe('Cached recommendation.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns fallback on malformed Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    const result = await service.analyze('OBSCURE-XYZ-999', SAMPLE_PRICES);
    expect(result.recommendation).toBe('Could not analyze prices for this part.');
    expect(result.confidence).toBe('low');
  });

  it('returns early without calling Claude when prices array is empty', async () => {
    const result = await service.analyze('6203-2RS', []);
    expect(result.recommendation).toBe('No prices available to analyze.');
    expect(result.confidence).toBe('low');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
