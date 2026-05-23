# Security & Authorization Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-user ownership to quotes and alerts, harden JWT secret handling, gate `synchronize` to dev-only, enforce enum types on alertType and quote status, rate-limit scraper endpoints, and remove exposed cache-clear endpoints.

**Architecture:** All changes are confined to the NestJS backend. A `@CurrentUser()` decorator extracts the authenticated user from every protected route. `userId` columns are added to `quotes` and `alerts` tables and every service query filters by this value. `findOne` checks both `id` AND `userId` so a wrong-user lookup returns 404 (not 403), preventing data-existence leaks. The database is wiped once after all entity changes are in place.

**Tech Stack:** NestJS 10, TypeORM 0.3, PostgreSQL (Supabase), `@nestjs/throttler` v6, Jest 29 + ts-jest

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| Create | `backend/src/auth/current-user.decorator.ts` | `@CurrentUser()` param decorator |
| Create | `backend/src/auth/dto/login.dto.ts` | Extracted `LoginDto` |
| Create | `backend/src/auth/dto/register.dto.ts` | Extracted `RegisterDto` |
| Create | `backend/src/alerts/dto/create-alert.dto.ts` | `AlertType` enum + `CreateAlertDto` |
| Create | `backend/src/alerts/alerts.service.spec.ts` | Unit tests for ownership |
| Create | `backend/src/quotes/dto/create-quote.dto.ts` | Extracted `CreateQuoteDto` |
| Create | `backend/src/quotes/dto/add-line-item.dto.ts` | Extracted `AddLineItemDto` |
| Create | `backend/src/quotes/dto/update-status.dto.ts` | `QuoteStatus` enum + `UpdateStatusDto` |
| Create | `backend/src/quotes/quotes.service.spec.ts` | Unit tests for ownership |
| Modify | `backend/src/config/configuration.ts` | Startup guard for JWT_SECRET |
| Modify | `backend/src/app.module.ts` | synchronize by NODE_ENV, ThrottlerModule |
| Modify | `backend/src/auth/auth.controller.ts` | Import from dto/ folder |
| Modify | `backend/src/alerts/entities/alert.entity.ts` | Add `userId`, enum column |
| Modify | `backend/src/alerts/alerts.service.ts` | Add `userId` param to all methods |
| Modify | `backend/src/alerts/alerts.controller.ts` | Inject `@CurrentUser()` |
| Modify | `backend/src/quotes/entities/quote.entity.ts` | Add `userId`, enum column |
| Modify | `backend/src/quotes/quotes.service.ts` | Add `userId` param to all methods |
| Modify | `backend/src/quotes/quotes.controller.ts` | Inject `@CurrentUser()`, import DTOs |
| Modify | `backend/src/vendors/vendors.controller.ts` | Remove cache endpoints, add `@Throttle` |
| Modify | `backend/package.json` | Add `@nestjs/throttler`, jest deps + config |

---

## Task 1: Add Dependencies and Jest Infrastructure

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install throttler and jest packages**

Run from `backend/`:
```bash
npm install @nestjs/throttler
npm install --save-dev jest @types/jest ts-jest @nestjs/testing
```

- [ ] **Step 2: Add test script and jest config to package.json**

Open `backend/package.json`. Add `"test": "jest"` to `scripts` and append the jest block:

```json
{
  "name": "industrial-parts-backend",
  "version": "1.0.0",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/typeorm": "^10.0.0",
    "@nestjs/jwt": "^10.0.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/swagger": "^7.0.0",
    "@nestjs/throttler": "^6.0.0",
    "typeorm": "^0.3.17",
    "pg": "^8.11.0",
    "ioredis": "^5.3.0",
    "passport": "^0.6.0",
    "passport-jwt": "^4.0.0",
    "bcrypt": "^5.1.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.1",
    "playwright": "^1.44.0",
    "reflect-metadata": "^0.1.13",
    "rxjs": "^7.8.0"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.0.0",
    "@nestjs/schematics": "^10.0.0",
    "@nestjs/testing": "^10.0.0",
    "@types/bcrypt": "^5.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^20.0.0",
    "@types/passport-jwt": "^3.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  },
  "jest": {
    "moduleFileExtensions": ["js", "json", "ts"],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": { "^.+\\.(t|j)s$": "ts-jest" },
    "collectCoverageFrom": ["**/*.(t|j)s"],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}
```

- [ ] **Step 3: Verify jest runs (no tests yet)**

```bash
cd backend && npm test
```
Expected: `No tests found, exiting with code 1` or `Test Suites: 0 of 0` — no crash, no dependency errors.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: add @nestjs/throttler and jest test infrastructure"
```

---

## Task 2: JWT_SECRET Startup Guard

**Files:**
- Modify: `backend/src/config/configuration.ts`

- [ ] **Step 1: Add startup guard to configuration.ts**

Replace the entire file with:

```ts
export default () => {
  if (
    process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret')
  ) {
    throw new Error('JWT_SECRET env var is required in production and must not be "dev-secret"');
  }

  return {
    port: parseInt(process.env.PORT, 10) || 3000,
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-secret',
      expiresIn: '30d',
    },
    database: {
      url: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'true',
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      tls: process.env.REDIS_TLS === 'true',
    },
    scraper: {
      priceTtlSeconds: 900,
      searchTtlSeconds: 300,
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
      ],
    },
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/config/configuration.ts
git commit -m "feat: crash on startup if JWT_SECRET is missing or default in production"
```

---

## Task 3: App Module — synchronize Flag + ThrottlerModule

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Update app.module.ts**

Replace the entire file with:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import configuration from './config/configuration';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { QuotesModule } from './quotes/quotes.module';
import { AlertsModule } from './alerts/alerts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get('database.url'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: process.env.NODE_ENV !== 'production',
        ssl: config.get('database.ssl') ? { rejectUnauthorized: false } : false,
        logging: false,
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    RedisModule,
    AuthModule,
    UsersModule,
    VendorsModule,
    QuotesModule,
    AlertsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/app.module.ts
git commit -m "feat: gate synchronize to dev-only, add global ThrottlerGuard (60 req/60s)"
```

---

## Task 4: @CurrentUser() Decorator

**Files:**
- Create: `backend/src/auth/current-user.decorator.ts`

- [ ] **Step 1: Create the decorator**

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): { id: string; email: string } => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

`JwtStrategy.validate()` already returns `{ id: payload.sub, email: payload.email }` which Passport attaches to `request.user`. This decorator is a thin wrapper around that.

- [ ] **Step 2: Commit**

```bash
git add backend/src/auth/current-user.decorator.ts
git commit -m "feat: add @CurrentUser() param decorator"
```

---

## Task 5: Move Auth DTOs

**Files:**
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/dto/register.dto.ts`
- Modify: `backend/src/auth/auth.controller.ts`

- [ ] **Step 1: Create login.dto.ts**

```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
}
```

- [ ] **Step 2: Create register.dto.ts**

```ts
import { IsOptional, IsString } from 'class-validator';
import { LoginDto } from './login.dto';

export class RegisterDto extends LoginDto {
  @IsOptional() @IsString() name?: string;
}
```

- [ ] **Step 3: Update auth.controller.ts to import from dto/ folder**

Replace the entire file with:

```ts
import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) { return this.auth.login(dto.email, dto.password); }

  @Post('register')
  register(@Body() dto: RegisterDto) { return this.auth.register(dto.email, dto.password, dto.name); }
}
```

- [ ] **Step 4: Verify the app still compiles**

```bash
cd backend && npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/dto/ backend/src/auth/auth.controller.ts
git commit -m "refactor: move auth DTOs to dto/ subfolder"
```

---

## Task 6: AlertType Enum + CreateAlertDto

**Files:**
- Create: `backend/src/alerts/dto/create-alert.dto.ts`

- [ ] **Step 1: Create the DTO file**

```ts
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export enum AlertType {
  PRICE_BELOW = 'price_below',
  IN_STOCK = 'in_stock',
  LEAD_TIME_ABOVE = 'lead_time_above',
}

export class CreateAlertDto {
  @IsString() @IsNotEmpty() partNumber: string;
  @IsOptional() @IsString() vendorSlug?: string;
  @IsEnum(AlertType) alertType: AlertType;
  @IsOptional() @IsNumber() @Min(0) thresholdValue?: number;
  @IsOptional() @IsString() notes?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/alerts/dto/create-alert.dto.ts
git commit -m "feat: add AlertType enum and CreateAlertDto with enum validation"
```

---

## Task 7: Alert Entity — userId Column + alertType Enum

**Files:**
- Modify: `backend/src/alerts/entities/alert.entity.ts`

- [ ] **Step 1: Update the Alert entity**

Replace the entire file with:

```ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';
import { AlertType } from '../dto/create-alert.dto';

@Entity('alerts')
export class Alert {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ name: 'user_id' }) userId: string;

  @Column({ name: 'part_number' }) partNumber: string;
  @Column({ name: 'vendor_slug', nullable: true }) vendorSlug: string;

  @Column({ name: 'alert_type', type: 'enum', enum: AlertType })
  alertType: AlertType;

  @Column({ name: 'threshold_value', type: 'numeric', precision: 12, scale: 4, nullable: true })
  thresholdValue: number;

  @Column({ nullable: true, type: 'text' }) notes: string;
  @Column({ name: 'is_active', default: true }) isActive: boolean;
  @Column({ name: 'last_triggered', nullable: true }) lastTriggered: Date;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/alerts/entities/alert.entity.ts
git commit -m "feat: add userId column and AlertType enum to Alert entity"
```

---

## Task 8: AlertsService — userId Ownership + Unit Tests

**Files:**
- Modify: `backend/src/alerts/alerts.service.ts`
- Create: `backend/src/alerts/alerts.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/alerts/alerts.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { Alert } from './entities/alert.entity';
import { AlertType } from './dto/create-alert.dto';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
});

describe('AlertsService', () => {
  let service: AlertsService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getRepositoryToken(Alert), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get<AlertsService>(AlertsService);
    repo = module.get(getRepositoryToken(Alert));
  });

  describe('findAll', () => {
    it('queries only the requesting user\'s alerts', async () => {
      repo.find.mockResolvedValue([]);
      await service.findAll('user-a');
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'user-a' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('create', () => {
    it('sets userId on the new alert', async () => {
      const dto = { partNumber: '6205-2RS', alertType: AlertType.PRICE_BELOW, thresholdValue: 10 };
      repo.create.mockReturnValue({ ...dto, userId: 'user-a' });
      repo.save.mockResolvedValue({ id: 'alert-1', ...dto, userId: 'user-a' });
      await service.create(dto, 'user-a');
      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 'user-a' }));
    });
  });

  describe('toggle', () => {
    it('throws NotFoundException when alert belongs to a different user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.toggle('alert-1', 'user-b')).rejects.toThrow(NotFoundException);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'alert-1', userId: 'user-b' } });
    });

    it('flips isActive when the user owns the alert', async () => {
      const alert = { id: 'alert-1', isActive: true, userId: 'user-a' };
      repo.findOne.mockResolvedValue(alert);
      repo.save.mockResolvedValue({ ...alert, isActive: false });
      const result = await service.toggle('alert-1', 'user-a');
      expect(result.isActive).toBe(false);
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when alert belongs to a different user', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.delete('alert-1', 'user-b')).rejects.toThrow(NotFoundException);
    });

    it('deletes the alert when the user owns it', async () => {
      repo.findOne.mockResolvedValue({ id: 'alert-1', userId: 'user-a' });
      repo.delete.mockResolvedValue({});
      const result = await service.delete('alert-1', 'user-a');
      expect(repo.delete).toHaveBeenCalledWith('alert-1');
      expect(result).toEqual({ deleted: true });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npm test -- alerts.service.spec.ts
```
Expected: FAIL — `findAll`, `create`, `toggle`, `delete` signatures don't match yet.

- [ ] **Step 3: Update AlertsService**

Replace `backend/src/alerts/alerts.service.ts` with:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Alert } from './entities/alert.entity';
import { CreateAlertDto } from './dto/create-alert.dto';

@Injectable()
export class AlertsService {
  constructor(@InjectRepository(Alert) private repo: Repository<Alert>) {}

  findAll(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  create(data: CreateAlertDto, userId: string) {
    return this.repo.save(this.repo.create({ ...data, userId }));
  }

  async toggle(id: string, userId: string) {
    const alert = await this.repo.findOne({ where: { id, userId } });
    if (!alert) throw new NotFoundException();
    alert.isActive = !alert.isActive;
    return this.repo.save(alert);
  }

  async delete(id: string, userId: string) {
    const alert = await this.repo.findOne({ where: { id, userId } });
    if (!alert) throw new NotFoundException();
    await this.repo.delete(id);
    return { deleted: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npm test -- alerts.service.spec.ts
```
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/alerts/alerts.service.ts backend/src/alerts/alerts.service.spec.ts
git commit -m "feat: AlertsService enforces per-user ownership on all queries"
```

---

## Task 9: AlertsController — Inject @CurrentUser

**Files:**
- Modify: `backend/src/alerts/alerts.controller.ts`

- [ ] **Step 1: Update AlertsController**

Replace the entire file with:

```ts
import { Controller, Get, Post, Delete, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AlertsService } from './alerts.service';
import { CreateAlertDto } from './dto/create-alert.dto';

@ApiTags('alerts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('alerts')
export class AlertsController {
  constructor(private svc: AlertsService) {}

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.svc.findAll(user.id);
  }

  @Post()
  create(@Body() dto: CreateAlertDto, @CurrentUser() user: { id: string }) {
    return this.svc.create(dto, user.id);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.toggle(id, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.delete(id, user.id);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/alerts/alerts.controller.ts
git commit -m "feat: AlertsController passes userId from JWT to service on every route"
```

---

## Task 10: Quote DTOs — QuoteStatus Enum + All Quote DTOs

**Files:**
- Create: `backend/src/quotes/dto/create-quote.dto.ts`
- Create: `backend/src/quotes/dto/add-line-item.dto.ts`
- Create: `backend/src/quotes/dto/update-status.dto.ts`

- [ ] **Step 1: Create create-quote.dto.ts**

```ts
import { IsOptional, IsString, IsNotEmpty } from 'class-validator';

export class CreateQuoteDto {
  @IsString() @IsNotEmpty() title: string;
  @IsOptional() @IsString() notes?: string;
}
```

- [ ] **Step 2: Create add-line-item.dto.ts**

```ts
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AddLineItemDto {
  @IsString() @IsNotEmpty() partNumber: string;
  @IsString() @IsNotEmpty() vendorSlug: string;
  @IsString() @IsNotEmpty() vendorName: string;
  @IsOptional() @IsString() vendorSku?: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(1) quantity: number;
  @IsNumber() @Min(0) unitPrice: number;
  @IsOptional() @IsString() availability?: string;
  @IsOptional() @IsNumber() @Min(0) leadTimeDays?: number;
  @IsOptional() @IsString() productUrl?: string;
}
```

- [ ] **Step 3: Create update-status.dto.ts**

```ts
import { IsEnum } from 'class-validator';

export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export class UpdateStatusDto {
  @IsEnum(QuoteStatus) status: QuoteStatus;
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/quotes/dto/
git commit -m "feat: add QuoteStatus enum and extract all quote DTOs to dto/ folder"
```

---

## Task 11: Quote Entity — userId Column + status Enum

**Files:**
- Modify: `backend/src/quotes/entities/quote.entity.ts`

- [ ] **Step 1: Update the Quote entity**

Replace the entire file with:

```ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, Index } from 'typeorm';
import { QuoteLineItem } from './quote-line-item.entity';
import { QuoteStatus } from '../dto/update-status.dto';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index()
  @Column({ name: 'user_id' }) userId: string;

  @Column() title: string;

  @Column({ type: 'enum', enum: QuoteStatus, default: QuoteStatus.DRAFT })
  status: QuoteStatus;

  @Column({ nullable: true, type: 'text' }) notes: string;

  @OneToMany(() => QuoteLineItem, item => item.quote, { cascade: true, eager: true })
  lineItems: QuoteLineItem[];

  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/quotes/entities/quote.entity.ts
git commit -m "feat: add userId column and QuoteStatus enum to Quote entity"
```

---

## Task 12: QuotesService — userId Ownership + Unit Tests

**Files:**
- Modify: `backend/src/quotes/quotes.service.ts`
- Create: `backend/src/quotes/quotes.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/quotes/quotes.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { QuotesService } from './quotes.service';
import { Quote } from './entities/quote.entity';
import { QuoteLineItem } from './entities/quote-line-item.entity';
import { QuoteStatus } from './dto/update-status.dto';

const mockRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
  update: jest.fn(),
});

describe('QuotesService', () => {
  let service: QuotesService;
  let quotesRepo: ReturnType<typeof mockRepo>;
  let itemsRepo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: getRepositoryToken(Quote), useFactory: mockRepo },
        { provide: getRepositoryToken(QuoteLineItem), useFactory: mockRepo },
      ],
    }).compile();
    service = module.get<QuotesService>(QuotesService);
    quotesRepo = module.get(getRepositoryToken(Quote));
    itemsRepo = module.get(getRepositoryToken(QuoteLineItem));
  });

  describe('findAll', () => {
    it('queries only the requesting user\'s quotes', async () => {
      quotesRepo.find.mockResolvedValue([]);
      await service.findAll('user-a');
      expect(quotesRepo.find).toHaveBeenCalledWith({
        where: { userId: 'user-a' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when quote belongs to a different user', async () => {
      quotesRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('quote-1', 'user-b')).rejects.toThrow(NotFoundException);
      expect(quotesRepo.findOne).toHaveBeenCalledWith({ where: { id: 'quote-1', userId: 'user-b' } });
    });

    it('returns the quote when the user owns it', async () => {
      const quote = { id: 'quote-1', userId: 'user-a', title: 'Test' };
      quotesRepo.findOne.mockResolvedValue(quote);
      const result = await service.findOne('quote-1', 'user-a');
      expect(result).toEqual(quote);
    });
  });

  describe('create', () => {
    it('sets userId on the new quote', async () => {
      quotesRepo.create.mockReturnValue({ title: 'Q1', userId: 'user-a', status: QuoteStatus.DRAFT });
      quotesRepo.save.mockResolvedValue({ id: 'q-1', title: 'Q1', userId: 'user-a' });
      await service.create('Q1', undefined, 'user-a');
      expect(quotesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-a', title: 'Q1' }),
      );
    });
  });

  describe('delete', () => {
    it('throws NotFoundException when quote belongs to a different user', async () => {
      quotesRepo.findOne.mockResolvedValue(null);
      await expect(service.delete('quote-1', 'user-b')).rejects.toThrow(NotFoundException);
    });

    it('deletes when the user owns the quote', async () => {
      quotesRepo.findOne.mockResolvedValue({ id: 'quote-1', userId: 'user-a' });
      quotesRepo.delete.mockResolvedValue({});
      const result = await service.delete('quote-1', 'user-a');
      expect(quotesRepo.delete).toHaveBeenCalledWith('quote-1');
      expect(result).toEqual({ deleted: true });
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npm test -- quotes.service.spec.ts
```
Expected: FAIL — method signatures don't match yet.

- [ ] **Step 3: Update QuotesService**

Replace `backend/src/quotes/quotes.service.ts` with:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Quote } from './entities/quote.entity';
import { QuoteLineItem } from './entities/quote-line-item.entity';
import { AddLineItemDto } from './dto/add-line-item.dto';
import { QuoteStatus } from './dto/update-status.dto';

@Injectable()
export class QuotesService {
  constructor(
    @InjectRepository(Quote) private quotesRepo: Repository<Quote>,
    @InjectRepository(QuoteLineItem) private itemsRepo: Repository<QuoteLineItem>,
  ) {}

  findAll(userId: string) {
    return this.quotesRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, userId: string) {
    const q = await this.quotesRepo.findOne({ where: { id, userId } });
    if (!q) throw new NotFoundException('Quote not found');
    return q;
  }

  create(title: string, notes: string | undefined, userId: string) {
    return this.quotesRepo.save(this.quotesRepo.create({ title, notes, userId }));
  }

  async addLineItem(quoteId: string, data: AddLineItemDto, userId: string) {
    const quote = await this.findOne(quoteId, userId);
    return this.itemsRepo.save(
      this.itemsRepo.create({ quote, ...data, totalPrice: data.quantity * data.unitPrice }),
    );
  }

  async removeLineItem(quoteId: string, itemId: string, userId: string) {
    await this.findOne(quoteId, userId);
    await this.itemsRepo.delete(itemId);
    return { deleted: true };
  }

  async updateStatus(id: string, status: QuoteStatus, userId: string) {
    await this.findOne(id, userId);
    await this.quotesRepo.update(id, { status });
    return this.findOne(id, userId);
  }

  async delete(id: string, userId: string) {
    await this.findOne(id, userId);
    await this.quotesRepo.delete(id);
    return { deleted: true };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npm test -- quotes.service.spec.ts
```
Expected: PASS — 6 tests passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/quotes/quotes.service.ts backend/src/quotes/quotes.service.spec.ts
git commit -m "feat: QuotesService enforces per-user ownership on all queries"
```

---

## Task 13: QuotesController — Inject @CurrentUser

**Files:**
- Modify: `backend/src/quotes/quotes.controller.ts`

- [ ] **Step 1: Update QuotesController**

Replace the entire file with:

```ts
import { Controller, Get, Post, Delete, Param, Body, Patch, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { QuotesService } from './quotes.service';
import { CreateQuoteDto } from './dto/create-quote.dto';
import { AddLineItemDto } from './dto/add-line-item.dto';
import { UpdateStatusDto } from './dto/update-status.dto';

@ApiTags('quotes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('quotes')
export class QuotesController {
  constructor(private svc: QuotesService) {}

  @Get()
  findAll(@CurrentUser() user: { id: string }) {
    return this.svc.findAll(user.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.findOne(id, user.id);
  }

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() user: { id: string }) {
    return this.svc.create(dto.title, dto.notes, user.id);
  }

  @Post(':id/items')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddLineItemDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.addLineItem(id, dto, user.id);
  }

  @Delete(':id/items/:itemId')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.removeLineItem(id, itemId, user.id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.svc.updateStatus(id, dto.status, user.id);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.svc.delete(id, user.id);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 3: Run all tests**

```bash
cd backend && npm test
```
Expected: all tests in `alerts.service.spec.ts` and `quotes.service.spec.ts` pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/quotes/quotes.controller.ts
git commit -m "feat: QuotesController passes userId from JWT to service on every route"
```

---

## Task 14: VendorsController — Remove Cache Endpoints + Rate Limit Scrapers

**Files:**
- Modify: `backend/src/vendors/vendors.controller.ts`

- [ ] **Step 1: Update VendorsController**

Replace the entire file with:

```ts
import { Controller, Get, Query, Param, UseGuards } from '@nestjs/common';
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
  @Get('prices/:partNumber')
  getPrices(@Param('partNumber') p: string) { return this.svc.getPricesForPart(p); }

  @Get('prices/:vendorSlug/:partNumber')
  getVendorPrice(@Param('vendorSlug') v: string, @Param('partNumber') p: string) {
    return this.svc.getPriceFromVendor(v, p);
  }
}
```

- [ ] **Step 2: Verify build**

```bash
cd backend && npm run build
```
Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/vendors/vendors.controller.ts
git commit -m "feat: remove exposed cache endpoints, rate-limit scraper routes to 5 req/30s"
```

---

## Task 15: Wipe Database + Full Smoke Test

The `userId` columns added in Tasks 7 and 11 are `NOT NULL`. Any existing rows in `alerts` and `quotes` tables will prevent the app from syncing the new schema. Since the data is intentionally wiped, drop all tables via the Supabase dashboard or psql before restarting the server.

- [ ] **Step 1: Drop tables in Supabase (or local Postgres)**

Option A — Supabase SQL editor. Run:
```sql
DROP TABLE IF EXISTS quote_line_items CASCADE;
DROP TABLE IF EXISTS quotes CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;
DROP TABLE IF EXISTS users CASCADE;
```

Option B — psql:
```bash
psql $DATABASE_URL -c "DROP TABLE IF EXISTS quote_line_items, quotes, alerts, users CASCADE;"
```

- [ ] **Step 2: Start the dev server**

```bash
cd backend && npm run start:dev
```

Expected output: server starts on port 3000, no TypeORM errors. TypeORM will auto-sync (create) all tables fresh with the new schema including `user_id` columns and enum types.

- [ ] **Step 3: Smoke test auth**

```bash
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}' | jq .
```

Expected: `{ "access_token": "...", "user": { "id": "...", "email": "test@example.com" } }`

- [ ] **Step 4: Smoke test user isolation**

Register a second user and verify their quote list is empty:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user2@example.com","password":"secret123"}' | jq -r .access_token)

curl -s http://localhost:3000/api/v1/quotes \
  -H "Authorization: Bearer $TOKEN" | jq .
```
Expected: `[]`

- [ ] **Step 5: Smoke test enum validation**

Send an invalid `alertType` and confirm the API rejects it:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"secret123"}' | jq -r .access_token)

curl -s -X POST http://localhost:3000/api/v1/alerts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"partNumber":"6205-2RS","alertType":"invalid_type"}' | jq .
```
Expected: `400 Bad Request` with a validation error about `alertType`.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: verify schema wipe and smoke tests pass after security hardening"
```

---

## Summary of Changes

| What changed | Why |
|---|---|
| `userId` column on `quotes` + `alerts` | Every user only sees their own data |
| `findOne` checks `id AND userId` | 404 (not 403) on wrong-user access — prevents data existence leaks |
| `AlertType` + `QuoteStatus` enums | Invalid values rejected at DTO layer and by Postgres |
| `synchronize` gated to `NODE_ENV !== 'production'` | Schema auto-alter disabled in production |
| JWT_SECRET startup guard | Server refuses to boot with a forgeable secret in production |
| `@nestjs/throttler` global guard + per-route override | 60 req/60s default; 5 req/30s on slow scraper routes |
| Cache-clear endpoints removed | Not a user-facing concern; internal only |
| DTOs moved to `dto/` subfolders | Controllers are import-only; logic stays in services |
