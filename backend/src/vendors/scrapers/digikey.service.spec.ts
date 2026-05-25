import { ConfigService } from '@nestjs/config';
import { DigiKeyService } from './digikey.service';

function makeService() {
  const config = {
    get: jest.fn((key: string, def = '') => def),
  } as unknown as ConfigService;
  return new DigiKeyService(config);
}

describe('DigiKeyService.scoreRelevance', () => {
  let service: DigiKeyService;
  beforeEach(() => { service = makeService(); });

  it('returns 0 when no query words appear in name', () => {
    expect((service as any).scoreRelevance('lm358', 'ATmega328P')).toBe(0);
  });

  it('returns 1 when one query word appears in name', () => {
    expect((service as any).scoreRelevance('lm358', 'Texas Instruments LM358')).toBe(1);
  });

  it('counts matching words from a multi-word query', () => {
    expect((service as any).scoreRelevance('raspberry pi 5', 'Raspberry Pi SC1112')).toBe(2);
  });

  it('is case-insensitive', () => {
    expect((service as any).scoreRelevance('RASPBERRY PI', 'raspberry pi sc1112')).toBe(2);
  });

  it('returns 3 when all three words match', () => {
    expect((service as any).scoreRelevance('raspberry pi 5', 'Raspberry Pi 5 Board')).toBe(3);
  });
});
