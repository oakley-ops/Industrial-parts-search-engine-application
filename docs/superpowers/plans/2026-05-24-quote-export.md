# Quote Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let engineers preview a quote as a PDF inside the app and share it via the native OS share sheet for internal procurement approval.

**Architecture:** Mobile-only — no backend changes. A pure `buildQuoteHtml(quote)` utility generates the HTML string. A new `/quote-export/[id]` screen fetches the quote, renders the HTML in a WebView as a preview, and uses `expo-print` + `expo-sharing` to generate and share the PDF. The quotes list gets an Export icon button that navigates to this screen.

**Tech Stack:** `expo-print`, `expo-sharing`, `react-native-webview`, Jest + ts-jest (already configured)

---

### Task 1: Install dependencies

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`

- [ ] **Step 1: Install expo-print, expo-sharing, react-native-webview**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx expo install expo-print expo-sharing react-native-webview
```

Expected: packages added to `node_modules` and `package.json` dependencies updated.

- [ ] **Step 2: Verify no TypeScript errors from new packages**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors (warnings about unresolved modules are OK at this stage).

- [ ] **Step 3: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add mobile/package.json mobile/package-lock.json
git commit -m "chore: install expo-print, expo-sharing, react-native-webview"
```

---

### Task 2: buildQuoteHtml utility (TDD)

**Files:**
- Create: `mobile/utils/quoteHtml.test.ts`
- Create: `mobile/utils/quoteHtml.ts`

- [ ] **Step 1: Write failing tests**

Create `mobile/utils/quoteHtml.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx jest utils/quoteHtml.test.ts
```

Expected: FAIL — `Cannot find module './quoteHtml'`

- [ ] **Step 3: Implement quoteHtml.ts**

Create `mobile/utils/quoteHtml.ts`:

```typescript
import { Quote, QuoteLineItem } from '../types';

function formatCurrency(amount: number): string {
  return `$${Number(amount).toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function lineItemRow(item: QuoteLineItem): string {
  const subLine = [
    item.availability,
    item.leadTimeDays != null
      ? `${item.leadTimeDays} day${item.leadTimeDays === 1 ? '' : 's'} lead time`
      : null,
  ].filter(Boolean).join(' · ');

  return `<tr>
    <td>${item.partNumber}${item.vendorSku ? `<br><span class="sub">${item.vendorSku}</span>` : ''}</td>
    <td>${item.description || '—'}${subLine ? `<br><span class="sub">${subLine}</span>` : ''}</td>
    <td>${item.vendorName}</td>
    <td class="num">${item.quantity}</td>
    <td class="num">${formatCurrency(item.unitPrice)}</td>
    <td class="num">${formatCurrency(item.totalPrice)}</td>
  </tr>`;
}

export function buildQuoteHtml(quote: Quote): string {
  const total = quote.lineItems.reduce((s, i) => s + Number(i.totalPrice), 0);
  const snapshotDate =
    quote.lineItems.length > 0
      ? formatDate(
          quote.lineItems.reduce(
            (earliest, i) => (i.snapshotAt < earliest ? i.snapshotAt : earliest),
            quote.lineItems[0].snapshotAt,
          ),
        )
      : null;

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
  <div class="title">${quote.title}</div>
  <span class="badge">${quote.status.toUpperCase()}</span>
  <div class="date">Generated ${formatDate(new Date().toISOString())}</div>

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
    <tbody>
      ${quote.lineItems.map(lineItemRow).join('\n      ')}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="5">Total</td>
        <td class="num">${formatCurrency(total)}</td>
      </tr>
    </tfoot>
  </table>

  ${snapshotDate ? `<div class="footer">Prices captured as of ${snapshotDate}</div>` : ''}
  ${quote.notes ? `<div class="notes"><strong>Notes:</strong> ${quote.notes}</div>` : ''}
</body>
</html>`;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx jest utils/quoteHtml.test.ts
```

Expected:
```
PASS utils/quoteHtml.test.ts
  buildQuoteHtml
    ✓ returns a valid HTML document
    ✓ includes all part numbers
    ✓ shows correct grand total
    ✓ includes availability and lead time when present
    ✓ includes quote notes when non-empty
    ✓ omits notes section when notes is null
    ✓ produces no table rows when lineItems is empty

Tests: 7 passed, 7 total
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add mobile/utils/quoteHtml.ts mobile/utils/quoteHtml.test.ts
git commit -m "feat: add buildQuoteHtml utility with tests"
```

---

### Task 3: Quote export screen

**Files:**
- Create: `mobile/app/quote-export/[id].tsx`

- [ ] **Step 1: Create the quote-export directory**

```bash
mkdir -p "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile/app/quote-export"
```

- [ ] **Step 2: Create the screen**

Create `mobile/app/quote-export/[id].tsx`:

```typescript
import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { getQuote } from '../../services/api';
import { Quote } from '../../types';
import { buildQuoteHtml } from '../../utils/quoteHtml';

export default function QuoteExportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { load(); }, [id]);

  const load = async () => {
    setLoading(true);
    setError(false);
    try {
      setQuote(await getQuote(id));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (!quote) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: buildQuoteHtml(quote) });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        dialogTitle: quote.title,
        UTI: 'com.adobe.pdf',
      });
    } catch {
      Alert.alert('Export Failed', 'Could not generate PDF. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Could not load quote.</Text>
        <TouchableOpacity style={s.retryBtn} onPress={load}>
          <Text style={s.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!quote || quote.lineItems.length === 0) {
    return (
      <View style={s.center}>
        <Text style={{ fontSize: 48 }}>📋</Text>
        <Text style={s.emptyText}>No items in this quote</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={s.backLinkText}>← Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <WebView
        originWhitelist={['*']}
        source={{ html: buildQuoteHtml(quote) }}
        style={{ flex: 1 }}
      />
      <View style={s.bar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.shareBtn, sharing && s.shareBtnDisabled]}
          onPress={handleShare}
          disabled={sharing}
        >
          {sharing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.shareBtnText}>Share PDF</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f9fafb', gap: 12 },
  bar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff',
  },
  backBtn: { padding: 10 },
  backBtnText: { color: '#1e40af', fontSize: 15, fontWeight: '600' },
  shareBtn: { backgroundColor: '#1e40af', borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  errorText: { fontSize: 16, color: '#374151' },
  retryBtn: { borderWidth: 1, borderColor: '#1e40af', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: '#1e40af', fontWeight: '600' },
  emptyText: { fontSize: 16, color: '#374151' },
  backLinkText: { color: '#1e40af', fontSize: 15, fontWeight: '600' },
});
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add "mobile/app/quote-export/[id].tsx"
git commit -m "feat: add quote export preview screen"
```

---

### Task 4: Add Export button to quotes list

**Files:**
- Modify: `mobile/app/(tabs)/quotes.tsx`

The current file imports from `expo-router`: `useFocusEffect`. The `router` object for navigation is not yet imported.

- [ ] **Step 1: Add router import**

Open `mobile/app/(tabs)/quotes.tsx`. Find line 3:
```typescript
import { useFocusEffect } from 'expo-router';
```

Change to:
```typescript
import { useFocusEffect, router } from 'expo-router';
```

- [ ] **Step 2: Replace the card header row**

Find the card header row (lines 53–58 in the current file):
```typescript
<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
  <Text style={s.cardTitle}>{item.title}</Text>
  <TouchableOpacity onPress={() => handleDelete(item.id, item.title)}>
    <Ionicons name="trash-outline" size={18} color="#ef4444" />
  </TouchableOpacity>
</View>
```

Replace with:
```typescript
<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
  <Text style={s.cardTitle}>{item.title}</Text>
  <View style={{ flexDirection: 'row', gap: 12 }}>
    <TouchableOpacity onPress={() => router.push(`/quote-export/${item.id}`)}>
      <Ionicons name="share-outline" size={18} color="#1e40af" />
    </TouchableOpacity>
    <TouchableOpacity onPress={() => handleDelete(item.id, item.title)}>
      <Ionicons name="trash-outline" size={18} color="#ef4444" />
    </TouchableOpacity>
  </View>
</View>
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add "mobile/app/(tabs)/quotes.tsx"
git commit -m "feat: add export button to quotes list"
```

---

### Task 5: Run all tests and push

- [ ] **Step 1: Run all tests**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx jest
```

Expected:
```
PASS utils/geo.test.ts
PASS utils/quoteHtml.test.ts

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
```

- [ ] **Step 2: Push to GitHub**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git push origin main
```

- [ ] **Step 3: Manual test checklist**

On a device:
- [ ] Quotes tab shows Export icon (share icon, blue) to the left of the delete icon on each quote card
- [ ] Tap Export on a quote with items → preview screen opens showing the quote as a styled HTML document
- [ ] All part numbers, vendors, quantities, prices, and grand total display correctly
- [ ] Tap "Share PDF" → loading spinner shows → OS share sheet appears
- [ ] Save to Files → PDF file appears and matches the preview
- [ ] Tap Export on a quote with 0 items → "No items in this quote" + Back link shown; no Share PDF button
- [ ] Kill network, tap Export → "Could not load quote." + Retry button shown
- [ ] Restore network, tap Retry → quote loads correctly
