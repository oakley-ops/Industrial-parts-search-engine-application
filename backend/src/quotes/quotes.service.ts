import { Injectable } from '@nestjs/common';
import { CreateQuoteDto } from './dto/create-quote.dto';

@Injectable()
export class QuotesService {
  findAll() {
    return [];
  }

  findOne(id: string) {
    return null;
  }

  create(createQuoteDto: CreateQuoteDto) {
    return createQuoteDto;
  }
}
