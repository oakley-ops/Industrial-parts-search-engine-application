import { Module } from '@nestjs/common';
import { PartsModule } from './parts/parts.module';
import { VendorsModule } from './vendors/vendors.module';
import { QuotesModule } from './quotes/quotes.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PartsModule, VendorsModule, QuotesModule, AuthModule],
})
export class AppModule {}
