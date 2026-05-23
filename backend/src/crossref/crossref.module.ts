import { Module } from '@nestjs/common';
import { CrossrefController } from './crossref.controller';
import { CrossrefService } from './crossref.service';

@Module({
  controllers: [CrossrefController],
  providers: [CrossrefService],
})
export class CrossrefModule {}
