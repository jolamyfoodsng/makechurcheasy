# Usage Audit Report

**Date:** 2026-04-15
**Auditor:** Qwen Code (automated)
**Scope:** Usage tracking — resource counting, sync to server, and enforcement

---

## Resource Types Tracked

| Resource | Counted From | Counted In | Synced To Server | Enforced |
|----------|-------------|------------|------------------|----------|
| Songs | `worshipDb.getAllSongs()` (archived=false) | `usageSync.ts` | ✅ `songs` field | ✅ Resource limit |
| Images | `libraryDb.getAllMedia()` (type=image) | `usageSync.ts` | ✅ `images` field | ✅ Resource limit |
| Videos | `libraryDb.getAllMedia()` (type=video) | `usageSync.ts` | ✅ `videos` field | ✅ Resource limit |
| Themes | `bibleDb.getCustomThemes()` (templateType=fullscreen) | `usageSync.ts` | ✅ `themes` field | ✅ Resource limit |
| Lower Thirds | `bibleDb.getCustomThemes()` (lower-third/side-by-side) | `usageSync.ts` | ✅ `lowerThirds` field | ✅ Resource limit |
| Bible Versions | `bibleDb.getInstalledTranslations()` | `usageSync.ts` | ✅ `bibleVersions` field | ✅ Resource limit |
| Devices | Server-side tracking | — | `devices: 0` (server maintains) | ✅ `maxDevices` |
| Cloud Storage | Server-side measurement | — | — | ✅ `cloudStorageGB` quota |

## Sync Architecture

### Periodic Sync (`startUsageSync`)
- **Interval:** Every 5 minutes
- **Initial delay:** 10 seconds after app start
- **Method:** `POST /api/user/usage` with `X-Device-Id` header
- **Behavior:** Fire-and-forget — failures logged, never block UI

### On-Demand Sync (`triggerUsageSync`)
- Called immediately after create/delete operations
- Wired into: `worshipDb.ts`, `libraryDb.ts`, `bibleDb.ts`
- Uses dynamic imports to avoid loading db modules unnecessarily

### Sync Endpoint
- **Route:** `POST /api/user/usage`
- **Auth:** `X-Device-Id` header (desktop app)
- **Storage:** Writes to `user_usage` collection (upserted by userId)
- **Server-side enforcement:** Entitlement checks in `/api/user/entitlements`

## Enforce-At-Create Pattern

When a user attempts to create a resource:
1. Fetch current usage count from server
2. Compare against plan limit via `canAdd()`
3. If over limit → block creation with descriptive error
4. If allowed → create resource → `triggerUsageSync()` (fire-and-forget)

## Test Coverage

**File:** `src/services/usageTracking.test.ts` — 14 tests

| Test Category | Count | What's Verified |
|---------------|-------|-----------------|
| Song counting | 3 | Filters archived, counts non-archived, empty list |
| Media counting | 3 | Image/video separation, no cross-contamination |
| Theme counting | 3 | Fullscreen vs lower-third vs side-by-side |
| Full payload | 3 | Correct fields, structure, no missing fields |
| Edge cases | 2 | All zeros, all maxed |

## Verification

- [x] `usageTracking.test.ts` — 14 tests passing
- [x] `triggerUsageSync()` confirmed in `worshipDb.ts`, `libraryDb.ts`, `bibleDb.ts`
- [x] All 7 resource fields present in sync payload
- [x] Archived songs excluded from count
- [x] Theme template types correctly separated
