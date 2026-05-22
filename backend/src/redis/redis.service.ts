import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor(private config: ConfigService) {}

  onModuleInit() {
    this.client = new Redis(this.config.get('redis.url'), {
      tls: this.config.get('redis.tls') ? {} : undefined,
      maxRetriesPerRequest: 3,
    });
    this.client.on('connect', () => this.logger.log('Redis connected'));
    this.client.on('error', (err) => this.logger.error(`Redis: ${err.message}`));
  }

  async onModuleDestroy() { await this.client.quit(); }

  async get(key: string): Promise<string | null> { return this.client.get(key); }

  async setex(key: string, ttl: number, value: string): Promise<void> {
    await this.client.setex(key, ttl, value);
  }

  async del(key: string): Promise<void> { await this.client.del(key); }

  async keys(pattern: string): Promise<string[]> { return this.client.keys(pattern); }
}
