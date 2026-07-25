# Billing Audit Report

**Date:** 2026-04-15
**Auditor:** Qwen Code (automated)
**Scope:** Subscription lifecycle, Paystack integration, cancellation flow, downgrade safety

---

## Subscription States

```
free ──(subscribe)──→ active ──(cancel)──→ cancelled ──(past periodEnd)──→ free
                          ↑                                       
                          └──(re-subscribe)─────────────────────────┘
```

| State | Has Access? | Downgrade Pending? | Description |
|-------|-------------|-------------------|-------------|
| free | No (free tier only) | No | Never subscribed or expired |
| active | Yes | No | Current paid subscriber |
| cancelled | Yes until `periodEnd` | Yes (`scheduledDowngradeAt = periodEnd`) | Cancelled but still in billing period |
| past_due | Yes (grace period) | No | Payment failed, retry in progress |

## Cancellation Flow (FIXED)

### Before Fix
- Cancellation immediately downgraded to free tier
- Users lost access instantly despite having paid for the period

### After Fix
1. **Webhook `subscription.disable`** → Sets `status: "cancelled"`, `scheduledDowngradeAt: currentPeriodEnd`
2. **User retains full Pro access** until `periodEnd`
3. **Daily cron job** checks for `scheduledDowngradeAt <= now`:
   - Sets `plan: "free"` on user document
   - Sets `status: "expired"` on subscription
   - Clears `scheduledDowngradeAt` and `currentSubscriptionId`

### Test Verification
- `subscriptionLifecycle.test.ts` — 15 tests covering:
  - Webhook disable preserves access ✅
  - `scheduledDowngradeAt` set correctly ✅
  - Cron processes past dates, skips future dates ✅
  - End-to-end cancel→expire→downgrade flow ✅

## Paystack Integration

### Webhook Events Handled
| Event | Handler | Action |
|-------|---------|--------|
| `subscription.disable` | Webhook route | Mark as cancelled, preserve access |
| `subscription.create` | Webhook route | Activate subscription |
| `charge.success` | Webhook route | Process payment, add credits |
| `invoice.payment_failed` | Webhook route | Set past_due status |

### Transaction Recording
- Every webhook creates a `credit_transactions` document
- Fields: `userId`, `amount`, `type` (subscription/payment), `status`, `plan`, `reference`
- Idempotency: duplicate `reference` check prevents double-processing

### Billing Test Coverage
**File:** `src/services/billing.test.ts` — 19 tests

| Category | Tests | Verified |
|----------|-------|----------|
| Plan resolution | 4 | From Paystack metadata and data fields |
| Transaction creation | 3 | Correct fields, display name mapping |
| Idempotency | 2 | Duplicate reference rejection |
| Period calculation | 3 | Monthly (30d), yearly (365d) |
| Webhook routing | 4 | Correct event → correct handler |
| Amount conversion | 3 | Kobo → Naira conversion |

## Credit System

| Plan | Monthly Credits | Notes |
|------|----------------|-------|
| Free | 25 | 25 initial, no renewal |
| Basic | 200 | Monthly renewal |
| Starter | 400 | Monthly renewal |
| Growth | 800 | Monthly renewal |
| Pro | 2,500 | Monthly renewal |

- Credits are non-cumulative (reset each billing period)
- `deductCreditsWithSync()` — atomic deduct + server sync
- `onCreditChange` event bus notifies UI of balance updates

## Risk Areas

| Risk | Mitigation | Status |
|------|-----------|--------|
| Double-charging | Idempotency check on Paystack reference | ✅ Implemented |
| Downgrade on cancel | Fixed: access preserved until periodEnd | ✅ Fixed this session |
| Credit leak on downgrade | Credits reset to free tier (25) on downgrade | ✅ Handled |
| Webhook replay | MongoDB upsert by reference | ✅ Idempotent |

## Verification

- [x] `billing.test.ts` — 19 tests passing
- [x] `subscriptionLifecycle.test.ts` — 15 tests passing
- [x] Cancellation preserves access until `periodEnd`
- [x] `scheduledDowngradeAt` field used correctly
- [x] Daily cron processes expired subscriptions
