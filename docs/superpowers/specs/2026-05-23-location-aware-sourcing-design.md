# Location-Aware Sourcing Design

**Date:** 2026-05-23
**Status:** Approved

## Goal

Show engineers which vendors are domestic (avoiding tariffs) and surface nearby Grainger/Motion Industries branches for same-day pickup — all on the part detail and search screens.

---

## Architecture

No backend changes. All logic lives in the mobile app.

### New files

**`mobile/services/location.ts`**

Single source of truth for location data. Two exported functions:

```typescript
export async function getCountryCode(): Promise<string | null>
```
Reads from `expo-localization` (`Localization.locale` → split on `-` → take last segment, e.g. `'en-US'` → `'US'`). No GPS required. Returns `null` if locale is unavailable or ambiguous.

```typescript
export async function getCoords(): Promise<{ lat: number; lng: number } | null>
```
Requests foreground GPS permission via `expo-location`. Caches result in module-level variable so it only prompts once per app session. Returns `null` if permission denied or location unavailable. Never throws — always fails silently.

Also exports:
```typescript
export const DOMESTIC_VENDORS: Record<string, string[]> = {
  US: ['grainger', 'mcmaster', 'motion', 'digikey'],
  CA: ['grainger', 'motion'],
};

export function isDomestic(vendorSlug: string, countryCode: string | null): boolean {
  if (!countryCode) return false;
  return (DOMESTIC_VENDORS[countryCode] ?? []).includes(vendorSlug);
}
```

`DOMESTIC_VENDORS` covers US and Canada. OEM Secrets and DigiKey are excluded from CA since they're primarily US-focused distributors for industrial parts. OEM Secrets is excluded from US because it's an international marketplace with mixed seller origins.

---

**`mobile/types/index.ts`** (modify — add `Branch` type)

```typescript
export interface Branch {
  vendor: 'grainger' | 'motion';
  name: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  url: string;
}
```

**`mobile/assets/branches.json`**

Static array of `Branch` objects (see type above).

Contains ~200 entries covering major metro areas. Updated manually as needed (branches open/close infrequently). Source: publicly available branch locator pages on grainger.com and motionindustries.com.

---

**`mobile/utils/geo.ts`**

Two pure functions — no side effects, no imports from React Native.

```typescript
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number  // returns miles

export function nearestBranches(
  coords: { lat: number; lng: number },
  branches: Branch[],
  radiusMiles: number,
  limit: number,
): Branch[]  // sorted nearest-first, filtered to within radiusMiles
```

---

### Modified files

**`mobile/app/part/[id].tsx`**

1. **Domestic badge** — each vendor card row gets a small tag next to the vendor name:
   - `🇺🇸` with green background when `isDomestic(p.vendorSlug, countryCode)` is true
   - `🌍` with grey background when false
   - Hidden entirely if `countryCode` is null

2. **"Domestic only" filter chip** — rendered below the "All Vendor Prices" header. Toggles `domesticOnly: boolean` state. When active, vendor cards where `isDomestic()` is false are hidden. Chip is hidden if `countryCode` is null.

3. **Nearby branches section** — rendered between the vendor cards and the noStock banner. Visible only when `coords !== null && nearbyBranches.length > 0`. Loads on mount via `useEffect` (fetches coords + filters branches). Shows up to 3 nearest branches within 50 miles.

   Each branch row:
   ```
   📍 Grainger — Chicago, IL · 2.3 mi    [View Branch →]
   ```
   "View Branch →" calls `Linking.openURL(branch.url)`.

   Section header: "Nearby Pickup"

State additions:
```typescript
const [countryCode, setCountryCode] = useState<string | null>(null);
const [domesticOnly, setDomesticOnly] = useState(false);
const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
const [nearbyBranches, setNearbyBranches] = useState<Branch[]>([]);
```

On mount (`useEffect` with `[]`):
```typescript
getCountryCode().then(setCountryCode);
getCoords().then(c => {
  setCoords(c);
  if (c) setNearbyBranches(nearestBranches(c, branches, 50, 3));
});
```

---

**`mobile/app/(tabs)/index.tsx`**

1. **Domestic badge** — small flag tag on each result card next to the vendor name badge (line 58), same logic as part detail screen.

2. **"🇺🇸 Domestic only" chip** — added to the existing `chips` row (line 103), after the existing vendor chips and before the "Find Equivalent" chip. Toggles `domesticOnly` state. When active, `results` rendered in the FlatList are filtered: `results.filter(r => !domesticOnly || isDomestic(r.vendorSlug, countryCode))`.

State additions:
```typescript
const [countryCode, setCountryCode] = useState<string | null>(null);
const [domesticOnly, setDomesticOnly] = useState(false);
```

On mount:
```typescript
getCountryCode().then(setCountryCode);
```

---

## Data Flow

```
App load (search screen)
  → getCountryCode() → countryCode state
  → render domestic badge and filter chip on each result

Part detail screen mount
  → getCountryCode() → countryCode state (for badges + filter)
  → getCoords() → coords state
      → nearestBranches(coords, branches, 50, 3) → nearbyBranches state
  → render badges, filter chip, and nearby branches section
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Locale unavailable | `countryCode = null` — badges and filter chip hidden |
| GPS permission denied | `coords = null` — nearby branches section hidden |
| GPS timeout / error | `getCoords()` returns `null` — same as denied |
| No branches within 50 miles | `nearbyBranches = []` — section hidden |
| `Linking.openURL` fails | No handling needed — OS manages browser launch |

---

## Dependencies

Add to `mobile/package.json`:
- `expo-location` — GPS permission and coordinates (may already be installed; check before adding)
- `expo-localization` — locale/country code (likely already installed via Expo)

Check: `grep "expo-location\|expo-localization" mobile/package.json`

---

## Testing

**Unit tests (`mobile/utils/geo.test.ts`):**
- `haversineDistance`: known coordinate pairs with expected distances (e.g. NYC→LA ≈ 2,451 miles)
- `nearestBranches`: returns branches sorted nearest-first, respects radius limit, respects count limit, returns empty array when no branches in radius

**Manual tests:**
- US device locale → domestic badges appear on Grainger/McMaster/Motion/DigiKey, not on OEM Secrets
- Non-US locale (e.g. `fr-FR`) → OEM Secrets and DigiKey show `🌍`, Grainger shows `🌍`
- "Domestic only" chip filters correctly on both search and part detail screens
- GPS granted → nearby branches appear within correct distance
- GPS denied → nearby branches section absent, no error shown
- Tap "View Branch →" → correct branch URL opens in browser

---

## What This Is Not

- No branch-level stock check — branches are shown as pickup options, not as inventory sources
- No real-time branch data — static JSON, updated manually
- No routing or turn-by-turn directions
- No per-seller origin filtering within OEM Secrets
- No shipping time estimation
