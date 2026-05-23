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
IMPORTANT: If no specific part number is visible, set "partNumber" to the most searchable product name or description (e.g. "USB-C to USB-A adapter", "24V DC relay", "Allen-Bradley PLC module"). Never leave partNumber empty.
Respond ONLY with valid JSON, no markdown, no explanation:
{"partNumber":"...","manufacturer":"...","description":"...","confidence":"high|medium|low"}`;

const PART_PROMPT = `You are identifying an industrial or electronic component from a photo.
Identify the part as specifically as possible — manufacturer, model number, and component type.
IMPORTANT: Always fill "partNumber" with the best searchable term you can find:
- If a part number or model number is visible, use it exactly (e.g. "E3NX-FA41", "Arduino Uno R3")
- If no number is visible, use the most specific product name that would return results in a parts search (e.g. "USB-C to USB-A adapter cable", "12V 5A power supply", "NEMA 17 stepper motor")
Never leave partNumber empty — a good search term is always better than nothing.
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
      return JSON.parse(match![0]);
    } catch {
      this.logger.error(`Failed to parse vision response: ${raw}`);
      return { partNumber: '', manufacturer: '', description: '', confidence: 'low' };
    }
  }
}
