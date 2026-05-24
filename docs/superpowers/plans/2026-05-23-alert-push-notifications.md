# Alert Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the Expo project ID so push notifications from the already-implemented alert evaluator cron job reach users' devices.

**Architecture:** The backend `AlertEvaluatorService` (hourly cron), `NotificationsService` (Expo server SDK), and mobile `registerForPushNotifications()` are all fully implemented and tested. The only missing piece is the `projectId` placeholder in `mobile/app.json`, which `getExpoPushTokenAsync` requires to produce a valid production push token.

**Tech Stack:** Expo EAS, `expo-notifications`, NestJS `@nestjs/schedule`

---

### Task 1: Confirm backend tests pass

**Files:**
- Test: `backend/src/alerts/alert-evaluator.service.spec.ts` (read-only — 9 tests already written)

- [ ] **Step 1: Run the alert evaluator test suite**

```bash
cd backend
npm test -- --testPathPattern="alert-evaluator"
```

Expected output:
```
PASS src/alerts/alert-evaluator.service.spec.ts
  AlertEvaluatorService
    ✓ does nothing when there are no active alerts
    ✓ triggers PRICE_BELOW when price is below threshold
    ✓ does NOT trigger PRICE_BELOW when price is above threshold
    ✓ triggers IN_STOCK when part is in stock
    ✓ triggers LEAD_TIME_ABOVE when lead time exceeds threshold
    ✓ disables alert even when user has no push token
    ✓ clears push token on DeviceNotRegistered and still disables alert
    ✓ skips a group and leaves alerts active when scraper throws
    ✓ uses getPriceFromVendor when all alerts in group share the same vendorSlug

Tests: 9 passed, 9 total
```

If any test fails, investigate before proceeding — the backend must be green before configuring the mobile side.

---

### Task 2: Configure Expo project ID in app.json

**Files:**
- Modify: `mobile/app.json` — replace the `projectId` placeholder

The mobile app calls `Notifications.getExpoPushTokenAsync({ projectId })` at app load. Without a real `projectId`, this returns an invalid token in production builds and push notifications will never be delivered.

- [ ] **Step 1: Log into Expo and get your project ID**

Run this in your terminal (requires user interaction — prefix with `!` in Claude Code):

```bash
cd mobile
npx expo whoami
```

If not logged in:
```bash
npx expo login
```

Then fetch or create the EAS project:
```bash
npx eas init
```

`eas init` will either link to an existing Expo project matching the slug `industrial-parts-finder` or create a new one. It will print the project ID and may update `app.json` automatically. If it updates `app.json`, skip Step 2 and go to Step 3.

- [ ] **Step 2: Update app.json with the project ID**

Open `mobile/app.json`. Find:
```json
"extra": {
  "eas": {
    "projectId": "REPLACE_WITH_YOUR_EXPO_PROJECT_ID"
  }
}
```

Replace `REPLACE_WITH_YOUR_EXPO_PROJECT_ID` with the UUID from `eas init` output, e.g.:
```json
"extra": {
  "eas": {
    "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

The project ID is a UUID (format: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`). It's also visible at `expo.dev` → your project → Project ID.

- [ ] **Step 3: Verify the value is set correctly**

```bash
grep -A3 '"eas"' mobile/app.json
```

Expected: the `projectId` field contains a UUID, not the placeholder string.

- [ ] **Step 4: Commit**

```bash
git add mobile/app.json
git commit -m "config: set Expo EAS project ID for push notifications"
```

---

### Task 3: Push to GitHub and verify Railway deploy

**Files:**
- No file changes — deploy verification only.

- [ ] **Step 1: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 2: Verify Railway picks up the deploy**

Open the Railway dashboard for the `Industrial-parts-search-engine-application` service. Within ~2 minutes of the push, a new deployment should appear. Wait for it to reach `Active` status.

In the deploy logs, confirm these lines appear (they confirm the alert cron is registered):

```
[InstanceLoader] AlertsModule dependencies initialized
[NestApplication] Nest application successfully started
```

- [ ] **Step 3: Smoke test — verify push token registration**

Install the app on a physical device (push notifications do not work in simulators). Open the app — it requests notification permission on first load via `registerForPushNotifications()` in `mobile/app/(tabs)/_layout.tsx`.

After granting permission, confirm the token was stored:

```bash
# Check the users table in your Railway PostgreSQL instance
# via Railway's database console or psql:
SELECT id, email, expo_push_token FROM users WHERE expo_push_token IS NOT NULL LIMIT 5;
```

Expected: at least one row with a non-null `expo_push_token` value starting with `ExponentPushToken[`.

- [ ] **Step 4: Smoke test — trigger an alert manually**

Create a test alert for a part that is currently in stock (e.g., `6203-2RS`, alert type `in_stock`). Then call the cron handler directly via a one-off NestJS script, or wait up to an hour for the hourly cron to fire.

To trigger immediately without waiting, use Railway's shell (or a local backend run) to call:

```typescript
// In a NestJS REPL or test script:
await alertEvaluatorService.evaluateAlerts();
```

Or from the Railway deploy logs, watch for the cron log line:
```
[AlertEvaluatorService] Alert evaluation: checked=N triggered=N partsScraped=N errors=0
```

Expected: push notification arrives on the physical device within seconds of the cron run, and the alert shows `is_active = false` in the database.
