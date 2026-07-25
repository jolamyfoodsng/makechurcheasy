# Configuration Consolidation Plan (Revised)

**Date:** 2026-06-26
**Status:** Design phase — no implementation yet
**Basis:** Settings Usage Audit (`SETTINGS_USAGE_AUDIT.md`) + Admin Settings Review
**Scope:** Consolidate 4 collections → 2, delete 94 dead settings, remove 25 fields from Admin UI, keep 33 active ones (8 visible in Admin, 25 technical-only in config pipeline)

---

## Current State (Post-Audit)

```
platform_settings (~100 fields)
├── appUpdates:      7 active (dual-source)  + 2 dead
├── trial:           0 active                + 10 dead  ← DELETE ENTIRE SECTION
├── credits:         0 active                + 8 dead   ← DELETE ENTIRE SECTION
├── ambassador:      0 active                + 6 dead   ← DELETE ENTIRE SECTION
├── authentication:  1 active                + 7 dead
├── obs:             1 active                + 9 dead
├── ai:              0 active                + 10 dead  ← DELETE ENTIRE SECTION
├── notifications:   0 active                + 7 dead   ← DELETE ENTIRE SECTION
├── storage:         6 active                + 9 dead
├── security:        2 active + 2 partial    + 8 dead
├── themes:          5 active + 1 partial    + 8 dead
└── analytics:       0 active                + 4 dead   ← DELETE ENTIRE SECTION

app_settings (11 fields)                         ← DELETE COLLECTION
├── 7 active (dual-source with platform_settings)
└── 4 partially active (desktop ignores these)

trial_settings (6 fields)                        ← DELETE COLLECTION
├── 1 active (defaultDurationDays)
└── 5 dead

plan_config (~20 sections)                       ← KEEP AS-IS
└── ~20 active sections + 2 dead (trial.durationDays, trial.enabled)
```

---

## Proposed Architecture (Post-Consolidation)

```
┌──────────────────────────────────────────────────────────┐
│              ADMIN DASHBOARD UI                           │
│                                                          │
│  Settings Page ──→ PUT /api/admin/platform-settings      │
│  (simplified:     Sections: appUpdates, authentication,  │
│   fewer tabs)      storage, security, themes)            │
│                                                          │
│  Plan Config ───→ PUT /api/admin/plan-config             │
│  (existing)       Sections: plans, creditCosts,          │
│                    pricingPlans, featureBanners           │
└──────────────────────────────────────────────────────────┘

                            │
                            ▼

┌──────────────────────────────────────────────────────────┐
│              MONGODB (2 collections)                      │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │  platform_settings (slimmed)                  │       │
│  │                                               │       │
│  │  appUpdates:      9 fields (7 merged from     │       │
│  │                   app_settings + 2 URLs)      │       │
│  │  authentication:  1 field  (maxDevicesPerUser)│       │
│  │  obs:             1 field  (websocketPort)    │       │
│  │  storage:         6 fields (compression/exts) │       │
│  │  security:        4 fields (internetVerification│     │
│  │                   + maintenance cosmetic)     │       │
│  │  themes:          9 fields (bible + LT)       │       │
│  │                                               │       │
│  │  TOTAL: ~30 fields (down from ~100)           │       │
│  │  Admin-visible: ~12 fields (5 sections)       │       │
│  │  Technical-only: ~18 fields (obs, security)   │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  ┌──────────────────────────────────────────────┐       │
│  │  plan_config (unchanged)                      │       │
│  │                                               │       │
│  │  plans, creditCosts, pricingPlans,            │       │
│  │  featureBanners, translationWordsPerCredit    │       │
│  │                                               │       │
│  │  TOTAL: ~20 sections (unchanged)              │       │
│  └──────────────────────────────────────────────┘       │
│                                                          │
│  DELETED: app_settings, trial_settings                   │
└──────────────────────────────────────────────────────────┘

                            │
                            ▼

┌──────────────────────────────────────────────────────────┐
│              DESKTOP APP (client)                          │
│                                                          │
│  GET /api/config/desktop ──→ localStorage (5 min)        │
│  Single endpoint, single source. No conflicts.           │
└──────────────────────────────────────────────────────────┘
```

---

## Migration Phases

### Phase 1: Merge app_settings into platform_settings.appUpdates

**Problem:** 7 fields exist in both collections with different defaults. Enforcement reads from `app_settings`. Admin UI writes to `platform_settings`.

**Fix:** Make enforcement read from `platform_settings` instead.

| File | Change |
|------|--------|
| `api/src/lib/versionGate.ts` | `getAppSettings()` → `getPlatformSettings()` |
| `api/src/app/api/device/license/route.ts` | `getAppSettings()` → `getPlatformSettings()` |
| `api/src/app/api/device/check-access/route.ts` | `getAppSettings()` → `getPlatformSettings()` |
| `api/src/app/api/device/speech-to-scripture/check-access/route.ts` | `getAppSettings()` → `getPlatformSettings()` |
| `api/src/lib/platformSettings.ts` | Add `verificationSettings` fields to schema (move from app_settings) |
| `api/src/lib/configService.ts` | Add `verificationSettings` to `DesktopConfig` output |
| `desktop/src/services/desktopConfigTypes.ts` | Add `verificationSettings` type |
| `desktop/src/services/forcedUpdateService.ts` | Read from `getDesktopConfig()` instead of `/api/app/version` |
| `desktop/src/services/internetVerificationService.ts` | Read from `getDesktopConfig()` instead of `/api/app/verification-settings` |
| `api/scripts/migrate-app-settings.ts` | NEW: Migrate existing `app_settings` values into `platform_settings.appUpdates` |
| `api/src/app/api/app/version/route.ts` | Deprecate (keep for backward compat, add deprecation header) |
| `api/src/app/api/app/verification-settings/route.ts` | Deprecate |
| `api/src/app/api/admin/app-settings/route.ts` | Deprecate → then DELETE |

**Files: 13 (1 new, 2 deprecated, 1 deleted)**

### Phase 2: Merge trial_settings.defaultDurationDays into platform_settings

**Problem:** Trial duration lives in `trial_settings` (1 active field, 5 dead). No dashboard UI writes to it.

**Fix:** Move the one active field into `platform_settings`, delete `trial_settings`.

| File | Change |
|------|--------|
| `api/src/lib/platformSettings.ts` | Add `trial.defaultDurationDays` (keep field, remove dead trial fields) |
| `api/src/lib/trial.ts` | `getTrialSettings()` → `getPlatformSettings()` for `defaultDurationDays` |
| `api/src/app/api/admin/users/[id]/trial/route.ts` | Same reader change |
| `api/src/app/api/admin/trial-bulk/route.ts` | Same reader change |
| `api/scripts/migrate-trial-settings.ts` | Update to write to `platform_settings` |
| `api/src/lib/trialSettings.ts` | DELETE |
| `api/src/app/api/admin/trial-settings/route.ts` | DELETE |

**Files: 7 (1 deleted, 1 migration update)**

### Phase 3: Delete Dead Settings from platform_settings

**Problem:** 76 dead settings create confusion, bloat the schema, and slow down config reads.

**Fix:** Remove dead sections and fields from the schema, configService, and admin UI.

#### 3a. Delete dead sections entirely

| Section to Delete | Fields | Files to Modify |
|-------------------|--------|-----------------|
| `trial` (except `defaultDurationDays`) | 9 dead fields | `platformSettings.ts`, `configService.ts`, `desktopConfigTypes.ts`, `TrialSection.tsx` |
| `credits` (entire section) | 8 dead fields | `platformSettings.ts`, `configService.ts`, `desktopConfigTypes.ts`, `CreditsSection.tsx` |
| `ambassador` (entire section) | 6 dead fields | `platformSettings.ts`, `AmbassadorSection.tsx` |
| `ai` (entire section) | 10 dead fields | `platformSettings.ts`, `configService.ts`, `desktopConfigTypes.ts`, `AISettingsSection.tsx` |
| `notifications` (entire section) | 7 dead fields | `platformSettings.ts`, `NotificationsSection.tsx` |
| `analytics` (entire section) | 4 dead fields | `platformSettings.ts`, `configService.ts`, `desktopConfigTypes.ts`, `AnalyticsSection.tsx` |

#### 3b. Delete dead fields from kept sections

| Section | Fields to Delete | Keep |
|---------|-----------------|------|
| `appUpdates` | `releaseNotes`, `downloadUrls.linux`, `downloadUrls.macosIntel` | 9 active fields |
| `authentication` | `emailPasswordEnabled`, `googleEnabled`, `appleEnabled`, `emailVerificationRequired`, `verificationCodeLength`, `codeExpiryMinutes`, `maxSessionsPerUser` | `maxDevicesPerUser` |
| `obs` | **ALL 10 fields** — entire section removed from Admin per Admin Settings Review (9 dead + 1 technical: `websocketPort`) | **REMOVE FROM ADMIN** |
| `storage` | `enableCloudSync`, `maxUploadSizeMB`, `allowedFileTypes`, `compressionEnabled`, `defaultQuotaGB`, `retentionDays`, `maximumBackgroundVideoSizeMB`, `churchLogoSizeLimitMB`, `mediaLibraryQuotaGB` | 6 compression/extension fields |
| `security` | `force2FAForAdmins`, `requireHttps`, `apiKeysEnabled`, `apiKeyExpiryDays`, `forceLogoutAllUsers`, `mfaForAllUsers`, `deviceRevocationEnabled`, `requirePeriodicLicenseVerification` | `internetVerificationEnabled`, `maxOfflineDays`, `maintenanceMode`, `maintenanceMessage` |
| `themes` | **ALL dead defaults** — `defaultBibleTheme`, `defaultWorshipTheme`, `defaultLowerThirdTheme`, `defaultAnnouncementTheme`, `defaultFont`, `defaultBrandColours.*`, `worshipDefaults.*` | `bibleDefaults.*` (5), `lowerThirdDefaults.*` (4) |

#### 3c. Remove from Admin UI (Admin Settings Review)

Per the Admin Settings Principle ("every setting must chain UI → save → read → behavior"), these sections are removed from Admin visibility:

| Section | Reason | Fields Affected |
|---------|--------|----------------|
| `obs` (entire section) | Technical implementation detail — websocketPort is active but not an admin control | 10 fields (9 dead + 1 technical) |
| `ai.provider` | Dead + implementation detail — controlled by plan_config | 1 field |
| Theme defaults (dead fields) | Dead fields — Theme System manages these at runtime | 12 fields |
| `appUpdates.releaseNotes` | Dead — never read by desktop | 1 field |
| `appUpdates.downloadUrls.linux` | Dead — no Linux platform | 1 field |
| **Total** | | **25 fields removed from Admin** |

**Files for Phase 3: ~14**
- `api/src/lib/platformSettings.ts` — remove dead fields from interface + defaults
- `api/src/lib/configService.ts` — remove dead fields from DesktopConfig output
- `desktop/src/services/desktopConfigTypes.ts` — remove dead types + defaults
- `desktop/src/services/desktopConfig.ts` — remove dead helper functions (`isCompressionEnabled`, `getDefaultWorshipTheme`, etc.)
- `dashboard/app/(dashboard)/admin/settings/types.ts` — remove dead types
- `dashboard/app/(dashboard)/admin/settings/page.tsx` — remove dead tabs (trial, credits, ambassador, AI, notifications, analytics) + remove OBS tab
- `dashboard/app/(dashboard)/admin/settings/sections/TrialSection.tsx` — DELETE
- `dashboard/app/(dashboard)/admin/settings/sections/CreditsSection.tsx` — DELETE
- `dashboard/app/(dashboard)/admin/settings/sections/AmbassadorSection.tsx` — DELETE
- `dashboard/app/(dashboard)/admin/settings/sections/AISettingsSection.tsx` — DELETE
- `dashboard/app/(dashboard)/admin/settings/sections/NotificationsSection.tsx` — DELETE
- `dashboard/app/(dashboard)/admin/settings/sections/AnalyticsSection.tsx` — DELETE
- `dashboard/app/(dashboard)/admin/settings/sections/OBSSection.tsx` — DELETE (Admin removed per principle)
- `dashboard/app/(dashboard)/admin/settings/sections/ThemeSection.tsx` — MODIFY (remove dead default fields, keep bible + LT)

### Phase 4: Cleanup Dead Code

| File | Change |
|------|--------|
| `api/src/lib/emailPreferences.ts` | DELETE — `shouldSendEmail()` is never called |
| `desktop/src/services/desktopConfig.ts` | Remove `isCompressionEnabled()` (never called) |
| `desktop/src/services/desktopConfig.ts` | Remove `getDefaultWorshipTheme()` (never imported) |
| `api/src/lib/trial.ts` | Remove `isTrialEnabled()` (never called) |
| `api/src/app/api/admin/trial-settings/route.ts` | DELETE (if not done in Phase 2) |
| `api/src/app/api/admin/app-settings/route.ts` | DELETE (if not done in Phase 1) |

---

## Settings Priority Classification

### ACTIVE — Must Keep (33 settings)

These are the ONLY settings that affect runtime behavior. **Admin-visible** means the setting appears in the Admin Dashboard UI. **Technical-only** means it remains in the database/config pipeline but is NOT surfaced to admins (per Admin Settings Review).

| Category | Settings | Count | Admin-Visible |
|----------|----------|-------|---------------|
| Version enforcement | `latestVersion`, `minimumSupportedVersion`, `forceUpdatesEnabled`, `emergencyLock`, `emergencyLockDelay`, `gracePeriodHours`, `updateMessage` | 7 | ✅ Yes |
| Download URLs | `downloadUrls.windows`, `downloadUrls.macosAppleSilicon` | 2 | ✅ Yes |
| Device limits | `authentication.maxDevicesPerUser` | 1 | ✅ Yes |
| OBS connection | `obs.websocketPort` | 1 | ❌ No — technical detail |
| Internet verification | `security.internetVerificationEnabled`, `security.maxOfflineDays` | 2 | ✅ Yes |
| Maintenance (cosmetic) | `security.maintenanceMode`, `security.maintenanceMessage` | 2 | ✅ Yes |
| Bible themes | `bibleDefaults.font/textSize/textColor/backgroundColor/accentColor` | 5 | ✅ Yes |
| Lower-third themes | `lowerThirdDefaults.nameColor/titleColor/backgroundColor/nameSize` | 4 | ✅ Yes |
| Media compression | `storage.imageTargetSizeBytes/videoTargetSizeBytes/imageMaxDimension/videoMaxWidth/allowedImageExtensions/allowedVideoExtensions` | 6 | ✅ Yes |
| Trial duration | `trial.defaultDurationDays` (migrated from trial_settings) | 1 | ✅ Yes |
| **Verification settings** | `verificationSettings.*` (migrated from app_settings) | 3 | ✅ Yes |
| | **TOTAL** | **33** | **28 Admin-visible, 5 Technical-only** |

### DEAD — Delete, Do Not Migrate (76 settings)

| Category | Count | Reason |
|----------|-------|--------|
| Trial (platform_settings) | 10 | Real duration in trial_settings; rest never enforced |
| Credits (platform_settings) | 8 | `plan_config` is authoritative |
| Ambassador (platform_settings) | 6 | No code reads any of these |
| AI (platform_settings) | 10 | `plan_config` entitlements are the gate |
| Notifications (platform_settings) | 7 | `sendEmail()` is unconditional |
| Storage (platform_settings) | 9 | No enforcement code exists |
| Security (platform_settings) | 8 | Hardcoded values override these |
| Themes (platform_settings) | 14 | `getDefaultWorshipTheme()` never imported |
| Analytics (platform_settings) | 4 | No gating code exists |
| AppUpdates (platform_settings) | 3 | No consumer (releaseNotes, linux, macosIntel) |
| Authentication (platform_settings) | 7 | Hardcoded in auth routes |
| OBS (platform_settings) | 9 | Hardcoded in OBS services |
| trial_settings | 5 | `isTrialEnabled()` never called; email gates never checked |
| plan_config trial | 2 | `trial_settings` is source (also being deleted) |
| app_settings verification | 4 | Desktop computes its own from platform_settings |
| **TOTAL** | **~94** | |

---

## Files Affected Summary

### Phase 1: Merge app_settings (13 files)
```
MODIFY:  api/src/lib/versionGate.ts
MODIFY:  api/src/app/api/device/license/route.ts
MODIFY:  api/src/app/api/device/check-access/route.ts
MODIFY:  api/src/app/api/device/speech-to-scripture/check-access/route.ts
MODIFY:  api/src/lib/platformSettings.ts
MODIFY:  api/src/lib/configService.ts
MODIFY:  desktop/src/services/desktopConfigTypes.ts
MODIFY:  desktop/src/services/forcedUpdateService.ts
MODIFY:  desktop/src/services/internetVerificationService.ts
NEW:     api/scripts/migrate-app-settings.ts
DEPRECATE: api/src/app/api/app/version/route.ts
DEPRECATE: api/src/app/api/app/verification-settings/route.ts
DELETE:  api/src/app/api/admin/app-settings/route.ts
```

### Phase 2: Merge trial_settings (7 files)
```
MODIFY:  api/src/lib/platformSettings.ts (add trial.defaultDurationDays)
MODIFY:  api/src/lib/trial.ts
MODIFY:  api/src/app/api/admin/users/[id]/trial/route.ts
MODIFY:  api/src/app/api/admin/trial-bulk/route.ts
MODIFY:  api/scripts/migrate-trial-settings.ts
DELETE:  api/src/lib/trialSettings.ts
DELETE:  api/src/app/api/admin/trial-settings/route.ts
```

### Phase 3: Delete Dead Settings + Admin Review (14 files)
```
MODIFY:  api/src/lib/platformSettings.ts (strip dead fields)
MODIFY:  api/src/lib/configService.ts (strip dead output)
MODIFY:  desktop/src/services/desktopConfigTypes.ts (strip dead types)
MODIFY:  desktop/src/services/desktopConfig.ts (strip dead helpers)
MODIFY:  dashboard/app/(dashboard)/admin/settings/types.ts
MODIFY:  dashboard/app/(dashboard)/admin/settings/page.tsx (remove tabs + OBS tab)
DELETE:  dashboard/.../sections/TrialSection.tsx
DELETE:  dashboard/.../sections/CreditsSection.tsx
DELETE:  dashboard/.../sections/AmbassadorSection.tsx
DELETE:  dashboard/.../sections/AISettingsSection.tsx
DELETE:  dashboard/.../sections/NotificationsSection.tsx
DELETE:  dashboard/.../sections/AnalyticsSection.tsx
DELETE:  dashboard/.../sections/OBSSection.tsx (Admin removed per principle)
MODIFY:  dashboard/.../sections/ThemeSection.tsx (remove dead defaults, keep bible + LT)
```

### Phase 4: Cleanup (6 files)
```
DELETE:  api/src/lib/emailPreferences.ts
MODIFY:  desktop/src/services/desktopConfig.ts (remove dead functions)
MODIFY:  api/src/lib/trial.ts (remove isTrialEnabled)
DELETE:  api/src/app/api/admin/trial-settings/route.ts (if not done)
DELETE:  api/src/app/api/admin/app-settings/route.ts (if not done)
```

### Total: ~40 files (14 deleted, 1 new, 2 deprecated, 23 modified)

---

## Recommended Implementation Order

```
Phase 1: Merge app_settings           ← MOST URGENT (security: emergency lock, version gate)
  │                                       13 files, ~1 day
  │
  ▼
Phase 2: Merge trial_settings         ← HIGH (1 active field, 5 dead to delete)
  │                                       7 files, ~0.5 day
  │
  ▼
Phase 3: Delete dead settings + Admin Review ← HIGH (eliminate config debt + clean Admin UI)
  │                                       14 files, ~1.5 days
  │
  ▼
Phase 4: Cleanup dead code            ← MEDIUM (remove dead functions)
                                         6 files, ~0.5 day
```

### Estimated Total: ~3.5 days (down from 8-12 days pre-audit)

---

## What Gets Fixed By Each Phase

| Problem | Fixed By |
|---------|----------|
| Admin writes appUpdates to platform_settings but enforcement reads app_settings | Phase 1 |
| Emergency lock values may differ between collections | Phase 1 |
| Version gate defaults differ (48h vs 72h grace) | Phase 1 |
| Desktop reads version from separate endpoint, not config | Phase 1 |
| Trial duration not editable from admin UI | Phase 2 |
| 76 dead settings cause admin UI confusion | Phase 3 |
| Dead dashboard tabs waste admin time | Phase 3 |
| OBS section in Admin is technical detail, not admin control | Phase 3 (Admin Review) |
| Dead theme defaults in Admin are managed by Theme System | Phase 3 (Admin Review) |
| AI provider setting in Admin is implementation detail | Phase 3 (Admin Review) |
| releaseNotes + linux URL in Admin are dead config | Phase 3 (Admin Review) |
| Dead code in desktop config service | Phase 4 |
| Dead email preferences function | Phase 4 |
| Dead trial enablement function | Phase 4 |
