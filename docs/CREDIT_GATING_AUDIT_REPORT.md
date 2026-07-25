# Credit Gating Audit Report — MakeChurchEasy

**Date**: 2026-03-28  
**Scope**: Every feature that consumes credits or is behind a plan entitlement  
**Method**: Full stack trace — UI (desktop) → API routes → service layer → database  

---

## Summary

| # | Feature | Requires Credits? | Current Enforcement | Bypass Possible? | Issues | Recommended Fix |
|---|---------|-------------------|---------------------|------------------|--------|-----------------|
| 1 | **Speech-to-Scripture (Verse AI)** | Yes (1/min) | ⚠️ Backend YES, UI PARTIAL | Yes — UI bug | "Start Listening" not disabled at 0 credits; "Buy Credits" button dismisses overlay without navigating | Disable button when credits ≤ 0; wire "Buy Credits" to credit purchase page |
| 2 | **Translation** | Yes (2/min) | ⚠️ Backend YES, UI PARTIAL | Yes — race condition | Credits deducted AFTER translation completes; "Buy Credits" shows `alert('coming soon')`; no server-side deduction on translation API | Deduct credits BEFORE translation starts; wire "Buy Credits" button |
| 3 | **AI Summary** | Yes (5 flat) | ✅ Backend YES | No (if UI exists) | No desktop UI exists; `aiService.ts` exists but is UNUSED | Safe if/when UI is added |
| 4 | **AI Notes** | Yes (10 flat) | ✅ Backend YES | No (if UI exists) | No desktop UI exists; `aiService.ts` exists but is UNUSED | Safe if/when UI is added |
| 5 | **AI Points** | Yes (10 flat) | ✅ Backend YES | No (if UI exists) | No desktop UI exists | Safe if/when UI is added |
| 6 | **Transcript Export** | No | ✅ Entitlement only | No | None found | None needed |
| 7 | **Translation Export** | No | ✅ Entitlement only | No | None found | None needed |
| 8 | **Theme Creation** | Plan-limited | 🔴 NONE | Yes — unlimited | `planLimits.ts` defines limits; server API has ZERO enforcement; `canCreateTheme()` is dead code | Add server-side plan limit enforcement in theme API |
| 9 | **Lower-Third Creation** | Plan-limited | 🔴 NONE | Yes — unlimited | `planLimits.ts` defines limits; server API has ZERO enforcement; `canCreateLowerThirdTheme()` is dead code | Add server-side plan limit enforcement in lower-third API |
| 10 | **Bible Translations** | No | ✅ Free (redirect) | No | None found | None needed |
| 11 | **AI-Powered Search** | N/A | N/A | N/A | Feature does not exist in codebase | N/A |
| 12 | **AI Assistants** | N/A | N/A | N/A | Dormant feature flag only (`useAssistants` in localStorage) | N/A |

---

## Detailed Findings

### 1. Speech-to-Scripture (Verse AI) — ⚠️ PARTIAL ENFORCEMENT

**Backend** (`/api/device/speech-to-scripture/check-access`):  
Full 10-step validation chain:
1. Version gate
2. DeviceId required
3. Device secret verification
4. User fetch
5. Account active check
6. Platform settings (emergency lock / maintenance)
7. Subscription status
8. Trial status
9. **Credit check** (line 160-166): `if (!credits.unlimited && !credits.isAdmin && credits.credits <= 0)` → returns `insufficient_credits`
10. Session creation

**Desktop UI** (`SpeechToScripturePage.tsx`):  
- `CreditsGuard` wraps the page (App.tsx line 1131) — shows blocked overlay at `credits === 0`
- **BUG**: "Start Listening" button (line 799) is only disabled for `isConnecting || checkingAccess` — NOT for 0 credits
- `handleStart()` (line 228) calls backend check-access, shows overlay on rejection
- **BUG**: "Buy Credits" button (line 760) calls `setAccessDenied(null)` — dismisses the overlay without navigating to credit purchase

**Verdict**: Backend correctly blocks at 0 credits. But the button is clickable, causing a poor UX (user clicks → sees rejection → "Buy Credits" does nothing). The backend is the safety net here, so no credit bypass exists, but the UX is broken.

---

### 2. Translation — ⚠️ RACE CONDITION

**Backend** (`/api/device/check-access`):  
- `translation` is in `FEATURE_CONFIG` with `requiresCredits: true` and `entitlementKey: "translation"`
- Validates `available >= needed` (line 178-188)
- Returns `insufficient_credits` if check fails

**Desktop UI** (`TranscriptDetailPage.tsx`):  
- TranslationModal fetches credits from backend (line 475-479)
- `canAfford = pro || availableCredits >= estimatedCredits` (line 482)
- Button shows "Insufficient Credits" when `!canAfford` (line 607)
- Calls `checkPremiumAccess('translation', { requiredCredits: credits })` before starting (line 1535)
- **RACE CONDITION**: Credits are deducted AFTER translation completes in `onComplete` callback (lines 1178-1189). If the user closes the app during translation, credits are never deducted.
- **BUG**: "Buy Credits" button shows `alert('Credit purchase coming soon!')` (line 617) — non-functional

**Translation API** (`translationService.ts`):  
- Calls `POST /api/transcripts/:id/translate` — NO credit validation, NO deduction
- The API route has NO credit enforcement — it just runs the translation

**Verdict**: The pre-check via `checkPremiumAccess` correctly gates the feature. However, credits are deducted AFTER completion, creating a window where credits could be bypassed (e.g., app crash during translation). The translation API itself has no server-side credit deduction — it relies entirely on the desktop client to deduct after completion.

---

### 3–5. AI Summary / AI Notes / AI Points — ✅ STRONG ENFORCEMENT

**Backend** (`/api/ai/summary`, `/api/ai/notes`, `/api/ai/points`):  
All three follow the same pattern:
1. Entitlement check (aiFeatures)
2. `checkCredits()` from `api/src/lib/credits.ts`
3. Execute AI operation
4. Deduct credits on success via `deductCredits()`

**Desktop UI**:  
- `aiService.ts` exists but is **UNUSED** by any UI component — no desktop UI routes to these features
- `aiService.ts` does NOT call `checkPremiumAccess()` before API calls — **potential bypass** if a UI is added without fixing this

**Verdict**: Backend enforcement is solid. No desktop UI exists, so no client-side bypass is possible. If a UI is added later, `aiService.ts` must be updated to call `checkPremiumAccess()`.

---

### 6–7. Transcript Export / Translation Export — ✅ CORRECT

**Backend** (`/api/device/check-access`):  
- Both in `FEATURE_CONFIG` with `requiresCredits: false` — entitlement-only checks
- Correctly gates based on plan entitlements

**Desktop UI** (`TranscriptDetailPage.tsx`):  
- Transcript export: `checkPremiumAccess('transcriptExport')` (line 1033)
- Translation export: `checkPremiumAccess('translationExport')` (line 1065)

**Verdict**: Consistent and correct. No credits consumed, entitlement properly enforced at both layers.

---

### 8. Theme Creation — 🔴 ZERO SERVER-SIDE ENFORCEMENT

**Backend** (`/api/themes`):  
- POST handler has NO credit check, NO plan limit check, NO entitlement check
- Any authenticated user can create unlimited themes

**Desktop UI**:  
- `licenseService.ts` has `canCreateTheme()` (line 488) — **DEAD CODE**, never imported or called
- No client-side gating exists in the actual theme creation flow

**Plan Limits** (`planLimits.ts`):  
- Defines limits per plan: free:3, basic:5, starter:10, growth:unlimited, pro:unlimited
- **Never enforced anywhere** — purely declarative

**Verdict**: CRITICAL. Plan limits are cosmetic. Any authenticated user can create unlimited themes regardless of plan. Server-side enforcement must be added.

---

### 9. Lower-Third Creation — 🔴 ZERO SERVER-SIDE ENFORCEMENT

**Backend**:  
- Same issue as themes — no server-side plan limit enforcement

**Desktop UI**:  
- `licenseService.ts` has `canCreateLowerThirdTheme()` (line 494) — **DEAD CODE**, never imported or called

**Plan Limits** (`planLimits.ts`):  
- Defines limits per plan: free:1, basic:3, starter:10, growth:unlimited, pro:unlimited
- **Never enforced anywhere**

**Verdict**: CRITICAL. Same issue as themes — plan limits are cosmetic.

---

### Cross-Cutting Concerns

| Concern | Status | Risk |
|---------|--------|------|
| **Offline bypass** (`premiumActionGuard.ts`) | Falls back to cached license on network failure — returns `allowed: true` if `isUnlocked()` | Medium — offline grace period exists, but credits are not checked offline |
| **CreditsGuard fail-open** | Returns `allowed: true` when network is unavailable (line 56-57) | Medium — user with 0 credits can access features offline |
| **aiService.ts** | Exists but unused; does NOT call `checkPremiumAccess()` | Low now, HIGH if UI is added |
| **No centralized middleware** | Each AI route validates credits independently via `checkCredits()` | Medium — inconsistency risk if new routes are added |
| **Dead code** | `canCreateTheme()`, `canCreateLowerThirdTheme()` in `licenseService.ts` | Low — misleading, should be removed or wired |

---

## Priority Fixes

1. **🔴 P0 — Theme & Lower-Third server-side enforcement**: Add plan limit checks in the theme/lower-third API POST handlers. Use `planLimits.ts` values.
2. **🔴 P0 — Translation race condition**: Deduct credits BEFORE starting translation, not after completion. Add server-side deduction in the translation API.
3. **⚠️ P1 — "Start Listening" button disable**: Disable the button when `credits <= 0` (not just `isConnecting || checkingAccess`).
4. **⚠️ P1 — "Buy Credits" buttons**: Wire both "Buy Credits" buttons (Speech-to-Scripture + Translation) to the actual credit purchase flow instead of dismissing/alerting.
5. **⚠️ P2 — aiService.ts**: Add `checkPremiumAccess()` calls before API calls in `aiService.ts` so it's safe when UI is added.
6. **⚠️ P2 — CreditsGuard offline behavior**: Consider denying access (fail-closed) when offline and credits are 0, rather than failing open.
7. **🧹 P3 — Dead code cleanup**: Remove or wire `canCreateTheme()` and `canCreateLowerThirdTheme()`.
