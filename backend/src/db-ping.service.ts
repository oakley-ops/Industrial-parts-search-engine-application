import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

@Injectable()
export class DbPingService {
  private readonly logger = new Logger(DbPingService.name);

  constructor(private dataSource: DataSource) {}

  // Ping every 25 s — shorter than Supabase pgBouncer's ~30 s idle timeout.
  // A failed ping removes the dead connection from the pool so real requests
  // always get a fresh one.
  @Cron('*/25 * * * * *')
  async ping() {
    try {
      await this.dataSource.query('SELECT 1');
    } catch (err: any) {
      this.logger.warn(`DB keep-alive ping failed: ${err?.message ?? err}`);
    }
  }
}
