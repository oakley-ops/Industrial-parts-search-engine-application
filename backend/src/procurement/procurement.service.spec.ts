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
