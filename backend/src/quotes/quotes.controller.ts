import { Controller, Get, Post, Delete, Param, Body, Patch, UseGuards, StreamableFile } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { UpdateQuoteDto } from './dto/update-quote.dto';
import { AddLineItemDto } from './dto/add-line-item.dto';
import { UpdateLineItemDto } from './dto/update-line-item.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@ApiTags('quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private svc: QuotesService) {}

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.svc.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.findOne(id, user.id);
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @CurrentUser() user: { id: string }): Promise<StreamableFile> {
    const pdf = await this.svc.generatePdf(id, user.id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: 'attachment; filename="quote.pdf"',
    });
  }

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: { id: string }) {
    return this.svc.create(dto.title, dto.notes, user.id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.duplicateQuote(id, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() user: { id: string }) {
    return this.svc.updateQuote(id, dto, user.id);
  }

  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddLineItemDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.addLineItem(id, dto, user.id);
  }

  @Patch(':id/items/:itemId')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateLineItemDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.updateLineItem(id, itemId, dto, user.id);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.removeLineItem(id, itemId, user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.updateStatus(id, dto.status, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.delete(id, user.id);
  }
}
