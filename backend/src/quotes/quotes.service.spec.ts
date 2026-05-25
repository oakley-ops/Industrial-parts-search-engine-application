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

  describe('updateLineItem', () => {
    const quoteId = 'quote-1';
    const itemId = 'item-1';
    const userId = 'user-a';
    const quote = { id: quoteId, userId };

    it('updates quantity and recomputes totalPrice using stored unitPrice', async () => {
      const storedItem = { id: itemId, quantity: 3, unitPrice: 2.0 };
      quotesRepo.findOne.mockResolvedValue(quote);
      itemsRepo.findOne.mockResolvedValue(storedItem);
      itemsRepo.update.mockResolvedValue({});

      await service.updateLineItem(quoteId, itemId, { quantity: 5 }, userId);

      expect(itemsRepo.update).toHaveBeenCalledWith(itemId, {
        quantity: 5,
        totalPrice: 10.0,
      });
      expect(itemsRepo.update).not.toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({ unitPrice: expect.anything() }),
      );
    });

    it('updates unitPrice and recomputes totalPrice using stored quantity', async () => {
      const storedItem = { id: itemId, quantity: 4, unitPrice: 1.0 };
      quotesRepo.findOne.mockResolvedValue(quote);
      itemsRepo.findOne.mockResolvedValue(storedItem);
      itemsRepo.update.mockResolvedValue({});

      await service.updateLineItem(quoteId, itemId, { unitPrice: 3.5 }, userId);

      expect(itemsRepo.update).toHaveBeenCalledWith(itemId, {
        unitPrice: 3.5,
        totalPrice: 14.0,
      });
      expect(itemsRepo.update).not.toHaveBeenCalledWith(
        itemId,
        expect.objectContaining({ quantity: expect.anything() }),
      );
    });

    it('updates both quantity and unitPrice and recomputes totalPrice', async () => {
      const storedItem = { id: itemId, quantity: 1, unitPrice: 1.0 };
      quotesRepo.findOne.mockResolvedValue(quote);
      itemsRepo.findOne.mockResolvedValue(storedItem);
      itemsRepo.update.mockResolvedValue({});

      await service.updateLineItem(quoteId, itemId, { quantity: 10, unitPrice: 1.05 }, userId);

      expect(itemsRepo.update).toHaveBeenCalledWith(itemId, {
        quantity: 10,
        unitPrice: 1.05,
        totalPrice: 10.5,
      });
    });

    it('throws NotFoundException when line item does not exist', async () => {
      quotesRepo.findOne.mockResolvedValue(quote);
      itemsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateLineItem(quoteId, itemId, { quantity: 5 }, userId),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
