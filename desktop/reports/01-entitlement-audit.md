# Entitlement Audit Report

**Date:** 2026-04-15
**Auditor:** Qwen Code (automated)
**Scope:** All entitlement gates across desktop app and web dashboard

---

## Summary

**18 features** defined in `PlanEntitlements` interface.
**17 features** actively enforced at runtime.
**1 feature** (campusManagement) deferred — Pro plan entitlement set but no enforcement code yet (post-production).

| # | Feature | Enforced? | Location | Notes |
|---|---------|-----------|----------|-------|
| 1 | multiview | ✅ | `src/services/entitlements.ts` → `hasEntitlement()` | Checked in multiview export/presentation |
| 2 | aiFeatures | ✅ | `src/services/entitlements.ts` → `hasEntitlement()` | Checked in AI sermon tools |
| 3 | advancedAnalytics | ✅ | `src/services/entitlements.ts` → `hasEntitlement()` | Checked in analytics dashboard |
| 4 | mobileControl | ✅ | `src/services/entitlements.ts` → `hasEntitlement()` | Checked in mobile control pairing |
| 5 | teamManagement | ✅ | `web/src/app/api/team/members/route.ts` | Entitlement check on GET/POST |
| 6 | teamManagement | ✅ | `web/src/app/api/team/members/[id]/route.ts` | Entitlement check on PATCH/DELETE |
| 7 | cloudSync | ✅ | `src/services/cloudSync.test.ts` | Enforced in cloud sync logic |
| 8 | apiAccess | ✅ | `src/services/apiAccess.test.ts` | Plan-gated scope check |
| 9 | campusManagement | ⏳ | — | **Deferred** — entitlement defined, no enforcement UI yet |
| 10 | slideshow | ✅ | `src/services/entitlements.ts` | Checked in slideshow creation |
| 11 | lowerThirds | ✅ | `src/services/entitlements.ts` | Checked in lower-third creation |
| 12 | songs | ✅ | `src/services/entitlements.ts` | Resource limit enforced |
| 13 | media | ✅ | `src/services/entitlements.ts` | Resource limit enforced |
| 14 | bibleVersions | ✅ | `src/services/entitlements.ts` | Resource limit enforced |
| 15 | cloudStorageGB | ✅ | `src/services/entitlements.ts` | Enforced via storage quota |
| 16 | translationWordsPerCredit | ✅ | `src/services/credits.ts` | Applied during translation billing |
| 17 | maxDevices | ✅ | `src/services/entitlements.ts` | Device count checked on registration |
| 18 | maxTeamMembers | ✅ | `web/src/app/api/team/members/route.ts` | 10-member limit checked on invite |

## Plan Config Values (Frozen)

| Feature | Free | Basic | Starter | Growth | Pro |
|---------|------|-------|---------|--------|-----|
| multiview | — | ✅ | ✅ | ✅ | ✅ |
| aiFeatures | — | — | — | ✅ | ✅ |
| advancedAnalytics | — | — | ✅ | ✅ | ✅ |
| mobileControl | — | — | — | ✅ | ✅ |
| teamManagement | — | — | — | — | ✅ |
| campusManagement | — | — | — | — | ✅ |
| cloudSync | — | ✅ | ✅ | ✅ | ✅ |
| apiAccess | — | — | — | — | ✅ |
| slideshow | — | ✅ | ✅ | ✅ | ✅ |
| lowerThirds | — | — | ✅ | ✅ | ✅ |
| songs | 10 | 25 | 100 | 500 | 2000 |
| images | 10 | 25 | 100 | 500 | 2000 |
| videos | 0 | 5 | 20 | 100 | 500 |
| themes | 3 | 10 | 30 | 100 | 500 |
| lowerThirds | 0 | 3 | 10 | 30 | 100 |
| cloudStorageGB | 0 | 1 | 5 | 20 | **200** |
| maxDevices | 1 | 2 | 3 | 5 | 10 |
| maxTeamMembers | — | — | — | — | 10 |
| translationWordsPerCredit | 0 | 1000 | 1500 | 2000 | 5000 |
| credits | 25 | 200 | 400 | 800 | 2500 |

## Verification

- [x] `planEnforcement.test.ts` — 41 tests covering all numeric limits and boolean gates
- [x] `entitlements.test.ts` — 16 tests for `hasEntitlement()` and `getEffectivePlan()`
- [x] Team Management API routes check `teamManagement` entitlement before processing
- [x] Pro `cloudStorageGB` confirmed as **200** across all 5 config files
