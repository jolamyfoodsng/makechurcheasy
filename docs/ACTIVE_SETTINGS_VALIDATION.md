# Active Settings Validation Report

**Date:** 2026-06-26  
**Purpose:** Verify every "active" setting actually changes runtime behavior before consolidation  
**Method:** Code trace of every setting through full chain: Admin UI → Save → DB → Config Service → Desktop/API → Behavior change

---

## Executive Summary

| Category | Total | PASS | PARTIAL | FAIL |
|----------|-------|------|---------|------|
| appUpdates | 7 | 0 | 0 | 7 (dual-store) |
| storage | 6 | 6 | 0 | 0 |
| themes.bibleDefaults | 5 | 5 | 0 | 0 |
| themes.lowerThirdDefaults | 4 | 3 | 0 | 1 |
| obs | 1 | 1 | 0 | 0 |
| authentication | 1 | 1 | 0 | 0 |
| security | 4 | 2 | 2 | 0 |
| trial | 1 | 0 | 0 | 1 |
| verificationSettings | 3 | 0 | 0 | 3 |
| **TOTAL** | **32** | **18** | **2** | **12** |

**Key Finding:** 12 of 33 "active" settings do NOT work end-to-end as administered. The audit classified them as active because code *reads* them — but the admin UI writes to the wrong collection or the code hardcodes a different value.

---

## Detailed Results

### 1. appUpdates Section (7 settings) — ALL FAIL (dual-store)

The Admin Dashboard UI writes to `platform_settings` via `PUT /api/admin/platform-settings`.  
All enforcement code reads from `app_settings` via `getAppSettings()`.  
**No sync exists between the two collections.**

Admin changes have **zero effect** on enforcement behavior.

| Setting | Old Value (platform_settings default) | New Value (admin sets) | Expected Behavior | Actual Behavior | Verdict |
|---------|--------------------------------------|----------------------|-------------------|-----------------|---------|
| `appUpdates.latestVersion` | `"2.6.0"` | `"2.7.0"` | Desktop forced update targets 2.7.0 | Reads from `app_settings` (empty string default) — never triggers | **FAIL** |
| `appUpdates.minimumSupportedVersion` | `"2.0.0"` | `"2.5.0"` | Users below 2.5.0 blocked immediately | Reads from `app_settings` (empty string default) — never blocks | **FAIL** |
| `appUpdates.forceUpdatesEnabled` | `false` | `true` | Master switch activates all version enforcement | Reads from `app_settings` (false default) — stays off | **FAIL** |
| `appUpdates.emergencyLock` | `false` | `true` | Nuclear lock blocks all users client+server | Reads from `app_settings` (false default) — stays off | **FAIL** |
| `appUpdates.emergencyLockDelay` | `0` | `48` | 48-hour countdown before emergency lock | Reads from `app_settings` (0 default) — immediate/never | **FAIL** |
| `appUpdates.gracePeriodHours` | `48` | `168` | 7-day grace period for forced updates | Reads from `app_settings` (72 default, different!) — wrong value | **FAIL** |
| `appUpdates.updateMessage` | `"A new version..."` | `"Please update now"` | Custom message in forced update overlay | Reads from `app_settings` (empty default) — hardcoded fallback used | **FAIL** |

**Root Cause:** Dual data store. Admin writes `platform_settings`, enforcement reads `app_settings`.  
**Fix:** Phase 1 of consolidation plan — migrate all readers to `platform_settings`.  
**Note:** The *logic* is correctly implemented (version comparison, countdown, overlay). The issue is purely the data source disconnect. Once Phase 1 merges the stores, all 7 settings will work.

---

### 2. Storage Compression (6 settings) — ALL PASS

Full chain verified: Admin UI → `platform_settings` → `configService.ts` → `/api/config/desktop` → `desktopConfig.ts` cache → sync helpers → compression/validation code.

| Setting | Default | Expected Behavior | Actual Behavior | Consumer Files | Verdict |
|---------|---------|-------------------|-----------------|----------------|---------|
| `storage.imageTargetSizeBytes` | `1048576` (1MB) | Compress images to this target | Config-driven compression loop, no hardcoded values | `mediaCompression.ts`, `dockUploadService.ts` | **PASS** |
| `storage.videoTargetSizeBytes` | `1048576` (1MB) | Compress videos to this target | Config-driven ffmpeg two-pass compression | `mediaCompression.ts`, `dockUploadService.ts` | **PASS** |
| `storage.imageMaxDimension` | `1920` | Cap image width/height | Config-driven `scaleDimensions()` | `mediaCompression.ts` | **PASS** |
| `storage.videoMaxWidth` | `854` | Cap video width | Config-driven ffmpeg `-vf scale=` filter | `mediaCompression.ts` | **PASS** |
| `storage.allowedImageExtensions` | 7-item array | Allow only listed image types | Config-driven validation in upload + drag-drop + media tab | `mediaValidation.ts` → 4 downstream consumers | **PASS** |
| `storage.allowedVideoExtensions` | 8-item array | Allow only listed video types | Config-driven validation in upload + drag-drop + media tab | `mediaValidation.ts` → 4 downstream consumers | **PASS** |

**No hardcoded values found.** All 6 settings properly flow from admin to behavior.

---

### 3. Bible Defaults (5 settings) — ALL PASS

Full chain verified: Admin UI → `platform_settings` → `configService.ts` → `/api/config/desktop` → `desktopConfig.ts` → `getDefaultBibleTheme()` → `applyThemeConfigOverrides()` in `bible/types.ts`.

| Setting | Default | Expected Behavior | Actual Behavior | Verdict |
|---------|---------|-------------------|-----------------|---------|
| `themes.bibleDefaults.font` | `"Inter"` | Sets Bible display font | Mutates `DEFAULT_THEME_SETTINGS.fontFamily` globally | **PASS** |
| `themes.bibleDefaults.textSize` | `48` | Sets Bible text size | Mutates `DEFAULT_THEME_SETTINGS.fontSize` | **PASS** |
| `themes.bibleDefaults.textColor` | `"#ffffff"` | Sets Bible text color | Mutates `DEFAULT_THEME_SETTINGS.fontColor` | **PASS** |
| `themes.bibleDefaults.backgroundColor` | `"#000000"` | Sets Bible background | Mutates `DEFAULT_THEME_SETTINGS.backgroundColor` | **PASS** |
| `themes.bibleDefaults.accentColor` | `"#3b82f6"` | Sets Bible accent color | Mutates `DEFAULT_THEME_SETTINGS.referenceBackgroundColor` | **PASS** |

Applied at startup (`main.tsx:62`) and refreshed on focus/online events.

---

### 4. Lower Third Defaults (4 settings) — 3 PASS, 1 FAIL

Full chain verified: Admin UI → `platform_settings` → `configService.ts` → `/api/config/desktop` → `desktopConfig.ts` → `getDefaultLowerThirdTheme()` → `dockObsClient.ts:getDefaultLTTheme()` → HTML template.

| Setting | Default | Expected Behavior | Actual Behavior | Verdict |
|---------|---------|-------------------|-----------------|---------|
| `themes.lowerThirdDefaults.nameColor` | `"#ffffff"` | Sets lower-third name text color | Injected as `--fg` CSS variable in OBS HTML | **PASS** |
| `themes.lowerThirdDefaults.titleColor` | `"#a3a3a3"` | Sets lower-third title/role text color | **Hardcoded to `#1D4ED8`** in HTML template — `lt.titleColor` never referenced | **FAIL** |
| `themes.lowerThirdDefaults.backgroundColor` | `"#000000"` | Sets lower-third panel background | Injected as `--bg` CSS variable | **PASS** |
| `themes.lowerThirdDefaults.nameSize` | `36` | Sets lower-third name font size | Injected directly into `font-size:clamp()` | **PASS** |

**FAIL Detail:** `dockObsClient.ts:249` has `--accent:#1D4ED8` hardcoded. The `lt.titleColor` value is returned by `getDefaultLowerThirdTheme()` but the HTML template never uses it. Admin can edit this field in dashboard but it has zero runtime effect.

---

### 5. OBS WebSocket Port (1 setting) — PASS

Full chain verified: Admin UI → `platform_settings` → `configService.ts` → `/api/config/desktop` → `desktopConfig.ts` → `getDefaultOBSUrl()` / `getDefaultOBSPort()`.

| Setting | Default | Expected Behavior | Actual Behavior | Verdict |
|---------|---------|-------------------|-----------------|---------|
| `obs.websocketPort` | `4455` | Sets default OBS WebSocket URL | Used by 9 desktop files for OBS connection defaults | **PASS** |

**Consumers:** `dockObsClient.ts`, `DockPage.tsx`, `obsService.ts`, `dockObsInterop.ts`, `mvStore.ts`, `useOBS.ts`, `OnboardingPage.tsx`, `ConnectionStatus.tsx`, `OBSConnectGate.tsx`

---

### 6. Authentication Max Devices (1 setting) — PASS

Full chain verified: Admin UI → `platform_settings` → License API reads directly → Desktop receives `tooManyDevices` flag → `licenseGuard.ts` locks.

| Setting | Default | Expected Behavior | Actual Behavior | Verdict |
|---------|---------|-------------------|-----------------|---------|
| `authentication.maxDevicesPerUser` | `3` | Block users exceeding device limit | License route counts devices, sets `lockReason = "too_many_devices"` | **PASS** |

**Note:** This is the only active setting where the API reads `platform_settings` directly (not via configService/desktop endpoint).

---

### 7. Security (4 settings) — 2 PASS, 2 PARTIAL

| Setting | Default | Expected Behavior | Actual Behavior | Verdict |
|---------|---------|-------------------|-----------------|---------|
| `security.internetVerificationEnabled` | `false` | Master switch for offline tier system | `internetVerificationService.ts` reads config, `computeTier()` bypasses when false | **PASS** |
| `security.maxOfflineDays` | `28` | Days before offline lock triggers | `internetVerificationService.ts` uses config value for warning/critical/locked tiers. **BUT** `licenseGuard.ts:95` hardcodes `MAX_OFFLINE_DAYS = 14` independently | **PARTIAL** |
| `security.maintenanceMode` | `false` | Shows maintenance banner/overlay | Desktop: cosmetic banner on LoginPage + DockPage. **Server:** License route uses `app_settings.emergencyLock`, NOT this field | **PARTIAL** |
| `security.maintenanceMessage` | `"We'll be back shortly!"` | Text in maintenance display | Displayed in cosmetic banner/overlay (scope limited by maintenanceMode being cosmetic only) | **PASS** (cosmetic) |

**PARTIAL Detail — maxOfflineDays:** Two parallel offline enforcement systems:
1. `internetVerificationService.ts` — uses config-driven `maxOfflineDays` (default 28) for tier progression
2. `licenseGuard.ts` — hardcodes `MAX_OFFLINE_DAYS = 14` for offline validity check

If admin sets `maxOfflineDays` to 7, the tier system locks at 7 days, but `licenseGuard.ts` still allows 14 days offline. The systems disagree.

**PARTIAL Detail — maintenanceMode:** Admin toggles "Maintenance Mode" in dashboard. Desktop shows cosmetic banners. But server APIs continue serving all requests because the license route reads `app_settings.emergencyLock` (which defaults to false). Actual enforcement requires also toggling `app_settings.emergencyLock`.

---

### 8. Trial Duration (1 setting) — FAIL (wrong collection)

| Setting | Default | Expected Behavior | Actual Behavior | Verdict |
|---------|---------|-------------------|-----------------|---------|
| `trial.defaultDurationDays` | `14` | Controls trial length for new users | `trial_settings` collection works correctly. But dashboard writes to `platform_settings` — wrong collection | **FAIL** |

**Detail:** 
- **DB:** `trial_settings.defaultDurationDays` (read by `getTrialSettings()`)
- **Dashboard writes to:** `platform_settings.trial.defaultDurationDays` (dead — no code reads this for behavior)
- **Behavioral readers:** `trial.ts:createTrialObject()`, admin trial routes — all read from `trial_settings`

Admin changes the "Trial Duration" field in the dashboard → value saved to `platform_settings` → `trial.ts` reads from `trial_settings` → value unchanged → no effect.

The ONLY way to change actual trial duration is via `PUT /api/admin/trial-settings` (no dashboard UI).

---

### 9. Verification Settings (3 settings from app_settings) — ALL FAIL

| Setting | Default | Expected Behavior | Actual Behavior | Verdict |
|---------|---------|-------------------|-----------------|---------|
| `app_settings.verificationSettings.enabled` | `false` | Enable/disable internet verification | Desktop reads `platform_settings.security.internetVerificationEnabled` instead — different collection | **FAIL** |
| `app_settings.verificationSettings.intervalHours` | `4` | Set verification check interval | Desktop hardcodes `PERIODIC_INTERVAL_MS = 4 * 60 * 60 * 1000` — never reads this | **FAIL** |
| `app_settings.verificationSettings.strictMode` | `false` | Enable strict verification | `strictMode` not referenced anywhere in desktop codebase | **FAIL** |

**Detail:** The desktop `internetVerificationService.ts` reads from `getDesktopConfig()` (which reads `platform_settings`), not from `/api/app/verification-settings` (which reads `app_settings`). The `/api/app/verification-settings` endpoint is orphaned — no consumer.

---

## Settings Reclassified

Based on validation, the 33 "active" settings break down as:

### WORKING (18 settings) — Admin changes propagate to behavior

| Setting | Chain |
|---------|-------|
| `storage.imageTargetSizeBytes` | ✅ Admin → DB → config → desktop → compression |
| `storage.videoTargetSizeBytes` | ✅ Admin → DB → config → desktop → compression |
| `storage.imageMaxDimension` | ✅ Admin → DB → config → desktop → compression |
| `storage.videoMaxWidth` | ✅ Admin → DB → config → desktop → compression |
| `storage.allowedImageExtensions` | ✅ Admin → DB → config → desktop → validation |
| `storage.allowedVideoExtensions` | ✅ Admin → DB → config → desktop → validation |
| `themes.bibleDefaults.font` | ✅ Admin → DB → config → desktop → theme system |
| `themes.bibleDefaults.textSize` | ✅ Admin → DB → config → desktop → theme system |
| `themes.bibleDefaults.textColor` | ✅ Admin → DB → config → desktop → theme system |
| `themes.bibleDefaults.backgroundColor` | ✅ Admin → DB → config → desktop → theme system |
| `themes.bibleDefaults.accentColor` | ✅ Admin → DB → config → desktop → theme system |
| `themes.lowerThirdDefaults.nameColor` | ✅ Admin → DB → config → desktop → OBS HTML |
| `themes.lowerThirdDefaults.backgroundColor` | ✅ Admin → DB → config → desktop → OBS HTML |
| `themes.lowerThirdDefaults.nameSize` | ✅ Admin → DB → config → desktop → OBS HTML |
| `obs.websocketPort` | ✅ Admin → DB → config → desktop → OBS connection |
| `authentication.maxDevicesPerUser` | ✅ Admin → DB → license API → desktop lock |
| `security.internetVerificationEnabled` | ✅ Admin → DB → config → desktop → tier system |
| `security.maintenanceMessage` | ✅ Admin → DB → config → desktop → banner text |

### PARTIALLY WORKING (2 settings) — Behavior exists but conflicts with hardcoded values

| Setting | Issue |
|---------|-------|
| `security.maxOfflineDays` | Config works in internetVerificationService; licenseGuard hardcodes 14 days |
| `security.maintenanceMode` | Cosmetic banners work; server enforcement uses different setting (app_settings.emergencyLock) |

### BROKEN — Admin UI writes to wrong collection (7 settings)

| Setting | Write Target | Read Target | Fix |
|---------|-------------|-------------|-----|
| `appUpdates.latestVersion` | `platform_settings` | `app_settings` | Phase 1: merge stores |
| `appUpdates.minimumSupportedVersion` | `platform_settings` | `app_settings` | Phase 1: merge stores |
| `appUpdates.forceUpdatesEnabled` | `platform_settings` | `app_settings` | Phase 1: merge stores |
| `appUpdates.emergencyLock` | `platform_settings` | `app_settings` | Phase 1: merge stores |
| `appUpdates.emergencyLockDelay` | `platform_settings` | `app_settings` | Phase 1: merge stores |
| `appUpdates.gracePeriodHours` | `platform_settings` | `app_settings` | Phase 1: merge stores |
| `appUpdates.updateMessage` | `platform_settings` | `app_settings` | Phase 1: merge stores |

### BROKEN — Dead settings, no behavioral reader (4 settings)

| Setting | Issue |
|---------|-------|
| `trial.defaultDurationDays` | Dashboard writes `platform_settings`; behavior reads `trial_settings` |
| `app_settings.verificationSettings.enabled` | Desktop reads `platform_settings.security.internetVerificationEnabled` instead |
| `app_settings.verificationSettings.intervalHours` | Desktop hardcodes 4-hour interval |
| `app_settings.verificationSettings.strictMode` | Not referenced anywhere |

### BROKEN — Setting exists but code ignores it (1 setting)

| Setting | Issue |
|---------|-------|
| `themes.lowerThirdDefaults.titleColor` | Read from DB, returned by helper, but HTML template hardcodes `#1D4ED8` |

---

## Bugs Found During Validation

### Bug 1: `lowerThirdDefaults.titleColor` ignored (CRITICAL for UI)

**File:** `desktop/src/dock/dockObsClient.ts:249`  
**Issue:** `--accent:#1D4ED8` is hardcoded. Should be `--accent:${lt.titleColor}`.  
**Impact:** Admin changes title color in dashboard → zero effect on OBS lower thirds.

### Bug 2: `licenseGuard.ts` hardcodes 14-day offline limit

**File:** `desktop/src/services/licenseGuard.ts:95`  
**Issue:** `const MAX_OFFLINE_DAYS = 14` ignores `security.maxOfflineDays` from config.  
**Impact:** Two parallel offline enforcement systems disagree. Tier system uses config (28 days default), license guard uses 14.

### Bug 3: `licenseGuard.ts` hardcodes 6-hour verification interval

**File:** `desktop/src/services/licenseGuard.ts:97`  
**Issue:** `const VERIFICATION_INTERVAL_MS = 6 * 60 * 60 * 1000` ignores any config.  
**Impact:** Admin cannot control how often desktop revalidates its license.

### Bug 4: `isCompressionEnabled()` never imported

**File:** `desktop/src/services/desktopConfig.ts:191`  
**Issue:** Exported function exists but is never called. Compression runs unconditionally based on file size.  
**Impact:** `storage.compressionEnabled` admin toggle has zero effect. (This is a dead setting, already identified.)

### Bug 5: Default value mismatch — `gracePeriodHours`

**platform_settings:** defaults to `48`  
**app_settings:** defaults to `72`  
**Issue:** If one collection is seeded and the other isn't, the two stores start with different values. After Phase 1 merges them, the platform_settings default (48h) should be used.

### Bug 6: `maintenanceMode` not enforced server-side

**File:** `api/src/app/api/device/license/route.ts`  
**Issue:** License route sets `maintenanceMode` from `appSettings.emergencyLock`, not from `platformSettings.security.maintenanceMode`.  
**Impact:** Admin toggles "Maintenance Mode" → desktop shows banner → but server APIs continue serving. Actual lock requires separately toggling `app_settings.emergencyLock`.

---

## Consolidation Impact

### What Phase 1 Fixes

| Setting | Before (BROKEN) | After Phase 1 (WORKING) |
|---------|-----------------|------------------------|
| `appUpdates.latestVersion` | Admin writes wrong collection | All 7 settings work end-to-end |
| `appUpdates.minimumSupportedVersion` | Enforcement reads stale app_settings | |
| `appUpdates.forceUpdatesEnabled` | | |
| `appUpdates.emergencyLock` | | |
| `appUpdates.emergencyLockDelay` | | |
| `appUpdates.gracePeriodHours` | Default mismatch (48 vs 72) | Single source (48h) |
| `appUpdates.updateMessage` | | |

### What Phase 2 Fixes

| Setting | Before (BROKEN) | After Phase 2 (WORKING) |
|---------|-----------------|------------------------|
| `trial.defaultDurationDays` | Dashboard writes wrong collection | Admin UI → platform_settings → trial.ts reads it |

### What Phase 3 Removes (dead settings that survived audit)

| Setting | Reason |
|---------|--------|
| `app_settings.verificationSettings.enabled` | Dead — desktop reads platform_settings instead |
| `app_settings.verificationSettings.intervalHours` | Dead — desktop hardcodes interval |
| `app_settings.verificationSettings.strictMode` | Dead — not referenced anywhere |
| `themes.lowerThirdDefaults.titleColor` | Dead — code hardcodes color (Bug 1) |

### Remaining Issues After All Phases

| Issue | Fix Required |
|-------|-------------|
| `security.maxOfflineDays` vs `licenseGuard.ts` hardcoded 14 days | Update `licenseGuard.ts` to read from config |
| `security.maintenanceMode` not enforced server-side | Either wire to `emergencyLock` or merge the two toggles |
| `isCompressionEnabled()` never called | Either wire it or remove the setting |

---

## Recommended Pre-Consolidation Fixes

Before starting Phase 1, fix these bugs to ensure settings work after migration:

1. **Fix `lowerThirdDefaults.titleColor`** — Replace `#1D4ED8` with `${lt.titleColor}` in `dockObsClient.ts:249`
2. **Fix `licenseGuard.ts` hardcoded values** — Read `maxOfflineDays` from config instead of hardcoding 14
3. **Fix `gracePeriodHours` default** — Align to 48h in both collections
4. **Fix `maintenanceMode` enforcement** — Decide: cosmetic-only or real enforcement. If real, merge with `emergencyLock`.
