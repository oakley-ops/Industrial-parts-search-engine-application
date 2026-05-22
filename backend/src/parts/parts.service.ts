import { Injectable } from '@nestjs/common';
import { CreatePartDto } from './dto/create-part.dto';

@Injectable()
export class PartsService {
  findAll(query?: string) {
    return [];
  }

  findOne(id: string) {
    return null;
  }

  create(createPartDto: CreatePartDto) {
    return createPartDto;
  }
}
