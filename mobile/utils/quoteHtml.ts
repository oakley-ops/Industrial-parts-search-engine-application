import { Quote, QuoteLineItem } from '../types';

function escape(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function money(n: number | string): string {
  return `$${Number(n).toFixed(2)}`;
}

function fmtDate(d: Date | string): string {
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function vendorClass(slug: string): string {
  if (slug === 'motion') return 'v-motion';
  if (slug === 'digikey') return 'v-digikey';
  return 'v-default';
}

function availLabel(avail: string): string {
  const map: Record<string, string> = {
    VENDOR_WAREHOUSE: 'In Stock',
    MANUFACTURER_ORDER: 'Order Required',
    BACKORDER: 'Backorder',
  };
  return map[avail] || avail;
}

function lineItemRow(item: QuoteLineItem): string {
  const availHtml = item.availability
    ? `<div class="sub avail">${availLabel(item.availability)}${item.leadTimeDays != null ? ` · ${item.leadTimeDays}d lead` : ''}</div>`
    : '';
  return `<tr>
    <td><div class="pn">${escape(item.partNumber)}</div>${item.vendorSku && item.vendorSku !== item.partNumber ? `<div class="sub sku">SKU: ${escape(item.vendorSku)}</div>` : ''}${availHtml}</td>
    <td>${item.description ? escape(item.description) : '<span class="muted">—</span>'}</td>
    <td><span class="vbadge ${vendorClass(item.vendorSlug)}">${escape(item.vendorName)}</span></td>
    <td class="num">${item.quantity}</td>
    <td class="num">${money(item.unitPrice)}</td>
    <td class="num bold">${money(item.totalPrice)}</td>
  </tr>`;
}

export function buildQuoteHtml(quote: Quote): string {
  const total = quote.lineItems.reduce((s, i) => s + Math.round(Number(i.totalPrice) * 100), 0) / 100;
  const earliest = quote.lineItems.length > 0
    ? quote.lineItems.reduce(
        (e, i) => (i.snapshotAt < e ? i.snapshotAt : e),
        quote.lineItems[0].snapshotAt,
      )
    : null;

  const statusClass: Record<string, string> = {
    draft: 'st-draft', sent: 'st-sent', accepted: 'st-accepted', rejected: 'st-rejected',
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #111827; font-size: 13px; line-height: 1.4; }

    .hdr { background: #0f172a; padding: 28px 32px 24px; }
    .hdr-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-icon { width: 34px; height: 34px; background: #f97316; border-radius: 5px; display: flex; align-items: center; justify-content: center; font-size: 17px; }
    .brand-name { font-size: 17px; font-weight: 800; color: #f1f5f9; }
    .brand-sub { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 1px; }
    .ref-block { text-align: right; }
    .ref-label { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; }
    .ref-val { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .hdr-bottom { display: flex; justify-content: space-between; align-items: flex-end; }
    .q-title { font-size: 22px; font-weight: 800; color: #f1f5f9; }
    .meta-row { display: flex; gap: 18px; margin-top: 8px; }
    .mlabel { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; }
    .mval { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .status { padding: 4px 10px; border-radius: 4px; font-size: 10px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; }
    .st-draft { background: #2d1a00; color: #f59e0b; }
    .st-sent { background: #1e3a5f; color: #60a5fa; }
    .st-accepted { background: #052e16; color: #22c55e; }
    .st-rejected { background: #2d0a0a; color: #f87171; }

    .body { padding: 24px 32px 32px; }
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f8fafc; }
    th { padding: 10px 12px; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; border-bottom: 2px solid #e5e7eb; text-align: left; }
    th.num, td.num { text-align: right; }
    td { padding: 11px 12px; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
    .pn { font-weight: 700; font-size: 13px; color: #111827; }
    .sub { font-size: 11px; color: #94a3b8; margin-top: 2px; }
    .sku { font-variant-numeric: tabular-nums; }
    .avail { color: #16a34a; }
    .muted { color: #9ca3af; }
    .bold { font-weight: 700; }
    .num { font-variant-numeric: tabular-nums; }
    .vbadge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 11px; font-weight: 700; }
    .v-motion { background: #fff7ed; color: #c2410c; }
    .v-digikey { background: #eff6ff; color: #1d4ed8; }
    .v-default { background: #f1f5f9; color: #475569; }
    .tfoot-row td { border-top: 2px solid #e5e7eb; border-bottom: none; padding-top: 14px; }
    .tfoot-label { font-size: 13px; font-weight: 600; color: #374151; }
    .tfoot-total { font-size: 20px; font-weight: 800; color: #f97316; font-variant-numeric: tabular-nums; }
    .footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .nlabel { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 5px; }
    .ntext { font-size: 12px; color: #374151; line-height: 1.6; }
    .snap-note { font-size: 11px; color: #9ca3af; text-align: right; white-space: nowrap; }
    .watermark { margin-top: 28px; text-align: center; font-size: 10px; color: #d1d5db; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-top">
      <div class="brand">
        <div class="brand-icon">⚙</div>
        <div>
          <div class="brand-name">Parts Finder</div>
          <div class="brand-sub">Industrial Parts Search</div>
        </div>
      </div>
      <div class="ref-block">
        <div class="ref-label">Quote Reference</div>
        <div class="ref-val">#${escape(quote.id.slice(0, 8).toUpperCase())}</div>
      </div>
    </div>
    <div class="hdr-bottom">
      <div>
        <div class="q-title">${escape(quote.title)}</div>
        <div class="meta-row">
          <div><div class="mlabel">Generated</div><div class="mval">${fmtDate(new Date())}</div></div>
          <div><div class="mlabel">Items</div><div class="mval">${quote.lineItems.length}</div></div>
          <div><div class="mlabel">Total</div><div class="mval">${money(total)}</div></div>
        </div>
      </div>
      <span class="status ${statusClass[quote.status] || 'st-draft'}">${escape(quote.status)}</span>
    </div>
  </div>

  <div class="body">
    ${quote.lineItems.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th>Part Number</th><th>Description</th><th>Vendor</th>
          <th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${quote.lineItems.map(lineItemRow).join('')}</tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="5" class="tfoot-label">Quote Total</td>
          <td class="num tfoot-total">${money(total)}</td>
        </tr>
      </tfoot>
    </table>
    ` : '<p style="color:#9ca3af;padding:16px 0">No line items in this quote.</p>'}

    <div class="footer">
      ${quote.notes ? `<div><div class="nlabel">Notes</div><div class="ntext">${escape(quote.notes)}</div></div>` : '<div></div>'}
      ${earliest ? `<div class="snap-note">Prices captured<br>as of ${fmtDate(earliest)}</div>` : ''}
    </div>
    <div class="watermark">Generated by Parts Finder · Industrial Parts Search Engine</div>
  </div>
</body>
</html>`;
}
