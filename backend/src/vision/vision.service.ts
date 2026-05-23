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
Look carefully at connector shapes, labels, colors, and markings before responding.

RULES for "partNumber":
- If a model/part number is printed on the component, use it exactly (e.g. "E3NX-FA41", "LM317T")
- If no number is visible, write the most precise searchable product name using correct technical terminology:
  * Identify connector types accurately (USB-A, USB-C, Micro-B, Mini-B, RJ45, XLR, etc.)
  * Include key specs if visible (voltage, amperage, length, color)
  * Example good terms: "USB-A male to USB-C male cable 2.0", "24VDC 10A power relay", "M12 4-pin sensor connector"
- NEVER write "Unknown", "N/A", or any placeholder — always describe what you actually see
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
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
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
