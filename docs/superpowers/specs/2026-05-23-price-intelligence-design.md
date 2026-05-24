# Price Intelligence Design

**Date:** 2026-05-23
**Status:** Approved

## Goal

When an engineer is viewing a part's vendor prices, they can tap "Analyze Prices" to get a single Claude-generated directive — "Buy at Grainger now" or "Consider cross-referencing — all vendors are priced above typical" — with a confidence level based on how well Claude knows the part type.

---

## Architecture

### Backend: `price-intel` NestJS Module

**New files:**
- `backend/src/price-intel/price-intel.module.ts`
- `backend/src/price-intel/price-intel.controller.ts`
- `backend/src/price-intel/price-intel.service.ts`

**Endpoint:**
```
POST /api/v1/price-intel
```

Requires `JwtAuthGuard`.

**Request body:**
```json
{
  "partNumber": "6203-2RS",
  "description": "deep groove ball bearing",
  "prices": [
    { "vendorName": "Grainger", "price": 4.50, "source": "VENDOR_WAREHOUSE" },
    { "vendorName": "McMaster-Carr", "price": 6.20, "source": "VENDOR_WAREHOUSE" }
  ]
}
```

`description` is optional. `prices` contains only vendorName, price (number), and source — no URLs or SKUs.

**DTO:**
```typescript
class PriceEntryDto {
  @IsString() @IsNotEmpty() vendorName: string;
  @IsNumber() price: number;
  @IsString() source: string;
}

class PriceIntelDto {
  @IsString() @IsNotEmpty() partNumber: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceEntryDto) prices: PriceEntryDto[];
}
```

**Response:**
```json
{
  "recommendation": "Buy at Grainger now — $4.50 is at the low end of the typical range for a 6203-2RS bearing.",
  "confidence": "high"
}
```

`confidence` is `"high" | "medium" | "low"` — set by Claude based on how well it knows the part type.

**Claude system prompt:**
```
You are a price intelligence assistant for industrial maintenance engineers.
You will be given a part number, optional description, and current prices from industrial distributors.
Using your knowledge of industrial parts pricing, assess whether these prices are fair, high, or low relative to typical market rates.

Respond ONLY with valid JSON:
{
  "recommendation": "one clear directive sentence — e.g. 'Buy at [vendor] now — [price] is [assessment] for [part type]' or 'Consider cross-referencing — all vendors are priced above typical for this part'",
  "confidence": "high | medium | low"
}

Confidence guidelines:
- "high": common commodity parts (bearings, motors, belts, seals) where you have strong market knowledge
- "medium": recognizable part type but limited pricing data
- "low": obscure OEM parts, proprietary components, or parts you cannot identify

RULES:
- Never invent a price range you are not confident about
- If confidence is low, say so in the recommendation (e.g. "Limited market data — prices appear reasonable but verify before large orders")
- Name the best-value vendor in the recommendation when confidence is high or medium
- Keep the recommendation to one sentence
- Always respond with valid JSON only — no markdown, no explanation outside the JSON
```

**Caching:** Redis key `price-intel:{partNumber}` (partNumber lowercased). TTL: 86400s (24 hours). On Redis unavailability, fail open — call Claude directly without caching.

**Error handling:**
- Claude parse failure → return `{ recommendation: "Could not analyze prices for this part.", confidence: "low" }`, HTTP 200
- Empty prices array → return `{ recommendation: "No prices available to analyze.", confidence: "low" }`, HTTP 200
- DB/auth failure → standard NestJS exception handling (4xx/5xx)

**Module wiring:** `PriceIntelModule` imports `ConfigModule` (for Anthropic key) and the existing global Redis provider. Registered in `AppModule`.

---

### Mobile

**New type in `mobile/types/index.ts`:**
```typescript
export interface PriceIntelResult {
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}
```

**New API function in `mobile/services/api.ts`:**
```typescript
export const analyzePrices = async (
  partNumber: string,
  description: string | undefined,
  prices: { vendorName: string; price: number; source: string }[]
): Promise<PriceIntelResult> => {
  const { data } = await api.post('/price-intel', { partNumber, description, prices });
  return data as PriceIntelResult;
};
```

**Changes to `mobile/app/part/[id].tsx`:**

Add `priceIntel` state:
```typescript
const [priceIntel, setPriceIntel] = useState<PriceIntelResult | null>(null);
const [analyzingPrices, setAnalyzingPrices] = useState(false);
```

Add `handleAnalyzePrices` function:
```typescript
const handleAnalyzePrices = async () => {
  setAnalyzingPrices(true);
  try {
    const validPrices = prices
      .filter(p => p.price !== null)
      .map(p => ({ vendorName: p.vendorName, price: p.price!, source: p.source }));
    const result = await analyzePrices(partNumber, description, validPrices);
    setPriceIntel(result);
  } catch {
    Alert.alert('Error', 'Could not analyze prices');
  } finally {
    setAnalyzingPrices(false);
  }
};
```

The button renders below the vendor card list, only when prices have finished loading and at least one vendor returned a non-null price:

```
[ Before tap ]
┌─────────────────────────────────────┐
│  💡 Analyze Prices                  │
└─────────────────────────────────────┘

[ Loading ]
┌─────────────────────────────────────┐
│  ⏳ Analyzing prices...             │
└─────────────────────────────────────┘

[ Result ]
┌─────────────────────────────────────┐
│  ● Buy at Grainger now              │
│  $4.50 is at the low end of the    │
│  typical range for a 6203-2RS      │
│  bearing.              High conf    │
└─────────────────────────────────────┘
```

Confidence dot color: green (high), amber (medium), grey (low) — same convention as `crossref.tsx`.

The button is hidden while vendor prices are still loading (`pricesLoading === true`) and hidden if all vendors returned null prices. Once a result is shown, the button disappears and the result card is permanent for the session.

---

## Data Flow

```
User taps "Analyze Prices"
  → mobile filters prices to non-null entries
  → POST /api/v1/price-intel { partNumber, description?, prices }
  → Redis cache check (key: price-intel:{partNumber})
      hit  → return cached result (~5ms)
      miss → Claude call (~3–5s) → cache 24h → return
  → Mobile renders recommendation text + confidence dot
```

---

## Testing

**Backend unit tests:**
- Mock Anthropic, assert prompt includes part number, prices, and description
- Assert `"high"` confidence response is parsed and returned correctly
- Assert malformed Claude response returns fallback `{ recommendation: "Could not analyze...", confidence: "low" }`
- Assert empty prices array returns early without calling Claude

**Backend integration test:**
- POST `/api/v1/price-intel` with `{ partNumber: "6203-2RS", prices: [{ vendorName: "Grainger", price: 4.50, source: "VENDOR_WAREHOUSE" }] }`, assert 200 + `{ recommendation, confidence }` shape

**Mobile manual test:**
- Open a part with live prices → verify "Analyze Prices" button appears after prices load
- Tap button → verify loading state → verify recommendation and confidence dot appear
- Confidence dot green for high, amber for medium, grey for low
- Open same part again → verify Redis cache returns result instantly

---

## What This Is Not

- No price history tracking — this is Claude's training knowledge, not scraped historical data
- No price alerts or subscriptions
- No per-vendor breakdown — one directive sentence covers all vendors
- No automatic triggering — always on-demand
