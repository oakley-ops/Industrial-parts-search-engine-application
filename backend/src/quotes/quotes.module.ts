import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotesController } from './quotes.controller';
import { QuotesService } from './quotes.service';
import { Quote } from './entities/quote.entity';
import { QuoteLineItem } from './entities/quote-line-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Quote, QuoteLineItem])],
  controllers: [QuotesController],
  providers: [QuotesService],
})
export class QuotesModule {}
