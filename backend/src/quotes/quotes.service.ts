import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from './entities/quote.entity';
import { QuoteLineItem } from './entities/quote-line-item.entity';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote) private quotesRepo: Repository<Quote>,
    @InjectRepository(QuoteLineItem) private itemsRepo: Repository<QuoteLineItem>,
  ) {}

  findAll() { return this.quotesRepo.find({ order: { createdAt: 'DESC' } }); }

  async findOne(id: string) {
    const q = await this.quotesRepo.findOne({ where: { id } });
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }

  create(title: string, notes?: string) {
    return this.quotesRepo.save(this.quotesRepo.create({ title, notes }));
  }

  async addLineItem(quoteId: string, data: {
    partNumber: string; vendorSlug: string; vendorName: string;
    vendorSku?: string; description?: string; quantity: number;
    unitPrice: number; availability?: string; leadTimeDays?: number; productUrl?: string;
  }) {
    const quote = await this.findOne(quoteId);
    return this.itemsRepo.save(this.itemsRepo.create({ quote, ...data, totalPrice: data.quantity * data.unitPrice }));
  }

  async removeLineItem(itemId: string) { await this.itemsRepo.delete(itemId); return { deleted: true }; }
  async updateStatus(id: string, status: string) { await this.quotesRepo.update(id, { status }); return this.findOne(id); }
  async delete(id: string) { await this.quotesRepo.delete(id); return { deleted: true }; }
}
