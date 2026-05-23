# Alert Evaluation System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a background job that evaluates alert conditions hourly against live vendor prices and sends Expo push notifications to users when conditions are met.

**Architecture:** An `AlertEvaluatorService` runs on a `@Cron` schedule, groups active alerts by part number to minimize scraper calls, evaluates each alert's condition against scraped prices, and triggers push notifications via a new `NotificationsService` that wraps the Expo server SDK. Triggered alerts are disabled immediately (once-and-done).

**Tech Stack:** `@nestjs/schedule` (cron), `expo-server-sdk` (server-side push), `expo-notifications` (React Native token registration)

---

## File Structure

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/package.json` | Add `@nestjs/schedule`, `expo-server-sdk` |
| Modify | `mobile/package.json` | Add `expo-notifications` |
| Modify | `backend/src/users/entities/user.entity.ts` | Add `expoPushToken` column |
| Modify | `backend/src/users/users.service.ts` | Add `updatePushToken()` method |
| Create | `backend/src/users/dto/update-push-token.dto.ts` | `UpdatePushTokenDto` |
| Create | `backend/src/users/users.controller.ts` | `PATCH /users/push-token` endpoint |
| Modify | `backend/src/users/users.module.ts` | Register `UsersController` |
| Create | `backend/src/notifications/notifications.service.ts` | Expo push wrapper |
| Create | `backend/src/notifications/notifications.service.spec.ts` | Unit tests |
| Create | `backend/src/notifications/notifications.module.ts` | Standalone module |
| Modify | `backend/src/alerts/alerts.service.ts` | Add `findAllActive()`, `disableAndStampAlert()` |
| Modify | `backend/src/alerts/alerts.service.spec.ts` | Tests for new methods |
| Create | `backend/src/alerts/alert-evaluator.service.ts` | Hourly cron evaluation loop |
| Create | `backend/src/alerts/alert-evaluator.service.spec.ts` | Unit tests |
| Modify | `backend/src/alerts/alerts.module.ts` | Import NotificationsModule, UsersModule, VendorsModule; add AlertEvaluatorService |
| Modify | `backend/src/app.module.ts` | Add `ScheduleModule.forRoot()` |
| Create | `mobile/services/notifications.ts` | Push token registration utility |
| Modify | `mobile/app/_layout.tsx` | Call `registerForPushNotifications` after auth |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `backend/package.json`
- Modify: `mobile/package.json`

- [ ] **Step 1: Install backend packages**

Run from the `backend/` directory:

```bash
npm install @nestjs/schedule expo-server-sdk
```

Expected: `@nestjs/schedule` and `expo-server-sdk` appear in `backend/package.json` `dependencies`.

- [ ] **Step 2: Install mobile package**

Run from the `mobile/` directory:

```bash
npx expo install expo-notifications
```

Expected: `expo-notifications` appears in `mobile/package.json` `dependencies`.

- [ ] **Step 3: Verify backend packages load**

```bash
node -e "require('@nestjs/schedule'); require('expo-server-sdk'); console.log('OK')"
```

Expected: prints `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json mobile/package.json mobile/package-lock.json
git commit -m "chore: install @nestjs/schedule, expo-server-sdk, expo-notifications"
```

---

### Task 2: User expoPushToken Column + UsersService.updatePushToken

**Files:**
- Modify: `backend/src/users/entities/user.entity.ts`
- Modify: `backend/src/users/users.service.ts`
- Create: `backend/src/users/users.service.spec.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/src/users/users.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';

describe('UsersService.updatePushToken', () => {
  let service: UsersService;
  let mockUpdate: jest.Mock;

  beforeEach(async () => {
    mockUpdate = jest.fn().mockResolvedValue(undefined);
    const module = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            update: mockUpdate,
          },
        },
      ],
    }).compile();
    service = module.get(UsersService);
  });

  it('calls repo.update with userId and token', async () => {
    await service.updatePushToken('user-1', 'ExponentPushToken[abc]');
    expect(mockUpdate).toHaveBeenCalledWith('user-1', { expoPushToken: 'ExponentPushToken[abc]' });
  });

  it('calls repo.update with null to clear the token', async () => {
    await service.updatePushToken('user-1', null);
    expect(mockUpdate).toHaveBeenCalledWith('user-1', { expoPushToken: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="users.service.spec"
```

Expected: FAIL — `updatePushToken is not a function`

- [ ] **Step 3: Add expoPushToken column to User entity**

Full file `backend/src/users/entities/user.entity.ts`:

```ts
import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ unique: true }) email: string;
  @Column({ name: 'password_hash' }) passwordHash: string;
  @Column({ nullable: true }) name: string;
  @Column({ name: 'expo_push_token', nullable: true, type: 'text' })
  expoPushToken: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

- [ ] **Step 4: Add updatePushToken to UsersService**

Full file `backend/src/users/users.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  findByEmail(email: string) { return this.repo.findOne({ where: { email } }); }
  findById(id: string) { return this.repo.findOne({ where: { id } }); }

  async create(email: string, password: string, name?: string) {
    const passwordHash = await bcrypt.hash(password, 12);
    return this.repo.save(this.repo.create({ email, passwordHash, name }));
  }

  validatePassword(user: User, password: string) {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updatePushToken(userId: string, token: string | null): Promise<void> {
    await this.repo.update(userId, { expoPushToken: token });
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- --testPathPattern="users.service.spec"
```

Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/users/entities/user.entity.ts backend/src/users/users.service.ts backend/src/users/users.service.spec.ts
git commit -m "feat: add expoPushToken column and updatePushToken to UsersService"
```

---

### Task 3: UsersController + UpdatePushTokenDto

**Files:**
- Create: `backend/src/users/dto/update-push-token.dto.ts`
- Create: `backend/src/users/users.controller.ts`
- Modify: `backend/src/users/users.module.ts`

- [ ] **Step 1: Create UpdatePushTokenDto**

`backend/src/users/dto/update-push-token.dto.ts`:

```ts
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdatePushTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
```

- [ ] **Step 2: Create UsersController**

`backend/src/users/users.controller.ts`:

```ts
import { Controller, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { UsersService } from './users.service';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Patch('push-token')
  updatePushToken(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdatePushTokenDto,
  ): Promise<void> {
    return this.usersService.updatePushToken(user.id, dto.token);
  }
}
```

- [ ] **Step 3: Register controller in UsersModule**

Full file `backend/src/users/users.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 4: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/users.controller.ts backend/src/users/dto/update-push-token.dto.ts backend/src/users/users.module.ts
git commit -m "feat: add PATCH /users/push-token endpoint"
```

---

### Task 4: NotificationsService + NotificationsModule

**Files:**
- Create: `backend/src/notifications/notifications.service.spec.ts`
- Create: `backend/src/notifications/notifications.service.ts`
- Create: `backend/src/notifications/notifications.module.ts`

- [ ] **Step 1: Write failing tests**

`backend/src/notifications/notifications.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import Expo from 'expo-server-sdk';
import { NotificationsService } from './notifications.service';

jest.mock('expo-server-sdk');

const MockedExpo = Expo as jest.MockedClass<typeof Expo>;

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockSend: jest.Mock;

  beforeEach(async () => {
    mockSend = jest.fn();
    MockedExpo.mockImplementation(() => ({ sendPushNotificationsAsync: mockSend } as any));
    (Expo.isExpoPushToken as jest.Mock) = jest.fn().mockReturnValue(true);

    const module = await Test.createTestingModule({
      providers: [NotificationsService],
    }).compile();
    service = module.get(NotificationsService);
  });

  it('returns "sent" on a successful push', async () => {
    mockSend.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);
    const result = await service.sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body');
    expect(result).toBe('sent');
    expect(mockSend).toHaveBeenCalledWith([{
      to: 'ExponentPushToken[abc]',
      sound: 'default',
      title: 'Title',
      body: 'Body',
    }]);
  });

  it('returns "device_not_registered" on DeviceNotRegistered ticket error', async () => {
    mockSend.mockResolvedValue([{
      status: 'error',
      message: 'The recipient device is not registered',
      details: { error: 'DeviceNotRegistered' },
    }]);
    const result = await service.sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body');
    expect(result).toBe('device_not_registered');
  });

  it('throws on other Expo ticket errors', async () => {
    mockSend.mockResolvedValue([{
      status: 'error',
      message: 'Message too big',
      details: { error: 'MessageTooBig' },
    }]);
    await expect(
      service.sendPushNotification('ExponentPushToken[abc]', 'Title', 'Body'),
    ).rejects.toThrow('Message too big');
  });

  it('throws if token fails Expo validation', async () => {
    (Expo.isExpoPushToken as jest.Mock).mockReturnValue(false);
    await expect(
      service.sendPushNotification('not-a-valid-token', 'Title', 'Body'),
    ).rejects.toThrow('Invalid Expo push token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="notifications.service.spec"
```

Expected: FAIL — cannot find module `./notifications.service`

- [ ] **Step 3: Implement NotificationsService**

`backend/src/notifications/notifications.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import Expo, { ExpoPushTicket } from 'expo-server-sdk';

@Injectable()
export class NotificationsService {
  private readonly expo = new Expo();
  private readonly logger = new Logger(NotificationsService.name);

  async sendPushNotification(
    token: string,
    title: string,
    body: string,
  ): Promise<'sent' | 'device_not_registered'> {
    if (!Expo.isExpoPushToken(token)) {
      throw new Error(`Invalid Expo push token: ${token}`);
    }

    const tickets: ExpoPushTicket[] = await this.expo.sendPushNotificationsAsync([
      { to: token, sound: 'default', title, body },
    ]);

    for (const ticket of tickets) {
      if (ticket.status === 'error') {
        if (ticket.details?.error === 'DeviceNotRegistered') {
          return 'device_not_registered';
        }
        throw new Error(ticket.message);
      }
    }

    return 'sent';
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- --testPathPattern="notifications.service.spec"
```

Expected: PASS (4 tests)

- [ ] **Step 5: Create NotificationsModule**

`backend/src/notifications/notifications.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
```

- [ ] **Step 6: Verify compilation**

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/notifications/
git commit -m "feat: add NotificationsService with Expo push wrapper"
```

---

### Task 5: AlertsService — findAllActive + disableAndStampAlert

**Files:**
- Modify: `backend/src/alerts/alerts.service.ts`
- Modify: `backend/src/alerts/alerts.service.spec.ts`

- [ ] **Step 1: Write failing tests**

The existing `backend/src/alerts/alerts.service.spec.ts` already has imports. Append these two `describe` blocks at the end of the file (after the last closing `}`):

```ts
describe('AlertsService.findAllActive', () => {
  let service: AlertsService;
  let mockFind: jest.Mock;

  beforeEach(async () => {
    mockFind = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: getRepositoryToken(Alert),
          useValue: { find: mockFind, findOne: jest.fn(), save: jest.fn(), delete: jest.fn(), create: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(AlertsService);
  });

  it('queries only active alerts', async () => {
    const active = [{ id: '1', isActive: true }];
    mockFind.mockResolvedValue(active);
    const result = await service.findAllActive();
    expect(mockFind).toHaveBeenCalledWith({ where: { isActive: true } });
    expect(result).toEqual(active);
  });
});

describe('AlertsService.disableAndStampAlert', () => {
  let service: AlertsService;
  let mockSave: jest.Mock;
  let mockFindOne: jest.Mock;

  beforeEach(async () => {
    mockSave = jest.fn().mockResolvedValue(undefined);
    mockFindOne = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        AlertsService,
        {
          provide: getRepositoryToken(Alert),
          useValue: { find: jest.fn(), findOne: mockFindOne, save: mockSave, delete: jest.fn(), create: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(AlertsService);
  });

  it('sets isActive=false and stamps lastTriggered', async () => {
    const alert = { id: 'alert-1', isActive: true, lastTriggered: null } as Alert;
    mockFindOne.mockResolvedValue(alert);
    await service.disableAndStampAlert('alert-1');
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false, lastTriggered: expect.any(Date) }),
    );
  });

  it('throws NotFoundException if alert does not exist', async () => {
    mockFindOne.mockResolvedValue(null);
    await expect(service.disableAndStampAlert('missing')).rejects.toThrow(NotFoundException);
  });
});
```

Make sure the top of the spec file has these imports (add any that are missing):

```ts
import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AlertsService } from './alerts.service';
import { Alert } from './entities/alert.entity';
```

- [ ] **Step 2: Run tests to verify new describes fail**

```bash
npm test -- --testPathPattern="alerts.service.spec"
```

Expected: existing tests PASS, new tests FAIL — `findAllActive is not a function`

- [ ] **Step 3: Add the two new methods to AlertsService**

Full file `backend/src/alerts/alerts.service.ts`:

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

  findAllActive(): Promise<Alert[]> {
    return this.repo.find({ where: { isActive: true } });
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

  async disableAndStampAlert(id: string): Promise<void> {
    const alert = await this.repo.findOne({ where: { id } });
    if (!alert) throw new NotFoundException();
    alert.isActive = false;
    alert.lastTriggered = new Date();
    await this.repo.save(alert);
  }
}
```

- [ ] **Step 4: Run all alerts service tests**

```bash
npm test -- --testPathPattern="alerts.service.spec"
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/alerts/alerts.service.ts backend/src/alerts/alerts.service.spec.ts
git commit -m "feat: add findAllActive and disableAndStampAlert to AlertsService"
```

---

### Task 6: AlertEvaluatorService

**Files:**
- Create: `backend/src/alerts/alert-evaluator.service.spec.ts`
- Create: `backend/src/alerts/alert-evaluator.service.ts`

- [ ] **Step 1: Write failing tests**

`backend/src/alerts/alert-evaluator.service.spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { AlertEvaluatorService } from './alert-evaluator.service';
import { AlertsService } from './alerts.service';
import { VendorsService } from '../vendors/vendors.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { Alert } from './entities/alert.entity';
import { AlertType } from './dto/create-alert.dto';

const makeAlert = (overrides: Partial<Alert> = {}): Alert => ({
  id: 'alert-1',
  userId: 'user-1',
  partNumber: 'PN-123',
  vendorSlug: null,
  alertType: AlertType.PRICE_BELOW,
  thresholdValue: 100,
  notes: null,
  isActive: true,
  lastTriggered: null,
  createdAt: new Date(),
  ...overrides,
} as Alert);

const makePrice = (overrides = {}) => ({
  vendorSlug: 'grainger',
  vendorName: 'Grainger',
  vendorSku: 'SKU-1',
  price: 90,
  currency: 'USD',
  quantityOnHand: 5,
  source: 'VENDOR_WAREHOUSE' as const,
  leadTimeDays: null,
  minOrderQty: 1,
  unitOfMeasure: 'EA',
  productUrl: 'http://grainger.com/PN-123',
  inStock: true,
  scrapedAt: new Date().toISOString(),
  ...overrides,
});

describe('AlertEvaluatorService', () => {
  let service: AlertEvaluatorService;
  let alertsService: jest.Mocked<Pick<AlertsService, 'findAllActive' | 'disableAndStampAlert'>>;
  let vendorsService: jest.Mocked<Pick<VendorsService, 'getPricesForPart' | 'getPriceFromVendor'>>;
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'sendPushNotification'>>;
  let usersService: jest.Mocked<Pick<UsersService, 'findById' | 'updatePushToken'>>;

  beforeEach(async () => {
    alertsService = {
      findAllActive: jest.fn(),
      disableAndStampAlert: jest.fn().mockResolvedValue(undefined),
    };
    vendorsService = {
      getPricesForPart: jest.fn(),
      getPriceFromVendor: jest.fn(),
    };
    notificationsService = { sendPushNotification: jest.fn().mockResolvedValue('sent') };
    usersService = {
      findById: jest.fn(),
      updatePushToken: jest.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        AlertEvaluatorService,
        { provide: AlertsService, useValue: alertsService },
        { provide: VendorsService, useValue: vendorsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: UsersService, useValue: usersService },
      ],
    }).compile();

    service = module.get(AlertEvaluatorService);
  });

  it('does nothing when there are no active alerts', async () => {
    alertsService.findAllActive.mockResolvedValue([]);
    await service.evaluateAlerts();
    expect(vendorsService.getPricesForPart).not.toHaveBeenCalled();
    expect(notificationsService.sendPushNotification).not.toHaveBeenCalled();
  });

  it('triggers PRICE_BELOW when price is below threshold', async () => {
    const alert = makeAlert({ alertType: AlertType.PRICE_BELOW, thresholdValue: 100 });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ price: 85 })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'Alert: PN-123',
      expect.stringContaining('85'),
    );
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('does NOT trigger PRICE_BELOW when price is above threshold', async () => {
    const alert = makeAlert({ alertType: AlertType.PRICE_BELOW, thresholdValue: 100 });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ price: 110 })]);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).not.toHaveBeenCalled();
    expect(alertsService.disableAndStampAlert).not.toHaveBeenCalled();
  });

  it('triggers IN_STOCK when part is in stock', async () => {
    const alert = makeAlert({ alertType: AlertType.IN_STOCK, thresholdValue: null });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ inStock: true })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'Alert: PN-123',
      expect.stringContaining('in stock'),
    );
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('triggers LEAD_TIME_ABOVE when lead time exceeds threshold', async () => {
    const alert = makeAlert({ alertType: AlertType.LEAD_TIME_ABOVE, thresholdValue: 14 });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ leadTimeDays: 21 })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'Alert: PN-123',
      expect.stringContaining('21 days'),
    );
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('disables alert even when user has no push token', async () => {
    const alert = makeAlert({ alertType: AlertType.IN_STOCK });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ inStock: true })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: null } as any);

    await service.evaluateAlerts();

    expect(notificationsService.sendPushNotification).not.toHaveBeenCalled();
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('clears push token on DeviceNotRegistered and still disables alert', async () => {
    const alert = makeAlert({ alertType: AlertType.IN_STOCK });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockResolvedValue([makePrice({ inStock: true })]);
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[old]' } as any);
    notificationsService.sendPushNotification.mockResolvedValue('device_not_registered');

    await service.evaluateAlerts();

    expect(usersService.updatePushToken).toHaveBeenCalledWith('user-1', null);
    expect(alertsService.disableAndStampAlert).toHaveBeenCalledWith('alert-1');
  });

  it('skips a group and leaves alerts active when scraper throws', async () => {
    const alert = makeAlert();
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPricesForPart.mockRejectedValue(new Error('scraper timeout'));

    await service.evaluateAlerts();

    expect(alertsService.disableAndStampAlert).not.toHaveBeenCalled();
  });

  it('uses getPriceFromVendor when all alerts in group share the same vendorSlug', async () => {
    const alert = makeAlert({ vendorSlug: 'grainger', alertType: AlertType.IN_STOCK });
    alertsService.findAllActive.mockResolvedValue([alert]);
    vendorsService.getPriceFromVendor.mockResolvedValue(makePrice({ inStock: true }));
    usersService.findById.mockResolvedValue({ id: 'user-1', expoPushToken: 'ExponentPushToken[abc]' } as any);

    await service.evaluateAlerts();

    expect(vendorsService.getPriceFromVendor).toHaveBeenCalledWith('grainger', 'PN-123');
    expect(vendorsService.getPricesForPart).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- --testPathPattern="alert-evaluator.service.spec"
```

Expected: FAIL — cannot find module `./alert-evaluator.service`

- [ ] **Step 3: Implement AlertEvaluatorService**

`backend/src/alerts/alert-evaluator.service.ts`:

```ts
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AlertsService } from './alerts.service';
import { VendorsService } from '../vendors/vendors.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import { Alert } from './entities/alert.entity';
import { AlertType } from './dto/create-alert.dto';
import { PriceResult } from '../vendors/scrapers/base.scraper';

@Injectable()
export class AlertEvaluatorService {
  private readonly logger = new Logger(AlertEvaluatorService.name);

  constructor(
    private alertsService: AlertsService,
    private vendorsService: VendorsService,
    private notificationsService: NotificationsService,
    private usersService: UsersService,
  ) {}

  @Cron('0 * * * *')
  async evaluateAlerts(): Promise<void> {
    const alerts = await this.alertsService.findAllActive();

    const groups = new Map<string, Alert[]>();
    for (const alert of alerts) {
      const existing = groups.get(alert.partNumber) ?? [];
      groups.set(alert.partNumber, [...existing, alert]);
    }

    let checked = 0, triggered = 0, partsScraped = 0, errors = 0;

    for (const [partNumber, group] of groups) {
      try {
        const prices = await this.fetchPrices(partNumber, group);
        partsScraped++;

        for (const alert of group) {
          checked++;
          const match = this.evaluate(alert, prices);
          if (match) {
            triggered++;
            await this.notifyAndDisable(alert, match);
          }
        }
      } catch (err) {
        errors++;
        this.logger.warn(`Skipping ${partNumber}: ${(err as Error).message}`);
      }
    }

    this.logger.log(
      `Alert evaluation: checked=${checked} triggered=${triggered} partsScraped=${partsScraped} errors=${errors}`,
    );
  }

  private async fetchPrices(partNumber: string, group: Alert[]): Promise<PriceResult[]> {
    const allSameVendor =
      group.length > 0 &&
      group.every(a => a.vendorSlug && a.vendorSlug === group[0].vendorSlug);

    if (allSameVendor && group[0].vendorSlug) {
      const result = await this.vendorsService.getPriceFromVendor(group[0].vendorSlug, partNumber);
      return result ? [result] : [];
    }

    return this.vendorsService.getPricesForPart(partNumber);
  }

  private evaluate(
    alert: Alert,
    prices: PriceResult[],
  ): { price: PriceResult; message: string } | null {
    for (const price of prices) {
      if (alert.vendorSlug && price.vendorSlug !== alert.vendorSlug) continue;

      if (
        alert.alertType === AlertType.PRICE_BELOW &&
        price.price !== null &&
        price.price < alert.thresholdValue
      ) {
        return {
          price,
          message: `Price at ${price.vendorName} dropped to $${price.price} (your threshold: $${alert.thresholdValue})`,
        };
      }

      if (alert.alertType === AlertType.IN_STOCK && price.inStock) {
        return {
          price,
          message: `${alert.partNumber} is back in stock at ${price.vendorName}`,
        };
      }

      if (
        alert.alertType === AlertType.LEAD_TIME_ABOVE &&
        price.leadTimeDays !== null &&
        price.leadTimeDays > alert.thresholdValue
      ) {
        return {
          price,
          message: `Lead time at ${price.vendorName} is now ${price.leadTimeDays} days (your threshold: ${alert.thresholdValue} days)`,
        };
      }
    }

    return null;
  }

  private async notifyAndDisable(
    alert: Alert,
    result: { price: PriceResult; message: string },
  ): Promise<void> {
    const user = await this.usersService.findById(alert.userId);

    if (user?.expoPushToken) {
      const outcome = await this.notificationsService.sendPushNotification(
        user.expoPushToken,
        `Alert: ${alert.partNumber}`,
        result.message,
      );
      if (outcome === 'device_not_registered') {
        await this.usersService.updatePushToken(user.id, null);
        this.logger.log(`Cleared stale push token for user ${user.id}`);
      }
    }

    await this.alertsService.disableAndStampAlert(alert.id);
  }
}
```

- [ ] **Step 4: Run all tests**

```bash
npm test -- --testPathPattern="alert-evaluator.service.spec"
```

Expected: all 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/alerts/alert-evaluator.service.ts backend/src/alerts/alert-evaluator.service.spec.ts
git commit -m "feat: add AlertEvaluatorService with hourly cron and condition evaluation"
```

---

### Task 7: Wire Modules

**Files:**
- Modify: `backend/src/alerts/alerts.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Update AlertsModule to import dependencies and register evaluator**

Full file `backend/src/alerts/alerts.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { AlertEvaluatorService } from './alert-evaluator.service';
import { Alert } from './entities/alert.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Alert]),
    NotificationsModule,
    UsersModule,
    VendorsModule,
  ],
  controllers: [AlertsController],
  providers: [AlertsService, AlertEvaluatorService],
})
export class AlertsModule {}
```

- [ ] **Step 2: Add ScheduleModule.forRoot() to AppModule**

Full file `backend/src/app.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
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
    ScheduleModule.forRoot(),
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

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no TypeScript errors

- [ ] **Step 4: Run all backend tests**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/alerts/alerts.module.ts backend/src/app.module.ts
git commit -m "feat: wire AlertEvaluatorService and enable ScheduleModule"
```

---

### Task 8: Mobile — Push Token Registration

**Files:**
- Create: `mobile/services/notifications.ts`
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Create notifications utility**

`mobile/services/notifications.ts`:

```ts
import * as Notifications from 'expo-notifications';
import api from './api';

export async function registerForPushNotifications(): Promise<void> {
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  const { data: token } = await Notifications.getExpoPushTokenAsync();
  await api.patch('/users/push-token', { token });
}
```

- [ ] **Step 2: Call registration in _layout.tsx after auth check**

Full file `mobile/app/_layout.tsx`:

```ts
import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getToken } from '../services/api';
import { registerForPushNotifications } from '../services/notifications';

export default function RootLayout() {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    getToken().then(token => {
      if (!token) {
        router.replace('/login');
      } else {
        registerForPushNotifications().catch(() => {});
      }
      setChecked(true);
    });
  }, []);

  if (!checked) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
```

- [ ] **Step 3: Verify TypeScript compilation**

```bash
cd mobile && npx tsc --noEmit
```

Expected: no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add mobile/services/notifications.ts mobile/app/_layout.tsx
git commit -m "feat: register Expo push token after authentication"
```

---

## Self-Review

**Spec coverage:**
- ✅ Section 1 (Push Token Registration): Tasks 2, 3 — `expoPushToken` column, `updatePushToken()`, `PATCH /users/push-token`, `UpdatePushTokenDto`, UsersModule controller registration
- ✅ Section 2 (Alert Evaluation Logic): Tasks 5, 6 — `findAllActive()`, `disableAndStampAlert()`, `AlertEvaluatorService` with cron, grouping by part, all three `alertType` conditions, error handling (scraper skip, DeviceNotRegistered, no push token)
- ✅ Section 3 (Notifications Module): Task 4 — `NotificationsService`, `NotificationsModule`, token validation, DeviceNotRegistered return, other errors thrown
- ✅ Section 4 (Mobile Changes): Task 8 — `notifications.ts` utility, `_layout.tsx` post-auth call
- ✅ Wiring: Task 7 — AlertsModule imports, ScheduleModule.forRoot()
- ✅ Dependencies: Task 1 — all three packages

**Type consistency:** `AlertType` imported from `./dto/create-alert.dto` everywhere. `PriceResult` from `../vendors/scrapers/base.scraper` everywhere. `updatePushToken(userId: string, token: string | null): Promise<void>` signature consistent across service definition, tests, and evaluator call site.
