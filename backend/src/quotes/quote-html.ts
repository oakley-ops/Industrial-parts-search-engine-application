import { Quote } from './entities/quote.entity';

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

function availClass(avail: string): string {
  return avail === 'VENDOR_WAREHOUSE' ? 'avail-stock' : 'avail-order';
}

function availLabel(avail: string): string {
  const map: Record<string, string> = {
    VENDOR_WAREHOUSE: 'In Stock',
    MANUFACTURER_ORDER: 'Order Required',
    BACKORDER: 'Backorder',
  };
  return map[avail] || avail;
}

export function buildQuoteHtml(quote: Quote): string {
  const total = quote.lineItems.reduce((s, i) => s + Math.round(Number(i.totalPrice) * 100), 0) / 100;
  const earliest = quote.lineItems.length > 0
    ? quote.lineItems.reduce((e, i) => (i.snapshotAt < e ? i.snapshotAt : e), quote.lineItems[0].snapshotAt)
    : null;

  const rows = quote.lineItems.map(item => `
    <tr>
      <td>
        <div class="pn">${escape(item.partNumber)}</div>
        ${item.vendorSku && item.vendorSku !== item.partNumber ? `<div class="sub">SKU: ${escape(item.vendorSku)}</div>` : ''}
      </td>
      <td>${item.description ? escape(item.description) : '<span class="muted">—</span>'}</td>
      <td><span class="vbadge ${vendorClass(item.vendorSlug)}">${escape(item.vendorName)}</span></td>
      <td class="num">${item.quantity}</td>
      <td class="num">${money(item.unitPrice)}</td>
      <td class="num bold">${money(item.totalPrice)}</td>
    </tr>
    ${item.availability ? `<tr class="sub-row"><td colspan="2"><span class="avail ${availClass(item.availability)}">${availLabel(item.availability)}</span>${item.leadTimeDays != null ? ` · <span class="muted">${item.leadTimeDays}d lead time</span>` : ''}</td><td colspan="4"></td></tr>` : ''}
  `).join('');

  const statusClass: Record<string, string> = { draft: 'st-draft', sent: 'st-sent', accepted: 'st-accepted', rejected: 'st-rejected' };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #111827; font-size: 13px; line-height: 1.4; }

    /* ── Header ── */
    .hdr { background: #0f172a; padding: 28px 36px 24px; }
    .hdr-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .brand { display: flex; align-items: center; gap: 10px; }
    .brand-icon { width: 36px; height: 36px; background: #f97316; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
    .brand-name { font-size: 18px; font-weight: 800; color: #f1f5f9; letter-spacing: -0.3px; }
    .brand-sub { font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-top: 1px; }
    .ref-block { text-align: right; }
    .ref-label { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; }
    .ref-val { font-size: 13px; color: #94a3b8; font-variant-numeric: tabular-nums; margin-top: 2px; }
    .hdr-bottom { display: flex; justify-content: space-between; align-items: flex-end; }
    .q-title { font-size: 24px; font-weight: 800; color: #f1f5f9; letter-spacing: -0.5px; }
    .meta-row { display: flex; gap: 20px; margin-top: 8px; }
    .meta-item .mlabel { font-size: 10px; color: #475569; text-transform: uppercase; letter-spacing: 0.8px; }
    .meta-item .mval { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .status { padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; }
    .st-draft { background: #2d1a00; color: #f59e0b; }
    .st-sent { background: #1e3a5f; color: #60a5fa; }
    .st-accepted { background: #052e16; color: #22c55e; }
    .st-rejected { background: #2d0a0a; color: #f87171; }

    /* ── Body ── */
    .body { padding: 28px 36px 36px; }

    /* ── Table ── */
    table { width: 100%; border-collapse: collapse; }
    thead tr { background: #f8fafc; }
    th { padding: 10px 12px; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.6px; border-bottom: 2px solid #e5e7eb; text-align: left; }
    th.num, td.num { text-align: right; }
    td { padding: 12px; vertical-align: top; border-bottom: 1px solid #f3f4f6; }
    tbody tr.sub-row td { padding-top: 0; padding-bottom: 10px; border-bottom: none; }
    tbody tr:nth-child(4n+1) { background: #fafafa; }

    .pn { font-weight: 700; font-size: 13px; color: #111827; }
    .sub { font-size: 11px; color: #94a3b8; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .muted { color: #9ca3af; }
    .bold { font-weight: 700; }
    .num { font-variant-numeric: tabular-nums; }

    .vbadge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 11px; font-weight: 700; }
    .v-motion { background: #fff7ed; color: #c2410c; }
    .v-digikey { background: #eff6ff; color: #1d4ed8; }
    .v-default { background: #f1f5f9; color: #475569; }

    .avail { font-size: 11px; font-weight: 600; }
    .avail-stock { color: #16a34a; }
    .avail-order { color: #d97706; }

    /* ── Total row ── */
    .tfoot-row td { border-top: 2px solid #e5e7eb; border-bottom: none; padding-top: 14px; }
    .tfoot-label { font-size: 13px; font-weight: 600; color: #374151; }
    .tfoot-total { font-size: 22px; font-weight: 800; color: #f97316; font-variant-numeric: tabular-nums; }

    /* ── Footer ── */
    .footer { margin-top: 28px; padding-top: 18px; border-top: 1px solid #f3f4f6; display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
    .notes-block .nlabel { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px; }
    .notes-block .ntext { font-size: 12px; color: #374151; line-height: 1.6; }
    .snap-note { font-size: 11px; color: #9ca3af; text-align: right; white-space: nowrap; }
    .watermark { margin-top: 32px; text-align: center; font-size: 10px; color: #d1d5db; letter-spacing: 1px; text-transform: uppercase; }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="hdr-top">
      <div class="brand">
        <div class="brand-icon">⚙</div>
        <div>
          <div class="brand-name">Parts Finder</div>
          <div class="brand-sub">Industrial Parts Search Engine</div>
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
          <div class="meta-item">
            <div class="mlabel">Generated</div>
            <div class="mval">${fmtDate(new Date())}</div>
          </div>
          <div class="meta-item">
            <div class="mlabel">Items</div>
            <div class="mval">${quote.lineItems.length}</div>
          </div>
          <div class="meta-item">
            <div class="mlabel">Total</div>
            <div class="mval">${money(total)}</div>
          </div>
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
          <th>Part Number</th>
          <th>Description</th>
          <th>Vendor</th>
          <th class="num">Qty</th>
          <th class="num">Unit Price</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="tfoot-row">
          <td colspan="5" class="tfoot-label">Quote Total</td>
          <td class="num tfoot-total">${money(total)}</td>
        </tr>
      </tfoot>
    </table>
    ` : '<p style="color:#9ca3af;padding:20px 0">No line items in this quote.</p>'}

    <div class="footer">
      ${quote.notes ? `<div class="notes-block"><div class="nlabel">Notes</div><div class="ntext">${escape(quote.notes)}</div></div>` : '<div></div>'}
      ${earliest ? `<div class="snap-note">Prices captured as of<br>${fmtDate(earliest)}</div>` : ''}
    </div>
    <div class="watermark">Generated by Parts Finder · Industrial Parts Search Engine</div>
  </div>
</body>
</html>`;
}
