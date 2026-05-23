# Cross-Referencing Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-powered cross-referencing feature that suggests up to 5 compatible replacement parts when a user searches for a discontinued or unavailable part.

**Architecture:** A new NestJS `crossref` module exposes `POST /api/v1/crossref`; it calls Claude Sonnet, caches the result in Redis for 24h, and returns a typed JSON response. The mobile app adds a new `CrossrefScreen` reachable from two entry points: a banner on the detail page when no stock is found, and a chip toggle on the search screen.

**Tech Stack:** NestJS 10, Anthropic SDK (`@anthropic-ai/sdk`), ioredis (via existing `RedisService`), React Native / Expo Router, TypeScript.

---

## File Map

**Create:**
- `backend/src/crossref/crossref.service.ts` — Claude call + Redis cache logic
- `backend/src/crossref/crossref.controller.ts` — POST endpoint + DTO validation
- `backend/src/crossref/crossref.module.ts` — NestJS module declaration
- `backend/src/crossref/crossref.service.spec.ts` — Unit tests
- `mobile/app/crossref.tsx` — CrossrefScreen

**Modify:**
- `backend/src/app.module.ts` — register CrossrefModule
- `mobile/types/index.ts` — add CrossrefSuggestion + CrossrefResult types
- `mobile/services/api.ts` — add findEquivalents function
- `mobile/app/part/[id].tsx` — add "Find Equivalent" banner + secondary button
- `mobile/app/(tabs)/index.tsx` — add "Find Equivalent" chip toggle

---

## Task 1: CrossrefService with unit tests

**Files:**
- Create: `backend/src/crossref/crossref.service.ts`
- Create: `backend/src/crossref/crossref.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/crossref/crossref.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CrossrefService } from './crossref.service';
import { RedisService } from '../redis/redis.service';

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn().mockResolvedValue(undefined),
};

describe('CrossrefService', () => {
  let service: CrossrefService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CrossrefService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<CrossrefService>(CrossrefService);
  });

  it('returns parsed suggestions from Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"suggestions":[{"partNumber":"6203-2RSH","manufacturer":"SKF","matchReason":"Direct equivalent","keySpecs":["10mm bore","40mm OD"],"confidence":"high"}]}',
      }],
    });

    const result = await service.findEquivalents('6203-2RS', 'NSK');
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].partNumber).toBe('6203-2RSH');
    expect(result.suggestions[0].confidence).toBe('high');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'crossref:6203-2RS:NSK',
      86400,
      expect.any(String),
    );
  });

  it('returns cached result without calling Claude', async () => {
    const cached = {
      suggestions: [{
        partNumber: 'CACHED-PART',
        manufacturer: 'ACME',
        matchReason: 'cached',
        keySpecs: [],
        confidence: 'high',
      }],
    };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.findEquivalents('6203-2RS', 'NSK');
    expect(result.suggestions[0].partNumber).toBe('CACHED-PART');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns empty suggestions on malformed Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'this is not json' }],
    });

    const result = await service.findEquivalents('OBSCURE-XYZ-999');
    expect(result.suggestions).toEqual([]);
    expect(result.error).toBeDefined();
  });

  it('uses empty string for manufacturer in cache key when not provided', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{"suggestions":[]}' }],
    });

    await service.findEquivalents('TEST-PART');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'crossref:TEST-PART:',
      86400,
      expect.any(String),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest crossref.service.spec.ts --no-coverage
```

Expected: FAIL — `CrossrefService` not found.

- [ ] **Step 3: Create the service**

Create `backend/src/crossref/crossref.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { RedisService } from '../redis/redis.service';

export interface CrossrefSuggestion {
  partNumber: string;
  manufacturer: string;
  matchReason: string;
  keySpecs: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CrossrefResult {
  suggestions: CrossrefSuggestion[];
  error?: string;
}

const CROSSREF_PROMPT = `You are an expert in industrial and electronic components.
Given a part number and optional manufacturer/description, suggest up to 5 compatible replacement or equivalent parts.
Only suggest parts you are genuinely confident about. Return fewer than 5 if confidence is low.

For each suggestion include:
- partNumber: the exact replacement part number
- manufacturer: the manufacturer name
- matchReason: one sentence explaining why this is a valid equivalent
- keySpecs: array of 2-5 key specifications that confirm the match (e.g. "10mm bore", "24VDC", "NEMA 56C frame")
- confidence: "high" for direct drop-in equivalent, "medium" for functionally equivalent with minor differences, "low" for similar but verify before ordering

RULES:
- Never suggest the exact same part number that was provided as input
- Never write "Unknown", "N/A", or any placeholder
- Only suggest real parts from real manufacturers
- If no confident equivalents exist, return an empty suggestions array

Respond ONLY with valid JSON, no markdown, no explanation:
{"suggestions":[{"partNumber":"...","manufacturer":"...","matchReason":"...","keySpecs":["..."],"confidence":"high|medium|low"}]}`;

@Injectable()
export class CrossrefService {
  private readonly logger = new Logger(CrossrefService.name);
  private client: Anthropic;

  constructor(private config: ConfigService, private redis: RedisService) {
    this.client = new Anthropic({ apiKey: config.get<string>('ANTHROPIC_API_KEY') });
  }

  async findEquivalents(
    partNumber: string,
    manufacturer?: string,
    description?: string,
  ): Promise<CrossrefResult> {
    const cacheKey = `crossref:${partNumber}:${manufacturer || ''}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // fail open — proceed to Claude
    }

    try {
      const userMessage = [
        `Part number: ${partNumber}`,
        manufacturer ? `Manufacturer: ${manufacturer}` : null,
        description ? `Description: ${description}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: `${CROSSREF_PROMPT}\n\n${userMessage}` }],
        }],
      });

      const raw = (response.content[0] as { type: string; text: string }).text.trim();
      const match = raw.match(/\{[\s\S]*\}/);
      const result: CrossrefResult = JSON.parse(match![0]);

      try {
        await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
      } catch {
        // fail open — return result even if cache write fails
      }

      return result;
    } catch (err) {
      this.logger.error(`Crossref failed for ${partNumber}: ${err}`);
      return { suggestions: [], error: 'Could not find equivalents for this part' };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest crossref.service.spec.ts --no-coverage
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/crossref/crossref.service.ts backend/src/crossref/crossref.service.spec.ts
git commit -m "feat: add CrossrefService with Claude + Redis caching"
```

---

## Task 2: CrossrefController, Module, and AppModule wiring

**Files:**
- Create: `backend/src/crossref/crossref.controller.ts`
- Create: `backend/src/crossref/crossref.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the controller**

Create `backend/src/crossref/crossref.controller.ts`:

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CrossrefService } from './crossref.service';

class CrossrefDto {
  @IsString()
  @IsNotEmpty()
  partNumber: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('crossref')
@UseGuards(JwtAuthGuard)
export class CrossrefController {
  constructor(private crossref: CrossrefService) {}

  @Post()
  async find(@Body() dto: CrossrefDto) {
    return this.crossref.findEquivalents(dto.partNumber, dto.manufacturer, dto.description);
  }
}
```

- [ ] **Step 2: Create the module**

Create `backend/src/crossref/crossref.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { CrossrefController } from './crossref.controller';
import { CrossrefService } from './crossref.service';

@Module({
  controllers: [CrossrefController],
  providers: [CrossrefService],
})
export class CrossrefModule {}
```

- [ ] **Step 3: Register CrossrefModule in AppModule**

Open `backend/src/app.module.ts`. Add the import at the top:

```typescript
import { CrossrefModule } from './crossref/crossref.module';
```

Add `CrossrefModule` to the `imports` array, after `VisionModule`:

```typescript
    VisionModule,
    CrossrefModule,
```

- [ ] **Step 4: Verify the backend builds without errors**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output (no type errors).

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && npx jest --no-coverage
```

Expected: all tests pass including the 4 new crossref tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/crossref/crossref.controller.ts backend/src/crossref/crossref.module.ts backend/src/app.module.ts
git commit -m "feat: wire up CrossrefController and register CrossrefModule"
```

---

## Task 3: Mobile types and API function

**Files:**
- Modify: `mobile/types/index.ts`
- Modify: `mobile/services/api.ts`

- [ ] **Step 1: Add CrossrefSuggestion and CrossrefResult types**

Open `mobile/types/index.ts`. Append at the end of the file:

```typescript
export interface CrossrefSuggestion {
  partNumber: string;
  manufacturer: string;
  matchReason: string;
  keySpecs: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface CrossrefResult {
  suggestions: CrossrefSuggestion[];
  error?: string;
}
```

- [ ] **Step 2: Add findEquivalents to the API service**

Open `mobile/services/api.ts`. Add this import after the existing imports (the file currently has no types import):

```typescript
import { CrossrefResult } from '../types';
```

Then add the function before `export default api;`:

```typescript
// Cross-referencing
export const findEquivalents = async (
  partNumber: string,
  manufacturer?: string,
  description?: string,
): Promise<CrossrefResult> => {
  const { data } = await api.post('/crossref', { partNumber, manufacturer, description });
  return data as CrossrefResult;
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/types/index.ts mobile/services/api.ts
git commit -m "feat: add CrossrefSuggestion types and findEquivalents API function"
```

---

## Task 4: CrossrefScreen

**Files:**
- Create: `mobile/app/crossref.tsx`

- [ ] **Step 1: Create the CrossrefScreen**

Create `mobile/app/crossref.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { findEquivalents } from '../services/api';
import { CrossrefSuggestion } from '../types';

const CONFIDENCE = {
  high: { color: '#16a34a', label: 'High' },
  medium: { color: '#d97706', label: 'Medium' },
  low: { color: '#dc2626', label: 'Low' },
};

export default function CrossrefScreen() {
  const { partNumber, manufacturer, description } = useLocalSearchParams<{
    partNumber: string;
    manufacturer?: string;
    description?: string;
  }>();

  const [suggestions, setSuggestions] = useState<CrossrefSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, [partNumber]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await findEquivalents(partNumber, manufacturer, description);
      setSuggestions(result.suggestions);
      if (result.error) setError(result.error);
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const searchPart = (suggestion: CrossrefSuggestion) => {
    router.push({
      pathname: '/part/[id]',
      params: { id: suggestion.partNumber },
    });
  };

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>Find Equivalent</Text>
          <Text style={s.headerSub} numberOfLines={1}>{partNumber}</Text>
        </View>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={s.loadingTitle}>Searching for compatible parts...</Text>
          <Text style={s.loadingSub}>Analyzing specifications and cross-references</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <View style={s.infoBox}>
            <Ionicons name="swap-horizontal-outline" size={16} color="#1e40af" />
            <Text style={s.infoText}>
              AI-suggested equivalents for <Text style={{ fontWeight: '700' }}>{partNumber}</Text>
              {manufacturer ? ` (${manufacturer})` : ''}. Verify specs before ordering.
            </Text>
          </View>

          {suggestions.length === 0 ? (
            <View style={s.center}>
              <Text style={{ fontSize: 48 }}>🔍</Text>
              <Text style={s.emptyTitle}>No equivalents found</Text>
              <Text style={s.emptySub}>
                {error || 'This part may be too specialized or obscure for AI cross-referencing.'}
              </Text>
              <TouchableOpacity style={s.manualBtn} onPress={() => router.replace('/(tabs)')}>
                <Ionicons name="search-outline" size={16} color="#1e40af" />
                <Text style={s.manualBtnText}>Search Manually</Text>
              </TouchableOpacity>
            </View>
          ) : (
            suggestions.map((s_item, i) => {
              const cfg = CONFIDENCE[s_item.confidence] || CONFIDENCE.low;
              return (
                <View key={i} style={s.card}>
                  <View style={s.cardTop}>
                    <Text style={s.manufacturer}>{s_item.manufacturer}</Text>
                    <View style={s.confidenceDot}>
                      <View style={[s.dot, { backgroundColor: cfg.color }]} />
                      <Text style={[s.confidenceLabel, { color: cfg.color }]}>{cfg.label}</Text>
                    </View>
                  </View>
                  <Text style={s.partNumber}>{s_item.partNumber}</Text>
                  <Text style={s.matchReason}>{s_item.matchReason}</Text>
                  {s_item.keySpecs.length > 0 && (
                    <View style={s.specRow}>
                      {s_item.keySpecs.map((spec, j) => (
                        <View key={j} style={s.specChip}>
                          <Text style={s.specText}>{spec}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity style={s.searchBtn} onPress={() => searchPart(s_item)}>
                    <Text style={s.searchBtnText}>Search This Part</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e40af',
    paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, gap: 12,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  headerSub: { color: '#93c5fd', fontSize: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, padding: 32 },
  loadingTitle: { fontSize: 16, fontWeight: '600', color: '#111827' },
  loadingSub: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },
  infoBox: {
    flexDirection: 'row', gap: 8, backgroundColor: '#eff6ff',
    borderRadius: 10, padding: 12, marginBottom: 16, alignItems: 'flex-start',
  },
  infoText: { flex: 1, fontSize: 13, color: '#1e40af', lineHeight: 18 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#f3f4f6', elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  manufacturer: { fontSize: 13, color: '#6b7280', fontWeight: '500' },
  confidenceDot: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  confidenceLabel: { fontSize: 12, fontWeight: '600' },
  partNumber: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 6 },
  matchReason: { fontSize: 13, color: '#4b5563', lineHeight: 18, marginBottom: 10 },
  specRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  specChip: { backgroundColor: '#f3f4f6', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  specText: { fontSize: 12, color: '#374151' },
  searchBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, backgroundColor: '#1e40af', borderRadius: 8, padding: 12,
  },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  manualBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#eff6ff', borderRadius: 8, paddingHorizontal: 16,
    paddingVertical: 10, borderWidth: 1, borderColor: '#bfdbfe', marginTop: 8,
  },
  manualBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 14 },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/app/crossref.tsx
git commit -m "feat: add CrossrefScreen with suggestion cards and empty state"
```

---

## Task 5: Detail page entry points

**Files:**
- Modify: `mobile/app/part/[id].tsx`

- [ ] **Step 1: Add the `noStock` helper and two entry point buttons**

Open `mobile/app/part/[id].tsx`.

After the `best` computation on line 77 (`const best = prices.filter...`), add:

```typescript
  const noStock = !loading && prices.length > 0 && prices.every(
    p => p.price === null || p.source === 'BACKORDER' || p.error,
  );

  const goToCrossref = () => router.push({
    pathname: '/crossref',
    params: {
      partNumber: id,
      manufacturer: prices[0]?.vendorName || '',
      description: '',
    },
  });
```

- [ ] **Step 2: Add the no-stock banner**

In the JSX, after the `{prices.length === 0 && ...}` empty state block (around line 183), add this block before the closing `</ScrollView>`:

```tsx
          {noStock && (
            <View style={s.noStockBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 18 }}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '700', color: '#92400e', fontSize: 15 }}>No stock found at any vendor</Text>
                  <Text style={{ color: '#92400e', fontSize: 13, marginTop: 2 }}>Find a compatible replacement part?</Text>
                </View>
              </View>
              <TouchableOpacity style={s.crossrefBtn} onPress={goToCrossref}>
                <Ionicons name="swap-horizontal-outline" size={18} color="#fff" />
                <Text style={s.crossrefBtnText}>Find Equivalent Parts</Text>
              </TouchableOpacity>
            </View>
          )}
```

- [ ] **Step 3: Add the secondary "Find Equivalent" button on every detail page**

In the header section (inside the `<View style={s.header}>` block), add a second icon button after the refresh button. Replace the existing header block (lines 81–92) with:

```tsx
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle} numberOfLines={1}>{id}</Text>
          <Text style={s.headerSub}>Live prices • {prices.length + (sourceResult ? 1 : 0)} vendors</Text>
        </View>
        <TouchableOpacity onPress={goToCrossref} style={{ padding: 4 }}>
          <Ionicons name="swap-horizontal-outline" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity onPress={load} style={{ padding: 4 }}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
```

- [ ] **Step 4: Add the two new styles**

In the `StyleSheet.create` block at the bottom of the file, add after the last style:

```typescript
  noStockBanner: {
    backgroundColor: '#fef3c7', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#fcd34d',
  },
  crossrefBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: '#d97706', borderRadius: 8, padding: 12,
  },
  crossrefBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/part/[id].tsx
git commit -m "feat: add Find Equivalent entry points on part detail page"
```

---

## Task 6: Search screen "Find Equivalent" chip toggle

**Files:**
- Modify: `mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Add the findEquivalent state and chip**

Open `mobile/app/(tabs)/index.tsx`.

Add `findEquivalent` state after the existing state declarations (after line 13 `const [searched, setSearched] = useState(false);`):

```typescript
  const [findEquivalent, setFindEquivalent] = useState(false);
```

- [ ] **Step 2: Update doSearch to route to crossref when toggle is active**

Replace the existing `doSearch` function (line 30):

```typescript
  const doSearch = async () => {
    if (!query.trim()) return;
    if (findEquivalent) {
      router.push({
        pathname: '/crossref',
        params: { partNumber: query.trim() },
      });
      return;
    }
    triggerSearch(query);
  };
```

- [ ] **Step 3: Add the "Find Equivalent" chip to the chips row**

Replace the existing `<View style={s.chips}>` block (lines 92–96) with:

```tsx
      <View style={s.chips}>
        {['Grainger', 'Motion', 'McMaster'].map(v => (
          <View key={v} style={s.chip}><Text style={s.chipText}>{v}</Text></View>
        ))}
        <TouchableOpacity
          style={[s.chip, findEquivalent && s.chipActive]}
          onPress={() => setFindEquivalent(v => !v)}
        >
          <Text style={[s.chipText, findEquivalent && s.chipTextActive]}>🔄 Find Equivalent</Text>
        </TouchableOpacity>
      </View>
```

- [ ] **Step 4: Add chipActive and chipTextActive styles**

In the `StyleSheet.create` block, add after `chipText`:

```typescript
  chipActive: { backgroundColor: '#1e40af', borderColor: '#1e40af' },
  chipTextActive: { color: '#fff' },
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/app/(tabs)/index.tsx
git commit -m "feat: add Find Equivalent chip toggle to search screen"
```

---

## Task 7: Deploy

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

Expected: Railway auto-deploy triggers on push (watch Railway dashboard for build status).

- [ ] **Step 2: Verify backend endpoint is live**

After Railway deploy completes, test with curl (replace `<RAILWAY_URL>` with your actual Railway URL and `<TOKEN>` with a valid JWT from login):

```bash
curl -X POST https://<RAILWAY_URL>/api/v1/crossref \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <TOKEN>" \
  -d '{"partNumber":"6203-2RS","manufacturer":"NSK","description":"deep groove ball bearing"}'
```

Expected: 200 response with `{"suggestions":[...]}` containing 1–5 items.

- [ ] **Step 3: Manual mobile test — no-stock flow**

1. Search for a part number known to be unavailable (e.g. `"WEG07018ES3E143T"` or any very old motor part)
2. Open the detail page — all vendors should show no price
3. Verify the yellow "No stock found" banner appears below the vendor cards
4. Tap "Find Equivalent Parts"
5. Verify the CrossrefScreen loads with the spinner, then shows suggestion cards
6. Tap "Search This Part" on any suggestion
7. Verify the existing detail page opens with the suggested part number and runs scrapers

- [ ] **Step 4: Manual mobile test — search toggle flow**

1. Tap the "🔄 Find Equivalent" chip in the search screen — verify it highlights blue
2. Type a part number in the search box and tap Search
3. Verify you are taken directly to CrossrefScreen instead of normal search results
4. Tap the chip again — verify it deactivates, then search works normally

- [ ] **Step 5: Manual mobile test — header button**

1. Search for any part and open any detail page
2. Verify the swap icon (↔) appears in the header next to the refresh icon
3. Tap it — verify CrossrefScreen opens with that part number
