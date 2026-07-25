# Settings Usage Audit

**Date:** 2026-06-26
**Purpose:** Determine which settings actually affect runtime behavior before consolidation
**Method:** Traced every setting through write → store → read → enforce paths

---

## Executive Summary

| Metric | Count |
|--------|-------|
| Total settings across 4 collections | ~113 |
| **Active** (read + write + enforced) | **27** |
| **Partially Active** (some effect, incomplete) | **6** |
| **Dead** (written, never read) | **76** |
| **Phantom** (don't exist in codebase) | **4** |
| **Active in plan_config** | **~20 sections** |

**76% of all settings in `platform_settings` are dead.** The admin dashboard gives the illusion of configurability for features that either have no implementation or are controlled by other systems (`plan_config`).

---

## ACTIVE SETTINGS

Settings that currently affect behavior. These are the ONLY settings worth preserving.

### platform_settings — Active (27 settings)

| # | Setting | Written By | Read By | Runtime Effect |
|---|---------|-----------|---------|----------------|
| 1 | `appUpdates.latestVersion` | admin UI, app-settings API | `forcedUpdateService.ts`, `/api/device/license`, `versionGate.ts` | Target version for forced update dialogs |
| 2 | `appUpdates.minimumSupportedVersion` | admin UI, app-settings API | `versionGate.ts` (403 block), `forcedUpdateService.ts` | Server blocks old desktop versions |
| 3 | `appUpdates.forceUpdatesEnabled` | admin UI, app-settings API | `versionGate.ts` (master toggle), `forcedUpdateService.ts` | When false, all version gating bypassed |
| 4 | `appUpdates.emergencyLock` | admin UI, app-settings API | `/api/device/license`, `/api/device/check-access`, `forcedUpdateService.ts` | Emergency kill switch — blocks all access |
| 5 | `appUpdates.emergencyLockDelay` | admin UI, app-settings API | `forcedUpdateService.ts` | Hours before emergency lock fully enforces |
| 6 | `appUpdates.gracePeriodHours` | admin UI, app-settings API | `forcedUpdateService.ts` | Countdown duration for forced updates |
| 7 | `appUpdates.updateMessage` | admin UI, app-settings API | `forcedUpdateService.ts` | Text shown in lock/update overlay |
| 8 | `appUpdates.downloadUrls.windows` | admin UI | `DockPage.tsx` | Windows download button URL |
| 9 | `appUpdates.downloadUrls.macosAppleSilicon` | admin UI | `DockPage.tsx` | macOS download button URL |
| 10 | `authentication.maxDevicesPerUser` | admin UI | `device/license/route.ts` | Max devices before `too_many_devices` lock |
| 11 | `obs.websocketPort` | admin UI | `getDefaultOBSUrl()` in 8+ desktop files | Default OBS WebSocket connection port |
| 12 | `security.internetVerificationEnabled` | admin UI | `internetVerificationService.ts` | Master switch for 4-tier offline grace period |
| 13 | `security.maxOfflineDays` | admin UI | `internetVerificationService.ts` | Drives warning/critical/locked thresholds |
| 14 | `themes.bibleDefaults.font` | admin UI | `bible/types.ts` → `applyThemeConfigOverrides()` | Bible display font family |
| 15 | `themes.bibleDefaults.textSize` | admin UI | `bible/types.ts` | Bible text size in pixels |
| 16 | `themes.bibleDefaults.textColor` | admin UI | `bible/types.ts` | Bible text color |
| 17 | `themes.bibleDefaults.backgroundColor` | admin UI | `bible/types.ts` | Bible background color |
| 18 | `themes.bibleDefaults.accentColor` | admin UI | `bible/types.ts` | Bible reference/verse highlight color |
| 19 | `themes.lowerThirdDefaults.nameColor` | admin UI | `dockObsClient.ts` | OBS lower-third speaker name color |
| 20 | `themes.lowerThirdDefaults.backgroundColor` | admin UI | `dockObsClient.ts` | OBS lower-third panel background |
| 21 | `themes.lowerThirdDefaults.nameSize` | admin UI | `dockObsClient.ts` | OBS lower-third name font size |
| 22 | `storage.imageTargetSizeBytes` | admin UI | `mediaCompression.ts`, `dockUploadService.ts` | Image compression target size |
| 23 | `storage.videoTargetSizeBytes` | admin UI | `mediaCompression.ts`, `dockUploadService.ts` | Video compression target size |
| 24 | `storage.imageMaxDimension` | admin UI | `mediaCompression.ts` | Max image width/height cap |
| 25 | `storage.videoMaxWidth` | admin UI | `mediaCompression.ts` | Max video width cap |
| 26 | `storage.allowedImageExtensions` | admin UI | `mediaValidation.ts` | Accepted image file types |
| 27 | `storage.allowedVideoExtensions` | admin UI | `mediaValidation.ts` | Accepted video file types |

### platform_settings — Partially Active (6 settings)

| # | Setting | Issue |
|---|---------|-------|
| 1 | `appUpdates.downloadUrls.macosIntel` | In config but download UI has no Intel Mac branch |
| 2 | `security.maintenanceMode` | Cosmetic only (banner + login overlay). Server uses `app_settings.emergencyLock` instead |
| 3 | `security.maintenanceMessage` | Cosmetic only — text for the above banner |
| 4 | `themes.lowerThirdDefaults.titleColor` | Propagated to OBS template but role-line accent is hardcoded to `#1D4ED8` |
| 5 | `app_settings.verificationSettings.enabled` | API-exposed but desktop reads `platform_settings.security.internetVerificationEnabled` instead |
| 6 | `app_settings.verificationSettings.*` (all 4) | Same — desktop computes its own values from `platform_settings` |

### app_settings — Active (7 settings)

| # | Setting | Written By | Read By | Runtime Effect |
|---|---------|-----------|---------|----------------|
| 1 | `latestVersion` | admin API | `versionGate.ts`, `forcedUpdateService.ts`, license route | Target version for updates |
| 2 | `minimumSupportedVersion` | admin API | `versionGate.ts` (403 block) | Server blocks old versions |
| 3 | `forceUpdatesEnabled` | admin API | `versionGate.ts`, license route | Master toggle for version gating |
| 4 | `emergencyLock` | admin API | license, check-access, STS check-access | Emergency kill switch |
| 5 | `emergencyLockDelay` | admin API | `forcedUpdateService.ts` | Grace period before lock |
| 6 | `gracePeriodHours` | admin API | `forcedUpdateService.ts` | Countdown for forced updates |
| 7 | `updateMessage` | admin API | `forcedUpdateService.ts` | Text in lock overlay |

**NOTE:** These 7 are ACTIVE but duplicate platform_settings fields with DIFFERENT default values (e.g., gracePeriodHours: 48 vs 72). This is the dual-source conflict.

### trial_settings — Active (1 setting)

| # | Setting | Written By | Read By | Runtime Effect |
|---|---------|-----------|---------|----------------|
| 1 | `defaultDurationDays` | admin API | `createTrialObject()`, admin trial routes, bulk trial route | Determines trial length for all new trials |

### plan_config — Active (~20 sections)

| Section | Written By | Read By | Runtime Effect |
|---------|-----------|---------|----------------|
| `plans.free.credits` | admin API | `credits.ts`, signup routes, cron | Initial credits for free users |
| `plans.trial.credits` | admin API | `auth.ts`, email-confirmed route | Initial credits for trial users |
| `plans.starter.credits` | admin API | `credits.ts` | Credits for starter plan |
| `plans.growth.credits` | admin API | `credits.ts` | Credits for growth plan |
| `plans.pro.credits` | admin API | `credits.ts` | Credits for pro plan (-1 = unlimited) |
| `plans.*.entitlements` | admin API | 30+ routes (check-access, device, payments, etc.) | Feature access per plan tier |
| `plans.*.pricing` | admin API | payments initialize/verify, webhooks | Payment amounts and Paystack codes |
| `plans.*.label` | admin API | `/api/plan-config` GET → desktop/dashboard UI | Plan display names |
| `plans.*.paystack` | admin API | payments initialize/verify | Paystack plan codes |
| `creditCosts.*` | admin API | desktop `credits.ts` | Per-action credit costs |
| `translationWordsPerCredit` | admin API | desktop `credits.ts` | Word-to-credit conversion rate |
| `pricingPlans.*` | admin API | `/api/plan-config` GET → pricing page UI | Pricing card display data |
| `featureBanners.*` | admin API | `/api/plan-config` GET → feature banner UI | Feature promotion banners |

---

## DEAD SETTINGS

Settings that can be removed instead of migrated. **Do not carry these forward.**

### platform_settings.trial — 10 settings (ALL DEAD)

| Setting | Why Dead |
|---------|----------|
| `trial.enabled` | Forwarded to desktop config but never read. Real toggle is `trial_settings.enableForNewUsers` (also dead) |
| `trial.defaultDurationDays` | Real value is `trial_settings.defaultDurationDays` |
| `trial.allowRestart` | Never read by any logic |
| `trial.allowMultipleTrials` | Never enforced — no code checks this |
| `trial.maxTrialsPerEmail` | Never enforced — no code checks this |
| `trial.defaultTrialPlan` | Never read — trial plan is always "free" |
| `trial.welcomeMessage` | Never displayed — not in desktop config, not in any template |
| `trial.sendExtensionEmails` | Email gate not implemented — emails send unconditionally |
| `trial.sendRestartEmails` | Same — gate not implemented |
| `trial.sendStopEmails` | Same — gate not implemented |

### platform_settings.credits — 8 settings (ALL DEAD)

| Setting | Why Dead |
|---------|----------|
| `credits.freePlanCredits` | Real allocation is `plan_config.plans.free.credits` |
| `credits.starterCredits` | Real allocation is `plan_config.plans.starter.credits` |
| `credits.proCredits` | Real allocation is `plan_config.plans.pro.credits` |
| `credits.translationCost` | Desktop receives it but reads costs from `planConfig.creditCosts` |
| `credits.speechToScriptureCost` | Same — `planConfig.creditCosts` is authoritative |
| `credits.aiSummaryCost` | Same — `planConfig.creditCosts` is authoritative |
| `credits.dailyBonusCredits` | No daily bonus system exists anywhere in the codebase |
| `credits.monthlyResetDay` | No monthly reset system exists anywhere in the codebase |

### platform_settings.ambassador — 6 settings (ALL DEAD)

| Setting | Why Dead |
|---------|----------|
| `ambassador.enabled` | No code checks this — grants work unconditionally |
| `ambassador.creditsPerAmbassador` | Grant route takes credits from request body, ignores this |
| `ambassador.defaultTrialDurationDays` | Grant route uses hardcoded `DURATION_MS` map |
| `ambassador.autoExpiry` | Grant route always computes expiry regardless |
| `ambassador.sendWelcomeEmail` | Grant route always sends email unconditionally |
| `ambassador.badgeText` | No code renders this badge text anywhere |

### platform_settings.authentication — 7 settings (6 DEAD, 1 ACTIVE)

| Setting | Why Dead |
|---------|----------|
| `authentication.emailPasswordEnabled` | Login page always renders email form regardless |
| `authentication.googleEnabled` | Login page always renders Google button regardless |
| `authentication.appleEnabled` | No Apple login implementation exists in desktop |
| `authentication.emailVerificationRequired` | Always enforced — no toggle checked |
| `authentication.verificationCodeLength` | Hardcoded to 6 digits in `email-login/route.ts` |
| `authentication.codeExpiryMinutes` | Hardcoded to 1 minute in `email-login/route.ts` (setting says 15) |
| `authentication.maxSessionsPerUser` | No session limit enforced — `removeOtherSessions()` removes all |

### platform_settings.obs — 9 settings (ALL DEAD except websocketPort)

| Setting | Why Dead |
|---------|----------|
| `obs.enableOBSIntegration` | OBS features always available — never checked |
| `obs.requireOBSAuthentication` | No auth gate implemented on WS connections |
| `obs.allowAutoDiscovery` | No code gates auto-discovery on this flag |
| `obs.enableOBSDock` | Dock always accessible — never checked |
| `obs.enableMultiview` | Multiview always accessible — never checked |
| `obs.minSupportedOBSVersion` | No version comparison code exists |
| `obs.minSupportedWebSocketVersion` | No version comparison code exists |
| `obs.autoDetect` | `autoDetectConfig()` in `layoutService.ts` is unrelated to this toggle |
| `obs.reconnectIntervalMs` | `obsService.ts` hardcodes its own reconnect logic |

### platform_settings.ai — 10 settings (ALL DEAD)

| Setting | Why Dead |
|---------|----------|
| `ai.provider` | AI provider is hardcoded — no code reads this |
| `ai.dailyRequestLimit` | No rate limiter implements this |
| `ai.maximumTranslationMinutes` | No enforcement code exists |
| `ai.supportedLanguages` | Desktop uses hardcoded 180+ language list from `ALL_LANGUAGES` constant |
| `ai.featureToggles.scriptureTranslation` | Gated by `plan_config` entitlements, not this toggle |
| `ai.featureToggles.speechToScripture` | Gated by `plan_config` entitlements, not this toggle |
| `ai.featureToggles.aiSummaries` | Gated by `plan_config` entitlements, not this toggle |
| `ai.featureToggles.sermonNotes` | Gated by `plan_config` entitlements, not this toggle |
| `ai.featureToggles.aiAssistant` | No code checks this toggle |

### platform_settings.notifications — 7 settings (ALL DEAD)

| Setting | Why Dead |
|---------|----------|
| `notifications.welcomeEmail` | Welcome emails always sent — `shouldSendEmail()` never called |
| `notifications.trialExpiryReminder` | Trial emails always sent unconditionally |
| `notifications.paymentReminder` | Payment emails always sent unconditionally |
| `notifications.securityAlerts` | Security emails always sent unconditionally |
| `notifications.featureAnnouncements` | No announcement email system exists |
| `notifications.creditLowBalance` | No balance alert system exists |
| `notifications.weeklyDigest` | No digest system exists |

### platform_settings.storage — 9 settings (6 ACTIVE, 3 DEAD)

| Setting | Why Dead |
|---------|----------|
| `storage.enableCloudSync` | No code checks this — cloud sync always available |
| `storage.maxUploadSizeMB` | Superseded by `imageTargetSizeBytes`/`videoTargetSizeBytes` |
| `storage.allowedFileTypes` | Superseded by `allowedImageExtensions`/`allowedVideoExtensions` |
| `storage.compressionEnabled` | `isCompressionEnabled()` exists but is never called — compression always runs |
| `storage.defaultQuotaGB` | No quota enforcement exists |
| `storage.retentionDays` | No retention/cleanup system exists |
| `storage.maximumBackgroundVideoSizeMB` | No enforcement code exists |
| `storage.churchLogoSizeLimitMB` | No enforcement code exists |
| `storage.mediaLibraryQuotaGB` | No enforcement code exists |

### platform_settings.security — 8 settings (2 ACTIVE, 2 PARTIAL, 4 DEAD)

| Setting | Why Dead |
|---------|----------|
| `security.force2FAForAdmins` | No auth flow reads this — admins bypass 2FA |
| `security.requireHttps` | No middleware enforces HTTPS based on this |
| `security.apiKeysEnabled` | No API key code checks this flag |
| `security.apiKeyExpiryDays` | No API key expiry logic exists |
| `security.forceLogoutAllUsers` | Button handler is a TODO stub (`// TODO: API call to force logout`) |
| `security.mfaForAllUsers` | No auth flow reads this |
| `security.deviceRevocationEnabled` | Server revocation works regardless — this flag is ignored |
| `security.requirePeriodicLicenseVerification` | 6h verification hardcoded in `licenseGuard.ts` |

### platform_settings.themes — 14 settings (5 ACTIVE, 1 PARTIAL, 8 DEAD)

| Setting | Why Dead |
|---------|----------|
| `themes.defaultBibleTheme` | Theme-by-ID lookup not implemented — `bibleDefaults` used instead |
| `themes.defaultWorshipTheme` | No theme resolver exists |
| `themes.defaultLowerThirdTheme` | `getDefaultLowerThirdTheme()` returns `lowerThirdDefaults` directly |
| `themes.defaultAnnouncementTheme` | No announcement rendering exists |
| `themes.defaultFont` | `bibleDefaults.font` is used instead — this is never applied globally |
| `themes.defaultBrandColours.primary` | Zero imports/consumers in desktop |
| `themes.defaultBrandColours.secondary` | Zero imports/consumers in desktop |
| `themes.defaultBrandColours.accent` | Zero imports/consumers in desktop |
| `themes.worshipDefaults.font` | `getDefaultWorshipTheme()` exists but is never imported by any consumer |
| `themes.worshipDefaults.textSize` | Same — unreachable function |
| `themes.worshipDefaults.textColor` | Same — unreachable function |
| `themes.worshipDefaults.backgroundColor` | Same — unreachable function |
| `themes.worshipDefaults.animationEnabled` | Same — unreachable function |

### platform_settings.analytics — 4 settings (ALL DEAD)

| Setting | Why Dead |
|---------|----------|
| `analytics.usageAnalytics` | Analytics fire unconditionally based on env vars |
| `analytics.crashReporting` | `captureException()` always fires — never gated |
| `analytics.errorTracking` | Same — always fires |
| `analytics.performanceMonitoring` | No performance monitoring code exists |

### platform_settings.appUpdates — 2 settings (DEAD)

| Setting | Why Dead |
|---------|----------|
| `appUpdates.releaseNotes` | Dashboard downloads page reads from GitHub API, not this field |
| `appUpdates.downloadUrls.linux` | Download UI has no Linux branch |

### trial_settings — 5 settings (1 ACTIVE, 5 DEAD)

| Setting | Why Dead |
|---------|----------|
| `enableForNewUsers` | `isTrialEnabled()` is exported but never imported or called |
| `enableForExistingUsers` | No consumer — never read by any route |
| `sendExtensionEmails` | Notification system sends unconditionally — never checks this flag |
| `sendRestartEmails` | Same — never checked |
| `sendStopEmails` | Same — never checked |

### plan_config — 2 settings (DEAD)

| Setting | Why Dead |
|---------|----------|
| `trial.durationDays` | Trial duration is controlled by `trial_settings.defaultDurationDays` |
| `trial.enabled` | No code reads this — trial enablement has no functional gate |

---

## PHANTOM SETTINGS

Settings referenced in the audit request but **do not exist** in any schema, type, or default:

| Setting | Status |
|---------|--------|
| `credits.growthCredits` | Not in `PlatformSettings` interface — field was planned but never added |
| `ambassador.welcomeSubject` | Not in schema — does not exist |
| `ambassador.welcomeBody` | Not in schema — does not exist |
| `ambassador.cooldownDays` | Not in schema — does not exist |
| `notifications.fromName` | Not in schema — hardcoded as `"support@creatorstudioslabs.stream"` in `emailTemplates.ts` |
| `notifications.fromEmail` | Not in schema — hardcoded in `emailTemplates.ts` |
| `notifications.replyToEmail` | Not in schema |
| `notifications.footerText` | Not in schema |
| `notifications.footerAddress` | Not in schema |

---

## ROOT CAUSES OF DEAD SETTINGS

### 1. Config Pipeline Without Consumers (Most Common)

The pattern: Admin UI → `PUT /api/admin/platform-settings` → `platform_settings` in MongoDB → `configService.ts` → `DesktopConfig` → desktop localStorage cache → **nobody reads it**.

30+ settings follow this pattern. `configService.ts` faithfully transforms them into `DesktopConfig`, but the desktop app has no accessor functions (in `desktopConfig.ts`) or conditional logic (in pages/components) to consume them.

### 2. Plan Entitlements Superseded Platform Toggles

The AI feature kill-switches (`scriptureTranslation`, `speechToScripture`, `aiSummaries`, `sermonNotes`, `aiAssistant`) were designed as platform-level toggles. But the actual enforcement reads from `plan_config.plans[tier].entitlements[key]`. The platform toggles are bypassed entirely.

### 3. Email System Bypasses Notification Toggles

`emailTemplates.ts` → `sendEmail()` sends unconditionally. The `shouldSendEmail()` function in `emailPreferences.ts` exists but is **never imported or called** by any email-sending code. All 7 notification toggles are dead.

### 4. Dual-Source Conflict Creates Confusion

7 appUpdate fields exist in both `platform_settings` and `app_settings` with different default values. The admin UI writes to `platform_settings`. The enforcement code reads from `app_settings`. Neither path is aware of the other.

### 5. Hardcoded Values Override Config

- `email-login/route.ts` hardcodes 6-digit codes and 1-minute expiry (ignoring `verificationCodeLength` and `codeExpiryMinutes`)
- `licenseGuard.ts` hardcodes 14-day offline limit and 6-hour verification interval (ignoring `maxOfflineDays` and `requirePeriodicLicenseVerification`)
- `obsService.ts` hardcodes reconnect logic (ignoring `reconnectIntervalMs`)
- Ambassador grant route hardcodes durations (ignoring `defaultTrialDurationDays`)

### 6. Planned Features Never Implemented

- `dailyBonusCredits` / `monthlyResetDay` — no daily/monthly credit system
- `storage.defaultQuotaGB` / `retentionDays` — no quota enforcement or cleanup
- `analytics.performanceMonitoring` — no performance monitoring code
- `notifications.featureAnnouncements` / `creditLowBalance` / `weeklyDigest` — no email templates

---

## CONSOLIDATION IMPACT

Based on this audit, the consolidation plan changes dramatically:

### What to KEEP (27 active + 6 partial = 33 settings)

| Section | Keep | Remove |
|---------|------|--------|
| `appUpdates` | 9 active + 1 partial (merge from app_settings) | 2 dead (releaseNotes, linux URL) |
| `trial` | Remove entirely — merge `defaultDurationDays` into a simple config field | 10 dead |
| `credits` | Remove entirely — `plan_config` is authoritative | 8 dead |
| `ambassador` | Remove entirely — no settings are consumed | 6 dead |
| `authentication` | Keep `maxDevicesPerUser` only | 7 dead |
| `obs` | Keep `websocketPort` only | 9 dead |
| `ai` | Remove entirely — plan entitlements are the gate | 10 dead |
| `notifications` | Remove entirely — email system bypasses all toggles | 7 dead |
| `storage` | Keep 6 compression/extension settings | 9 dead |
| `security` | Keep 2 (internetVerification) | 8 dead |
| `themes` | Keep 9 (bible + lowerThird defaults) | 14 dead |
| `analytics` | Remove entirely — no enforcement code | 4 dead |

### What to DELETE (no migration needed)

- `platform_settings.trial` section — 10 dead fields
- `platform_settings.credits` section — 8 dead fields
- `platform_settings.ambassador` section — 6 dead fields
- `platform_settings.ai` section — 10 dead fields
- `platform_settings.notifications` section — 7 dead fields
- `platform_settings.analytics` section — 4 dead fields
- `trial_settings` collection — 5 of 6 fields dead (only `defaultDurationDays` survives)
- `app_settings.verificationSettings` — 4 partially active fields (desktop computes its own)

### Revised Scope

| Metric | Before Audit | After Audit |
|--------|-------------|-------------|
| Settings to migrate | ~113 | **~20** (active ones that need source consolidation) |
| Files to change | ~70 | **~15-20** (only active settings need wiring) |
| Dead code to delete | Unknown | **~94 dead settings + their UI sections** |
| Estimated effort | 8-12 days | **3-5 days** |

---

## ADMIN SETTINGS REVIEW

**Date:** 2026-06-26 (appended to initial audit)

### Admin Settings Principle

> Every setting visible in Admin must satisfy: Admin Changes Value → Value Is Saved → Platform Reads Value → Platform Behavior Changes. If a setting cannot demonstrate this flow, it should not appear in the Admin interface.

This means even **ACTIVE** settings that are implementation details (not administrative controls) should be removed from the Admin UI. They remain in the database/config pipeline but are not surfaced to admins.

### Additional Removals (Beyond Dead Settings)

The following sections/fields were reviewed and removed from Admin visibility per the principle above:

#### 1. OBS Section — Remove from Admin (all 10 fields)

| Field | Audit Status | Admin Review Decision |
|-------|-------------|----------------------|
| `obs.enableOBSIntegration` | Dead | Remove from Admin |
| `obs.requireOBSAuthentication` | Dead | Remove from Admin |
| `obs.allowAutoDiscovery` | Dead | Remove from Admin |
| `obs.enableOBSDock` | Dead | Remove from Admin |
| `obs.enableMultiview` | Dead | Remove from Admin |
| `obs.minSupportedOBSVersion` | Dead | Remove from Admin |
| `obs.minSupportedWebSocketVersion` | Dead | Remove from Admin |
| `obs.autoDetect` | Dead | Remove from Admin |
| `obs.reconnectIntervalMs` | Dead | Remove from Admin |
| `obs.websocketPort` | **ACTIVE** | Remove from Admin — technical implementation detail, not admin control |

**Rationale:** websocketPort is active (used by 8+ desktop files) but it's a technical OBS connection parameter, not an administrative setting. Admins should not configure WebSocket ports. This setting stays in the database/config pipeline but is removed from the Admin UI.

#### 2. AI Provider Setting — Remove from Admin

| Field | Audit Status | Admin Review Decision |
|-------|-------------|----------------------|
| `ai.provider` | Dead | Remove from Admin |

**Rationale:** AI provider selection is an implementation detail controlled by `plan_config` entitlements, not admin configuration.

#### 3. Theme Defaults Section — Remove Dead Fields from Admin

| Field | Audit Status | Admin Review Decision |
|-------|-------------|----------------------|
| `themes.defaultBibleTheme` | Dead | Remove from Admin |
| `themes.defaultWorshipTheme` | Dead | Remove from Admin |
| `themes.defaultLowerThirdTheme` | Dead | Remove from Admin |
| `themes.defaultAnnouncementTheme` | Dead | Remove from Admin |
| `themes.defaultFont` | Dead | Remove from Admin |
| `themes.defaultBrandColours.primary` | Dead | Remove from Admin |
| `themes.defaultBrandColours.secondary` | Dead | Remove from Admin |
| `themes.defaultBrandColours.accent` | Dead | Remove from Admin |
| `themes.worshipDefaults.backgroundColor` | Dead | Remove from Admin |
| `themes.worshipDefaults.textColor` | Dead | Remove from Admin |
| `themes.worshipDefaults.accentColor` | Dead | Remove from Admin |
| `themes.worshipDefaults.backgroundImage` | Dead | Remove from Admin |

**Rationale:** These fields are dead (written by admin, never read by platform). The Theme System manages all theme configuration at runtime. Only `bibleDefaults` and `lowerThirdDefaults` survive as active settings.

#### 4. Unused Update Settings — Remove from Admin

| Field | Audit Status | Admin Review Decision |
|-------|-------------|----------------------|
| `appUpdates.releaseNotes` | Dead | Remove from Admin |
| `appUpdates.downloadUrls.linux` | Dead | Remove from Admin |

**Rationale:** releaseNotes is never read by desktop. Linux download URL is for a platform that doesn't exist. These are configuration debt with no corresponding platform behavior.

### Summary of Admin Settings Review Impact

| Section | Action | Fields Affected |
|---------|--------|----------------|
| OBS | Remove entire section from Admin | 10 (9 dead + 1 technical) |
| AI | Remove provider setting from Admin | 1 (dead) |
| Theme Defaults | Remove dead fields, keep bible + LT defaults | 12 (all dead) |
| Update Settings | Remove releaseNotes + linux URL | 2 (dead) |
| **Total** | | **25 fields removed from Admin** |

**After Admin Review:** Admin Settings UI exposes only settings that represent true administrative controls with verified behavior change chains.
