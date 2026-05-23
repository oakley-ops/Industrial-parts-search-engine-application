import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CrossrefService } from './crossref.service';
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

describe('CrossrefService', () => {
  let service: CrossrefService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossrefService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CrossrefService>(CrossrefService);
  });

  it('returns parsed suggestions from Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"suggestions":[{"partNumber":"6203-2RSH","manufacturer":"SKF","matchReason":"Direct equivalent","keySpecs":["10mm bore","40mm OD"],"confidence":"high"}]}',
      }],
    });

    const result = await service.findEquivalents('6203-2RS', 'NSK');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].partNumber).toBe('6203-2RSH');
    expect(result.suggestions[0].confidence).toBe('high');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'crossref:6203-2RS:NSK',
      86400,
      expect.any(String),
    );
  });

  it('returns cached result without calling Claude', async () => {
    const cached = {
      suggestions: [{
        partNumber: 'CACHED-PART',
        manufacturer: 'ACME',
        matchReason: 'cached',
        keySpecs: [],
        confidence: 'high',
      }],
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.findEquivalents('6203-2RS', 'NSK');
    expect(result.suggestions[0].partNumber).toBe('CACHED-PART');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns empty suggestions on malformed Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'this is not json' }],
    });

    const result = await service.findEquivalents('OBSCURE-XYZ-999');
    expect(result.suggestions).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('uses empty string for manufacturer in cache key when not provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"suggestions":[]}' }],
    });

    await service.findEquivalents('TEST-PART');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'crossref:TEST-PART:',
      86400,
      expect.any(String),
    );
  });
});
