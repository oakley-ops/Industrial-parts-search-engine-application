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

describe('DigiKeyService.search', () => {
  let service: DigiKeyService;

  const makeProduct = (mpn: string, price: number, manufacturerName = 'Acme'): any => ({
    ManufacturerProductNumber: mpn,
    DigiKeyPartNumber: `DK-${mpn}`,
    Manufacturer: { Name: manufacturerName },
    Description: { ProductDescription: 'desc', DetailedDescription: 'detail' },
    QuantityAvailable: 10,
    UnitPrice: price,
    ProductUrl: `https://digikey.com/${mpn}`,
    ManufacturerLeadWeeks: '',
    MinimumOrderQuantity: 1,
    PrimaryPhoto: '',
  });

  beforeEach(() => {
    service = makeService();
    jest.clearAllMocks();
    jest.spyOn(service as any, 'getToken').mockResolvedValue('test-token');
    jest.spyOn(service as any, 'productDetailsSearch').mockResolvedValue([]);
  });

  it('returns [] when clientId is missing', async () => {
    const result = await service.search('lm358');
    expect(result).toEqual([]);
  });

  it('deduplicates products with same ManufacturerProductNumber across both sources', async () => {
    const p1 = makeProduct('LM358', 0.65);
    const p2 = makeProduct('LM741', 1.00);

    mockAxios.post.mockResolvedValueOnce({ data: { Products: [p1, p2] } });
    jest.spyOn(service as any, 'productDetailsSearch').mockResolvedValue([p1]);
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('LM358');

    const mpns = result.map(r => r.name.split(' ')[1]);
    expect(mpns.filter(m => m === 'LM358')).toHaveLength(1);
  });

  it('places product details results before keyword results when score is equal', async () => {
    const detailsProduct = makeProduct('SC1112', 10.00, 'Raspberry Pi');
    const keywordProduct = makeProduct('SC1892', 10.00, 'Raspberry Pi');

    mockAxios.post.mockResolvedValueOnce({ data: { Products: [keywordProduct] } });
    jest.spyOn(service as any, 'productDetailsSearch').mockResolvedValue([detailsProduct]);
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('SC1112');

    expect(result[0].vendorSku).toBe('DK-SC1112');
  });

  it('sorts by score descending then price descending within same score', async () => {
    const cheap = makeProduct('SC1892', 1.00, 'Raspberry Pi');
    const expensive = makeProduct('SC1112', 60.00, 'Raspberry Pi');

    mockAxios.post.mockResolvedValueOnce({ data: { Products: [cheap, expensive] } });
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('raspberry pi');

    expect(result[0].price).toBe(60.00);
    expect(result[1].price).toBe(1.00);
  });

  it('returns [] and logs error when keyword call throws', async () => {
    mockAxios.post.mockRejectedValueOnce(new Error('network error'));
    jest.spyOn(service as any, 'clientId', 'get').mockReturnValue('id');
    jest.spyOn(service as any, 'clientSecret', 'get').mockReturnValue('secret');

    const result = await service.search('LM358');

    expect(result).toEqual([]);
  });
});
