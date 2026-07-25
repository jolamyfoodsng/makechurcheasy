# Trial Audit Report

**Date:** 2026-04-15
**Auditor:** Qwen Code (automated)
**Scope:** Trial activation, enforcement, reminders, expiration, and upgrade flow

---

## Trial Lifecycle

```
free user ──(activate trial)──→ trial active ──(14 days)──→ trial expired ──(downgrade)──→ free
                                     │                              │
                                     ├──(3-day reminder)──→ email    ├──(1-day reminder)──→ email
                                     │                              │
                                     └──(upgrade to paid)──→ active subscription
```

## Trial Parameters

| Parameter | Value | Source |
|-----------|-------|--------|
| Default duration | 14 days | `trialSystem.ts` → `DEFAULT_TRIAL_DAYS` |
| Reminder #1 | 3 days before expiry | Scheduled via `scheduleReminder()` |
| Reminder #2 | 1 day before expiry | Scheduled via `scheduleReminder()` |
| Effective plan during trial | Pro | `getEffectivePlan()` returns `"pro"` when trial active |
| Credits during trial | Pro credits (2,500) | Via `getCreditSummary()` |
| Storage during trial | 200 GB | Via Pro entitlements |
| All Pro features | Enabled | Via `hasEntitlement()` |

## Trial State Tracking

### User Document Fields
```typescript
{
  trialActive: boolean,        // Is trial currently active?
  trialStart: string,          // ISO date when trial started
  trialEnd: string,            // ISO date when trial expires
  trialReminder3dSent: boolean, // 3-day reminder sent?
  trialReminder1dSent: boolean, // 1-day reminder sent?
}
```

### State Transitions

| Action | Fields Set |
|--------|-----------|
| Activate trial | `trialActive: true`, `trialStart: now`, `trialEnd: now + 14d`, `trialReminder3dSent: false`, `trialReminder1dSent: false` |
| Send 3-day reminder | `trialReminder3dSent: true` |
| Send 1-day reminder | `trialReminder1dSent: true` |
| Expire trial | `trialActive: false`, `trialEnd: null`, `trialReminder3dSent: false`, `trialReminder1dSent: false` |
| Upgrade to paid | Trial fields cleared, `plan: newTier`, subscription created |

## Enforcement Points

| Check | Location | Behavior |
|-------|----------|----------|
| Feature access | `getEffectivePlan()` | Returns `"pro"` if `trialActive === true` |
| Resource limits | `canAdd()` | Uses Pro limits during trial |
| Cloud storage | `checkStorageQuota()` | Uses Pro 200 GB limit during trial |
| Credit balance | `getCreditSummary()` | Uses Pro credit allocation during trial |

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| User on free with no trial | Normal free-tier limits apply |
| User activates trial, then cancels | Trial continues until `trialEnd` (same as subscription cancellation pattern) |
| User upgrades to paid during trial | Trial fields cleared, paid subscription takes over |
| User's trial expires | `trialActive` set to false, reverts to free-tier limits |
| Double activation | Blocked — check if `trialActive` already true |
| Expired trial reactivation | Allowed — new 14-day window from activation date |

## Test Coverage

**File:** `src/services/trialSystem.test.ts` — 17 tests

| Category | Tests | Verified |
|----------|-------|----------|
| Trial activation | 3 | Sets dates, 14-day default, plan stays free |
| Trial active check | 3 | Future/past/null end dates |
| Effective plan during trial | 2 | Returns "pro" during active trial |
| Reminder scheduling | 2 | 3-day and 1-day reminders |
| Trial expiration | 3 | Clears fields, detects expired state |
| Upgrade flow | 2 | Trial→paid transition |
| Edge cases | 2 | Already-active trial, null trial state |

## Verification

- [x] `trialSystem.test.ts` — 17 tests passing
- [x] Trial grants Pro-level entitlements (all 18 features)
- [x] Trial duration is 14 days from activation
- [x] Reminder scheduling at 3-day and 1-day marks
- [x] Expired trial correctly reverts to free tier
- [x] Upgrade during trial clears trial fields
