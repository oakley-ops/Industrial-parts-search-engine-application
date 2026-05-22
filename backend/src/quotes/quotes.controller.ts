import { Controller, Get, Post, Delete, Param, Body, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QuotesService } from './quotes.service';
import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class CreateQuoteDto { @IsString() title: string; @IsOptional() @IsString() notes?: string; }
export class AddLineItemDto {
  @IsString() partNumber: string; @IsString() vendorSlug: string; @IsString() vendorName: string;
  @IsOptional() @IsString() vendorSku?: string; @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(1) quantity: number; @IsNumber() unitPrice: number;
  @IsOptional() @IsString() availability?: string; @IsOptional() @IsNumber() leadTimeDays?: number;
  @IsOptional() @IsString() productUrl?: string;
}

@ApiTags('quotes') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('quotes')
export class QuotesController {
  constructor(private svc: QuotesService) {}
  @Get() findAll() { return this.svc.findAll(); }
  @Get(':id') findOne(@Param('id') id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: CreateQuoteDto) { return this.svc.create(dto.title, dto.notes); }
  @Post(':id/items') addItem(@Param('id') id: string, @Body() dto: AddLineItemDto) { return this.svc.addLineItem(id, dto); }
  @Delete(':id/items/:itemId') removeItem(@Param('itemId') itemId: string) { return this.svc.removeLineItem(itemId); }
  @Patch(':id/status') updateStatus(@Param('id') id: string, @Body('status') status: string) { return this.svc.updateStatus(id, status); }
  @Delete(':id') delete(@Param('id') id: string) { return this.svc.delete(id); }
}
