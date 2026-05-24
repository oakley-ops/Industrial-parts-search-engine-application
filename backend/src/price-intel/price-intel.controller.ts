import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional, IsArray, ValidateNested, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PriceIntelService } from './price-intel.service';

class PriceEntryDto {
  @IsString() @IsNotEmpty() vendorName: string;
  @IsNumber() price: number;
  @IsString() source: string;
}

class PriceIntelDto {
  @IsString() @IsNotEmpty() partNumber: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PriceEntryDto) prices: PriceEntryDto[];
}

@Controller('price-intel')
@UseGuards(JwtAuthGuard)
export class PriceIntelController {
  constructor(private svc: PriceIntelService) {}

  @Post()
  analyze(@Body() dto: PriceIntelDto) {
    return this.svc.analyze(dto.partNumber, dto.prices, dto.description);
  }
}
