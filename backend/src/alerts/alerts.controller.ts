import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private svc: AlertsService) {}

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.svc.findAll(user.id);
  }

  @Post()
  create(@Body() dto: CreateAlertDto, @CurrentUser() user: { id: string }) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.toggle(id, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.delete(id, user.id);
  }
}
