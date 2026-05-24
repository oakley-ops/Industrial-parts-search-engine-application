import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ProcurementConversation } from './entities/procurement-conversation.entity';
import { ProcurementMessage } from './entities/procurement-message.entity';

const PROCUREMENT_SYSTEM_PROMPT = `You are a procurement assistant for industrial maintenance engineers.
Help the user identify all parts needed for their repair job through conversation.
Ask clarifying questions (equipment model, failure mode, quantities needed) until you have enough to generate a complete parts list.

When ready to generate the parts list, respond ONLY with valid JSON:
{
  "type": "parts_list",
  "title": "short job title (max 6 words)",
  "summary": "one sentence describing the parts list",
  "parts": [
    {
      "partNumber": "exact part number or best searchable identifier",
      "description": "part description",
      "quantity": 1,
      "notes": "why this part is needed"
    }
  ]
}

When asking a clarifying question or making a conversational reply, respond ONLY with valid JSON:
{
  "type": "text",
  "title": "short job title if job is clear (max 6 words), or null",
  "content": "your message here"
}

RULES:
- Never use placeholder part numbers
- Suggest real parts from real manufacturers
- If unsure of exact part number, use best searchable identifier (e.g. "Grundfos CM5 impeller kit")
- Maximum 8 parts per list
- Always respond with valid JSON only — no markdown, no explanation outside the JSON`;

@Injectable()
export class ProcurementService {
  private readonly logger = new Logger(ProcurementService.name);
  private client: Anthropic;

  constructor(
    @InjectRepository(ProcurementConversation)
    private readonly convRepo: Repository<ProcurementConversation>,
    @InjectRepository(ProcurementMessage)
    private readonly msgRepo: Repository<ProcurementMessage>,
    private readonly config: ConfigService,
  ) {
    this.client = new Anthropic({ apiKey: config.get<string>('ANTHROPIC_API_KEY') });
  }

  createConversation(userId: string): Promise<ProcurementConversation> {
    return this.convRepo.save(this.convRepo.create({ userId }));
  }

  findAll(userId: string): Promise<ProcurementConversation[]> {
    return this.convRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      select: ['id', 'title', 'createdAt', 'updatedAt'],
    });
  }

  async findOne(id: string, userId: string): Promise<ProcurementConversation> {
    const conv = await this.convRepo.findOne({ where: { id, userId } });
    if (!conv) throw new NotFoundException('Conversation not found');
    return conv;
  }

  async deleteConversation(id: string, userId: string): Promise<{ deleted: boolean }> {
    await this.findOne(id, userId);
    await this.convRepo.delete(id);
    return { deleted: true };
  }

  async sendMessage(
    conversationId: string,
    userId: string,
    userContent: string,
  ): Promise<ProcurementMessage> {
    const conversation = await this.convRepo.findOne({ where: { id: conversationId, userId } });
    if (!conversation) throw new NotFoundException('Conversation not found');

    await this.msgRepo.save(
      this.msgRepo.create({ conversationId, role: 'user', messageType: 'text', content: userContent, parts: null }),
    );

    const history = await this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    const messages = history.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.role === 'assistant' && m.messageType === 'parts_list'
        ? `[Parts list generated: ${m.content}]`
        : m.content,
    }));

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: PROCUREMENT_SYSTEM_PROMPT,
        messages,
      });

      const block = response.content[0];
      if (!block || block.type !== 'text') throw new Error('Unexpected content block type');
      const raw = block.text.trim();
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object in Claude response');
      const parsed = JSON.parse(match[0]);

      if (parsed.title && conversation.title === 'New Conversation') {
        await this.convRepo.update(conversationId, { title: parsed.title });
      }

      if (parsed.type === 'parts_list') {
        return this.msgRepo.save(
          this.msgRepo.create({
            conversationId,
            role: 'assistant',
            messageType: 'parts_list',
            content: parsed.summary,
            parts: parsed.parts,
          }),
        );
      }

      return this.msgRepo.save(
        this.msgRepo.create({
          conversationId,
          role: 'assistant',
          messageType: 'text',
          content: parsed.content,
          parts: null,
        }),
      );
    } catch (err) {
      this.logger.error('Procurement sendMessage failed', err instanceof Error ? err.stack : err);
      return this.msgRepo.save(
        this.msgRepo.create({
          conversationId,
          role: 'assistant',
          messageType: 'text',
          content: 'Sorry, I ran into an issue. Try rephrasing your request.',
          parts: null,
        }),
      );
    }
  }
}
