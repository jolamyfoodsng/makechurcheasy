# Feature Entitlement Matrix

This matrix maps plan-controlled features to the entitlement checks that must be used everywhere in MakeChurchEasy.

| Feature | Required Plan | Source Entitlement | Frontend Check | Backend Check |
|---|---|---|---|---|
| Songs | Free limit 3, Basic limit 50, Growth/Pro unlimited | `PLAN_ENTITLEMENTS[plan].maxSongs` | `checkEntitlementSync("songs", effectivePlan, currentCount)` | Local DB / route-specific count enforcement |
| Images | Free limit 3, Basic limit 50, Growth/Pro unlimited | `PLAN_ENTITLEMENTS[plan].maxImages` | `checkEntitlementSync("images", effectivePlan, currentCount)` | Route-specific count enforcement |
| Videos | Free limit 2, Basic limit 50, Growth/Pro unlimited | `PLAN_ENTITLEMENTS[plan].maxVideos` | `checkEntitlementSync("videos", effectivePlan, currentCount)` | Route-specific count enforcement |
| Bible Versions | Free limit 3, Basic limit 10, Growth/Pro unlimited | `PLAN_ENTITLEMENTS[plan].maxBibleVersions` | `checkEntitlementSync("bibleVersions", effectivePlan, currentCount)` | Route-specific count enforcement |
| Devices | Free limit 1, Basic limit 3, Growth/Pro limit 10 | `PLAN_ENTITLEMENTS[plan].maxDevices` | `checkEntitlementSync("devices", effectivePlan, currentCount)` | Device registration / profile routes |
| Team Members | Free limit 3, Basic limit 5, Growth/Pro limit 20 | `PLAN_ENTITLEMENTS[plan].maxTeams` | Dashboard/team UI count checks | `api/src/app/api/team/members/*.ts` |
| Credits | Free 50, Basic 300, Growth 1000, Pro 3000 | `PLAN_ENTITLEMENTS[plan].credits` | Credit guards + premium action checks | credit reservation / check-access routes |
| Tickers | Basic+ | `PLAN_ENTITLEMENTS[plan].tickers` | `checkEntitlementSync("tickers", effectivePlan)` | OBS/dock action enforcement |
| Lower Thirds | Basic+ | `PLAN_ENTITLEMENTS[plan].lowerThirds` | `checkEntitlementSync("lowerThirds", effectivePlan)` | `api/src/app/api/themes/route.ts` for lower-third theme creation |
| Multiview | Basic+ | `PLAN_ENTITLEMENTS[plan].multiview` | `FeatureGuard feature="multiview"`, `checkEntitlementSync("multiview", effectivePlan)` | Premium action / route gate |
| Remote Control | Growth+ | `PLAN_ENTITLEMENTS[plan].remoteControl` | Derived mobile/remote UI checks | Canonical feature checks for remote workflows |
| Mobile Controller | Growth+ | `PLAN_ENTITLEMENTS[plan].mobileSupport` | Derived `mobileControl` checks in desktop/dock | Canonical feature checks for remote workflows |
| Bulk Import | Growth+ | `PLAN_ENTITLEMENTS[plan].bulkImport` | `checkEntitlementSync("massImport", effectivePlan)` | Import route/action validation |
| EasyWorship Import | Growth+ | `PLAN_ENTITLEMENTS[plan].easyWorshipImport` | `checkEntitlementSync("easyWorshipImport", effectivePlan)` | Import route/action validation |
| ProPresenter Import | Growth+ | `PLAN_ENTITLEMENTS[plan].propresenterImport` | `checkEntitlementSync("proPresenterImport", effectivePlan)` | Import route/action validation |
| Cloud Sync | Growth+ | `PLAN_ENTITLEMENTS[plan].cloudSync` | Cloud sync UI + dock prompts | `api/src/app/api/cloud-sync/*.ts` |
| Translation | Growth+ | derived legacy entitlement from canonical plan | `checkEntitlementSync("translation", effectivePlan)` and `checkPremiumAccess("translation")` | `api/src/app/api/device/check-access/route.ts` |
| Speech to Scripture | Growth+ | derived legacy entitlement from canonical plan | `checkEntitlementSync("speechToScripture", effectivePlan)` and `checkPremiumAccess("speechToScripture")` | `api/src/app/api/device/speech-to-scripture/check-access/route.ts` |
| AI Features | Growth+ | derived legacy entitlement from canonical plan | `checkEntitlementSync("aiFeatures", effectivePlan)` and `checkPremiumAccess(...)` | `api/src/app/api/ai/*.ts` |
| Advanced Analytics | Pro | derived legacy entitlement from canonical plan | `checkEntitlementSync("advancedAnalytics", effectivePlan)` | `api/src/app/api/user/analytics/route.ts` |
| Custom Reports | Pro | derived legacy entitlement from canonical plan | `checkEntitlementSync("customReports", effectivePlan)` | Route-specific report checks |
| Priority Support | Pro | `PLAN_ENTITLEMENTS[plan].prioritySupport` | Plan/billing UI only | Canonical feature check where support workflows exist |
| Priority Feature Requests | Pro | `PLAN_ENTITLEMENTS[plan].priorityFeatureRequests` | Plan/billing UI only | Canonical feature check where request workflows exist |
| Early Access Features | Pro | `PLAN_ENTITLEMENTS[plan].earlyAccessFeatures` | Feature flags must also check plan | Canonical feature check where early-access routes exist |

## Rules

1. Always resolve the user through `getEffectivePlan(user)`.
2. Never gate a feature with `user.plan !== "free"`, `isPremium`, or `licenseValid`.
3. UI checks must stop interaction.
4. Backend checks must reject bypassed requests.
5. Dock actions must use the same entitlement engine as the main desktop app.
