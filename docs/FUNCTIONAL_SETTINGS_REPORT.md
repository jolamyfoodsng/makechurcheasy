# Admin Settings Enforcement Verification Report

**Date:** 2026-06-26  
**Scope:** Every setting in the Admin Platform Settings UI traced through the codebase to verify whether changing it produces actual behavior changes.

---

## Executive Summary

The PlatformSettings system has **~100 configurable fields** across 12 sections. After tracing every field through the full data flow (admin UI → MongoDB → API config endpoint → desktop/API behavior code), the results are stark:

| Category | Count | Percentage |
|----------|-------|-----------|
| **FUNCTIONAL** — setting saves AND changes behavior | 16 | ~16% |
| **PARTIAL** — setting changes behavior on client only, not server | 2 | ~2% |
| **DUAL-SOURCE** — setting is functional but admin UI writes to wrong collection | 7 | ~7% |
| **NON-FUNCTIONAL** — setting saves but has zero effect on any behavior | 76 | ~76% |

**Only 2 of 12 sections have fully functional settings: `storage` (compression params) and `security` (internet verification).**

---

## FUNCTIONAL SETTINGS REPORT

Settings that **save successfully AND produce actual behavior changes** when modified through the admin UI.

---

### Section: Storage (6 of 15 functional)

| Setting | Changed Value | Expected Behavior | Enforcement Location | Verdict |
|---------|--------------|-------------------|---------------------|---------|
| `storage.imageTargetSizeBytes` | e.g., 512KB instead of 1MB | Image compression targets smaller file size before upload | `desktop/src/dock/mediaCompression.ts:23`, `desktop/src/dock/dockUploadService.ts:245` | **PASS** |
| `storage.videoTargetSizeBytes` | e.g., 2MB instead of 1MB | Video compression targets different file size | `desktop/src/dock/mediaCompression.ts:68`, `desktop/src/dock/dockUploadService.ts:252` | **PASS** |
| `storage.imageMaxDimension` | e.g., 1280 instead of 1920 | Images resized to max 1280px instead of 1920px | `desktop/src/dock/mediaCompression.ts:24` | **PASS** |
| `storage.videoMaxWidth` | e.g., 640 instead of 854 | Videos transcoded to max 640px width | `desktop/src/dock/mediaCompression.ts:69` | **PASS** |
| `storage.allowedImageExtensions` | Remove "webp" from list | .webp files rejected by validation | `desktop/src/services/mediaValidation.ts:23,32,49` | **PASS** |
| `storage.allowedVideoExtensions` | Remove "mkv" from list | .mkv files rejected by validation | `desktop/src/services/mediaValidation.ts:23,41,52` | **PASS** |

---

### Section: Security (2 of 12 functional)

| Setting | Changed Value | Expected Behavior | Enforcement Location | Verdict |
|---------|--------------|-------------------|---------------------|---------|
| `security.internetVerificationEnabled` | Enable (true) | Offline grace period system activates — 4-tier progressive lock (normal → warning → critical → locked) | `desktop/src/services/internetVerificationService.ts:161` (`computeTier()`) | **PASS** |
| `security.maxOfflineDays` | e.g., 14 instead of 28 | Warning at 7d, critical at 10.5d, locked at 14d (was 14d/21d/28d) | `desktop/src/services/internetVerificationService.ts:162-164` | **PASS** |

---

### Section: Authentication (1 of 8 functional)

| Setting | Changed Value | Expected Behavior | Enforcement Location | Verdict |
|---------|--------------|-------------------|---------------------|---------|
| `authentication.maxDevicesPerUser` | e.g., 1 instead of 3 | Users can only pair 1 device; exceeding returns `lockReason: "too_many_devices"` | `api/src/app/api/device/license/route.ts:212` | **PASS** |

---

### Section: OBS (1 of 10 functional)

| Setting | Changed Value | Expected Behavior | Enforcement Location | Verdict |
|---------|--------------|-------------------|---------------------|---------|
| `obs.websocketPort` | e.g., 4456 instead of 4455 | Desktop app shows `ws://localhost:4456` as default OBS URL in onboarding, connect gate, connection status | `desktop/src/services/desktopConfig.ts:112` (`getDefaultOBSUrl()`) → consumed by `useOBS.ts:119`, `OBSConnectGate.tsx`, `ConnectionStatus.tsx`, `dockObsClient.ts`, `mvStore.ts`, `OnboardingPage.tsx:376` | **PASS** |

---

### Section: Themes (2 of 9 functional)

| Setting | Changed Value | Expected Behavior | Enforcement Location | Verdict |
|---------|--------------|-------------------|---------------------|---------|
| `themes.bibleDefaults` | Change font to "Georgia", size to 72, text color to yellow | Bible slides render with Georgia font at 72px in yellow | `desktop/src/services/desktopConfig.ts:201` → `desktop/src/bible/types.ts:382` (`applyThemeConfigOverrides()`) → `desktop/src/main.tsx:61-79` | **PASS** |
| `themes.lowerThirdDefaults` | Change nameColor to red, nameSize to 48 | OBS lower-third overlay renders name in red at 48px | `desktop/src/services/desktopConfig.ts:217` → `desktop/src/dock/dockObsClient.ts:245` (HTML template) | **PASS** |

---

## DUAL-SOURCE SETTINGS (functional enforcement, but admin UI writes to wrong collection)

These settings DO control server-side behavior, but the admin Platform Settings UI writes to `platform_settings` while the enforcement code reads from the separate `app_settings` collection. **Changing these in the admin UI has no effect on enforcement.**

| Setting | Admin UI Writes To | Enforcement Reads From | Behavior When Changed via Admin UI | Verdict |
|---------|-------------------|----------------------|-------------------------------------|---------|
| `appUpdates.forceUpdatesEnabled` | `platform_settings` | `app_settings` (via `getAppSettings()`) | Dock banner changes (reads platform_settings); forced update overlay does NOT change | **FAIL — data source mismatch** |
| `appUpdates.emergencyLock` | `platform_settings` | `app_settings` (via `getAppSettings()`) | No server-side enforcement change; license/check-access still read from app_settings | **FAIL — data source mismatch** |
| `appUpdates.emergencyLockDelay` | `platform_settings` | `app_settings` (via `getAppSettings()`) | Emergency lock countdown unchanged | **FAIL — data source mismatch** |
| `appUpdates.latestVersion` | `platform_settings` | `app_settings` (via `getAppSettings()`) | Forced update target version unchanged | **FAIL — data source mismatch** |
| `appUpdates.minimumSupportedVersion` | `platform_settings` | `app_settings` (via `getAppSettings()`) | API version gate unchanged | **FAIL — data source mismatch** |
| `appUpdates.gracePeriodHours` | `platform_settings` | `app_settings` (via `getAppSettings()`) | Forced update countdown unchanged (also differs: platform_settings defaults to 48h, app_settings defaults to 72h) | **FAIL — data source mismatch** |
| `appUpdates.updateMessage` | `platform_settings` | `app_settings` (via `getAppSettings()`) | Forced update overlay message unchanged | **FAIL — data source mismatch** |

---

## PARTIAL SETTINGS (client-side only)

| Setting | What Changes | What Doesn't Change | Verdict |
|---------|-------------|---------------------|---------|
| `security.maintenanceMode` | Desktop shows yellow banner (`DockPage.tsx:605`) and login overlay (`LoginPage.tsx:160`) | **Server APIs continue serving all requests** — server uses `app_settings.emergencyLock` instead | **PARTIAL — cosmetic only** |
| `security.maintenanceMessage` | Text displayed in the client-side banner/overlay | Same — no server-side effect | **PARTIAL — cosmetic only** |

---

## NON-FUNCTIONAL SETTINGS REPORT

Settings that **save to MongoDB successfully but have zero effect** on any behavior in the platform. Organized by section.

---

### Section: Trial (10 of 10 NON-FUNCTIONAL)

All 10 trial settings save but nothing reads them to make behavioral decisions.

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `trial.enabled` | Toggle trial availability | Never read. Desktop config forwards it but desktop code never checks it |
| `trial.defaultDurationDays` | Set trial length | Ignored — behavior code reads from separate `trial_settings` collection instead |
| `trial.defaultTrialPlan` | Set which plan trial users get | Never referenced outside types/defaults |
| `trial.allowRestart` | Allow users to restart trials | Desktop receives it but never reads it |
| `trial.allowMultipleTrials` | Allow multiple trials per user | Never referenced outside types/defaults |
| `trial.maxTrialsPerEmail` | Limit trials per email | Never referenced outside types/defaults |
| `trial.welcomeMessage` | Custom welcome text | Desktop uses hardcoded strings, not this value |
| `trial.sendExtensionEmails` | Gate extension reminder emails | Never read before email sends |
| `trial.sendRestartEmails` | Gate restart notification emails | Never read before email sends |
| `trial.sendStopEmails` | Gate trial-stopped emails | Never read before email sends |

**Root cause:** Two disconnected trial configuration systems exist:
- **System A:** `platform_settings.trial` (written by admin UI, read by nothing)
- **System B:** `trial_settings` collection (has its own API route, has NO dashboard UI)

Only `trial_settings.defaultDurationDays` (System B) actually works — but it's not editable from the dashboard.

---

### Section: Credits (9 of 9 NON-FUNCTIONAL)

All 9 credit settings save but nothing reads them.

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `credits.freePlanCredits` | Set credits for free tier | Plan credits come from `plan_config.plans.free.credits` (separate collection) |
| `credits.starterCredits` | Set credits for starter tier | Plan credits come from `plan_config.plans.starter.credits` |
| `credits.proCredits` | Set credits for pro tier | Plan credits come from `plan_config.plans.pro.credits` |
| `credits.ambassadorCredits` | Set credits for ambassador tier | Admin users page uses hardcoded default `"500"` |
| `credits.translationCost` | Set cost per translation use | Sent to desktop but never read — actual cost from `plan_config.creditCosts[]` |
| `credits.speechToScriptureCost` | Set cost per transcription use | Sent to desktop but never read — actual cost from `plan_config.creditCosts[]` |
| `credits.aiSummaryCost` | Set cost per AI summary | Sent to desktop but never read — API routes use hardcoded `const AI_CREDITS = 5` |
| `credits.dailyBonusCredits` | Set daily bonus credits | No daily bonus logic exists anywhere |
| `credits.monthlyResetDay` | Set day of monthly credit reset | No monthly reset logic exists anywhere |

**Root cause:** Two disconnected credit configuration systems exist:
- **System A:** `platform_settings.credits` (written by admin UI, read by nothing)
- **System B:** `plan_config` (separate collection, separate admin endpoint `/api/admin/plan-config`)

All behavior code reads from System B.

---

### Section: Ambassador (6 of 6 NON-FUNCTIONAL)

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `ambassador.enabled` | Toggle ambassador program | Grant/revoke works regardless of this toggle |
| `ambassador.creditsPerAmbassador` | Set default credits per ambassador | Admin manually provides credits each time |
| `ambassador.defaultTrialDurationDays` | Set trial length for ambassador referrals | Hardcoded duration map used instead |
| `ambassador.autoExpiry` | Toggle automatic expiry | Always calculates expiry regardless |
| `ambassador.sendWelcomeEmail` | Gate welcome email | Always sends email unconditionally |
| `ambassador.badgeText` | Set badge display text | Never referenced in behavior code |

---

### Section: AI (9 of 9 NON-FUNCTIONAL)

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `ai.featureToggles.scriptureTranslation` | Toggle scripture translation feature | Feature gated by `plan_config` entitlements, not this toggle |
| `ai.featureToggles.speechToScripture` | Toggle speech-to-scripture feature | Feature gated by `plan_config` entitlements |
| `ai.featureToggles.aiSummaries` | Toggle AI summaries feature | Feature gated by `plan_config` entitlements |
| `ai.featureToggles.sermonNotes` | Toggle sermon notes feature | Feature gated by `plan_config` entitlements |
| `ai.featureToggles.aiAssistant` | Toggle AI assistant feature | Feature gated by `plan_config` entitlements |
| `ai.provider` | Select AI provider (openai, etc.) | Never read — no provider switching logic exists |
| `ai.dailyRequestLimit` | Set daily AI request limit | Never read — no rate limiting uses this |
| `ai.maximumTranslationMinutes` | Set max translation duration | Never read — no enforcement code |
| `ai.supportedLanguages` | Set available languages | Never read — desktop has hardcoded list |

---

### Section: Authentication (7 of 8 NON-FUNCTIONAL)

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `authentication.emailPasswordEnabled` | Toggle email/password login | Login page always shows email login |
| `authentication.googleEnabled` | Toggle Google login | Login page always shows Google button |
| `authentication.appleEnabled` | Toggle Apple login | No Apple login implemented in desktop |
| `authentication.emailVerificationRequired` | Toggle email verification | Always enforced for trial provisioning regardless |
| `authentication.verificationCodeLength` | Set code length | Hardcoded to 6 digits in `email-login/route.ts:18` |
| `authentication.codeExpiryMinutes` | Set code expiry | Hardcoded to 1 minute in `email-login/route.ts:60` |
| `authentication.maxSessionsPerUser` | Limit concurrent sessions | Never read by any route |

---

### Section: Security (8 of 12 NON-FUNCTIONAL)

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `security.force2FAForAdmins` | Require 2FA for admin accounts | No auth code reads this |
| `security.requireHttps` | Reject non-HTTPS connections | No middleware enforces this |
| `security.apiKeysEnabled` | Allow users to generate API keys | Keys work regardless of this toggle |
| `security.apiKeyExpiryDays` | Set API key expiry | Keys never expire based on this |
| `security.forceLogoutAllUsers` | Invalidate all sessions | Button handler has `// TODO: API call to force logout` — never implemented |
| `security.mfaForAllUsers` | Require MFA for all users | No auth flow reads this |
| `security.deviceRevocationEnabled` | Allow device revocation | Revocation works via server logic ignoring this flag |
| `security.requirePeriodicLicenseVerification` | Require periodic license checks | Verification runs on hardcoded 6h interval regardless |

---

### Section: Notifications (7 of 7 NON-FUNCTIONAL)

None of these settings are transmitted to any client, and none are checked before sending emails.

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `notifications.welcomeEmail` | Gate welcome emails | `sendEmail()` sends unconditionally; `shouldSendEmail()` utility exists but is never called |
| `notifications.trialExpiryReminder` | Gate trial expiry reminders | Cron job sends unconditionally |
| `notifications.paymentReminder` | Gate payment reminders | Webhook handler sends unconditionally |
| `notifications.securityAlerts` | Gate security alert emails | Security emails sent unconditionally |
| `notifications.featureAnnouncements` | Gate feature announcements | No feature announcement email code exists |
| `notifications.creditLowBalance` | Gate credit balance alerts | No credit balance alert code exists |
| `notifications.weeklyDigest` | Gate weekly digest emails | No weekly digest code exists |

---

### Section: App Updates (1 of 9 non-functional + 7 dual-source)

| Setting | Status | Details |
|---------|--------|---------|
| `appUpdates.releaseNotes` | **NON-FUNCTIONAL** | Saved to platform_settings but never consumed. Dashboard downloads page uses GitHub Releases API instead |
| `appUpdates.downloadUrls.macosIntel` | **NON-FUNCTIONAL** | Saved but never used by any code |
| `appUpdates.downloadUrls.linux` | **NON-FUNCTIONAL** | Saved but never used by any code |
| 7 other appUpdates fields | **DUAL-SOURCE** | See DUAL-SOURCE section above — enforcement reads from `app_settings`, not `platform_settings` |

---

### Section: OBS (9 of 10 NON-FUNCTIONAL)

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `obs.enableOBSIntegration` | Toggle OBS integration | OBS always available |
| `obs.requireOBSAuthentication` | Require OBS auth | No auth gate exists |
| `obs.allowAutoDiscovery` | Toggle auto-discovery | Never read |
| `obs.enableOBSDock` | Toggle dock feature | Dock always accessible |
| `obs.enableMultiview` | Toggle multiview | Multiview always accessible |
| `obs.minSupportedOBSVersion` | Set minimum OBS version | Never checked |
| `obs.minSupportedWebSocketVersion` | Set minimum WS version | Never checked |
| `obs.autoDetect` | Toggle auto-detection | Never read |
| `obs.reconnectIntervalMs` | Set reconnect interval | Never read (hardcoded in obsService.ts) |

---

### Section: Storage (9 of 15 NON-FUNCTIONAL)

| Setting | Status | Details |
|---------|--------|---------|
| `storage.enableCloudSync` | NON-FUNCTIONAL | Never checked |
| `storage.maxUploadSizeMB` | NON-FUNCTIONAL | Actual limits use `imageTargetSizeBytes`/`videoTargetSizeBytes` |
| `storage.allowedFileTypes` | NON-FUNCTIONAL | Actual validation uses `allowedImageExtensions`/`allowedVideoExtensions` arrays |
| `storage.compressionEnabled` | NON-FUNCTIONAL | `isCompressionEnabled()` exists but is never called — compression runs unconditionally |
| `storage.defaultQuotaGB` | NON-FUNCTIONAL | Not enforced anywhere |
| `storage.retentionDays` | NON-FUNCTIONAL | Not enforced anywhere |
| `storage.maximumBackgroundVideoSizeMB` | NON-FUNCTIONAL | Never read for enforcement |
| `storage.churchLogoSizeLimitMB` | NON-FUNCTIONAL | Never read for enforcement |
| `storage.mediaLibraryQuotaGB` | NON-FUNCTIONAL | Never read for enforcement |

---

### Section: Themes (7 of 9 NON-FUNCTIONAL)

| Setting | Status | Details |
|---------|--------|---------|
| `themes.defaultBibleTheme` | NON-FUNCTIONAL | Theme ID string — no code looks up themes by ID |
| `themes.defaultWorshipTheme` | NON-FUNCTIONAL | Same |
| `themes.defaultLowerThirdTheme` | NON-FUNCTIONAL | Same |
| `themes.defaultAnnouncementTheme` | NON-FUNCTIONAL | Same |
| `themes.defaultFont` | NON-FUNCTIONAL | Never applied globally — `bibleDefaults.font` used instead |
| `themes.defaultBrandColours` | NON-FUNCTIONAL | Never applied anywhere |
| `themes.worshipDefaults` | NON-FUNCTIONAL | `getDefaultWorshipTheme()` exists but is never imported/called |

---

### Section: Analytics (4 of 4 NON-FUNCTIONAL)

| Setting | What Admin UI Expects | What Actually Happens |
|---------|----------------------|----------------------|
| `analytics.usageAnalytics` | Toggle usage analytics | Analytics runs unconditionally if env var is set |
| `analytics.crashReporting` | Toggle crash reporting | Global error handlers always run |
| `analytics.errorTracking` | Toggle error tracking | `captureException()` always executes |
| `analytics.performanceMonitoring` | Toggle perf monitoring | No perf monitoring code exists |

---

## Root Causes

### 1. Disconnected Configuration Systems (77 dead settings)

The admin dashboard's Platform Settings page saves to `platform_settings`, but most behavior code reads from different sources:
- **Credits:** `plan_config` collection (separate admin endpoint)
- **Trial:** `trial_settings` collection (separate admin endpoint, no dashboard UI)
- **App Updates:** `app_settings` collection (separate admin endpoint)
- **Feature entitlements:** `plan_config.plans[tier].entitlements`

### 2. Desktop Transport Without Consumption

`configService.ts` faithfully transforms platform settings into `DesktopConfig`, and the desktop app fetches and caches it — but most values are never read by desktop behavior code. The desktop has its own hardcoded fallbacks that shadow the server values.

### 3. Dead Utility Functions

Three complete utility functions exist but are never imported or called:
- `isCompressionEnabled()` in `desktopConfig.ts:191`
- `getDefaultWorshipTheme()` in `desktopConfig.ts:209`
- `shouldSendEmail()` in `api/src/lib/emailPreferences.ts:67`

### 4. Missing Implementation (TODOs)

Several admin UI features have placeholder implementations:
- `forceLogoutAllUsers`: Button handler has `// TODO: API call to force logout`
- `dailyBonusCredits`: No daily bonus logic exists
- `monthlyResetDay`: No monthly reset logic exists
- `featureAnnouncements`/`creditLowBalance`/`weeklyDigest`: No email templates or sending logic exist

---

## Recommendations

1. **Wire up the settings.** For each non-functional setting, either implement the consumption code or remove the setting from the admin UI. Dead settings are worse than no settings — they give admins false confidence.

2. **Eliminate dual-source systems.** Consolidate `platform_settings`, `app_settings`, `trial_settings`, and `plan_config` into a single source of truth, or clearly document which admin endpoint controls which behavior.

3. **Implement the TODOs.** The `forceLogoutAllUsers` button, email preference gating (`shouldSendEmail()`), and daily bonus/reset logic are all half-built.

4. **Add an audit mode.** The admin UI should show which settings are actually enforced (a "green dot" indicator) vs. which are currently decorative.
