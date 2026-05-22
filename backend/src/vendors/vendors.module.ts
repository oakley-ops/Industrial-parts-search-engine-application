import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { GraingerScraper } from './scrapers/grainger.scraper';
import { MotionScraper } from './scrapers/motion.scraper';
import { McMasterScraper } from './scrapers/mcmaster.scraper';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, GraingerScraper, MotionScraper, McMasterScraper],
  exports: [VendorsService],
})
export class VendorsModule {}
