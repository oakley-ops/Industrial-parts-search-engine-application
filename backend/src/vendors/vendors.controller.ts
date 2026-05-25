import { Controller, Get, Query, Param, UseGuards, Sse, MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorsService } from './vendors.service';

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private svc: VendorsService) {}

  @Get()
  getVendors() { return this.svc.getVendors(); }

  // Scraper endpoints: tighter limit — these are slow (5–15s) and resource-heavy
  @Throttle({ default: { ttl: 30000, limit: 5 } })
  @Get('search')
  search(@Query('q') q: string) { return q ? this.svc.searchAll(q) : []; }

  @Throttle({ default: { ttl: 30000, limit: 5 } })
  @Sse('search/stream')
  searchStream(@Query('q') q: string): Observable<MessageEvent> {
    return this.svc.searchStream(q ?? '');
  }

  @Throttle({ default: { ttl: 30000, limit: 5 } })
  @Get('prices/:partNumber')
  getPrices(@Param('partNumber') p: string) { return this.svc.getPricesForPart(p); }

  @Get('prices/:vendorSlug/:partNumber')
  getVendorPrice(@Param('vendorSlug') v: string, @Param('partNumber') p: string) {
    return this.svc.getPriceFromVendor(v, p);
  }

  @Get('barcode/:barcode')
  lookupBarcode(@Param('barcode') barcode: string) {
    return this.svc.lookupBarcode(barcode);
  }
}
