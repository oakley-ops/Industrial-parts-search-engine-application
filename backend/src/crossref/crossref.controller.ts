import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CrossrefService } from './crossref.service';

class CrossrefDto {
  @IsString()
  @IsNotEmpty()
  partNumber: string;

  @IsOptional()
  @IsString()
  manufacturer?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('crossref')
@UseGuards(JwtAuthGuard)
export class CrossrefController {
  constructor(private crossref: CrossrefService) {}

  @Post()
  async find(@Body() dto: CrossrefDto) {
    return this.crossref.findEquivalents(dto.partNumber, dto.manufacturer, dto.description);
  }
}
