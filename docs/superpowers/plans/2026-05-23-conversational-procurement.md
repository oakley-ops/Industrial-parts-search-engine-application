# Conversational Procurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-turn AI chat tab where maintenance engineers describe a repair job and Claude generates a priced parts list they can add directly to a quote.

**Architecture:** New NestJS `procurement` module with two TypeORM entities (conversation + message), a Claude-backed service, and REST endpoints. Mobile adds a new "Assistant" tab (conversation list) and a full-screen chat screen. Price fetching is client-side — each part card calls the existing `getPricesForPart` independently on render.

**Tech Stack:** NestJS 10, TypeORM/PostgreSQL, Anthropic SDK (`claude-sonnet-4-6`), React Native / Expo Router, TypeScript.

---

## File Map

**Create (backend):**
- `backend/src/procurement/entities/procurement-conversation.entity.ts`
- `backend/src/procurement/entities/procurement-message.entity.ts`
- `backend/src/procurement/procurement.service.ts`
- `backend/src/procurement/procurement.service.spec.ts`
- `backend/src/procurement/procurement.controller.ts`
- `backend/src/procurement/procurement.module.ts`

**Modify (backend):**
- `backend/src/app.module.ts` — register ProcurementModule

**Create (mobile):**
- `mobile/app/(tabs)/procure.tsx` — conversation list tab
- `mobile/app/procurement/[id].tsx` — chat screen

**Modify (mobile):**
- `mobile/types/index.ts` — add ProcurementPart, ProcurementMessage, ProcurementConversation
- `mobile/services/api.ts` — add createConversation, getConversations, getConversation, sendProcurementMessage, deleteConversation
- `mobile/app/(tabs)/_layout.tsx` — add "Assistant" tab

---

## Task 1: Procurement Entities

**Files:**
- Create: `backend/src/procurement/entities/procurement-conversation.entity.ts`
- Create: `backend/src/procurement/entities/procurement-message.entity.ts`

- [ ] **Step 1: Create the conversation entity**

Create `backend/src/procurement/entities/procurement-conversation.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { ProcurementMessage } from './procurement-message.entity';

@Entity('procurement_conversations')
export class ProcurementConversation {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ name: 'user_id' }) userId: string;

  @Column({ default: 'New Conversation' }) title: string;

  @OneToMany(() => ProcurementMessage, msg => msg.conversation, { cascade: true, eager: true })
  messages: ProcurementMessage[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
```

- [ ] **Step 2: Create the message entity**

Create `backend/src/procurement/entities/procurement-message.entity.ts`:

```typescript
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ProcurementConversation } from './procurement-conversation.entity';

export type MessageRole = 'user' | 'assistant';
export type MessageType = 'text' | 'parts_list';

export interface ProcurementPart {
  partNumber: string;
  description: string;
  quantity: number;
  notes: string;
}

@Entity('procurement_messages')
export class ProcurementMessage {
  @PrimaryGeneratedColumn('uuid') id: string;

  @ManyToOne(() => ProcurementConversation, conv => conv.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversation_id' })
  conversation: ProcurementConversation;

  @Column({ name: 'conversation_id' }) conversationId: string;

  @Column({ type: 'varchar' }) role: MessageRole;

  @Column({ name: 'message_type', type: 'varchar', default: 'text' }) messageType: MessageType;

  @Column({ type: 'text' }) content: string;

  @Column({ type: 'jsonb', nullable: true }) parts: ProcurementPart[] | null;

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/procurement/ && git commit -m "feat: add ProcurementConversation and ProcurementMessage entities"
```

---

## Task 2: ProcurementService with tests

**Files:**
- Create: `backend/src/procurement/procurement.service.ts`
- Create: `backend/src/procurement/procurement.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/procurement/procurement.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProcurementService } from './procurement.service';
import { ProcurementConversation } from './entities/procurement-conversation.entity';
import { ProcurementMessage } from './entities/procurement-message.entity';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
});

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

describe('ProcurementService', () => {
  let service: ProcurementService;
  let convRepo: ReturnType<typeof mockRepo>;
  let msgRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProcurementService,
        { provide: ConfigService, useValue: { get: () => 'test-key' } },
        { provide: getRepositoryToken(ProcurementConversation), useFactory: mockRepo },
        { provide: getRepositoryToken(ProcurementMessage), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get<ProcurementService>(ProcurementService);
    convRepo = module.get(getRepositoryToken(ProcurementConversation));
    msgRepo = module.get(getRepositoryToken(ProcurementMessage));
  });

  describe('createConversation', () => {
    it('creates and saves a new conversation for the user', async () => {
      const conv = { id: 'conv-1', userId: 'user-1', title: 'New Conversation' };
      convRepo.create.mockReturnValue(conv);
      convRepo.save.mockResolvedValue(conv);

      const result = await service.createConversation('user-1');
      expect(convRepo.create).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(result.id).toBe('conv-1');
    });
  });

  describe('findAll', () => {
    it('returns only the requesting user\'s conversations', async () => {
      convRepo.find.mockResolvedValue([]);
      await service.findAll('user-1');
      expect(convRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { updatedAt: 'DESC' },
        select: ['id', 'title', 'createdAt', 'updatedAt'],
      });
    });
  });

  describe('sendMessage', () => {
    const conv = { id: 'conv-1', userId: 'user-1', title: 'New Conversation' };
    const history = [{ role: 'user', messageType: 'text', content: 'I need to replace a pump', conversationId: 'conv-1' }];

    beforeEach(() => {
      convRepo.findOne.mockResolvedValue(conv);
      msgRepo.save.mockImplementation(msg => Promise.resolve({ id: 'msg-1', ...msg }));
      msgRepo.create.mockImplementation(msg => msg);
      msgRepo.find.mockResolvedValue(history);
    });

    it('saves user message then assistant text reply', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '{"type":"text","title":null,"content":"What is the pump model?"}' }],
      });

      const result = await service.sendMessage('conv-1', 'user-1', 'I need to replace a pump');
      expect(result.role).toBe('assistant');
      expect(result.messageType).toBe('text');
      expect(result.content).toBe('What is the pump model?');
      expect(result.parts).toBeNull();
    });

    it('saves parts_list reply with parts array and updates title', async () => {
      mockCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            type: 'parts_list',
            title: 'Grundfos CM5 repair',
            summary: 'Parts to rebuild Grundfos CM5',
            parts: [{ partNumber: 'CM5-IMPELLER', description: 'Impeller kit', quantity: 1, notes: 'Main wear part' }],
          }),
        }],
      });

      const result = await service.sendMessage('conv-1', 'user-1', 'Grundfos CM5 pump');
      expect(result.messageType).toBe('parts_list');
      expect(result.parts).toHaveLength(1);
      expect(result.parts![0].partNumber).toBe('CM5-IMPELLER');
      expect(convRepo.update).toHaveBeenCalledWith('conv-1', { title: 'Grundfos CM5 repair' });
    });

    it('returns fallback text message on Claude parse failure', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: 'not valid json' }],
      });

      const result = await service.sendMessage('conv-1', 'user-1', 'some message');
      expect(result.role).toBe('assistant');
      expect(result.messageType).toBe('text');
      expect(result.content).toBe('Sorry, I ran into an issue. Try rephrasing your request.');
    });

    it('throws NotFoundException when conversation not found', async () => {
      convRepo.findOne.mockResolvedValue(null);
      await expect(service.sendMessage('bad-id', 'user-1', 'hello')).rejects.toThrow(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx jest procurement.service.spec.ts --no-coverage 2>&1 | tail -10
```

Expected: FAIL — `ProcurementService` not found.

- [ ] **Step 3: Create the service**

Create `backend/src/procurement/procurement.service.ts`:

```typescript
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

      const raw = (response.content[0] as { type: string; text: string }).text.trim();
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match![0]);

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
      this.logger.error(`Procurement sendMessage failed: ${err}`);
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx jest procurement.service.spec.ts --no-coverage 2>&1 | tail -15
```

Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/procurement/procurement.service.ts backend/src/procurement/procurement.service.spec.ts && git commit -m "feat: add ProcurementService with Claude multi-turn chat"
```

---

## Task 3: ProcurementController, Module, AppModule wiring

**Files:**
- Create: `backend/src/procurement/procurement.controller.ts`
- Create: `backend/src/procurement/procurement.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Create the controller**

Create `backend/src/procurement/procurement.controller.ts`:

```typescript
import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ProcurementService } from './procurement.service';

class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}

@Controller('procurement')
@UseGuards(JwtAuthGuard)
export class ProcurementController {
  constructor(private svc: ProcurementService) {}

  @Post()
  create(@CurrentUser() user: { id: string }) {
    return this.svc.createConversation(user.id);
  }

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.svc.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.findOne(id, user.id);
  }

  @Post(':id/messages')
  sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.sendMessage(id, user.id, dto.content);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.deleteConversation(id, user.id);
  }
}
```

- [ ] **Step 2: Create the module**

Create `backend/src/procurement/procurement.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { ProcurementConversation } from './entities/procurement-conversation.entity';
import { ProcurementMessage } from './entities/procurement-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProcurementConversation, ProcurementMessage])],
  controllers: [ProcurementController],
  providers: [ProcurementService],
})
export class ProcurementModule {}
```

- [ ] **Step 3: Register ProcurementModule in AppModule**

Open `backend/src/app.module.ts`. Add the import:

```typescript
import { ProcurementModule } from './procurement/procurement.module';
```

Add `ProcurementModule` to the `imports` array after `CrossrefModule`:

```typescript
    CrossrefModule,
    ProcurementModule,
```

- [ ] **Step 4: Verify TypeScript compiles and all tests pass**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/backend" && npx tsc --noEmit && npx jest --no-coverage 2>&1 | tail -10
```

Expected: zero type errors, all tests pass.

- [ ] **Step 5: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add backend/src/procurement/procurement.controller.ts backend/src/procurement/procurement.module.ts backend/src/app.module.ts && git commit -m "feat: wire up ProcurementController and register ProcurementModule"
```

---

## Task 4: Mobile types and API functions

**Files:**
- Modify: `mobile/types/index.ts`
- Modify: `mobile/services/api.ts`

- [ ] **Step 1: Add procurement types to mobile/types/index.ts**

Append at the end of `mobile/types/index.ts`:

```typescript
export interface ProcurementPart {
  partNumber: string;
  description: string;
  quantity: number;
  notes: string;
}

export interface ProcurementMessage {
  id: string;
  role: 'user' | 'assistant';
  messageType: 'text' | 'parts_list';
  content: string;
  parts: ProcurementPart[] | null;
  createdAt: string;
}

export interface ProcurementConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ProcurementMessage[];
}
```

- [ ] **Step 2: Add API functions to mobile/services/api.ts**

Open `mobile/services/api.ts`. Update the existing types import line (currently `import { CrossrefResult } from '../types';`) to:

```typescript
import { CrossrefResult, ProcurementConversation, ProcurementMessage } from '../types';
```

Then add the following before `export default api;`:

```typescript
// Procurement
export const createConversation = async (): Promise<ProcurementConversation> => {
  const { data } = await api.post('/procurement');
  return data as ProcurementConversation;
};
export const getConversations = async (): Promise<ProcurementConversation[]> => {
  const { data } = await api.get('/procurement');
  return data as ProcurementConversation[];
};
export const getConversation = async (id: string): Promise<ProcurementConversation> => {
  const { data } = await api.get(`/procurement/${id}`);
  return data as ProcurementConversation;
};
export const sendProcurementMessage = async (id: string, content: string): Promise<ProcurementMessage> => {
  const { data } = await api.post(`/procurement/${id}/messages`, { content });
  return data as ProcurementMessage;
};
export const deleteProcurementConversation = async (id: string): Promise<void> => {
  await api.delete(`/procurement/${id}`);
};
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add mobile/types/index.ts mobile/services/api.ts && git commit -m "feat: add procurement types and API functions"
```

---

## Task 5: Conversation list tab

**Files:**
- Create: `mobile/app/(tabs)/procure.tsx`
- Modify: `mobile/app/(tabs)/_layout.tsx`

- [ ] **Step 1: Create the procure tab screen**

Create `mobile/app/(tabs)/procure.tsx`:

```typescript
import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getConversations, createConversation, deleteProcurementConversation } from '../../services/api';
import { ProcurementConversation } from '../../types';

export default function ProcureScreen() {
  const [conversations, setConversations] = useState<ProcurementConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useFocusEffect(useCallback(() => { load(); }, []));

  const load = async () => {
    setLoading(true);
    try { setConversations(await getConversations()); } finally { setLoading(false); }
  };

  const handleNew = async () => {
    setCreating(true);
    try {
      const conv = await createConversation();
      router.push({ pathname: '/procurement/[id]', params: { id: conv.id } });
    } finally { setCreating(false); }
  };

  const handleDelete = (id: string, title: string) => {
    Alert.alert('Delete', `Delete "${title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteProcurementConversation(id);
          load();
        },
      },
    ]);
  };

  return (
    <View style={s.container}>
      <TouchableOpacity style={s.newBtn} onPress={handleNew} disabled={creating}>
        {creating
          ? <ActivityIndicator color="#fff" size="small" />
          : <Ionicons name="add-circle" size={20} color="#fff" />}
        <Text style={s.newBtnText}>New Conversation</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color="#1e40af" />
      ) : conversations.length === 0 ? (
        <View style={s.empty}>
          <Text style={{ fontSize: 64 }}>🤖</Text>
          <Text style={s.emptyTitle}>No conversations yet</Text>
          <Text style={s.emptySub}>Describe a repair job and Claude will build your parts list</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={c => c.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.card}
              onPress={() => router.push({ pathname: '/procurement/[id]', params: { id: item.id } })}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={s.cardMeta}>{new Date(item.updatedAt).toLocaleDateString()}</Text>
                </View>
                <TouchableOpacity onPress={() => handleDelete(item.id, item.title)} style={{ padding: 4 }}>
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#9ca3af" style={{ alignSelf: 'flex-end', marginTop: 4 }} />
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1e40af',
    margin: 16, borderRadius: 10, padding: 14, justifyContent: 'center',
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardMeta: { fontSize: 13, color: '#6b7280' },
});
```

- [ ] **Step 2: Add the Assistant tab to _layout.tsx**

Open `mobile/app/(tabs)/_layout.tsx`. Add the new tab after the `alerts` tab entry. Replace the existing `</Tabs>` closing block with:

```tsx
      <Tabs.Screen name="alerts" options={{ title: 'Alerts', tabBarLabel: 'Alerts', tabBarIcon: ({ color, size }) => <Ionicons name="notifications" size={size} color={color} /> }} />
      <Tabs.Screen name="procure" options={{ title: 'Assistant', tabBarLabel: 'Assistant', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubble-outline" size={size} color={color} /> }} />
    </Tabs>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add mobile/app/(tabs)/procure.tsx mobile/app/(tabs)/_layout.tsx && git commit -m "feat: add Assistant tab with conversation list"
```

---

## Task 6: Chat screen

**Files:**
- Create: `mobile/app/procurement/[id].tsx`

- [ ] **Step 1: Create the chat screen**

Price state is lifted to the parent (not inside PartCard) so the "Add All to Quote" button can access all resolved prices. `partPrices` is a `Record<partNumber, PriceResult[]>` keyed by part number; `partPricesLoading` tracks which parts are still fetching.

Create `mobile/app/procurement/[id].tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getConversation, sendProcurementMessage,
  getQuotes, createQuote, addLineItem, getPricesForPart,
} from '../../services/api';
import { ProcurementConversation, ProcurementMessage, ProcurementPart, Quote, PriceResult } from '../../types';

function PartCard({
  part,
  prices,
  loadingPrice,
  onAddToQuote,
}: {
  part: ProcurementPart;
  prices: PriceResult[];
  loadingPrice: boolean;
  onAddToQuote: (part: ProcurementPart, price: PriceResult | null) => void;
}) {
  const best = prices.filter(p => p.price !== null).sort((a, b) => (a.price || 0) - (b.price || 0))[0] || null;

  return (
    <View style={ps.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <Text style={ps.partNumber} numberOfLines={1}>{part.partNumber}</Text>
        <Text style={ps.qty}>Qty: {part.quantity}</Text>
      </View>
      <Text style={ps.description}>{part.description}</Text>
      {part.notes ? <Text style={ps.notes}>{part.notes}</Text> : null}
      {loadingPrice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
          <ActivityIndicator size="small" color="#1e40af" />
          <Text style={{ color: '#6b7280', fontSize: 12 }}>Fetching prices...</Text>
        </View>
      ) : best ? (
        <Text style={ps.price}>${best.price!.toFixed(2)} <Text style={ps.priceVendor}>({best.vendorName})</Text></Text>
      ) : (
        <Text style={ps.noPrice}>Price unavailable</Text>
      )}
      <TouchableOpacity style={ps.addBtn} onPress={() => onAddToQuote(part, best)}>
        <Ionicons name="add-circle-outline" size={16} color="#1e40af" />
        <Text style={ps.addBtnText}>Add to Quote</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ProcurementChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conversation, setConversation] = useState<ProcurementConversation | null>(null);
  const [messages, setMessages] = useState<ProcurementMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  // Price state lifted to parent so "Add All to Quote" can access all resolved prices
  const [partPrices, setPartPrices] = useState<Record<string, PriceResult[]>>({});
  const [partPricesLoading, setPartPricesLoading] = useState<Record<string, boolean>>({});

  // Quote modal state
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedPart, setSelectedPart] = useState<ProcurementPart | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<PriceResult | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [newQuoteTitle, setNewQuoteTitle] = useState('');
  const [savingQuote, setSavingQuote] = useState(false);
  const [qty, setQty] = useState('1');
  // When non-null, the quote modal is in "add all" mode
  const [addAllParts, setAddAllParts] = useState<ProcurementPart[] | null>(null);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { load(); }, [id]);

  // Fetch prices for all parts in parts_list messages whenever messages change
  useEffect(() => {
    messages.forEach(msg => {
      if (msg.messageType === 'parts_list' && msg.parts) {
        msg.parts.forEach(part => {
          if (partPrices[part.partNumber] === undefined && !partPricesLoading[part.partNumber]) {
            setPartPricesLoading(prev => ({ ...prev, [part.partNumber]: true }));
            getPricesForPart(part.partNumber)
              .then(p => setPartPrices(prev => ({ ...prev, [part.partNumber]: p })))
              .catch(() => setPartPrices(prev => ({ ...prev, [part.partNumber]: [] })))
              .finally(() => setPartPricesLoading(prev => ({ ...prev, [part.partNumber]: false })));
          }
        });
      }
    });
  }, [messages]);

  const load = async () => {
    setLoading(true);
    try {
      const conv = await getConversation(id);
      setConversation(conv);
      setMessages(conv.messages || []);
    } catch {
      Alert.alert('Error', 'Could not load conversation');
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    const optimistic: ProcurementMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      messageType: 'text',
      content: text,
      parts: null,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);

    try {
      const reply = await sendProcurementMessage(id, text);
      setMessages(prev => [...prev, reply]);
      if (reply.messageType === 'parts_list' || conversation?.title === 'New Conversation') {
        const updated = await getConversation(id);
        setConversation(updated);
      }
    } catch {
      Alert.alert('Error', 'Could not send message');
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const openQuoteModal = async (part: ProcurementPart, price: PriceResult | null) => {
    setAddAllParts(null);
    setSelectedPart(part);
    setSelectedPrice(price);
    setQty(String(part.quantity));
    setNewQuoteTitle('');
    try { setQuotes(await getQuotes()); } catch {}
    setShowQuoteModal(true);
  };

  const addToExistingQuote = async (quoteId: string) => {
    if (addAllParts) {
      setShowQuoteModal(false);
      await addAllToQuote(addAllParts, quoteId);
      return;
    }
    if (!selectedPart || !selectedPrice) return;
    setSavingQuote(true);
    try {
      await addLineItem(quoteId, {
        partNumber: selectedPart.partNumber,
        vendorSlug: selectedPrice.vendorSlug,
        vendorName: selectedPrice.vendorName,
        vendorSku: selectedPrice.vendorSku,
        quantity: parseInt(qty) || 1,
        unitPrice: selectedPrice.price || 0,
        availability: selectedPrice.source,
        productUrl: selectedPrice.productUrl,
      });
      setShowQuoteModal(false);
      Alert.alert('Added!', 'Part added to quote.');
    } catch {
      Alert.alert('Error', 'Could not add to quote');
    } finally { setSavingQuote(false); }
  };

  const createAndAdd = async () => {
    if (!newQuoteTitle.trim()) return;
    setSavingQuote(true);
    try {
      const q = await createQuote(newQuoteTitle.trim());
      setShowQuoteModal(false);
      if (addAllParts) {
        await addAllToQuote(addAllParts, q.id);
      } else if (selectedPart && selectedPrice) {
        await addLineItem(q.id, {
          partNumber: selectedPart.partNumber,
          vendorSlug: selectedPrice.vendorSlug,
          vendorName: selectedPrice.vendorName,
          vendorSku: selectedPrice.vendorSku,
          quantity: parseInt(qty) || 1,
          unitPrice: selectedPrice.price || 0,
          availability: selectedPrice.source,
          productUrl: selectedPrice.productUrl,
        });
        Alert.alert('Done', 'Part added to new quote.');
      } else {
        Alert.alert('Quote created', 'No price available — part not added automatically.');
      }
    } catch {
      Alert.alert('Error', 'Could not create quote');
    } finally {
      setSavingQuote(false);
    }
  };

  const addAllToQuote = async (parts: ProcurementPart[], quoteId: string) => {
    setSavingQuote(true);
    let added = 0;
    try {
      for (const part of parts) {
        const prices = partPrices[part.partNumber] || [];
        const best = prices.filter(p => p.price !== null).sort((a, b) => (a.price || 0) - (b.price || 0))[0];
        if (!best) continue;
        await addLineItem(quoteId, {
          partNumber: part.partNumber,
          vendorSlug: best.vendorSlug,
          vendorName: best.vendorName,
          vendorSku: best.vendorSku,
          quantity: part.quantity,
          unitPrice: best.price || 0,
          availability: best.source,
          productUrl: best.productUrl,
        });
        added++;
      }
      Alert.alert('Done', `${added} of ${parts.length} parts added to quote.`);
    } catch {
      Alert.alert('Error', 'Could not add all parts');
    } finally {
      setSavingQuote(false);
    }
  };

  const openAddAllModal = async (parts: ProcurementPart[]) => {
    setAddAllParts(parts);
    setNewQuoteTitle('');
    try { setQuotes(await getQuotes()); } catch {}
    setShowQuoteModal(true);
  };

  const renderMessage = (msg: ProcurementMessage, index: number) => {
    const isUser = msg.role === 'user';

    if (msg.messageType === 'parts_list' && msg.parts) {
      const allLoaded = msg.parts.every(p => !partPricesLoading[p.partNumber] && partPrices[p.partNumber] !== undefined);
      return (
        <View key={msg.id} style={s.assistantBubble}>
          <Text style={s.bubbleText}>{msg.content}</Text>
          <TouchableOpacity
            style={[s.addAllBtn, !allLoaded && { opacity: 0.5 }]}
            onPress={() => openAddAllModal(msg.parts!)}
            disabled={!allLoaded}
          >
            <Ionicons name="add-circle" size={16} color="#fff" />
            <Text style={s.addAllBtnText}>{allLoaded ? 'Add All to Quote' : 'Loading prices...'}</Text>
          </TouchableOpacity>
          <View style={s.partsList}>
            {msg.parts.map((part, i) => (
              <PartCard
                key={i}
                part={part}
                prices={partPrices[part.partNumber] || []}
                loadingPrice={partPricesLoading[part.partNumber] ?? true}
                onAddToQuote={openQuoteModal}
              />
            ))}
          </View>
        </View>
      );
    }

    return (
      <View key={msg.id} style={[s.bubble, isUser ? s.userBubble : s.assistantBubble]}>
        <Text style={[s.bubbleText, isUser && s.userBubbleText]}>{msg.content}</Text>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color="#1e40af" />
      </View>
    );
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={{ padding: 4 }}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{conversation?.title || 'Assistant'}</Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
        >
          {messages.length === 0 && (
            <View style={s.emptyChat}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>🔧</Text>
              <Text style={s.emptyChatTitle}>Describe your repair job</Text>
              <Text style={s.emptyChatSub}>Tell me what equipment needs repair and I'll help you identify the parts you need.</Text>
            </View>
          )}
          {messages.map((msg, i) => renderMessage(msg, i))}
          {sending && (
            <View style={s.assistantBubble}>
              <ActivityIndicator size="small" color="#1e40af" />
            </View>
          )}
        </ScrollView>

        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            placeholder="Describe the repair job..."
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={500}
            editable={!sending}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnOff]}
            onPress={handleSend}
            disabled={!input.trim() || sending}
          >
            <Ionicons name="send" size={20} color={input.trim() && !sending ? '#fff' : '#9ca3af'} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showQuoteModal} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={s.modalTitle}>Add to Quote</Text>
            <TouchableOpacity onPress={() => setShowQuoteModal(false)}>
              <Ionicons name="close" size={24} color="#111827" />
            </TouchableOpacity>
          </View>
          {addAllParts ? (
            <View style={s.selectedBanner}>
              <Text style={{ fontWeight: '700', color: '#1e40af' }}>Adding {addAllParts.length} parts to quote</Text>
            </View>
          ) : selectedPart ? (
            <View style={s.selectedBanner}>
              <Text style={{ fontWeight: '700', color: '#1e40af' }}>{selectedPart.partNumber}</Text>
              <Text style={{ fontWeight: '700' }}>
                {selectedPrice ? `$${selectedPrice.price?.toFixed(2)}` : 'No price'}
              </Text>
            </View>
          ) : null}
          {!addAllParts && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontSize: 16, fontWeight: '600' }}>Quantity</Text>
              <TextInput style={s.qtyInput} value={qty} onChangeText={setQty} keyboardType="number-pad" />
            </View>
          )}
          {quotes.filter(q => q.status === 'draft').length > 0 && (
            <>
              <Text style={s.sectionLabel}>ADD TO EXISTING QUOTE</Text>
              {quotes.filter(q => q.status === 'draft').map(q => (
                <TouchableOpacity key={q.id} style={s.quoteRow} onPress={() => addToExistingQuote(q.id)} disabled={savingQuote}>
                  <Text style={{ fontWeight: '600', color: '#111827' }}>{q.title}</Text>
                  <Text style={{ color: '#6b7280', fontSize: 13 }}>{q.lineItems?.length || 0} items</Text>
                </TouchableOpacity>
              ))}
            </>
          )}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>CREATE NEW QUOTE</Text>
          <TextInput style={s.textInput} placeholder="Quote title..." value={newQuoteTitle} onChangeText={setNewQuoteTitle} />
          <TouchableOpacity
            style={[s.createBtn, (!newQuoteTitle.trim() || savingQuote) && { opacity: 0.5 }]}
            onPress={createAndAdd}
            disabled={!newQuoteTitle.trim() || savingQuote}
          >
            {savingQuote ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Create & Add</Text>}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const ps = StyleSheet.create({
  card: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#e2e8f0' },
  partNumber: { fontSize: 15, fontWeight: '800', color: '#111827', flex: 1 },
  qty: { fontSize: 13, color: '#6b7280', fontWeight: '600' },
  description: { fontSize: 13, color: '#374151', marginBottom: 2 },
  notes: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginBottom: 4 },
  price: { fontSize: 16, fontWeight: '800', color: '#1e40af', marginTop: 6 },
  priceVendor: { fontSize: 12, fontWeight: '400', color: '#6b7280' },
  noPrice: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic', marginTop: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, borderWidth: 1.5, borderColor: '#1e40af', borderRadius: 6, padding: 8, justifyContent: 'center' },
  addBtnText: { color: '#1e40af', fontWeight: '600', fontSize: 13 },
});

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1e40af', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16,
  },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, textAlign: 'center' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyChat: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 32 },
  emptyChatTitle: { fontSize: 20, fontWeight: '700', color: '#111827', marginBottom: 8 },
  emptyChatSub: { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 22 },
  bubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 10 },
  userBubble: { backgroundColor: '#1e40af', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#e5e7eb', padding: 14, borderRadius: 16, marginBottom: 10, maxWidth: '92%' },
  bubbleText: { fontSize: 15, color: '#111827', lineHeight: 22 },
  userBubbleText: { color: '#fff' },
  addAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1e40af', borderRadius: 8, padding: 10, justifyContent: 'center', marginTop: 10 },
  addAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  partsList: { marginTop: 4 },
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10, padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  input: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, maxHeight: 100 },
  sendBtn: { backgroundColor: '#1e40af', borderRadius: 10, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
  sendBtnOff: { backgroundColor: '#f3f4f6' },
  modal: { flex: 1, padding: 24, backgroundColor: '#fff' },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#111827' },
  selectedBanner: { backgroundColor: '#eff6ff', borderRadius: 10, padding: 12, marginBottom: 16, flexDirection: 'row', justifyContent: 'space-between' },
  qtyInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8, padding: 10, width: 80, textAlign: 'center', fontSize: 16 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 8, letterSpacing: 0.5 },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, marginBottom: 8 },
  textInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, fontSize: 15, marginBottom: 12 },
  createBtn: { backgroundColor: '#1e40af', borderRadius: 10, padding: 16, alignItems: 'center' },
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application/mobile" && npx tsc --noEmit 2>&1 | head -10
```

Expected: no new errors (pre-existing `camera.tsx` errors are acceptable).

- [ ] **Step 3: Commit**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git add mobile/app/procurement/ && git commit -m "feat: add procurement chat screen with part cards and quote modal"
```

---

## Task 7: Deploy and verify

- [ ] **Step 1: Push to GitHub**

```bash
cd "/Users/isaacrodriguez/Industrial parts search app/Industrial-parts-search-engine-application" && git push origin main
```

Expected: Railway auto-deploy triggers.

- [ ] **Step 2: Verify backend after deploy**

After Railway build completes, confirm the new tables exist by checking Railway logs for TypeORM `CREATE TABLE` statements on `procurement_conversations` and `procurement_messages` (TypeORM `synchronize: true` handles migrations automatically).

- [ ] **Step 3: Manual end-to-end mobile test**

1. Open the app — verify "Assistant" tab appears in bottom nav
2. Tap "New Conversation"
3. Type: "I need to replace the motor on a conveyor belt, it's a 1HP TEFC 56C frame"
4. Verify Claude asks at least one clarifying question
5. Answer it (e.g. "single phase 115V")
6. Verify Claude returns a parts list with part cards
7. Verify each part card shows a loading spinner then resolves to a price
8. Tap "Add to Quote" on one part — verify quote modal opens and works
9. Go back to the Assistant tab — verify conversation appears in the list with the job title
10. Close and reopen the app — verify conversation persists
