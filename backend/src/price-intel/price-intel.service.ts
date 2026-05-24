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
