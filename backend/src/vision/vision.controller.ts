import { Controller, Post, Body, UseGuards, BadRequestException } from '@nestjs/common';
import { IsString, IsIn, IsNotEmpty } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VisionService } from './vision.service';

class IdentifyDto {
  @IsString()
  @IsNotEmpty()
  image: string;

  @IsIn(['label', 'part'])
  mode: 'label' | 'part';
}

@Controller('vision')
@UseGuards(JwtAuthGuard)
export class VisionController {
  constructor(private vision: VisionService) {}

  @Post('identify')
  async identify(@Body() dto: IdentifyDto) {
    if (!dto.image) throw new BadRequestException('image is required');
    return this.vision.identify(dto.image, dto.mode);
  }
}
