# Cross-Referencing Engine Design

**Date:** 2026-05-23
**Status:** Approved

## Goal

When a part is discontinued, backordered, or unavailable at any vendor, Claude finds up to 5 compatible replacement parts with reasoning — and the user can search each suggestion through the existing vendor scrapers with one tap.

## Architecture

### Backend: `crossref` NestJS Module

**New files:**
- `backend/src/crossref/crossref.module.ts`
- `backend/src/crossref/crossref.controller.ts`
- `backend/src/crossref/crossref.service.ts`

**Endpoint:**
```
POST /api/v1/crossref
```

**Request body:**
```json
{
  "partNumber": "6203-2RS",
  "manufacturer": "NSK",
  "description": "deep groove ball bearing"
}
```
`manufacturer` and `description` are optional but improve suggestion quality when available.

**Response:**
```json
{
  "suggestions": [
    {
      "partNumber": "6203-2RSH",
      "manufacturer": "SKF",
      "matchReason": "Direct equivalent — same bore, OD, and width as original",
      "keySpecs": ["10mm bore", "40mm OD", "12mm width", "rubber sealed"],
      "confidence": "high"
    }
  ]
}
```

`confidence` is one of `"high" | "medium" | "low"` and is provided by Claude based on how certain it is of the substitution.

**Claude prompt structure:** Structured system prompt instructing Claude to return valid JSON only — same pattern as `vision.service.ts`. Prompt explicitly forbids placeholder values and instructs Claude to return fewer than 5 results if it is not confident rather than padding with weak suggestions.

**Caching:** Redis key `crossref:{partNumber}:{manufacturer}` (manufacturer defaults to empty string if not provided). TTL: 24 hours. On Redis unavailability, fail open — call Claude directly without caching.

**Error handling:** If Claude returns malformed JSON or an empty suggestions array, the service returns `{ suggestions: [], error: "Could not find equivalents for this part" }` with HTTP 200 (not a 500 — this is an expected outcome for obscure parts).

**Module wiring:** `CrossrefModule` imports `ConfigModule` (for Anthropic key) and the existing Redis cache provider. Registered in `AppModule`.

**DTO:**
```typescript
class CrossrefDto {
  @IsString() @IsNotEmpty() partNumber: string;
  @IsOptional() @IsString() manufacturer?: string;
  @IsOptional() @IsString() description?: string;
}
```

---

### Mobile: Two Entry Points

#### Entry Point 1 — Detail Page (`mobile/app/part/[id].tsx`)

After vendor cards finish loading, if every price result is `null`, `error`, or `source === 'BACKORDER'`, show a "Find Equivalent Parts" banner below the vendor list:

```
┌─────────────────────────────────────────┐
│  ⚠️  No stock found at any vendor        │
│  Find a compatible replacement part?    │
│  [  🔄 Find Equivalent Parts  ]         │
└─────────────────────────────────────────┘
```

A secondary "Find Equivalent" button also appears on every detail page regardless of stock status, so engineers who want a substitute even when stock exists can reach it.

Both buttons navigate to `CrossrefScreen` passing `partNumber`, `manufacturer` (from vendor data if available), and `description`.

#### Entry Point 2 — Search Screen (`mobile/app/(tabs)/index.tsx`)

A "Find Equivalent" chip is added to the existing vendor chip row:

```
[ Grainger ]  [ Motion ]  [ McMaster ]  [ 🔄 Find Equivalent ]
```

When active (highlighted), submitting a search navigates to `CrossrefScreen` instead of the normal search results screen.

---

### Mobile: CrossrefScreen (`mobile/app/crossref.tsx`)

**Header:** Part number being cross-referenced, back button.

**Loading state:** Full-screen spinner with "Searching for compatible parts..." — same visual pattern as the camera analysis loading state.

**Suggestion cards (up to 5):**

```
┌──────────────────────────────────────────┐
│  SKF                          ● High     │
│  6203-2RSH                               │
│  Direct equivalent — same bore, OD,      │
│  width as original NSK part              │
│  ─────────────────────────────           │
│  10mm bore · 40mm OD · rubber sealed     │
│                                          │
│  [  Search This Part  →  ]               │
└──────────────────────────────────────────┘
```

Confidence dot color: green (high), amber (medium), red (low).

**"Search This Part" action:** Navigates to existing `/part/[id]` with the suggested `partNumber` — runs the existing scrapers as normal. No new scraping logic needed.

**Empty state:** "No equivalents found for this part" with a "Search manually" button that goes back to the search screen.

---

## Data Flow

```
User taps "Find Equivalent Parts"
  → navigate to CrossrefScreen (partNumber, manufacturer?, description?)
  → POST /api/v1/crossref
  → Redis cache check (key: crossref:{partNumber}:{manufacturer})
      hit  → return cached result (~5ms)
      miss → Claude call (~3–6s) → cache result → return
  → CrossrefScreen renders up to 5 suggestion cards
  → User taps "Search This Part" on a suggestion
  → navigate to /part/[id] with suggested partNumber
  → existing vendor scrapers run as normal
```

---

## Testing

**Backend unit test:** Mock the Anthropic client, assert correct JSON prompt structure, assert response parsing handles both valid and malformed Claude output.

**Backend integration test:** POST `/api/v1/crossref` with `{ partNumber: "6203-2RS", manufacturer: "NSK" }`, assert 200 + `suggestions` array with correct shape.

**Mobile manual test:** Use a known discontinued/backordered part number to verify end-to-end flow from detail page trigger through to scraper results on the suggested equivalent.

---

## What This Is Not

- This does not maintain a cross-reference database. Claude's training knowledge is the source of truth.
- This does not automatically run scrapers on all 5 suggestions (user picks one). Avoids wasting scrape budget on suggestions the user won't use.
- This does not handle price intelligence or conversational procurement — those are separate features.
