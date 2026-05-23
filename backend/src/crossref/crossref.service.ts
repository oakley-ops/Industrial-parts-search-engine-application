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
