import { SearchResult, PriceResult } from './scrapers/base.scraper';

const now = () => new Date().toISOString();

export const DEMO_SEARCH_RESULTS: SearchResult[] = [
  {
    vendorSlug: 'grainger', vendorName: 'Grainger',
    partNumber: 'DEMO', vendorSku: '5ZLP8', name: '6203-2RS Deep Groove Ball Bearing',
    description: 'Deep groove ball bearing, 17mm bore, 40mm OD, 12mm width, rubber sealed',
    price: 8.47, inStock: true, productUrl: 'https://www.grainger.com/product/5ZLP8',
  },
  {
    vendorSlug: 'motion', vendorName: 'Motion Industries',
    partNumber: 'DEMO', vendorSku: 'SKF-6203-2RS1', name: 'SKF 6203-2RS1 Radial Bearing',
    description: 'SKF single row deep groove ball bearing, rubber seals both sides',
    price: 9.12, inStock: true, productUrl: 'https://www.motionindustries.com/productDetail.asp?cid=skf-6203-2rs1',
  },
  {
    vendorSlug: 'mcmaster', vendorName: 'McMaster-Carr',
    partNumber: 'DEMO', vendorSku: '6383K14', name: 'Double-Sealed Miniature Ball Bearing 6203',
    description: 'Meets ABEC 3 precision rating, 17mm bore, 40mm OD',
    price: 7.90, inStock: true, productUrl: 'https://www.mcmaster.com/6383K14/',
  },
];

export const DEMO_PRICE_RESULTS: PriceResult[] = [
  {
    vendorSlug: 'grainger', vendorName: 'Grainger', vendorSku: '5ZLP8',
    price: 8.47, currency: 'USD', quantityOnHand: 142, source: 'VENDOR_WAREHOUSE',
    leadTimeDays: 1, minOrderQty: 1, unitOfMeasure: 'each',
    productUrl: 'https://www.grainger.com/product/5ZLP8', inStock: true, scrapedAt: now(),
  },
  {
    vendorSlug: 'motion', vendorName: 'Motion Industries', vendorSku: 'SKF-6203-2RS1',
    price: 9.12, currency: 'USD', quantityOnHand: 88, source: 'VENDOR_WAREHOUSE',
    leadTimeDays: 2, minOrderQty: 1, unitOfMeasure: 'each',
    productUrl: 'https://www.motionindustries.com/productDetail.asp?cid=skf-6203-2rs1', inStock: true, scrapedAt: now(),
  },
  {
    vendorSlug: 'mcmaster', vendorName: 'McMaster-Carr', vendorSku: '6383K14',
    price: 7.90, currency: 'USD', quantityOnHand: 500, source: 'VENDOR_WAREHOUSE',
    leadTimeDays: 1, minOrderQty: 1, unitOfMeasure: 'each',
    productUrl: 'https://www.mcmaster.com/6383K14/', inStock: true, scrapedAt: now(),
  },
];
