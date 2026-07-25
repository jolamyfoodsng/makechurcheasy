# Plan Enforcement System

The plan enforcement system controls what features and limits a user has. It operates across three layers.

---

## Architecture

```
Pricing (marketing pages)
    ↓ what we sell
Plans (server plan_config)
    ↓ what each plan includes
Enforcement (every API endpoint + frontend guard)
    ↓ what the user can actually do
```

The server decides everything. The desktop displays what the server tells it.

---

## plan_config (Source of Truth)

The `plan_config` collection defines every plan, its entitlements, and its limits.

```json
{
  "plans": {
    "free": {
      "name": "Free",
      "entitlements": {
        "translation": false,
        "mobileApp": false,
        "teamMembers": 1,
        "devices": 1,
        "credits": 25
      },
      "limits": {
        "themes": 1,
        "songs": 50,
        "images": 100,
        "videos": 25,
        "bibleVersions": 3
      }
    },
    "basic": {
      "name": "Basic",
      "entitlements": {
        "translation": true,
        "mobileApp": false,
        "teamMembers": 3,
        "devices": 2,
        "credits": 100
      },
      "limits": {
        "themes": 10,
        "songs": 200,
        "images": 500,
        "videos": 100,
        "bibleVersions": -1
      }
    },
    "growth": {
      "name": "Growth",
      "entitlements": {
        "translation": true,
        "mobileApp": true,
        "teamMembers": 10,
        "devices": 5,
        "credits": 500
      },
      "limits": {
        "themes": -1,
        "songs": -1,
        "images": -1,
        "videos": -1,
        "bibleVersions": -1
      }
    },
    "pro": {
      "name": "Pro",
      "entitlements": {
        "translation": true,
        "mobileApp": true,
        "teamMembers": -1,
        "devices": -1,
        "credits": 2000
      },
      "limits": {
        "themes": -1,
        "songs": -1,
        "images": -1,
        "videos": -1,
        "bibleVersions": -1
      }
    }
  }
}
```

**`-1` = unlimited.** When the value is `-1`, skip the limit check entirely.

---

## User Signup / Upgrade Flow

```
User signs up
    ↓
Server assigns plan: "free"
    ↓
Server creates welcome credits (25-50)
    ↓
Frontend fetches entitlements
    ↓
UI adapts to show/hide/limit features
```

On upgrade:

```
Stripe webhook → subscription.updated
    ↓
Server updates user's plan
    ↓
Server recalculates credits (base + add-ons)
    ↓
Frontend re-fetches entitlements
    ↓
UI immediately reflects new limits
```

---

## Checking a Request

Every feature endpoint follows the same pattern.

### Entitlement Check (yes/no access)

```
User requests translation
    ↓
Server reads user's plan from plan_config
    ↓
plan_config.plans[plan].entitlements.translation === true?
    ↓ Yes → proceed
    ↓ No → 403 + upgrade prompt data
```

### Limit Check (count-based)

```
User creates a theme
    ↓
Server reads user's plan limits
    ↓
Count existing themes from database
    ↓
count < limit?  → proceed
count >= limit? → 403 + upgrade prompt data
```

### Credit Check (usage-based)

```
User requests AI summary
    ↓
Server reads user's credit balance
    ↓
balance >= cost?  → reserve credits, proceed, commit or refund
balance < cost?   → 403 + "buy credits" prompt data
```

---

## Examples

### 1. Translation (entitlement check)

```
Server: user.plan = "free"
plan_config.plans.free.entitlements.translation = false
→ deny, return { error: "translation_not_in_plan", upgradeTo: "basic" }
```

### 2. Mobile App (entitlement check)

```
Server: user.plan = "basic"
plan_config.plans.basic.entitlements.mobileApp = false
→ deny, return { error: "mobile_app_not_in_plan", upgradeTo: "growth" }
```

### 3. Team Members (entitlement + limit check)

```
Server: user.plan = "growth"
plan_config.plans.growth.entitlements.teamMembers = 10
Count team members: 7
7 < 10 → allow
```

```
Server: user.plan = "free"
plan_config.plans.free.entitlements.teamMembers = 1
Count team members: 1
1 >= 1 → deny, return { error: "team_limit_reached", current: 1, limit: 1 }
```

### 4. Devices (entitlement + limit check)

```
Server: user.plan = "pro"
plan_config.plans.pro.entitlements.devices = -1
-1 = unlimited → skip count, allow
```

---

## Credits System

Credits are the usage currency for AI features. They are separate from plan entitlements.

- **Plan** = access to a feature (translation: yes/no)
- **Credits** = how much you can use it (500 credits/month)

### Credit Balance

```
balance = baseCredits (from plan)
        + addOnCredits (purchased)
        - usedThisMonth (consumed)
```

### Reserve-then-Execute Pattern

```
Request in
    ↓
Reserve credits (atomic decrement)
    ↓
Execute action
    ↓
Success → commit
Failure → refund reserved credits
```

This prevents double-spend. If two requests arrive simultaneously, only one succeeds because the decrement is atomic.

### Credit Costs

| Feature | Cost |
|---------|------|
| Translation | 2 credits/min |
| AI Summary | 5 credits flat |
| AI Notes | 10 credits flat |
| AI Points | 10 credits flat |
| Speech-to-Scripture | 1 credit/min |

---

## Strong Enforcement

These features are locked behind specific plans. The server must deny access for users on plans that don't include them.

| Feature | Minimum Plan | Type |
|---------|-------------|------|
| Translation | Basic | entitlement |
| Transcription | Basic | entitlement |
| AI Summary | Basic | entitlement |
| Verse AI | Basic | entitlement |
| Mobile App | Growth | entitlement |
| Team Members | Growth | entitlement (with limit) |
| Devices | Growth | entitlement (with limit) |
| Credits | All plans | usage (varying amounts) |
| Multiview | Growth | entitlement |
| Remote Control | Pro | entitlement |

---

## Not Upgrade Drivers

These features should be generous or unlimited on all plans. They are not behind a paywall.

| Feature | Why |
|---------|-----|
| Themes | Core functionality, not a premium feature |
| Songs | Core functionality |
| Images | Core functionality |
| Videos | Core functionality |
| Lower Thirds | Core functionality |

These should have high limits or be unlimited on all plans. If they currently have low limits, increase them.

---

## Frontend Display

The desktop never decides access. It displays what the server tells it.

```
Server returns entitlements
    ↓
Frontend shows/hides UI based on entitlements
    ↓
User clicks feature
    ↓
Frontend sends request
    ↓
Server validates again
    ↓
Server returns result or 403
    ↓
Frontend shows result or upgrade prompt
```

The frontend guard is a UX convenience, not a security layer. The server guard is the security layer.

---

## Upgrade Prompts

When the server denies a request, it returns structured data for the frontend to show an upgrade prompt.

```json
{
  "error": "translation_not_in_plan",
  "message": "Translation is not included in your current plan.",
  "upgradeTo": "basic",
  "upgradeUrl": "/subscription/plans?plan=basic"
}
```

The frontend uses this data to show a modal or redirect to pricing. The frontend does not generate upgrade logic — it displays what the server provides.
