import { Controller, Get, Delete, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { VendorsService } from './vendors.service';

@ApiTags('vendors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('vendors')
export class VendorsController {
  constructor(private svc: VendorsService) {}

  @Get() getVendors() { return this.svc.getVendors(); }
  @Get('search') search(@Query('q') q: string) { return q ? this.svc.searchAll(q) : []; }
  @Get('prices/:partNumber') getPrices(@Param('partNumber') p: string) { return this.svc.getPricesForPart(p); }
  @Get('prices/:vendorSlug/:partNumber') getVendorPrice(@Param('vendorSlug') v: string, @Param('partNumber') p: string) { return this.svc.getPriceFromVendor(v, p); }
  @Delete('cache/:partNumber') clearCache(@Param('partNumber') p: string) { return this.svc.clearCache(p); }
  @Delete('cache') clearAllCache() { return this.svc.clearCache(); }
}
