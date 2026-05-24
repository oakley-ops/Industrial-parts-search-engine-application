import { Quote, QuoteLineItem } from '../types';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(amount: number): string {
  return `$${Number(amount).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function lineItemRow(item: QuoteLineItem): string {
  const subLine = [
    item.availability ? escapeHtml(item.availability) : null,
    item.leadTimeDays != null
      ? `${item.leadTimeDays} day${item.leadTimeDays === 1 ? '' : 's'} lead time`
      : null,
  ].filter(Boolean).join(' · ');

  return `<tr>
    <td>${escapeHtml(item.partNumber)}${item.vendorSku ? `<br><span class="sub">${escapeHtml(item.vendorSku)}</span>` : ''}</td>
    <td>${item.description ? escapeHtml(item.description) : '—'}${subLine ? `<br><span class="sub">${subLine}</span>` : ''}</td>
    <td>${escapeHtml(item.vendorName)}</td>
    <td class="num">${item.quantity}</td>
    <td class="num">${formatCurrency(item.unitPrice)}</td>
    <td class="num">${formatCurrency(item.totalPrice)}</td>
  </tr>`;
}

export function buildQuoteHtml(quote: Quote): string {
  const total = quote.lineItems.reduce((s, i) => s + Math.round(Number(i.totalPrice) * 100), 0) / 100;
  const snapshotDate =
    quote.lineItems.length > 0
      ? formatDate(
          quote.lineItems.reduce(
            (earliest, i) => (i.snapshotAt < earliest ? i.snapshotAt : earliest),
            quote.lineItems[0].snapshotAt,
          ),
        )
      : null;

  const tableContent = quote.lineItems.length > 0 ? `<table>
    <thead>
      <tr>
        <th>Part Number</th>
        <th>Description</th>
        <th>Vendor</th>
        <th class="num">Qty</th>
        <th class="num">Unit Price</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
      ${quote.lineItems.map(lineItemRow).join('\n      ')}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5">Total</td>
        <td class="num">${formatCurrency(total)}</td>
      </tr>
    </tfoot>
  </table>` : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 24px; color: #111827; }
    .label { font-size: 11px; font-weight: 700; color: #6b7280; letter-spacing: 1px; text-transform: uppercase; }
    .title { font-size: 24px; font-weight: 800; color: #111827; margin: 4px 0 8px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background: #fef3c7; color: #92400e; }
    .date { font-size: 13px; color: #6b7280; margin-top: 6px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { background: #f3f4f6; text-align: left; padding: 10px 12px; font-size: 12px; font-weight: 700; color: #374151; }
    th.num, td.num { text-align: right; }
    td { padding: 10px 12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .sub { font-size: 11px; color: #6b7280; }
    .total-row td { border-top: 2px solid #e5e7eb; border-bottom: none; padding-top: 14px; font-size: 15px; font-weight: 800; }
    .footer { margin-top: 20px; font-size: 12px; color: #6b7280; }
    .notes { margin-top: 16px; font-size: 13px; color: #374151; border-top: 1px solid #e5e7eb; padding-top: 12px; }
  </style>
</head>
<body>
  <div class="label">Purchase Quote Request</div>
  <div class="title">${escapeHtml(quote.title)}</div>
  <span class="badge">${escapeHtml(quote.status.toUpperCase())}</span>
  <div class="date">Generated ${formatDate(new Date().toISOString())}</div>

  ${tableContent}

  ${snapshotDate ? `<div class="footer">Prices captured as of ${snapshotDate}</div>` : ''}
  ${quote.notes ? `<div class="notes"><strong>Notes:</strong> ${escapeHtml(quote.notes)}</div>` : ''}
</body>
</html>`;
}
