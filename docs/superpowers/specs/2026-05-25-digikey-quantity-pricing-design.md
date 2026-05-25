# DigiKey Quantity-Break Pricing in Quotes — Design Spec

## Goal

When a user edits a DigiKey line item in a quote and changes the quantity, the unit price automatically updates to the correct DigiKey price tier — no extra UI, no user action required.

## Background

DigiKey charges less per unit at higher quantities (e.g., LM385: $1.63/unit at qty 1, $1.40 at qty 10, $1.05 at qty 100). The existing `DigiKeyService.getPrices()` already fetches this tier table from DigiKey's `/pricing` endpoint, but the quote line item editor always stores the qty-1 price as a snapshot. This feature wires that tier data into the quote editor so line item prices reflect reality.

## Scope

**In scope:**
- `backend/src/vendors/scrapers/digikey.service.ts` — new `getPriceForQuantity()` method
- `backend/src/vendors/vendors.service.ts` — new `getDigiKeyPriceForQuantity()` delegation method
- `backend/src/vendors/vendors.controller.ts` — new `GET /vendors/digikey/price-for-quantity` endpoint
- `mobile/services/api.ts` — new `getDigiKeyPriceForQuantity()` client function
- `mobile/app/quote/[id].tsx` — debounced price refresh on DigiKey line item quantity change

**Out of scope:**
- Non-DigiKey line items (Grainger, Motion, McMaster, OEMSecrets) — unchanged
- Quote creation flow, quote list screen, PDF export — unchanged
- Showing the full tier table to users — not needed for simple UX
- Pushing quotes to DigiKey's ordering system — future feature

## Architecture

### Backend — `DigiKeyService.getPriceForQuantity(partNumber, quantity)`

Calls the existing `/products/v4/search/{partNumber}/pricing` endpoint (same one used by `getPrices()`). Walks the `StandardPricing` tier array from each `ProductVariation`, selects the highest `BreakQuantity` that does not exceed the requested quantity, and returns that tier's `UnitPrice`.

**Tier selection algorithm:**
```
tiers = sorted ascending by BreakQuantity
selected = tiers[0]  // lowest break (qty 1 price is the floor)
for each tier where tier.BreakQuantity <= quantity:
  selected = tier
return selected.UnitPrice
```

Returns `number | null`. Returns `null` if DigiKey credentials are missing, the part has no pricing, or the API call fails.

### Backend — `VendorsService.getDigiKeyPriceForQuantity(partNumber, quantity)`

Single-line delegation to `DigiKeyService.getPriceForQuantity()`. Follows the same pattern as `lookupBarcode()`.

### Backend — `VendorsController`

New endpoint:
```
GET /vendors/digikey/price-for-quantity?partNumber=LM385M3-1.2%2FNOPB&quantity=100
```

Returns: `{ unitPrice: number | null }`

Protected by `JwtAuthGuard` (same as all other vendor endpoints). No throttle needed — this is a fast, lightweight call triggered by user interaction, not a scraper.

### Mobile — `api.ts`

New function:
```typescript
export const getDigiKeyPriceForQuantity = async (
  partNumber: string,
  quantity: number,
): Promise<number | null>
```

Calls `GET /vendors/digikey/price-for-quantity`. Returns `null` on network error or if endpoint returns `null`.

### Mobile — `quote/[id].tsx`

In the inline qty editing flow (`editingItemId`, `editQty`), when the user confirms a new quantity on a line item where `vendorSlug === 'digikey'`:

1. Call `updateLineItemQty()` as today (saves the new quantity)
2. If `vendorSlug === 'digikey'`, also call `getDigiKeyPriceForQuantity(vendorSku, newQty)`
3. If a price is returned, call `updateLineItem(itemId, { unitPrice: newPrice })` to persist it
4. Reload the quote to reflect updated totals

No loading spinner needed — the qty save and price update happen in the background. If the price call fails, the line item keeps its existing price (silent degradation).

## Data Flow

```
User changes qty on DigiKey line item
          │
          ▼
updateLineItemQty(itemId, newQty)   ← always runs
          │
          ▼
vendorSlug === 'digikey'?
  yes → getDigiKeyPriceForQuantity(vendorSku, newQty)
          │
          ├── got price → updateLineItem(itemId, { unitPrice })
          │                      │
          │                      ▼
          │               load() — totals refresh
          │
          └── null → keep existing price, no error shown
```

## Error Handling

| Scenario | Behavior |
|---|---|
| DigiKey API unreachable | `getPriceForQuantity` returns `null`; line item keeps old price |
| Part has no pricing data | Returns `null`; line item keeps old price |
| Non-DigiKey line item | Code path never entered |
| Network error on mobile | `getDigiKeyPriceForQuantity` returns `null`; silent |

## Testing

- `getPriceForQuantity('LM385', 1)` → returns qty-1 price
- `getPriceForQuantity('LM385', 100)` → returns the 100-unit tier price (lower than qty-1)
- `getPriceForQuantity('LM385', 7)` → returns the tier for the highest break ≤ 7 (e.g., qty-1 price if no qty-5 break exists)
- `getPriceForQuantity` with no credentials → returns `null`
- `GET /vendors/digikey/price-for-quantity?partNumber=LM385&quantity=100` → `{ unitPrice: 1.05 }`

## Success Criteria

- Set qty=1 on a DigiKey line item → unit price reflects 1-unit cost
- Set qty=100 on same item → unit price automatically updates to 100-unit cost
- Quote total recalculates correctly
- Non-DigiKey line items are unaffected
- If DigiKey is unreachable, existing prices are preserved (no error shown)
