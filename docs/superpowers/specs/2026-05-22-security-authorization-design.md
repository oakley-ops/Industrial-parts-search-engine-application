# Security & Authorization Hardening

**Date:** 2026-05-22
**Clusters:** A (Security & Authorization) + B (Data Reliability)
**Scope:** Backend only — NestJS API

---

## Problem Summary

A full code review identified the following issues requiring remediation:

| Severity | Issue |
|----------|-------|
| Critical | No user ownership on Quotes or Alerts — all users see all data |
| Critical | JWT secret falls back to `'dev-secret'` if env var is missing |
| Critical | `synchronize: true` will auto-alter/destroy the production DB schema |
| High | `alertType` and `quote.status` accept any string — no enum enforcement |
| Medium | No rate limiting on slow scraper endpoints |
| Medium | Cache-clear endpoints exposed to all authenticated users |
| Low | DTOs defined inline in controller files |

---

## Architecture

All changes are confined to the NestJS backend. No mobile changes are required — the API contracts (routes, request/response shapes) remain identical. The mobile app does not need to be updated.

---

## Section 1: User Ownership

### CurrentUser Decorator

A `@CurrentUser()` parameter decorator is added at `backend/src/auth/current-user.decorator.ts`. It extracts `req.user` (already set by `JwtAuthGuard` via the JWT strategy) and returns the typed `{ id: string, email: string }` object. Controllers use this decorator instead of `@Request()`.

```
backend/src/auth/current-user.decorator.ts   ← new file
```

### Entity Changes

`Quote` and `Alert` entities each gain a `userId: string` column:

```ts
@Column({ name: 'user_id' }) userId: string;
```

- Plain UUID string column — no `@ManyToOne` relation object (the `User` entity is never loaded from these tables, only filtered by ID)
- Not nullable
- Indexed for query performance

The database is wiped and re-synced, so no migration is needed for this initial addition.

### Service Changes

Every service method that reads or mutates a quote or alert gains a `userId: string` parameter:

| Method | Change |
|--------|--------|
| `findAll()` | `find({ where: { userId }, order: ... })` |
| `findOne(id)` | `findOne({ where: { id, userId } })` — throws `NotFoundException` if not found or owned by another user (same response, so existence of other users' data is not leaked) |
| `create(...)` | sets `userId` on the new entity before saving |
| `delete(id)` | calls `findOne(id, userId)` first — ownership enforced automatically |
| `updateStatus(id, ...)` | calls `findOne(id, userId)` first |
| `addLineItem(quoteId, ...)` | calls `findOne(quoteId, userId)` first |
| `removeLineItem(itemId, ...)` | looks up item's `quote.userId` to verify ownership |
| `toggle(id)` — alerts | calls `findOne({ id, userId })` first |

### Controller Changes

All `QuotesController` and `AlertsController` methods inject `@CurrentUser() user` and pass `user.id` to the service. Controllers remain thin — no business logic added.

---

## Section 2: Schema Safety

### synchronize Flag

`app.module.ts` TypeORM config changes from:

```ts
synchronize: true,
```

to:

```ts
synchronize: process.env.NODE_ENV !== 'production',
```

- **Development:** auto-sync remains on — fast iteration, no manual steps
- **Production:** strictly off — TypeORM never auto-alters the database

TypeORM migration CLI is not set up at this time. When a production schema change is needed in the future, migration files will be added then.

### JWT_SECRET Startup Guard

`configuration.ts` throws on startup if the secret is unsafe in production:

```ts
if (process.env.NODE_ENV === 'production' &&
    (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'dev-secret')) {
  throw new Error('JWT_SECRET env var is required in production');
}
```

The server refuses to boot rather than running with a forgeable secret.

---

## Section 3: Input Hardening

### Enum Validation

Two enums are introduced in `dto/` files:

**`AlertType`** — `backend/src/alerts/dto/create-alert.dto.ts`
```ts
export enum AlertType {
  PRICE_BELOW = 'price_below',
  IN_STOCK = 'in_stock',
  LEAD_TIME_ABOVE = 'lead_time_above',
}
```

**`QuoteStatus`** — `backend/src/quotes/dto/update-status.dto.ts`
```ts
export enum QuoteStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}
```

DTOs use `@IsEnum(AlertType)` / `@IsEnum(QuoteStatus)`. Entity columns use `type: 'enum', enum: AlertType` so Postgres enforces values at the DB layer too.

### Rate Limiting

`@nestjs/throttler` is added as a dependency. A global `ThrottlerGuard` is registered in `AppModule`:

```ts
ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])  // 60 req / 60s default
```

The two slow scraper endpoints get tighter limits via `@Throttle`:

```ts
@Throttle({ default: { ttl: 30000, limit: 5 } })
@Get('search') search(...)

@Throttle({ default: { ttl: 30000, limit: 5 } })
@Get('prices/:partNumber') getPrices(...)
```

### CORS

`app.enableCors({ origin: '*' })` is left unchanged. React Native does not enforce CORS (no browser sandbox), so this has no security impact on the current mobile-only client. A code comment is added noting that origin should be restricted if a web frontend is introduced.

### Cache-Clear Endpoints Removed

`DELETE /vendors/cache` and `DELETE /vendors/cache/:partNumber` are removed from `VendorsController`. The underlying `VendorsService.clearCache()` method is kept (useful for testing) but no longer exposed via HTTP.

### DTOs Moved to Module Folders

All DTOs are extracted from controller files into proper `dto/` subfolders:

```
backend/src/auth/dto/login.dto.ts
backend/src/auth/dto/register.dto.ts
backend/src/quotes/dto/create-quote.dto.ts
backend/src/quotes/dto/add-line-item.dto.ts
backend/src/quotes/dto/update-status.dto.ts
backend/src/alerts/dto/create-alert.dto.ts
```

Controllers become import-only. No logic changes.

---

## Files Changed

| File | Change |
|------|--------|
| `backend/src/auth/current-user.decorator.ts` | New — `@CurrentUser()` decorator |
| `backend/src/auth/dto/login.dto.ts` | New — extracted from controller |
| `backend/src/auth/dto/register.dto.ts` | New — extracted from controller |
| `backend/src/quotes/entities/quote.entity.ts` | Add `userId` column, `status` as enum |
| `backend/src/quotes/dto/create-quote.dto.ts` | New — extracted from controller |
| `backend/src/quotes/dto/add-line-item.dto.ts` | New — extracted from controller |
| `backend/src/quotes/dto/update-status.dto.ts` | New — `QuoteStatus` enum + DTO |
| `backend/src/quotes/quotes.service.ts` | Add `userId` param to all methods |
| `backend/src/quotes/quotes.controller.ts` | Inject `@CurrentUser()`, pass `user.id` |
| `backend/src/alerts/entities/alert.entity.ts` | Add `userId` column, `alertType` as enum |
| `backend/src/alerts/dto/create-alert.dto.ts` | New — `AlertType` enum + DTO |
| `backend/src/alerts/alerts.service.ts` | Add `userId` param to all methods |
| `backend/src/alerts/alerts.controller.ts` | Inject `@CurrentUser()`, pass `user.id` |
| `backend/src/vendors/vendors.controller.ts` | Remove cache-clear endpoints, add `@Throttle` |
| `backend/src/app.module.ts` | `synchronize` by NODE_ENV, add `ThrottlerModule` |
| `backend/src/config/configuration.ts` | JWT_SECRET startup guard |
| `backend/package.json` | Add `@nestjs/throttler` |

---

## What This Does NOT Change

- Mobile app — no changes required
- API routes or response shapes — fully backward compatible
- Scraper logic — untouched
- Redis caching — untouched
- Auth flow (login/register) — untouched
