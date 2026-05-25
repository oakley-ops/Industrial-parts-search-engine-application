import { ConfigService } from '@nestjs/config';
import { DigiKeyService } from './digikey.service';
import axios from 'axios';

jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

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

  it('does not match partial word substrings', () => {
    expect((service as any).scoreRelevance('pi', 'Spinning Resistor')).toBe(0);
  });
});

describe('DigiKeyService.productDetailsSearch', () => {
  let service: DigiKeyService;
  beforeEach(() => {
    service = makeService();
    jest.clearAllMocks();
  });

  it('returns Products array when response has Products field', async () => {
    const products = [{ ManufacturerProductNumber: 'LM358', UnitPrice: 0.65 }];
    mockAxios.get.mockResolvedValueOnce({ data: { Products: products } });

    const result = await (service as any).productDetailsSearch('LM358', 'tok');

    expect(mockAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/LM358/productdetails'),
      expect.any(Object),
    );
    expect(result).toEqual(products);
  });

  it('wraps single Product in array when response has Product field', async () => {
    const product = { ManufacturerProductNumber: 'LM358', UnitPrice: 0.65 };
    mockAxios.get.mockResolvedValueOnce({ data: { Product: product } });

    const result = await (service as any).productDetailsSearch('LM358', 'tok');

    expect(result).toEqual([product]);
  });

  it('returns [] when response has neither Products nor Product', async () => {
    mockAxios.get.mockResolvedValueOnce({ data: {} });

    const result = await (service as any).productDetailsSearch('raspberry pi 5', 'tok');

    expect(result).toEqual([]);
  });

  it('returns [] when the request throws (e.g. 404 for non-MPN query)', async () => {
    mockAxios.get.mockRejectedValueOnce(new Error('Request failed with status code 404'));

    const result = await (service as any).productDetailsSearch('raspberry pi 5', 'tok');

    expect(result).toEqual([]);
  });
});
