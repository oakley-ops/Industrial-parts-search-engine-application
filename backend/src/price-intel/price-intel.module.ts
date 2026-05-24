import { Module } from '@nestjs/common';
import { PriceIntelController } from './price-intel.controller';
import { PriceIntelService } from './price-intel.service';

@Module({
  controllers: [PriceIntelController],
  providers: [PriceIntelService],
})
export class PriceIntelModule {}
