import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AlertsService } from './alerts.service';
import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateAlertDto {
  @IsString() partNumber: string;
  @IsOptional() @IsString() vendorSlug?: string;
  @IsString() alertType: string;
  @IsOptional() @IsNumber() thresholdValue?: number;
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('alerts') @ApiBearerAuth() @UseGuards(JwtAuthGuard) @Controller('alerts')
export class AlertsController {
  constructor(private svc: AlertsService) {}
  @Get() findAll() { return this.svc.findAll(); }
  @Post() create(@Body() dto: CreateAlertDto) { return this.svc.create(dto); }
  @Patch(':id/toggle') toggle(@Param('id') id: string) { return this.svc.toggle(id); }
  @Delete(':id') delete(@Param('id') id: string) { return this.svc.delete(id); }
}
