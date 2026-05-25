import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from './entities/quote.entity';
import { QuoteLineItem } from './entities/quote-line-item.entity';
import { AddLineItemDto } from './dto/add-line-item.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { QuoteStatus } from './dto/update-status.dto';
import { buildQuoteHtml } from './quote-html';

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

  async updateQuote(id: string, dto: UpdateQuoteDto, userId: string) {
    await this.findOne(id, userId);
    const patch: Partial<Quote> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (Object.keys(patch).length) await this.quotesRepo.update(id, patch);
    return this.findOne(id, userId);
  }

  async duplicateQuote(id: string, userId: string) {
    const src = await this.findOne(id, userId);
    const copy = await this.quotesRepo.save(
      this.quotesRepo.create({ title: `${src.title} (Copy)`, notes: src.notes, userId }),
    );
    for (const item of src.lineItems) {
      await this.itemsRepo.save(
        this.itemsRepo.create({
          quote: copy,
          partNumber: item.partNumber,
          vendorSlug: item.vendorSlug,
          vendorName: item.vendorName,
          vendorSku: item.vendorSku,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice,
          availability: item.availability,
          leadTimeDays: item.leadTimeDays,
          productUrl: item.productUrl,
        }),
      );
    }
    return this.findOne(copy.id, userId);
  }

  async addLineItem(quoteId: string, data: AddLineItemDto, userId: string) {
    const quote = await this.findOne(quoteId, userId);
    return this.itemsRepo.save(
      this.itemsRepo.create({ quote, ...data, totalPrice: data.quantity * data.unitPrice }),
    );
  }

  async updateLineItem(quoteId: string, itemId: string, quantity: number, userId: string) {
    await this.findOne(quoteId, userId);
    const item = await this.itemsRepo.findOne({ where: { id: itemId } });
    if (!item) throw new NotFoundException('Line item not found');
    await this.itemsRepo.update(itemId, {
      quantity,
      totalPrice: quantity * Number(item.unitPrice),
    });
    return this.findOne(quoteId, userId);
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

  async generatePdf(id: string, userId: string): Promise<Buffer> {
    const quote = await this.findOne(id, userId);
    const html = buildQuoteHtml(quote);
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'domcontentloaded' });
      const pdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0mm', bottom: '0mm', left: '0mm', right: '0mm' },
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  }
}
