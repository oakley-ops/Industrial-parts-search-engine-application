import { buildQuoteHtml } from './quoteHtml';
import { Quote } from '../types';

const baseItem = {
  id: 'li1',
  vendorSlug: 'grainger',
  vendorName: 'Grainger',
  quantity: 2,
  unitPrice: 45.50,
  totalPrice: 91.00,
  snapshotAt: '2026-05-24T09:00:00.000Z',
};

const mockQuote: Quote = {
  id: 'q1',
  title: 'Pump Rebuild Q3',
  status: 'draft',
  notes: 'Urgent — needed by end of quarter',
  createdAt: '2026-05-24T10:00:00.000Z',
  updatedAt: '2026-05-24T10:00:00.000Z',
  lineItems: [
    {
      ...baseItem,
      id: 'li1',
      partNumber: '3RX8000-0AA00',
      description: 'Surge protection filter',
      vendorSku: 'GRG-001',
      availability: 'In Stock',
      leadTimeDays: 2,
    },
    {
      ...baseItem,
      id: 'li2',
      partNumber: '6ES7215-1AG40',
      vendorName: 'Motion Industries',
      vendorSlug: 'motion',
      description: 'CPU module',
      quantity: 1,
      unitPrice: 320.00,
      totalPrice: 320.00,
      snapshotAt: '2026-05-23T15:00:00.000Z',
    },
  ],
};

describe('buildQuoteHtml', () => {
  it('returns a valid HTML document', () => {
    const html = buildQuoteHtml(mockQuote);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes all part numbers', () => {
    const html = buildQuoteHtml(mockQuote);
    expect(html).toContain('3RX8000-0AA00');
    expect(html).toContain('6ES7215-1AG40');
  });

  it('shows correct grand total', () => {
    const html = buildQuoteHtml(mockQuote);
    expect(html).toContain('$411.00');
  });

  it('includes availability and lead time when present', () => {
    const html = buildQuoteHtml(mockQuote);
    expect(html).toContain('In Stock');
    expect(html).toContain('2 days lead time');
  });

  it('includes quote notes when non-empty', () => {
    const html = buildQuoteHtml(mockQuote);
    expect(html).toContain('Urgent — needed by end of quarter');
  });

  it('omits notes section when notes is null', () => {
    const q: Quote = { ...mockQuote, notes: undefined };
    const html = buildQuoteHtml(q);
    expect(html).not.toContain('Notes:');
  });

  it('produces no table rows when lineItems is empty', () => {
    const q: Quote = { ...mockQuote, lineItems: [] };
    const html = buildQuoteHtml(q);
    expect(html).not.toContain('<tr>');
  });
});
