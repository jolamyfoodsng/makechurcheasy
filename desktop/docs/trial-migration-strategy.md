# Free Trial Migration Strategy

Two trial durations based on user creation date.

---

## Trial Durations

### Existing Users (pre-launch)

Any user created before `SUBSCRIPTION_LAUNCH_DATE` (June 25, 2026) receives:

**10 Days Free Trial** — one-time migration benefit for early adopters.

### New Users (post-launch)

Any user created after the subscription system goes live receives:

**7 Days Free Trial** by default.

---

## Data Storage

Store trial information directly on the `UserProfile` document in MongoDB.

**Do NOT store `isTrialActive`** in the database. Always calculate it at runtime.

```ts
// UserProfile fields (beside existing subscription fields)
trialStartedAt?: string;      // ISO date
trialEndsAt?: string;         // ISO date
trialDurationDays?: number;   // 7 or 10
```

### New user example:

```json
{
  "plan": "free",
  "trialStartedAt": "2026-06-25T00:00:00.000Z",
  "trialEndsAt": "2026-07-02T00:00:00.000Z",
  "trialDurationDays": 7
}
```

### Existing user (migration) example:

```json
{
  "plan": "free",
  "trialStartedAt": "2026-06-25T00:00:00.000Z",
  "trialEndsAt": "2026-07-05T00:00:00.000Z",
  "trialDurationDays": 10
}
```

---

## Entitlement Logic (Single Source of Truth)

Every feature gate, API endpoint, desktop permission check, dashboard widget, billing page, and upgrade modal must use this single entitlement flow:

```
const effectivePlan = getEffectivePlan(user);
```

Priority order:

1. **Active Paid Subscription** → Use Paid Plan (`starter`, `growth`, `pro`)
2. **Trial Active** (`now < trialEndsAt`) → Use **Starter** Plan
3. **Otherwise** → Use Free Plan

```ts
function getEffectivePlan(user: AuthUser | null): PlanTier {
  if (!user) return "free";
  if (isProUnlocked()) return "pro";
  if (isInTrial(user)) return "starter";   // NOT "pro" — Starter is the trial experience
  return getUserPlan(user);                // subscription cache or server plan
}
```

**Critical:** Do NOT scatter `if (isInTrial(user))` checks throughout the application. Always use `getEffectivePlan(user)` and let the entitlement flow handle it.

---

## Trial Behavior

Trial behaves like **Starter** — NOT Pro.

During trial, users experience:

- ✓ Translation
- ✓ Multiview
- ✓ Mass Import
- ✓ EasyWorship Import
- ✓ ProPresenter Import
- ✓ Premium Themes
- ✓ Starter-level Limits
- ✓ 500 Credits (Starter allocation)

**500 credits during trial** — otherwise users cannot properly test Speech-to-Scripture, Translation, AI Summary, AI Notes, which defeats the purpose.

---

## Trial Expiration

### Runtime check (always calculated, never stored):

```ts
const isTrialActive = now < trialEndsAt;
```

### When trial expires:

- Immediately fall back to **Free Plan** permissions
- No grace period
- Show: "Your free trial has ended. Upgrade to continue using: Translation, Multiview, Mass Import, Premium Themes"

---

## Migration Script (Existing Users)

Create a one-time migration script.

Find all users where:

```ts
user.createdAt < SUBSCRIPTION_LAUNCH_DATE   // June 25, 2026
&& !user.trialEndsAt
&& user.plan === "free"                     // Do NOT give trials to paid users
```

Set:

```ts
user.trialStartedAt = now;
user.trialEndsAt = now + 10 days;
user.trialDurationDays = 10;
```

**Safety:** Only assign trials to users on the free plan. Never assign to paid subscribers.

---

## Desktop App — Trial Fields in Login Payload

**This is critical.** The desktop app must receive trial fields during login to enforce trial access while offline.

### Verify these endpoints return `trialStartedAt`, `trialEndsAt`, `trialDurationDays`:

- `POST /api/auth/email-login` — trusted device response
- `GET /api/auth/status` — Firebase auth status
- `GET /api/user` — user profile
- Device pairing endpoints

### Desktop AuthUser type must include:

```ts
interface AuthUser {
  // ... existing fields
  plan?: PlanTier;
  trialStartedAt?: string;
  trialEndsAt?: string;
  trialDurationDays?: number;
}
```

### Desktop caching:

The signed `SubscriptionPayload` in localStorage should include trial fields so the desktop app can enforce trial access offline (within the existing 14-day offline window).

---

## UI Locations

Trial banners must appear in **multiple locations** — not just Settings. Users rarely visit settings.

### Required locations:

1. **Dashboard** — most important, always visible
2. **Billing Page** — plan details
3. **Settings** — usage tab

### Dashboard Banner

During active trial:

```
🎉 Free Trial Active
7 days remaining
Upgrade now and save 20%
```

or for early adopters:

```
🎉 Early Adopter Trial
10 days remaining
Thank you for being an early user.
```

### Billing Page

During trial, show instead of "Free Plan":

```
Current Plan
Free Trial
Expires: July 5, 2026
Days Remaining: 7
```

### After Trial Expires

```
Your free trial has ended.
Upgrade to continue using:
• Translation
• Multiview
• Mass Import
• Premium Themes
```

---

## Trial Countdown Helper

```ts
function getTrialDaysRemaining(user: AuthUser): number {
  if (!user.trialEndsAt) return 0;
  const msRemaining = new Date(user.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(msRemaining / (1000 * 60 * 60 * 24)));
}
```

Use this everywhere trial days are displayed:

- "10 Days Left"
- "5 Days Left"
- "1 Day Left"

---

## Schema Changes

### `web/src/types/schemas.ts` — UserProfile

Add directly beside existing subscription fields (`subscriptionExpiresAt`, `currentSubscriptionId`, `lastPaymentId`):

```ts
trialStartedAt?: string;
trialEndsAt?: string;
trialDurationDays?: number;
```

### User Creation Points (all 4)

Each must set trial fields for new users:

| Route | File |
|-------|------|
| Email signup | `web/src/app/api/auth/signup/route.ts` |
| Firebase auth | `web/src/app/api/auth/status/route.ts` |
| Landing registration | `web/src/app/api/landing/register/route.ts` |
| getOrCreateMongoUser | `web/src/lib/auth.ts` |

All get:

```ts
trialStartedAt: new Date().toISOString(),
trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
trialDurationDays: 7,
```

---

## Summary

| Rule | Detail |
|------|--------|
| Existing users | 10-day trial from launch date |
| New users | 7-day trial from signup |
| Trial plan level | **Starter** (not Pro) |
| Trial credits | 500 (Starter allocation) |
| `isTrialActive` | Never stored — always calculated |
| Entitlement check | Always use `getEffectivePlan(user)` |
| Migration safety | Only `plan === "free"` users |
| Desktop offline | Trial fields must be in login payload + cached |
| UI locations | Dashboard, Billing, Settings |
| Expiry behavior | Immediate fallback to Free, no grace period |
