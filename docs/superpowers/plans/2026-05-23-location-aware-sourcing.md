# Location-Aware Sourcing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show domestic vendor badges, a "Domestic only" filter, and nearby Grainger/Motion branch cards on the part detail and search screens.

**Architecture:** Mobile-only — no backend changes. A `location.ts` service provides country code (from device locale) and GPS coords. A static `branches.json` holds ~40 US branch locations. Pure `geo.ts` utilities compute haversine distances. Both the part detail and search screens consume these to render badges and branch cards.

**Tech Stack:** `expo-location`, `expo-localization`, Jest + ts-jest (mobile), TypeScript

---

### Task 1: Install dependencies and configure Jest

**Files:**
- Modify: `mobile/package.json`
- Modify: `mobile/app.json`
- Create: `mobile/jest.config.js`
- Create: `mobile/tsconfig.test.json`

- [ ] **Step 1: Install Expo location packages**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx expo install expo-location expo-localization
```

Expected: packages added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Add expo-location plugin to app.json**

Open `mobile/app.json`. The `plugins` array currently is:
```json
"plugins": [
  "expo-router",
  "expo-notifications",
  "expo-secure-store"
]
```

Change to:
```json
"plugins": [
  "expo-router",
  "expo-notifications",
  "expo-secure-store",
  "expo-location"
]
```

- [ ] **Step 3: Install Jest for mobile unit tests**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npm install --save-dev jest ts-jest @types/jest
```

- [ ] **Step 4: Add test script to package.json**

Open `mobile/package.json`. Add `"test": "jest"` to the `scripts` section:
```json
"scripts": {
  "start": "expo start",
  "android": "expo start --android",
  "ios": "expo start --ios",
  "test": "jest"
}
```

- [ ] **Step 5: Create jest.config.js**

Create `mobile/jest.config.js`:
```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
};
```

- [ ] **Step 6: Verify Jest works**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx jest --listTests
```

Expected: no errors (no test files yet, but the config loads cleanly).

- [ ] **Step 7: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add mobile/package.json mobile/package-lock.json mobile/app.json mobile/jest.config.js
git commit -m "chore: install expo-location, expo-localization, and jest for mobile"
```

---

### Task 2: Branch and NearbyBranch types

**Files:**
- Modify: `mobile/types/index.ts`

- [ ] **Step 1: Append Branch and NearbyBranch to mobile/types/index.ts**

Add at the end of `mobile/types/index.ts`:
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

export type NearbyBranch = Branch & { distance: number };
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add mobile/types/index.ts
git commit -m "feat: add Branch and NearbyBranch types"
```

---

### Task 3: geo.ts utility with unit tests (TDD)

**Files:**
- Create: `mobile/utils/geo.test.ts`
- Create: `mobile/utils/geo.ts`

- [ ] **Step 1: Create the utils directory and write failing tests**

```bash
mkdir -p "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile/utils"
```

Create `mobile/utils/geo.test.ts`:
```typescript
import { haversineDistance, nearestBranches } from './geo';
import { Branch } from '../types';

const chicago: Branch = {
  vendor: 'grainger', name: 'Grainger Chicago', city: 'Chicago', state: 'IL',
  lat: 41.8781, lng: -87.6298, url: 'https://www.grainger.com/store-locator?zip=60601',
};
const la: Branch = {
  vendor: 'grainger', name: 'Grainger LA', city: 'Los Angeles', state: 'CA',
  lat: 34.0522, lng: -118.2437, url: 'https://www.grainger.com/store-locator?zip=90012',
};
const nyc: Branch = {
  vendor: 'motion', name: 'Motion NYC', city: 'New York', state: 'NY',
  lat: 40.7128, lng: -74.0060, url: 'https://www.motionindustries.com/location-finder?zip=10001',
};

describe('haversineDistance', () => {
  it('returns ~2451 miles between NYC and LA', () => {
    const d = haversineDistance(40.7128, -74.0060, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it('returns 0 for identical coordinates', () => {
    expect(haversineDistance(41.8781, -87.6298, 41.8781, -87.6298)).toBe(0);
  });
});

describe('nearestBranches', () => {
  const coords = { lat: 41.8500, lng: -87.6500 }; // near Chicago

  it('returns branches within radius, sorted nearest-first', () => {
    const result = nearestBranches(coords, [chicago, la, nyc], 100, 5);
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe('Chicago');
    expect(result[0].distance).toBeGreaterThan(0);
    expect(result[0].distance).toBeLessThan(5);
  });

  it('respects the limit', () => {
    const result = nearestBranches(coords, [chicago, la, nyc], 5000, 1);
    expect(result).toHaveLength(1);
    expect(result[0].city).toBe('Chicago');
  });

  it('returns empty array when no branches within radius', () => {
    const result = nearestBranches(coords, [la, nyc], 50, 5);
    expect(result).toHaveLength(0);
  });

  it('sorts by distance ascending', () => {
    const result = nearestBranches(coords, [nyc, chicago, la], 5000, 3);
    expect(result[0].city).toBe('Chicago');
    expect(result[1].city).toBe('New York');
    expect(result[2].city).toBe('Los Angeles');
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx jest utils/geo.test.ts
```

Expected: FAIL — `Cannot find module './geo'`

- [ ] **Step 3: Implement geo.ts**

Create `mobile/utils/geo.ts`:
```typescript
import { Branch, NearbyBranch } from '../types';

export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function nearestBranches(
  coords: { lat: number; lng: number },
  branches: Branch[],
  radiusMiles: number,
  limit: number,
): NearbyBranch[] {
  return branches
    .map(b => ({ ...b, distance: haversineDistance(coords.lat, coords.lng, b.lat, b.lng) }))
    .filter(b => b.distance <= radiusMiles)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx jest utils/geo.test.ts
```

Expected:
```
PASS utils/geo.test.ts
  haversineDistance
    ✓ returns ~2451 miles between NYC and LA
    ✓ returns 0 for identical coordinates
  nearestBranches
    ✓ returns branches within radius, sorted nearest-first
    ✓ respects the limit
    ✓ returns empty array when no branches within radius
    ✓ sorts by distance ascending

Tests: 6 passed, 6 total
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add mobile/utils/geo.ts mobile/utils/geo.test.ts
git commit -m "feat: add haversineDistance and nearestBranches utilities with tests"
```

---

### Task 4: branches.json and location.ts

**Files:**
- Create: `mobile/assets/branches.json`
- Create: `mobile/services/location.ts`

- [ ] **Step 1: Create branches.json**

Create `mobile/assets/branches.json`:
```json
[
  { "vendor": "grainger", "name": "Grainger Chicago", "city": "Chicago", "state": "IL", "lat": 41.8781, "lng": -87.6298, "url": "https://www.grainger.com/store-locator?zip=60601" },
  { "vendor": "grainger", "name": "Grainger Los Angeles", "city": "Los Angeles", "state": "CA", "lat": 34.0522, "lng": -118.2437, "url": "https://www.grainger.com/store-locator?zip=90012" },
  { "vendor": "grainger", "name": "Grainger New York", "city": "New York", "state": "NY", "lat": 40.7128, "lng": -74.0060, "url": "https://www.grainger.com/store-locator?zip=10001" },
  { "vendor": "grainger", "name": "Grainger Houston", "city": "Houston", "state": "TX", "lat": 29.7604, "lng": -95.3698, "url": "https://www.grainger.com/store-locator?zip=77002" },
  { "vendor": "grainger", "name": "Grainger Dallas", "city": "Dallas", "state": "TX", "lat": 32.7767, "lng": -96.7970, "url": "https://www.grainger.com/store-locator?zip=75201" },
  { "vendor": "grainger", "name": "Grainger Phoenix", "city": "Phoenix", "state": "AZ", "lat": 33.4484, "lng": -112.0740, "url": "https://www.grainger.com/store-locator?zip=85004" },
  { "vendor": "grainger", "name": "Grainger Philadelphia", "city": "Philadelphia", "state": "PA", "lat": 39.9526, "lng": -75.1652, "url": "https://www.grainger.com/store-locator?zip=19103" },
  { "vendor": "grainger", "name": "Grainger San Antonio", "city": "San Antonio", "state": "TX", "lat": 29.4241, "lng": -98.4936, "url": "https://www.grainger.com/store-locator?zip=78205" },
  { "vendor": "grainger", "name": "Grainger San Diego", "city": "San Diego", "state": "CA", "lat": 32.7157, "lng": -117.1611, "url": "https://www.grainger.com/store-locator?zip=92101" },
  { "vendor": "grainger", "name": "Grainger Denver", "city": "Denver", "state": "CO", "lat": 39.7392, "lng": -104.9903, "url": "https://www.grainger.com/store-locator?zip=80202" },
  { "vendor": "grainger", "name": "Grainger Seattle", "city": "Seattle", "state": "WA", "lat": 47.6062, "lng": -122.3321, "url": "https://www.grainger.com/store-locator?zip=98101" },
  { "vendor": "grainger", "name": "Grainger Atlanta", "city": "Atlanta", "state": "GA", "lat": 33.7490, "lng": -84.3880, "url": "https://www.grainger.com/store-locator?zip=30303" },
  { "vendor": "grainger", "name": "Grainger Minneapolis", "city": "Minneapolis", "state": "MN", "lat": 44.9778, "lng": -93.2650, "url": "https://www.grainger.com/store-locator?zip=55401" },
  { "vendor": "grainger", "name": "Grainger Detroit", "city": "Detroit", "state": "MI", "lat": 42.3314, "lng": -83.0458, "url": "https://www.grainger.com/store-locator?zip=48226" },
  { "vendor": "grainger", "name": "Grainger Boston", "city": "Boston", "state": "MA", "lat": 42.3601, "lng": -71.0589, "url": "https://www.grainger.com/store-locator?zip=02110" },
  { "vendor": "grainger", "name": "Grainger Miami", "city": "Miami", "state": "FL", "lat": 25.7617, "lng": -80.1918, "url": "https://www.grainger.com/store-locator?zip=33130" },
  { "vendor": "grainger", "name": "Grainger Cleveland", "city": "Cleveland", "state": "OH", "lat": 41.4993, "lng": -81.6944, "url": "https://www.grainger.com/store-locator?zip=44113" },
  { "vendor": "grainger", "name": "Grainger Pittsburgh", "city": "Pittsburgh", "state": "PA", "lat": 40.4406, "lng": -79.9959, "url": "https://www.grainger.com/store-locator?zip=15222" },
  { "vendor": "grainger", "name": "Grainger St. Louis", "city": "St. Louis", "state": "MO", "lat": 38.6270, "lng": -90.1994, "url": "https://www.grainger.com/store-locator?zip=63101" },
  { "vendor": "grainger", "name": "Grainger Baltimore", "city": "Baltimore", "state": "MD", "lat": 39.2904, "lng": -76.6122, "url": "https://www.grainger.com/store-locator?zip=21201" },
  { "vendor": "grainger", "name": "Grainger Tampa", "city": "Tampa", "state": "FL", "lat": 27.9506, "lng": -82.4572, "url": "https://www.grainger.com/store-locator?zip=33602" },
  { "vendor": "grainger", "name": "Grainger Portland", "city": "Portland", "state": "OR", "lat": 45.5051, "lng": -122.6750, "url": "https://www.grainger.com/store-locator?zip=97204" },
  { "vendor": "grainger", "name": "Grainger Las Vegas", "city": "Las Vegas", "state": "NV", "lat": 36.1699, "lng": -115.1398, "url": "https://www.grainger.com/store-locator?zip=89101" },
  { "vendor": "grainger", "name": "Grainger Kansas City", "city": "Kansas City", "state": "MO", "lat": 39.0997, "lng": -94.5786, "url": "https://www.grainger.com/store-locator?zip=64106" },
  { "vendor": "grainger", "name": "Grainger Charlotte", "city": "Charlotte", "state": "NC", "lat": 35.2271, "lng": -80.8431, "url": "https://www.grainger.com/store-locator?zip=28202" },
  { "vendor": "motion", "name": "Motion Industries Birmingham", "city": "Birmingham", "state": "AL", "lat": 33.5186, "lng": -86.8104, "url": "https://www.motionindustries.com/location-finder?zip=35203" },
  { "vendor": "motion", "name": "Motion Industries Atlanta", "city": "Atlanta", "state": "GA", "lat": 33.7490, "lng": -84.3880, "url": "https://www.motionindustries.com/location-finder?zip=30303" },
  { "vendor": "motion", "name": "Motion Industries Houston", "city": "Houston", "state": "TX", "lat": 29.7604, "lng": -95.3698, "url": "https://www.motionindustries.com/location-finder?zip=77002" },
  { "vendor": "motion", "name": "Motion Industries Dallas", "city": "Dallas", "state": "TX", "lat": 32.7767, "lng": -96.7970, "url": "https://www.motionindustries.com/location-finder?zip=75201" },
  { "vendor": "motion", "name": "Motion Industries Chicago", "city": "Chicago", "state": "IL", "lat": 41.8781, "lng": -87.6298, "url": "https://www.motionindustries.com/location-finder?zip=60601" },
  { "vendor": "motion", "name": "Motion Industries Los Angeles", "city": "Los Angeles", "state": "CA", "lat": 34.0522, "lng": -118.2437, "url": "https://www.motionindustries.com/location-finder?zip=90012" },
  { "vendor": "motion", "name": "Motion Industries Detroit", "city": "Detroit", "state": "MI", "lat": 42.3314, "lng": -83.0458, "url": "https://www.motionindustries.com/location-finder?zip=48226" },
  { "vendor": "motion", "name": "Motion Industries Columbus", "city": "Columbus", "state": "OH", "lat": 39.9612, "lng": -82.9988, "url": "https://www.motionindustries.com/location-finder?zip=43215" },
  { "vendor": "motion", "name": "Motion Industries Nashville", "city": "Nashville", "state": "TN", "lat": 36.1627, "lng": -86.7816, "url": "https://www.motionindustries.com/location-finder?zip=37201" },
  { "vendor": "motion", "name": "Motion Industries Raleigh", "city": "Raleigh", "state": "NC", "lat": 35.7796, "lng": -78.6382, "url": "https://www.motionindustries.com/location-finder?zip=27601" },
  { "vendor": "motion", "name": "Motion Industries Denver", "city": "Denver", "state": "CO", "lat": 39.7392, "lng": -104.9903, "url": "https://www.motionindustries.com/location-finder?zip=80202" },
  { "vendor": "motion", "name": "Motion Industries Seattle", "city": "Seattle", "state": "WA", "lat": 47.6062, "lng": -122.3321, "url": "https://www.motionindustries.com/location-finder?zip=98101" },
  { "vendor": "motion", "name": "Motion Industries Minneapolis", "city": "Minneapolis", "state": "MN", "lat": 44.9778, "lng": -93.2650, "url": "https://www.motionindustries.com/location-finder?zip=55401" },
  { "vendor": "motion", "name": "Motion Industries Phoenix", "city": "Phoenix", "state": "AZ", "lat": 33.4484, "lng": -112.0740, "url": "https://www.motionindustries.com/location-finder?zip=85004" },
  { "vendor": "motion", "name": "Motion Industries Charlotte", "city": "Charlotte", "state": "NC", "lat": 35.2271, "lng": -80.8431, "url": "https://www.motionindustries.com/location-finder?zip=28202" }
]
```

- [ ] **Step 2: Create location.ts**

Create `mobile/services/location.ts`:
```typescript
import * as Localization from 'expo-localization';
import * as Location from 'expo-location';

export const DOMESTIC_VENDORS: Record<string, string[]> = {
  US: ['grainger', 'mcmaster', 'motion', 'digikey'],
  CA: ['grainger', 'motion'],
};

export function isDomestic(vendorSlug: string, countryCode: string | null): boolean {
  if (!countryCode) return false;
  return (DOMESTIC_VENDORS[countryCode] ?? []).includes(vendorSlug);
}

export function getCountryCode(): string | null {
  return Localization.getLocales()[0]?.regionCode ?? null;
}

let cachedCoords: { lat: number; lng: number } | null | undefined = undefined;

export async function getCoords(): Promise<{ lat: number; lng: number } | null> {
  if (cachedCoords !== undefined) return cachedCoords;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      cachedCoords = null;
      return null;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    cachedCoords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
    return cachedCoords;
  } catch {
    cachedCoords = null;
    return null;
  }
}
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add mobile/assets/branches.json mobile/services/location.ts
git commit -m "feat: add branches.json and location service"
```

---

### Task 5: Part detail screen — domestic badges, filter, and nearby branches

**Files:**
- Modify: `mobile/app/part/[id].tsx`

The current file is at `mobile/app/part/[id].tsx`. Read it before editing.

- [ ] **Step 1: Add imports**

At the top of `mobile/app/part/[id].tsx`, add these imports after the existing ones:
```typescript
import { getCountryCode, getCoords, isDomestic } from '../../services/location';
import { nearestBranches } from '../../utils/geo';
import { NearbyBranch } from '../../types';
import branches from '../../assets/branches.json';
```

- [ ] **Step 2: Add state variables**

After the existing `const [analyzingPrices, setAnalyzingPrices] = useState(false);` line, add:
```typescript
const [countryCode, setCountryCode] = useState<string | null>(null);
const [domesticOnly, setDomesticOnly] = useState(false);
const [nearbyBranches, setNearbyBranches] = useState<NearbyBranch[]>([]);
```

- [ ] **Step 3: Add location useEffect**

After the existing `useEffect(() => { load(); }, [id]);` line, add:
```typescript
useEffect(() => {
  setCountryCode(getCountryCode());
  getCoords().then(c => {
    if (c) setNearbyBranches(nearestBranches(c, branches as Branch[], 50, 3));
  });
}, []);
```

- [ ] **Step 4: Add domestic filter to displayed prices**

Find the line in the JSX that renders vendor cards:
```typescript
{prices.map((p, i) => {
```

Change the `prices` array used for rendering to apply the domestic filter. Add this computed value just before the `return` statement (after the `noStock` const):
```typescript
const displayedPrices = domesticOnly
  ? prices.filter(p => isDomestic(p.vendorSlug, countryCode))
  : prices;
```

Then change `{prices.map((p, i) => {` to `{displayedPrices.map((p, i) => {`

- [ ] **Step 5: Add domestic badge to each vendor card**

Inside the vendor card map, find the vendor name and status badge row:
```typescript
<View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
  <Text style={s.vendor}>{p.vendorName}</Text>
  <View style={[s.sourceBadge, { backgroundColor: cfg.color + '20' }]}>
```

Add the domestic badge after `<Text style={s.vendor}>{p.vendorName}</Text>`:
```typescript
<Text style={s.vendor}>{p.vendorName}</Text>
{countryCode && (
  <View style={[s.domesticBadge, { backgroundColor: isDomestic(p.vendorSlug, countryCode) ? '#dcfce7' : '#f3f4f6' }]}>
    <Text style={{ fontSize: 11, color: isDomestic(p.vendorSlug, countryCode) ? '#16a34a' : '#9ca3af' }}>
      {isDomestic(p.vendorSlug, countryCode) ? '🇺🇸' : '🌍'}
    </Text>
  </View>
)}
```

- [ ] **Step 6: Add "All Vendor Prices" header with Domestic only chip**

Find the existing header line:
```typescript
<Text style={{ fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 12 }}>All Vendor Prices</Text>
```

Replace with:
```typescript
<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
  <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>All Vendor Prices</Text>
  {countryCode && (
    <TouchableOpacity
      style={[s.domesticChip, domesticOnly && s.domesticChipActive]}
      onPress={() => setDomesticOnly(v => !v)}
    >
      <Text style={[s.domesticChipText, domesticOnly && s.domesticChipTextActive]}>
        🇺🇸 Domestic only
      </Text>
    </TouchableOpacity>
  )}
</View>
```

- [ ] **Step 7: Add nearby branches section**

Find the closing `)}` of the `noStock` banner JSX block. Add the nearby branches section immediately after it (before the price intel section):
```typescript
{nearbyBranches.length > 0 && (
  <View style={s.branchesCard}>
    <Text style={s.branchesSectionTitle}>Nearby Pickup</Text>
    {nearbyBranches.map((b, i) => (
      <View key={i} style={[s.branchRow, i < nearbyBranches.length - 1 && s.branchRowBorder]}>
        <View style={{ flex: 1 }}>
          <Text style={s.branchName}>📍 {b.name}</Text>
          <Text style={s.branchSub}>{b.city}, {b.state} · {b.distance.toFixed(1)} mi</Text>
        </View>
        <TouchableOpacity onPress={() => Linking.openURL(b.url)}>
          <Text style={s.branchLink}>View Branch →</Text>
        </TouchableOpacity>
      </View>
    ))}
  </View>
)}
```

- [ ] **Step 8: Add new styles**

In the `StyleSheet.create({...})` at the bottom, add these new styles:
```typescript
domesticBadge: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, marginLeft: 6, justifyContent: 'center' },
domesticChip: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#fff' },
domesticChipActive: { borderColor: '#1e40af', backgroundColor: '#eff6ff' },
domesticChipText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
domesticChipTextActive: { color: '#1e40af' },
branchesCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6', elevation: 2 },
branchesSectionTitle: { fontSize: 14, fontWeight: '700', color: '#111827', marginBottom: 10 },
branchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
branchRowBorder: { borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
branchName: { fontSize: 13, fontWeight: '600', color: '#111827' },
branchSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
branchLink: { fontSize: 13, color: '#1e40af', fontWeight: '600' },
```

- [ ] **Step 9: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add "mobile/app/part/[id].tsx"
git commit -m "feat: add domestic badges, filter, and nearby branches to part detail screen"
```

---

### Task 6: Search screen — domestic badges and filter chip

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`

Read the current file before editing. Key existing structure:
- Line 5: `import { searchParts } from '../../services/api';`
- Line 6: `import { SearchResult } from '../../types';`
- Line 58: `<View style={s.badge}><Text style={s.badgeText}>{item.vendorName}</Text></View>` — vendor badge in each result card
- Line 103: `<View style={s.chips}>` — chip row
- Line 105: vendor chips
- Line 108: Find Equivalent chip
- Line 149: `<FlatList data={results} ...` — result list

- [ ] **Step 1: Add imports**

After `import { SearchResult } from '../../types';`, add:
```typescript
import { getCountryCode, isDomestic } from '../../services/location';
```

- [ ] **Step 2: Add state variables**

After `const [findEquivalent, setFindEquivalent] = useState(false);`, add:
```typescript
const [countryCode, setCountryCode] = useState<string | null>(null);
const [domesticOnly, setDomesticOnly] = useState(false);
```

- [ ] **Step 3: Add useEffect to load country code on mount**

After the existing `useEffect` block, add:
```typescript
useEffect(() => {
  setCountryCode(getCountryCode());
}, []);
```

- [ ] **Step 4: Add domestic filter to FlatList data**

Find:
```typescript
<FlatList data={results} keyExtractor={(item, i) => `${item.vendorSlug}-${i}`}
```

Change `data={results}` to:
```typescript
data={domesticOnly ? results.filter(r => isDomestic(r.vendorSlug, countryCode)) : results}
```

- [ ] **Step 5: Add domestic badge to each result card**

Find the vendor badge in the result card (around line 58):
```typescript
<View style={s.badge}><Text style={s.badgeText}>{item.vendorName}</Text></View>
```

Replace with:
```typescript
<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
  <View style={s.badge}><Text style={s.badgeText}>{item.vendorName}</Text></View>
  {countryCode && (
    <Text style={{ fontSize: 11 }}>
      {isDomestic(item.vendorSlug, countryCode) ? '🇺🇸' : '🌍'}
    </Text>
  )}
</View>
```

- [ ] **Step 6: Add "Domestic only" chip to the chip row**

Find the chips row. The existing chips render vendor names and the Find Equivalent chip. Add the Domestic only chip after the vendor name chips and before Find Equivalent:

Find:
```typescript
<View style={s.chips}>
```

The chips row renders vendor name chips and the Find Equivalent chip. Add the Domestic only chip between them. Find the Find Equivalent chip:
```typescript
style={[s.chip, findEquivalent && s.chipActive]}
```

Add this block immediately before that TouchableOpacity:
```typescript
{countryCode && (
  <TouchableOpacity
    style={[s.chip, domesticOnly && s.chipActive]}
    onPress={() => setDomesticOnly(v => !v)}
  >
    <Text style={[s.chipText, domesticOnly && s.chipTextActive]}>🇺🇸 Domestic</Text>
  </TouchableOpacity>
)}
```

- [ ] **Step 7: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git add "mobile/app/(tabs)/index.tsx"
git commit -m "feat: add domestic badges and filter chip to search screen"
```

---

### Task 7: Push and verify

- [ ] **Step 1: Run geo tests one final time**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile"
npx jest
```

Expected: 6 tests pass.

- [ ] **Step 2: Push to GitHub**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application"
git push origin main
```

- [ ] **Step 3: Manual test checklist**

On a physical device:
- [ ] Search for a part → result cards show 🇺🇸 on Grainger/McMaster/Motion/DigiKey, 🌍 on OEM Secrets
- [ ] Tap "🇺🇸 Domestic" chip → OEM Secrets results disappear
- [ ] Open a part detail → vendor cards show flag badges
- [ ] Tap "🇺🇸 Domestic only" chip → non-domestic cards hide
- [ ] Nearby branches section appears if GPS granted and a branch is within 50 miles
- [ ] Tap "View Branch →" → opens browser at vendor's location search page
- [ ] Deny GPS permission → nearby branches section absent, no error
