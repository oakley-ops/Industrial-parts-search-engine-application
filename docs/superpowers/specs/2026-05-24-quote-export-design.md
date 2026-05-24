# Quote Export Design

**Date:** 2026-05-24
**Status:** Approved

## Goal

Let engineers export a quote as a PDF for internal procurement approval. The user taps "Export" on a quote, previews the rendered document in-app, then shares it via the native OS share sheet (Files, email, Slack, etc.).

---

## Architecture

No backend changes. All logic lives in the mobile app.

### New files

**`mobile/utils/quoteHtml.ts`**

A single pure function:

```typescript
export function buildQuoteHtml(quote: Quote): string
```

Takes a `Quote` object (with eagerly-loaded `lineItems`) and returns a self-contained HTML string suitable for rendering in a WebView or passing to `expo-print`. Includes inline CSS — no external resources. Returns a complete `<!DOCTYPE html>` document.

**Document layout:**

- **Header block**: "Purchase Quote Request" label, quote title (large), status badge, date generated
- **Line items table**: columns — Part Number | Description | Vendor | Qty | Unit Price | Total. Each row shows `availability` and `leadTimeDays` as a sub-line when present (e.g., "In Stock · 3 days lead time")
- **Footer block**: grand total (sum of all `totalPrice` values), pricing snapshot note ("Prices captured as of [earliest snapshotAt]"), quote notes (if `quote.notes` is non-empty)

No company logo or company name (not stored in the app).

---

**`mobile/app/quote-export/[id].tsx`**

New screen. Accepts a quote `id` route param.

State:
```typescript
const [quote, setQuote] = useState<Quote | null>(null);
const [loading, setLoading] = useState(true);
const [error, setError] = useState(false);
const [sharing, setSharing] = useState(false);
```

On mount: calls `getQuote(id)`, sets `quote`. On error: sets `error = true`.

**Render:**
- Loading: full-screen `ActivityIndicator`
- Error: centered error message + "Retry" button that re-calls `getQuote(id)`
- Empty quote (0 line items): message "No items in this quote" + back button; Share button disabled
- Normal: `WebView` filling the screen rendering `buildQuoteHtml(quote)`, with a sticky bottom bar containing:
  - "← Back" left button
  - "Share PDF" right button (disabled + spinner while `sharing` is true)

**Share PDF handler:**
```typescript
const uri = await Print.printToFileAsync({ html: buildQuoteHtml(quote) });
await Sharing.shareAsync(uri.uri, {
  mimeType: 'application/pdf',
  dialogTitle: quote.title,
  UTI: 'com.adobe.pdf',
});
```

If `printToFileAsync` throws: show Alert "Could not generate PDF. Please try again." and reset `sharing` to false.

---

### Modified files

**`mobile/app/(tabs)/quotes.tsx`**

Add an "Export" icon button to each quote card. Tapping it navigates to `/quote-export/[id]`.

The existing card row has a delete button on the right. Add the export button to the left of the delete button:

```
[Quote title]                    [Export icon]  [Delete icon]
[N items · $XXX.XX · DRAFT]
```

Use `router.push(\`/quote-export/\${quote.id}\`)` for navigation.

---

## Data Flow

```
Quotes list
  → tap Export on quote card
  → navigate to /quote-export/[id]
  → getQuote(id) fetches full quote with lineItems
  → buildQuoteHtml(quote) generates HTML string
  → WebView renders HTML as in-app preview
  → tap "Share PDF"
  → Print.printToFileAsync(html) → temp file URI
  → Sharing.shareAsync(uri) → OS share sheet
```

---

## Dependencies

Add to `mobile/package.json`:
- `expo-print` — HTML-to-PDF conversion and file generation
- `expo-sharing` — native OS share sheet
- `react-native-webview` — in-app HTML preview

Check: `grep "expo-print\|expo-sharing\|react-native-webview" mobile/package.json`

`react-native-webview` requires adding `"react-native-webview"` to the `plugins` array in `app.json`.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| `getQuote` network error | Error state — centered message + Retry button |
| Quote has 0 line items | Warning message shown; Share PDF button disabled |
| `printToFileAsync` throws | Alert: "Could not generate PDF. Please try again." |
| `shareAsync` fails / user cancels | OS handles cancellation — no action needed |

---

## Testing

**Unit tests (`mobile/utils/quoteHtml.test.ts`):**
- Output is a valid HTML string (contains `<!DOCTYPE html>`)
- All line items appear in output (partNumber, vendorName, quantity, unitPrice, totalPrice)
- Grand total equals sum of all line items' totalPrice
- Availability and leadTimeDays appear when present
- Quote notes appear when non-empty; absent when empty/null
- Empty lineItems array produces no table rows

**Manual tests:**
- Tap Export on a quote with multiple items → preview screen opens with correct data
- All line items, prices, and grand total display correctly in preview
- Tap Share PDF → OS share sheet appears → save to Files → verify PDF matches preview
- Tap Export on a quote with 0 items → "No items" message shown, Share PDF disabled
- Kill network after opening app, tap Export → error state with Retry button shown
- Retry after restoring network → loads correctly

---

## What This Is Not

- No company branding / logo support
- No per-item notes or comments
- No quote versioning or revision tracking
- No direct email send (uses OS share sheet — user picks email client if desired)
- No quote status update on export (status remains 'draft' unless changed separately)
