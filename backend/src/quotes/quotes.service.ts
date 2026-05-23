import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from './entities/quote.entity';
import { QuoteLineItem } from './entities/quote-line-item.entity';
import { AddLineItemDto } from './dto/add-line-item.dto';
import { QuoteStatus } from './dto/update-status.dto';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote) private quotesRepo: Repository<Quote>,
    @InjectRepository(QuoteLineItem) private itemsRepo: Repository<QuoteLineItem>,
  ) {}

  findAll(userId: string) {
    return this.quotesRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, userId: string) {
    const q = await this.quotesRepo.findOne({ where: { id, userId } });
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }

  create(title: string, notes: string | undefined, userId: string) {
    return this.quotesRepo.save(this.quotesRepo.create({ title, notes, userId }));
  }

  async addLineItem(quoteId: string, data: AddLineItemDto, userId: string) {
    const quote = await this.findOne(quoteId, userId);
    return this.itemsRepo.save(
      this.itemsRepo.create({ quote, ...data, totalPrice: data.quantity * data.unitPrice }),
    );
  }

  async removeLineItem(quoteId: string, itemId: string, userId: string) {
    await this.findOne(quoteId, userId);
    await this.itemsRepo.delete(itemId);
    return { deleted: true };
  }

  async updateStatus(id: string, status: QuoteStatus, userId: string) {
    await this.findOne(id, userId);
    await this.quotesRepo.update(id, { status });
    return this.findOne(id, userId);
  }

  async delete(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.quotesRepo.delete(id);
    return { deleted: true };
  }
}
