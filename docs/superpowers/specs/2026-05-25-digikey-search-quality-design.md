# DigiKey Search Quality Improvements — Design Spec

## Goal

Improve DigiKey search result relevance by running a dual-fetch strategy (keyword search + product details lookup in parallel) and applying query-term relevance scoring to the merged results.

## Background

DigiKey's keyword search API (`/products/v4/search/keyword`) ranks results by internal metrics (purchase volume, catalog position) that don't match user intent. For descriptive queries like "raspberry pi 5", cheap accessories ($1–$15) appear before the actual board ($60+). For part number queries like "LM358", the exact component is often buried behind similar parts.

DigiKey also exposes a product details endpoint (`/products/v4/search/{partNumber}/productdetails`) that performs exact/partial MPN matching. Running both in parallel and merging the results covers both search styles.

## Scope

**In scope:**
- `backend/src/vendors/scrapers/digikey.service.ts` — all changes live here

**Out of scope:**
- No changes to `vendors.service.ts`, `vendors.module.ts`, the SSE stream, Redis cache keys, or the mobile app
- No second vendor (Mouser requires IP whitelisting; Arrow/Newark deferred)

## Architecture

### Dual Fetch

`DigiKeyService.search()` fires two API calls in parallel using the same cached OAuth token:

1. **Keyword search** — `POST /products/v4/search/keyword`
   - `Keywords: query, RecordCount: 50, Sort: { SortOption: 'SortByUnitPrice', Direction: 'Descending' }`
   - Catches broad/descriptive queries

2. **Product details lookup** — `GET /products/v4/search/{encodedQuery}/productdetails`
   - Catches exact and partial MPN queries (e.g. "LM358", "SC1112", "ATmega328P")
   - Returns empty or errors gracefully if the query is not a valid MPN

### Merge and Deduplicate

Results from both calls are combined and deduplicated by `ManufacturerProductNumber`. Product details results are prepended (more exact), keyword results appended.

### Relevance Scoring

Each merged result receives a score equal to the number of query words (lowercased, split on whitespace) that appear anywhere in the product name (lowercased). Results are sorted by score descending, then price descending within the same score tier.

```
score("raspberry pi 5", "Raspberry Pi SC1112") = 2  ("raspberry", "pi" match; "5" does not)
score("raspberry pi 5", "Raspberry Pi SC1892") = 2  (same)
score("LM358",          "Texas Instruments LM358") = 1
```

Note: "5" alone won't distinguish SC1112 from other Pi accessories since most names don't include the digit. This scoring helps more for multi-word queries where some accessories lack one of the terms.

### Interface Change

`DkProductDetailsResponse` interface added to model the productdetails response:

```typescript
interface DkProductDetailsVariation {
  DigiKeyProductNumber: string;
  QuantityAvailableforPackageType: number;
  MinimumOrderQuantity: number;
  PackageType: { Id: number; Name: string };
  StandardPricing: { BreakQuantity: number; UnitPrice: number }[];
}

interface DkProductDetailsProduct {
  ManufacturerProductNumber: string;
  DigiKeyPartNumber: string;
  Manufacturer: { Name: string };
  Description: { ProductDescription: string; DetailedDescription: string };
  QuantityAvailable: number;
  UnitPrice: number;
  ProductUrl: string;
  PrimaryPhoto: string;
  ProductVariations: DkProductDetailsVariation[];
}

interface DkProductDetailsResponse {
  Product: DkProductDetailsProduct;
}
```

## Data Flow

```
search(query)
      │
      ├──► POST /keyword (50 results, price-sorted)
      │
      └──► GET /productdetails/{query}
                                        │
                                        ▼
                             merge: productdetails first, keyword appended
                             dedup: by ManufacturerProductNumber
                                        │
                                        ▼
                             score each result by query-word matches in name
                             sort: score↓ then price↓
                                        │
                                        ▼
                             return results (≤ 50)
```

## Error Handling

| Scenario | Behavior |
|---|---|
| Product details returns 404 / empty | Use keyword results only, no error surfaced |
| Keyword search fails | Use product details results only |
| Both fail | Return `[]`, log error |
| DigiKey rate-limits | Caught by existing try/catch, returns `[]` |

## Known Limitations

- "raspberry pi 5" → actual Pi 5 board (SC1112): DigiKey's keyword API does not surface SC1112 for this query. Users searching by description for consumer SBCs will not see the board. The fix requires a second vendor (Arrow, Newark) — deferred.
- Product details endpoint may return a 404 for non-MPN queries. This is handled gracefully.

## Testing

- Search "LM358" → exact LM358 entries appear first
- Search "raspberry pi 5" → results are ordered with higher-scoring name matches first; no $1 accessories at top
- Search "SC1112" → Raspberry Pi 5 board appears as first result (via product details endpoint)
- Search with backend DigiKey credentials removed → returns `[]` without error

## Success Criteria

- Part number searches (e.g. "LM358", "ATmega328P") return exact matches as the first result
- Descriptive searches return results with better name-to-query alignment than before
- No regression in existing search behavior (other vendors unaffected)
