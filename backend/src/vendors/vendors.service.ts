import { Injectable } from '@nestjs/common';
import { CreateVendorDto } from './dto/create-vendor.dto';

@Injectable()
export class VendorsService {
  findAll() {
    return [];
  }

  findOne(id: string) {
    return null;
  }

  create(createVendorDto: CreateVendorDto) {
    return createVendorDto;
  }
}
