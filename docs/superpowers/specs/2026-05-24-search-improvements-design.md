# Search Page Improvements Design

**Date:** 2026-05-24
**Status:** Approved

## Goal

Improve the search screen for engineers who search the same parts repeatedly. Three changes: config-driven vendor chips (only show active vendors), client-side sort controls (in-stock first by default + price toggle), and persisted search history (last 8 queries, shown on the initial screen).

---

## Architecture

No backend changes. All logic is client-side.

### New files

**`mobile/utils/searchConfig.ts`**

Defines the active vendor list. The search screen builds vendor chips from this array. Adding a new vendor later requires only uncommenting a line here.

```typescript
export interface VendorConfig {
  slug: string;
  name: string;
}

export const ACTIVE_VENDORS: VendorConfig[] = [
  { slug: 'motion', name: 'Motion Industries' },
  // { slug: 'grainger', name: 'Grainger' },
  // { slug: 'mcmaster', name: 'McMaster-Carr' },
];
```

**`mobile/utils/searchHistory.ts`**

AsyncStorage-backed search history. Exports three functions:

```typescript
export async function getSearchHistory(): Promise<string[]>
// Returns up to 8 queries, newest first.

export async function addToSearchHistory(query: string): Promise<void>
// Prepends query (trimmed, lowercased for dedup). Deduplicates: if the query
// already exists anywhere in the list, it moves to position 0 (most recent).
// Trims list to 8 items after insert.

export async function clearSearchHistory(): Promise<void>
// Removes all stored history.
```

Storage key: `'search_history'`. Value: JSON array of strings.

---

### Modified file

**`mobile/app/(tabs)/index.tsx`**

#### State additions

```typescript
const [activeVendors, setActiveVendors] = useState<Set<string>>(
  () => new Set(ACTIVE_VENDORS.map(v => v.slug))
);
const [inStockFirst, setInStockFirst] = useState(true);
const [priceSort, setPriceSort] = useState(false);
const [searchHistory, setSearchHistory] = useState<string[]>([]);
```

`activeVendors` is initialized with all configured vendors active.

#### On mount

Load search history from AsyncStorage:

```typescript
useEffect(() => {
  getSearchHistory().then(setSearchHistory);
}, []);
```

#### After a successful search

Write the query to history and refresh the in-memory list:

```typescript
await addToSearchHistory(q.trim());
setSearchHistory(await getSearchHistory());
```

This happens inside `triggerSearch` after `setResults`.

#### Chip row (replaces the current static chips)

```
[Motion Industries] · [🇺🇸 Domestic] · [In Stock First] · [Price ↑] · [🔄 Find Equivalent]
```

- **Vendor chips** — one per entry in `ACTIVE_VENDORS`. Active by default (filled blue). Tapping toggles the slug in/out of `activeVendors`. If a chip is deactivated, its results are hidden from the list.
- **In Stock First** — active (filled) by default. Toggleable. Sorts in-stock results above out-of-stock.
- **Price ↑** — inactive by default. Toggleable. Sorts results by `price` ascending, nulls last.
- **Domestic** and **Find Equivalent** chips — unchanged behavior.
- The chip row wraps via `flexWrap: 'wrap'` so it never clips on narrow screens.

#### Sort logic

Applied to results before rendering (not stored in state — computed inline):

```typescript
const sortedResults = [...results].sort((a, b) => {
  if (inStockFirst && a.inStock !== b.inStock) {
    return a.inStock ? -1 : 1;
  }
  if (priceSort) {
    if (a.price === null && b.price === null) return 0;
    if (a.price === null) return 1;
    if (b.price === null) return -1;
    return a.price - b.price;
  }
  return 0;
});
```

When both `inStockFirst` and `priceSort` are on: in-stock results appear first, sorted by price ascending among themselves; out-of-stock results appear below, also sorted by price ascending.

Vendor filter applied after sort:

```typescript
const displayedResults = sortedResults.filter(r => activeVendors.has(r.vendorSlug));
```

`inStockFirst` resets to `true` each time a new search fires (so the default always applies to fresh results). `priceSort` does not reset — if the user turned it on, it stays on.

#### Search history UI

Shown on the initial screen (before any search this session, `!searched`). Replaces the current hero `⚙️` block when history is non-empty.

Layout:
```
Recent Searches                              [Clear]
🕐  motion 10hp motor
🕐  omron e3nx-fa41
🕐  smc pneumatic cylinder
...
```

- Each row is a `TouchableOpacity` that calls `triggerSearch(item)` and sets `setQuery(item)`.
- "Clear" button calls `clearSearchHistory()` then `setSearchHistory([])`.
- When history is empty (first launch or after clearing), the existing hero `⚙️` block is shown instead.

---

## Data Flow

```
App opens
  → getSearchHistory() → setSearchHistory
  → initial screen shows Recent Searches (if any)

User taps a history item
  → setQuery(item) + triggerSearch(item)
  → results load, sorted + filtered

User types + submits search
  → triggerSearch(query)
  → results load, sorted + filtered
  → addToSearchHistory(query) → getSearchHistory() → setSearchHistory

User toggles a vendor chip
  → activeVendors updated → displayedResults recomputed (no re-fetch)

User toggles In Stock First or Price ↑
  → sort state updated → displayedResults recomputed (no re-fetch)

User taps Clear on history
  → clearSearchHistory() → setSearchHistory([])
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| AsyncStorage read fails on mount | `searchHistory` stays `[]`, no crash — history silently unavailable |
| AsyncStorage write fails after search | Search still completes; history not updated this session |
| All vendor chips toggled off | `displayedResults` is empty; show the "No results found" empty state. Note: the empty state condition must check `displayedResults.length === 0`, not `results.length === 0`, so it triggers even when raw results exist but are all filtered out. |
| Single vendor chip toggled off (only one vendor active) | Same: empty state shown |

---

## Testing

**Unit tests (`mobile/utils/searchHistory.test.ts`):**
- `addToSearchHistory` prepends and deduplicates
- `addToSearchHistory` trims list to 8 items
- `clearSearchHistory` returns empty array from `getSearchHistory`
- History is ordered newest first

**Manual tests:**
- Search fires → query appears in history on next visit to the tab
- Tap history item → query fills input and results load immediately
- Clear button → history section disappears, hero block shown instead
- Toggle Motion Industries chip off → results disappear; toggle back → results reappear
- In Stock First on (default) → in-stock results always at top
- Price ↑ on → cheapest first; if In Stock First also on, cheapest in-stock first then cheapest out-of-stock
- `inStockFirst` resets to true on each new search
- Chip row wraps correctly on narrow screen

---

## What This Is Not

- No server-side sort or filter — all client-side
- No vendor chip for Grainger or McMaster until those integrations are live
- No search history sync across devices
- No per-vendor result count badge on vendor chips
