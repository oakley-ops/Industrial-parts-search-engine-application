# Alert Push Notifications Design

**Date:** 2026-05-23
**Status:** Approved

## Goal

When an alert condition is met (price drops below threshold, part comes back in stock, or lead time exceeds threshold), the engineer receives an Expo push notification on their device. The alert auto-disables after firing so they are not spammed.

---

## Architecture

This feature is backend-only. All evaluation logic, push sending, and token management live in the existing `alerts` module. The mobile side already registers push tokens at app load.

### Backend: `AlertEvaluatorService` (already implemented)

**File:** `backend/src/alerts/alert-evaluator.service.ts`

**Cron schedule:** `0 * * * *` — runs every hour at :00.

**Evaluation loop:**

1. Load all `isActive: true` alerts via `AlertsService.findAllActive()`
2. Group alerts by `partNumber` — one scrape per part, not per alert
3. For each group: fetch live prices
   - If all alerts in the group share the same `vendorSlug`: call `VendorsService.getPriceFromVendor(slug, partNumber)` (targeted, faster)
   - Otherwise: call `VendorsService.getPricesForPart(partNumber)` (all vendors)
4. Evaluate each alert against fetched prices:
   - `PRICE_BELOW`: triggers when `price.price < alert.thresholdValue`
   - `IN_STOCK`: triggers when `price.inStock === true`
   - `LEAD_TIME_ABOVE`: triggers when `price.leadTimeDays > alert.thresholdValue`
5. On match: call `notifyAndDisable(alert, { price, message })`
   - Fetch user record for `expoPushToken`
   - If token present: send push via `NotificationsService.sendPushNotification(token, title, body)`
   - If `DeviceNotRegistered` returned: clear the stale token via `UsersService.updatePushToken(userId, null)`
   - Always: call `AlertsService.disableAndStampAlert(alertId)` — sets `isActive = false`, stamps `lastTriggered`
6. On scraper error for a group: log warning, skip group, leave alerts active (they retry next hour)

**Push notification shape:**
- Title: `Alert: {partNumber}`
- Body: human-readable message, e.g.:
  - `"Price at Grainger dropped to $4.50 (your threshold: $6.00)"`
  - `"6203-2RS is back in stock at McMaster-Carr"`
  - `"Lead time at Motion is now 21 days (your threshold: 14 days)"`

**Module wiring** (`backend/src/alerts/alerts.module.ts`):
- Imports: `NotificationsModule`, `UsersModule`, `VendorsModule`
- Providers: `AlertsService`, `AlertEvaluatorService`
- `ScheduleModule` already registered in `AppModule`

### Backend: Supporting services (already implemented)

- `AlertsService.findAllActive()` — `WHERE isActive = true`
- `AlertsService.disableAndStampAlert(id)` — sets `isActive = false`, `lastTriggered = NOW()`
- `NotificationsService.sendPushNotification(token, title, body)` — Expo server SDK, returns `'sent' | 'device_not_registered'`
- `UsersService.findById(id)` — returns user with `expoPushToken`
- `UsersService.updatePushToken(userId, null)` — clears stale token

### Mobile: Push token registration (already implemented)

**File:** `mobile/services/notifications.ts`

Called at app load from `mobile/app/(tabs)/_layout.tsx`:

```typescript
registerForPushNotifications().catch(() => {});
```

Flow:
1. `Notifications.requestPermissionsAsync()` — requests OS permission
2. If denied: return silently (no token stored; alert evaluation still runs but skips push)
3. `Notifications.getExpoPushTokenAsync({ projectId })` — gets Expo token
4. `PATCH /api/v1/users/push-token { token }` — stores on user record

### Configuration required

`mobile/app.json` currently has:
```json
"extra": { "eas": { "projectId": "REPLACE_WITH_YOUR_EXPO_PROJECT_ID" } }
```

This must be replaced with the actual Expo project ID from the EAS dashboard. Without it, `getExpoPushTokenAsync` cannot produce a valid production push token.

---

## Data Flow

```
Every hour (cron)
  → Load active alerts
  → Group by partNumber
  → Scrape live prices (1 request per unique part)
  → Evaluate conditions
      match → send push notification → disable alert + stamp lastTriggered
      no match → no action (alert stays active, checks next hour)
      scraper error → skip group (alert stays active, retries next hour)
```

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Scraper throws for a part | Skip that group; alerts remain active |
| User has no push token | Skip push; still disable and stamp alert |
| `DeviceNotRegistered` from Expo | Clear `expoPushToken`; still disable and stamp alert |
| Any other push error | Exception propagates; alert group may not be disabled (logged) |
| Permission denied on device | No token stored; push skipped; alert evaluates and disables normally |

---

## Testing

**Unit tests** (`backend/src/alerts/alert-evaluator.service.spec.ts`) — 8 tests covering:
- No active alerts → no scraping, no push
- `PRICE_BELOW` triggers when price < threshold
- `PRICE_BELOW` does not trigger when price >= threshold
- `IN_STOCK` triggers when `inStock: true`
- `LEAD_TIME_ABOVE` triggers when `leadTimeDays > threshold`
- Alert disables even when user has no push token
- Stale token cleared on `DeviceNotRegistered`, alert still disabled
- Scraper error → alert stays active

**Manual test:**
1. Create an `in_stock` alert for a part you know is in stock
2. Trigger `evaluateAlerts()` manually (or wait for the hourly cron)
3. Verify push notification arrives on device
4. Verify alert shows `isActive: false` and `lastTriggered` is set

---

## What This Is Not

- No notification history or in-app notification center
- No re-notification for recurring conditions (one-shot, auto-disable)
- No per-alert notification preferences (sound, quiet hours)
- No batch push optimization (acceptable at current scale)
