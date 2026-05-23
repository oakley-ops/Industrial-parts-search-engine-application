# Alert Evaluation System Design

**Date:** 2026-05-22
**Cluster:** C — Alert Evaluation
**Scope:** NestJS backend + React Native mobile (minor)

---

## Problem

The Alerts feature allows users to create conditions (price drops below threshold, part back in stock, lead time exceeds threshold) but no background process evaluates these conditions or notifies users. Alerts are UI-only placeholders.

---

## Decisions

| Decision | Choice | Reason |
|----------|--------|--------|
| Notification channel | Expo Push Notifications | Native mobile experience; app is React Native/Expo |
| Evaluation frequency | Every hour | Industrial parts prices change slowly; hourly is sufficient |
| Re-trigger behavior | Once and done | Alert fires once then auto-disables; user re-enables if needed |

---

## Architecture

Three new units, one modified unit:

```
@nestjs/schedule (cron)
       │
       ▼
AlertEvaluatorService          ← new, in alerts module
  │  groups alerts by part
  │  calls VendorsService (existing)
  │  evaluates conditions
  │  calls NotificationsService
  │  disables triggered alerts
       │
       ▼
NotificationsService           ← new, standalone module
  wraps expo-server-sdk-node
  sends push to Expo Push API

UsersController                ← new (service existed, no controller)
  PATCH /users/push-token      ← stores Expo token on User record

mobile/services/notifications  ← new utility
  requests push permission
  registers token with backend
```

---

## Section 1: Push Token Registration

### Backend

**`User` entity** — one new column:
```ts
@Column({ name: 'expo_push_token', nullable: true, type: 'text' })
expoPushToken: string | null;
```

**`UsersController`** (`backend/src/users/users.controller.ts`) — new file:
- `PATCH /users/push-token` — auth-protected, accepts `{ token: string }`, writes to `req.user.id`'s record
- Single endpoint, no other user management routes added

**`UpdatePushTokenDto`** (`backend/src/users/dto/update-push-token.dto.ts`):
```ts
export class UpdatePushTokenDto {
  @IsString() @IsNotEmpty() token: string;
}
```

**`UsersService`** — add one method:
```ts
updatePushToken(userId: string, token: string): Promise<void>
```

### Mobile

**`mobile/services/notifications.ts`** — new utility:
```ts
async function registerForPushNotifications(): Promise<void>
```
- Calls `Notifications.requestPermissionsAsync()`
- If granted, calls `Notifications.getExpoPushTokenAsync()`
- Calls `PATCH /users/push-token` with the token
- Silently no-ops if permission denied

**`mobile/app/_layout.tsx`** — call `registerForPushNotifications()` once after confirming the user is authenticated.

---

## Section 2: Alert Evaluation Logic

### AlertEvaluatorService

**File:** `backend/src/alerts/alert-evaluator.service.ts`

Runs once per hour via `@Cron('0 * * * *')` from `@nestjs/schedule`.

**Evaluation loop:**

```
1. Load all active alerts: find({ where: { isActive: true } })
2. Group alerts by partNumber (Map<string, Alert[]>)
3. For each unique partNumber:
   a. If alert has vendorSlug → call VendorsService.getPriceFromVendor(vendorSlug, partNumber)
      Else → call VendorsService.getPricesForPart(partNumber)
   b. If scraper throws or returns empty → log warning, skip this group (retry next hour)
   c. For each alert in the group:
      - Evaluate condition against price results (see below)
      - If triggered:
          i.  Load user's expoPushToken from UsersService
          ii. Send push notification via NotificationsService
          iii. Set alert.isActive = false, alert.lastTriggered = now()
          iv. Save alert
4. Log summary: { checked, triggered, partsScraped, errors }
```

**Condition evaluation:**

| alertType | Triggered when |
|-----------|---------------|
| `PRICE_BELOW` | Any price result where `price !== null && price < thresholdValue` |
| `IN_STOCK` | Any price result where `inStock === true` |
| `LEAD_TIME_ABOVE` | Any price result where `leadTimeDays !== null && leadTimeDays > thresholdValue` |

**Error handling:**
- Scraper failure for a part → skip that group, leave alerts active, log warning
- Push notification failure → still disable the alert (condition was met), log error
- `DeviceNotRegistered` from Expo → clear `expoPushToken` from user, log info

**Caching note:** `VendorsService` caches price results in Redis (15 min TTL). If a price was recently scraped for another reason, the evaluator hits cache at no scraper cost.

---

## Section 3: Notifications Module

### NotificationsService

**File:** `backend/src/notifications/notifications.service.ts`

Single public method:
```ts
async sendPushNotification(
  token: string,
  title: string,
  body: string
): Promise<'sent' | 'device_not_registered'>
```

Internals:
- Validates token with `Expo.isExpoPushToken(token)` before sending
- Uses `expo.sendPushNotificationsAsync([{ to, title, body, sound: 'default' }])`
- Returns `'device_not_registered'` if Expo receipt indicates `DeviceNotRegistered`
- All other errors are thrown (caller handles)

**Notification message format:**

| alertType | Title | Body |
|-----------|-------|------|
| `PRICE_BELOW` | `Alert: {partNumber}` | `Price at {vendorName} dropped to ${price} (your threshold: ${threshold})` |
| `IN_STOCK` | `Alert: {partNumber}` | `{partNumber} is back in stock at {vendorName}` |
| `LEAD_TIME_ABOVE` | `Alert: {partNumber}` | `Lead time at {vendorName} is now {days} days (your threshold: {threshold} days)` |

**`NotificationsModule`** (`backend/src/notifications/notifications.module.ts`) — standalone module, exports `NotificationsService`. Imported by `AlertsModule`.

---

## Section 4: Mobile Changes

**`mobile/services/notifications.ts`** — new file:
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

**`mobile/app/_layout.tsx`** — add after auth check:
```ts
import { registerForPushNotifications } from '../services/notifications';
// Inside the effect that runs when user is authenticated:
registerForPushNotifications().catch(() => {}); // non-blocking, silent fail
```

No other mobile changes. The push notification itself is handled by iOS/Android and Expo's notification SDK — no in-app notification UI is needed.

---

## Files Changed

| Action | Path | Purpose |
|--------|------|---------|
| Modify | `backend/src/users/entities/user.entity.ts` | Add `expoPushToken` column |
| Modify | `backend/src/users/users.service.ts` | Add `updatePushToken()` method |
| Modify | `backend/src/users/users.module.ts` | Export `UsersService`, add controller |
| Create | `backend/src/users/users.controller.ts` | `PATCH /users/push-token` endpoint |
| Create | `backend/src/users/dto/update-push-token.dto.ts` | `UpdatePushTokenDto` |
| Create | `backend/src/notifications/notifications.service.ts` | Expo push wrapper |
| Create | `backend/src/notifications/notifications.module.ts` | Standalone module |
| Create | `backend/src/alerts/alert-evaluator.service.ts` | Hourly cron evaluation loop |
| Modify | `backend/src/alerts/alerts.module.ts` | Import ScheduleModule, NotificationsModule, UsersModule; register AlertEvaluatorService |
| Modify | `backend/src/app.module.ts` | Import ScheduleModule.forRoot() |
| Modify | `backend/package.json` | Add `@nestjs/schedule`, `expo-server-sdk-node` |
| Create | `mobile/services/notifications.ts` | Push token registration utility |
| Modify | `mobile/app/_layout.tsx` | Call registerForPushNotifications after auth |

---

## What This Does NOT Change

- Existing alert CRUD endpoints — untouched
- Scraper logic — untouched
- Redis caching — used as-is (evaluator benefits from cached prices for free)
- Quote system — untouched
- Auth flow — untouched
