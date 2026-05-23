import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

export interface VisionResult {
  partNumber: string;
  manufacturer: string;
  description: string;
  confidence: 'high' | 'medium' | 'low';
}

const LABEL_PROMPT = `You are reading an industrial equipment label or data tag.
Extract the model/part number and manufacturer name.
Ignore serial numbers, voltage ratings, and other non-part-number text.
RULES for "partNumber":
- Use the exact model/part number if visible (e.g. "E3NX-FA41", "LM317T")
- If no part number is visible, use a specific searchable product name (e.g. "USB-C to USB-A adapter", "24V DC relay")
- NEVER write "Unknown", "N/A", "unknown", or any placeholder — always use a real term
Respond ONLY with valid JSON, no markdown, no explanation:
{"partNumber":"...","manufacturer":"...","description":"...","confidence":"high|medium|low"}`;

const PART_PROMPT = `You are identifying an industrial or electronic component from a photo.
RULES for "partNumber":
- If a model/part number is printed on the component, use it exactly (e.g. "E3NX-FA41", "Arduino Uno R3")
- If no number is visible, use the most specific product name a buyer would search for (e.g. "USB 3.0 Type-A to Micro-B cable", "12V 5A DC power supply", "NEMA 17 stepper motor")
- NEVER write "Unknown", "N/A", "unknown", or any placeholder — describe what you see instead
Respond ONLY with valid JSON, no markdown, no explanation:
{"partNumber":"...","manufacturer":"...","description":"...","confidence":"high|medium|low"}`;

@Injectable()
export class VisionService {
  private readonly logger = new Logger(VisionService.name);
  private client: Anthropic;

  constructor(private config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.get<string>('ANTHROPIC_API_KEY') });
  }

  async identify(base64Image: string, mode: 'label' | 'part'): Promise<VisionResult> {
    const prompt = mode === 'label' ? LABEL_PROMPT : PART_PROMPT;

    const response = await this.client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const raw = (response.content[0] as { type: string; text: string }).text.trim();
    const match = raw.match(/\{[\s\S]*\}/);

    try {
      const result: VisionResult = JSON.parse(match![0]);
      const placeholders = /^(unknown|n\/a|none|na|not found|not visible|unclear)$/i;
      if (placeholders.test(result.partNumber?.trim())) {
        result.partNumber = result.description || '';
      }
      if (placeholders.test(result.manufacturer?.trim())) {
        result.manufacturer = '';
      }
      return result;
    } catch {
      this.logger.error(`Failed to parse vision response: ${raw}`);
      return { partNumber: '', manufacturer: '', description: '', confidence: 'low' };
    }
  }
}
