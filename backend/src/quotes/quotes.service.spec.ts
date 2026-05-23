import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { Quote } from './entities/quote.entity';
import { QuoteLineItem } from './entities/quote-line-item.entity';
import { QuoteStatus } from './dto/update-status.dto';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
});

describe('QuotesService', () => {
  let service: QuotesService;
  let quotesRepo: ReturnType<typeof mockRepo>;
  let itemsRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: getRepositoryToken(Quote), useFactory: mockRepo },
        { provide: getRepositoryToken(QuoteLineItem), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get<QuotesService>(QuotesService);
    quotesRepo = module.get(getRepositoryToken(Quote));
    itemsRepo = module.get(getRepositoryToken(QuoteLineItem));
  });

  describe('findAll', () => {
    it('queries only the requesting user\'s quotes', async () => {
      quotesRepo.find.mockResolvedValue([]);
      await service.findAll('user-a');
      expect(quotesRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-a' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when quote belongs to a different user', async () => {
      quotesRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('quote-1', 'user-b')).rejects.toThrow(NotFoundException);
      expect(quotesRepo.findOne).toHaveBeenCalledWith({ where: { id: 'quote-1', userId: 'user-b' } });
    });

    it('returns the quote when the user owns it', async () => {
      const quote = { id: 'quote-1', userId: 'user-a', title: 'Test' };
      quotesRepo.findOne.mockResolvedValue(quote);
      const result = await service.findOne('quote-1', 'user-a');
      expect(result).toEqual(quote);
    });
  });

  describe('create', () => {
    it('sets userId on the new quote', async () => {
      quotesRepo.create.mockReturnValue({ title: 'Q1', userId: 'user-a', status: QuoteStatus.DRAFT });
      quotesRepo.save.mockResolvedValue({ id: 'q-1', title: 'Q1', userId: 'user-a' });
      await service.create('Q1', undefined, 'user-a');
      expect(quotesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-a', title: 'Q1' }),
      );
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when quote belongs to a different user', async () => {
      quotesRepo.findOne.mockResolvedValue(null);
      await expect(service.delete('quote-1', 'user-b')).rejects.toThrow(NotFoundException);
    });

    it('deletes when the user owns the quote', async () => {
      quotesRepo.findOne.mockResolvedValue({ id: 'quote-1', userId: 'user-a' });
      quotesRepo.delete.mockResolvedValue({});
      const result = await service.delete('quote-1', 'user-a');
      expect(quotesRepo.delete).toHaveBeenCalledWith('quote-1');
      expect(result).toEqual({ deleted: true });
    });
  });
});
