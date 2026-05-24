# Price Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Claude-powered "Analyze Prices" button to the part detail screen that returns a single directive recommendation ("Buy at Grainger now — $4.50 is at the low end of the typical range") with a confidence level, cached 24 hours in Redis.

**Architecture:** New NestJS `price-intel` module with one POST endpoint — identical pattern to the existing `crossref` module. Mobile adds two state vars and a button/result card to the existing part detail screen. No new screens, no new tables.

**Tech Stack:** NestJS 10, Anthropic SDK (`claude-sonnet-4-6`), Redis (ioredis, global), React Native / Expo Router, TypeScript.

---

## File Map

**Create (backend):**
- `backend/src/price-intel/price-intel.service.ts`
- `backend/src/price-intel/price-intel.service.spec.ts`
- `backend/src/price-intel/price-intel.controller.ts`
- `backend/src/price-intel/price-intel.module.ts`

**Modify (backend):**
- `backend/src/app.module.ts` — register `PriceIntelModule`

**Modify (mobile):**
- `mobile/types/index.ts` — append `PriceIntelResult`
- `mobile/services/api.ts` — add `analyzePrices` function + import `PriceIntelResult`
- `mobile/app/part/[id].tsx` — add state, handler, UI, styles

---

## Task 1: PriceIntelService with tests

**Files:**
- Create: `backend/src/price-intel/price-intel.service.ts`
- Create: `backend/src/price-intel/price-intel.service.spec.ts`

The `crossref` module at `backend/src/crossref/crossref.service.ts` is the reference — this service follows the exact same pattern: Redis cache check → Claude call → cache write → return.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/price-intel/price-intel.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PriceIntelService } from './price-intel.service';
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

const SAMPLE_PRICES = [
  { vendorName: 'Grainger', price: 4.50, source: 'VENDOR_WAREHOUSE' },
  { vendorName: 'McMaster-Carr', price: 6.20, source: 'VENDOR_WAREHOUSE' },
];

describe('PriceIntelService', () => {
  let service: PriceIntelService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedis.get.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceIntelService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PriceIntelService>(PriceIntelService);
  });

  it('returns parsed recommendation from Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"recommendation":"Buy at Grainger now — $4.50 is at the low end of the typical range.","confidence":"high"}',
      }],
    });

    const result = await service.analyze('6203-2RS', SAMPLE_PRICES);
    expect(result.recommendation).toContain('Grainger');
    expect(result.confidence).toBe('high');
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'price-intel:6203-2rs',
      86400,
      expect.any(String),
    );
  });

  it('returns cached result without calling Claude', async () => {
    const cached = { recommendation: 'Cached recommendation.', confidence: 'medium' };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));

    const result = await service.analyze('6203-2RS', SAMPLE_PRICES);
    expect(result.recommendation).toBe('Cached recommendation.');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns fallback on malformed Claude response', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    });

    const result = await service.analyze('OBSCURE-XYZ-999', SAMPLE_PRICES);
    expect(result.recommendation).toBe('Could not analyze prices for this part.');
    expect(result.confidence).toBe('low');
  });

  it('returns early without calling Claude when prices array is empty', async () => {
    const result = await service.analyze('6203-2RS', []);
    expect(result.recommendation).toBe('No prices available to analyze.');
    expect(result.confidence).toBe('low');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx jest price-intel.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `PriceIntelService` not found.

- [ ] **Step 3: Create the service**

Create `backend/src/price-intel/price-intel.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { RedisService } from '../redis/redis.service';

export interface PriceIntelResult {
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface PriceEntry {
  vendorName: string;
  price: number;
  source: string;
}

const PRICE_INTEL_PROMPT = `You are a price intelligence assistant for industrial maintenance engineers.
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
- Always respond with valid JSON only — no markdown, no explanation outside the JSON`;

@Injectable()
export class PriceIntelService {
  private readonly logger = new Logger(PriceIntelService.name);
  private client: Anthropic;

  constructor(private config: ConfigService, private redis: RedisService) {
    this.client = new Anthropic({ apiKey: config.get<string>('ANTHROPIC_API_KEY') });
  }

  async analyze(
    partNumber: string,
    prices: PriceEntry[],
    description?: string,
  ): Promise<PriceIntelResult> {
    if (!prices.length) {
      return { recommendation: 'No prices available to analyze.', confidence: 'low' };
    }

    const cacheKey = `price-intel:${partNumber.toLowerCase()}`;

    try {
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // fail open — proceed to Claude
    }

    try {
      const priceLines = prices
        .map(p => `  ${p.vendorName}: $${p.price.toFixed(2)} (${p.source})`)
        .join('\n');
      const userMessage = [
        `Part number: ${partNumber}`,
        description ? `Description: ${description}` : null,
        `Current prices:\n${priceLines}`,
      ]
        .filter(Boolean)
        .join('\n');

      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: [{ type: 'text', text: `${PRICE_INTEL_PROMPT}\n\n${userMessage}` }],
        }],
      });

      const block = response.content[0];
      if (!block || block.type !== 'text') throw new Error('Unexpected content block type');
      const raw = block.text.trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON in Claude response');
      const result: PriceIntelResult = JSON.parse(match[0]);

      try {
        await this.redis.setex(cacheKey, 86400, JSON.stringify(result));
      } catch {
        // fail open — return result even if cache write fails
      }

      return result;
    } catch (err) {
      this.logger.error('PriceIntelService failed', err instanceof Error ? err.stack : err);
      return { recommendation: 'Could not analyze prices for this part.', confidence: 'low' };
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx jest price-intel.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: PASS — 4 tests passing.

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/price-intel/ && git commit -m "feat: add PriceIntelService with Claude price analysis"
```

---

## Task 2: PriceIntelController, Module, AppModule wiring

**Files:**
- Create: `backend/src/price-intel/price-intel.controller.ts`
- Create: `backend/src/price-intel/price-intel.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the controller**

Create `backend/src/price-intel/price-intel.controller.ts`:

```typescript
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PriceIntelService } from './price-intel.service';

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

@Controller('price-intel')
@UseGuards(JwtAuthGuard)
export class PriceIntelController {
  constructor(private svc: PriceIntelService) {}

  @Post()
  analyze(@Body() dto: PriceIntelDto) {
    return this.svc.analyze(dto.partNumber, dto.prices, dto.description);
  }
}
```

- [ ] **Step 2: Create the module**

Create `backend/src/price-intel/price-intel.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PriceIntelController } from './price-intel.controller';
import { PriceIntelService } from './price-intel.service';

@Module({
  controllers: [PriceIntelController],
  providers: [PriceIntelService],
})
export class PriceIntelModule {}
```

- [ ] **Step 3: Register PriceIntelModule in AppModule**

Open `backend/src/app.module.ts`. Add the import line after the `ProcurementModule` import:

```typescript
import { PriceIntelModule } from './price-intel/price-intel.module';
```

Add `PriceIntelModule` to the `imports` array after `ProcurementModule`:

```typescript
    ProcurementModule,
    PriceIntelModule,
```

- [ ] **Step 4: Verify TypeScript compiles and all tests pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx tsc --noEmit && npx jest --no-coverage 2>&1 | tail -10
```

Expected: zero type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/price-intel/price-intel.controller.ts backend/src/price-intel/price-intel.module.ts backend/src/app.module.ts && git commit -m "feat: wire up PriceIntelController and register PriceIntelModule"
```

---

## Task 3: Mobile types and API function

**Files:**
- Modify: `mobile/types/index.ts`
- Modify: `mobile/services/api.ts`

- [ ] **Step 1: Append PriceIntelResult to mobile/types/index.ts**

Add at the end of `mobile/types/index.ts` (after the existing `ProcurementConversation` interface):

```typescript
export interface PriceIntelResult {
  recommendation: string;
  confidence: 'high' | 'medium' | 'low';
}
```

- [ ] **Step 2: Add analyzePrices to mobile/services/api.ts**

Open `mobile/services/api.ts`. The current types import line reads:

```typescript
import { CrossrefResult, ProcurementConversation, ProcurementMessage, ProcurementPart } from '../types';
```

Update it to:

```typescript
import { CrossrefResult, ProcurementConversation, ProcurementMessage, ProcurementPart, PriceIntelResult } from '../types';
```

Then add the following before `export default api;` at the end of the file:

```typescript
// Price Intelligence
export const analyzePrices = async (
  partNumber: string,
  description: string | undefined,
  prices: { vendorName: string; price: number; source: string }[],
): Promise<PriceIntelResult> => {
  const { data } = await api.post('/price-intel', { partNumber, description, prices });
  return data as PriceIntelResult;
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors (pre-existing `camera.tsx` errors are acceptable).

- [ ] **Step 4: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add mobile/types/index.ts mobile/services/api.ts && git commit -m "feat: add PriceIntelResult type and analyzePrices API function"
```

---

## Task 4: Part detail screen UI

**Files:**
- Modify: `mobile/app/part/[id].tsx`

Read the full file before making any edits.

- [ ] **Step 1: Add imports**

The current import line at line 5 reads:
```typescript
import { getPricesForPart, getQuotes, createQuote, addLineItem } from '../../services/api';
```

Replace with:
```typescript
import { getPricesForPart, getQuotes, createQuote, addLineItem, analyzePrices } from '../../services/api';
```

The current import line at line 6 reads:
```typescript
import { PriceResult, Quote } from '../../types';
```

Replace with:
```typescript
import { PriceResult, Quote, PriceIntelResult } from '../../types';
```

- [ ] **Step 2: Add CONF_COLORS constant**

After the `SOURCE` constant (the block ending with `};` around line 13), add:

```typescript
const CONF_COLORS: Record<string, string> = {
  high: '#16a34a',
  medium: '#d97706',
  low: '#9ca3af',
};
```

- [ ] **Step 3: Add state variables**

After the existing state declarations (after the line `const [saving, setSaving] = useState(false);`), add:

```typescript
const [priceIntel, setPriceIntel] = useState<PriceIntelResult | null>(null);
const [analyzingPrices, setAnalyzingPrices] = useState(false);
```

- [ ] **Step 4: Add handleAnalyzePrices function**

After the `goToCrossref` function (the block ending with `};` just before the `return (` statement), add:

```typescript
const handleAnalyzePrices = async () => {
  setAnalyzingPrices(true);
  try {
    const validPrices = prices
      .filter(p => p.price !== null)
      .map(p => ({ vendorName: p.vendorName, price: p.price!, source: p.source }));
    const result = await analyzePrices(id, undefined, validPrices);
    setPriceIntel(result);
  } catch {
    Alert.alert('Error', 'Could not analyze prices');
  } finally {
    setAnalyzingPrices(false);
  }
};
```

- [ ] **Step 5: Add UI element**

Inside the `ScrollView` content, after the closing `</View>` of the `noStock` banner block and before `</ScrollView>`, add:

```tsx
          {!loading && prices.some(p => p.price !== null) && (
            priceIntel ? (
              <View style={s.priceIntelCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <View style={[s.confDot, { backgroundColor: CONF_COLORS[priceIntel.confidence] }]} />
                  <Text style={s.priceIntelTitle}>Price Analysis</Text>
                  <Text style={s.confLabel}>
                    {priceIntel.confidence.charAt(0).toUpperCase() + priceIntel.confidence.slice(1)} conf
                  </Text>
                </View>
                <Text style={s.priceIntelText}>{priceIntel.recommendation}</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.analyzeBtn} onPress={handleAnalyzePrices} disabled={analyzingPrices}>
                {analyzingPrices ? (
                  <>
                    <ActivityIndicator size="small" color="#1e40af" />
                    <Text style={s.analyzeBtnText}>Analyzing prices...</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="bulb-outline" size={18} color="#1e40af" />
                    <Text style={s.analyzeBtnText}>Analyze Prices</Text>
                  </>
                )}
              </TouchableOpacity>
            )
          )}
```

- [ ] **Step 6: Add styles**

In the `StyleSheet.create({...})` block (the `s` object), add these entries after the last existing style (`crossrefBtn` and its related styles):

```typescript
  priceIntelCard: {
    backgroundColor: '#eff6ff', borderRadius: 12, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: '#bfdbfe',
  },
  priceIntelTitle: { fontSize: 14, fontWeight: '700', color: '#1e40af', flex: 1 },
  priceIntelText: { fontSize: 14, color: '#1e3a8a', lineHeight: 22 },
  confDot: { width: 10, height: 10, borderRadius: 5 },
  confLabel: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  analyzeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderWidth: 1.5, borderColor: '#1e40af', borderRadius: 10,
    padding: 14, marginBottom: 12, backgroundColor: '#fff',
  },
  analyzeBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 15 },
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors (pre-existing `camera.tsx` errors are acceptable).

- [ ] **Step 8: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add "mobile/app/part/[id].tsx" && git commit -m "feat: add Analyze Prices button to part detail screen"
```

---

## Task 5: Deploy and verify

- [ ] **Step 1: Push to GitHub**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git push origin main
```

Expected: Railway auto-deploy triggers.

- [ ] **Step 2: Manual end-to-end mobile test**

1. Search for a common part (e.g., "6203-2RS bearing" or "1HP TEFC motor")
2. Open the part detail screen — wait for prices to load from all vendors
3. Verify "Analyze Prices" button appears below the vendor cards (only after prices finish loading)
4. Tap "Analyze Prices" — verify loading state ("Analyzing prices...")
5. Verify the result card appears with recommendation text and a colored confidence dot
6. Confidence dot: green = high, amber = medium, grey = low
7. Go back and reopen the same part — the button should reappear (result is per-session, not persisted on mobile; Redis cache is server-side)
8. Search for an obscure OEM part number — verify low-confidence response mentions "verify before large orders" or similar
