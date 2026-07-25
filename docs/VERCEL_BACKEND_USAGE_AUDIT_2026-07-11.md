# Vercel Backend Usage Audit

Date: 2026-07-11

Scope audited:

- `api/` Next.js route handlers, middleware, cron routes, webhook routes
- `dashboard/` frontend polling and API consumers
- `desktop/` startup flows, auth/session/license checks, credits sync, usage sync, config refresh, dock fallback flows
- Search terms used across the codebase: `setInterval`, `setTimeout`, `fetch(`, `axios`, `refetchInterval`, `polling`, `retry`, `useEffect`, `invalidateQueries`, `refetchQueries`, `router.refresh`, `heartbeat`, `health`, `ping`, `subscription`, `license`, `session`, `auth`, `usage`, `credits`, `analytics`

High-level conclusions:

1. The main Vercel invocation pressure came from the desktop app, not middleware.
2. The worst offender was a 5-second credits poll hitting `/api/user/credits`.
3. The second worst offender was the desktop auth heartbeat polling two routes every 30 seconds: `/api/device/check` and `/api/device/profile`.
4. A cache bug caused several config/pricing helpers to return cached data while still issuing background fetches on every read.
5. Additional repeated traffic came from forced-update polling, usage sync, pairing polling, notification polling, and dock online-auth fallback.
6. `api/src/middleware.ts` was already restricted to `/api/:path*`; middleware was not the main source.
7. No React Query / TanStack Query usage was found in the app surfaces audited.

## Primary Root Causes

- `desktop/src/components/CreditsDisplay.tsx` polled credits every 5 seconds.
- `desktop/src/contexts/AuthContext.tsx` polled account state every 30 seconds and used two backend routes per cycle.
- `desktop/src/App.tsx` polled desktop config / forced-update state every 60 seconds.
- `desktop/src/services/desktopConfig.ts`, `desktop/src/services/planConfig.ts`, `dashboard/src/lib/planConfigService.ts`, and `desktop/src/hooks/useCountryPricing.ts` were revalidating on every cache read instead of only when stale.
- `desktop/src/services/usageSync.ts` posted usage on a fixed timer even when the app was hidden.
- `dashboard/src/lib/usePairingCode.ts` and `dashboard/src/components/UserNotificationsBell.tsx` kept polling on the dashboard side.

## Audit Table

| File | Function or route | How often it runs | Trigger | Repeated request risk | Recommended fix / status |
| --- | --- | --- | --- | --- | --- |
| `desktop/src/components/CreditsDisplay.tsx` | credits sync via `/api/user/credits` | Old: every 5s while mounted. New: on mount, visible tab restore, every 10m while visible | Credits badge mounted in app UI | Very high | Fixed. Removed 5s polling; now uses event-driven updates plus low-frequency refresh. |
| `desktop/src/contexts/AuthContext.tsx` | account heartbeat via `/api/device/check` + `/api/device/profile` | Old: every 30s, 2 requests per cycle. New: every 5m, 1 request via `/api/device/bootstrap`, visible only | Authenticated desktop session | Very high | Fixed. Consolidated to one bootstrap route and slowed cadence. |
| `api/src/app/api/device/profile/route.ts` | desktop account/profile route | Called by old desktop heartbeat and internet verification | Desktop auth refresh | High | Reduced from caller side. Added cache header and structured logging. Legacy route still exists and should be monitored. |
| `api/src/app/api/device/check/route.ts` | device existence heartbeat | Called by old desktop heartbeat | Desktop auth refresh | High | Reduced from caller side. Added structured logging. |
| `api/src/app/api/device/bootstrap/route.ts` | consolidated desktop bootstrap | New shared account/bootstrap route | Desktop auth refresh, dock online fallback, internet verification | Medium | Added to replace dual-route polling; returns user + plan + credits in one request. |
| `desktop/src/App.tsx` | forced-update/config refresh via `/api/config/desktop` | Old: every 60s. New: every 5m while visible | App running after splash | High | Fixed. Lowered frequency and skip when hidden. |
| `desktop/src/main.tsx` | config refresh via `/api/config/desktop` | Every 5m plus focus/online refresh | Desktop startup/runtime | Medium | Kept 5m baseline, but now skips while hidden and reuses shared helper. |
| `desktop/src/services/desktopConfig.ts` | desktop config cache | Every call could trigger background refetch even when fresh | Any consumer reading cached desktop config | High fan-out | Fixed. Only revalidates when stale. |
| `desktop/src/services/planConfig.ts` | plan config cache | Every call could trigger background refetch even when fresh | Any consumer reading cached plan config | High fan-out | Fixed. Only revalidates when stale. |
| `dashboard/src/lib/planConfigService.ts` | dashboard plan config cache | Every call could trigger background refetch even when fresh | Dashboard subscription/pricing views | Medium | Fixed. Only revalidates when stale. |
| `desktop/src/hooks/useCountryPricing.ts` | `/api/pricing/country` | Every hook load plus accidental background refreshes on cached reads | Pricing UI render | Medium | Fixed. Only revalidates when stale. |
| `desktop/src/services/credits.ts` | credits fetch helper | Called by credits UI and sync flows | Credits display / offline queue reconciliation | High | Fixed. Added request deduplication, bounded retry, 5-minute remote cache window, and snapshot hydration from bootstrap. |
| `desktop/src/services/authService.ts` | desktop account refresh | Called on startup and auth refresh | Desktop auth/session lifecycle | High | Fixed. Added deduplicated `/api/device/bootstrap` helper; also hydrates credits from bootstrap response. |
| `desktop/src/dock/DockAuthGate.tsx` | online auth fallback for OBS dock | Old: every 3s while blocked and used two backend requests. New: every 15s and 1 bootstrap request | Dock blocked/unpaired state | Medium | Fixed. Reduced cadence and removed second route call. |
| `dashboard/src/lib/usePairingCode.ts` | `/api/pairing/poll` | Old: every 3s. New: every 5s, visible only | Desktop pairing flow | Medium | Fixed. Slower polling and paused when hidden. |
| `api/src/app/api/pairing/poll/route.ts` | pairing status poll route | Polled during active pairing only | Dashboard/device pairing | Medium | Caller-side reduction applied. Route should still be monitored because pairing can fan out across many browser tabs. |
| `dashboard/src/components/UserNotificationsBell.tsx` | `/api/notifications` | Old: every 60s even when hidden. New: every 60s while visible, refresh-on-visible | Dashboard topbar bell | Low to medium | Fixed. Stop hidden-tab polling and refresh on visibility regain. |
| `desktop/src/services/usageSync.ts` | `/api/user/usage` | Old: every 5m always. New: every 15m while visible, plus explicit mutation-triggered sync | Desktop usage accounting | Medium | Fixed. Reduced background cadence and skip hidden windows. |
| `api/src/app/api/user/usage/route.ts` | desktop usage sync route | Every scheduled usage sync and mutation-triggered sync | Desktop usage accounting | Medium | Reduced from caller side. Still worth monitoring. |
| `desktop/src/services/licenseGuard.ts` | `/api/health` + `/api/device/license` | Every 6h plus every visibility regain | License/subscription enforcement | Medium | Fixed partially. Added 15-minute visibility throttle. Still a secondary invocation source. |
| `desktop/src/services/internetVerificationService.ts` | account verification | Every `verificationIntervalHours` plus startup | Offline grace-period enforcement | Low | Fixed partially. Moved to `/api/device/bootstrap` instead of `/api/device/profile`. |
| `api/src/app/api/config/desktop/route.ts` | public desktop config | Hit by startup/config/update flows | Desktop config consumers | Medium | Added cache headers and structured logging. |
| `api/src/app/api/plan-config/route.ts` | public plan config | Hit by desktop/dashboard plan loaders | Plan/pricing consumers | Medium | Added cache headers and structured logging. |
| `api/src/app/api/pricing/country/route.ts` | country pricing | Hit by pricing UI | Pricing screens | Medium | Added private cache headers, `Vary`, and structured logging. |
| `api/src/app/api/user/credits/route.ts` | user credits | Hit by credits UI | Desktop credits display and sync | High | Added private cache header and structured logging; caller-side polling drastically reduced. |
| `api/src/middleware.ts` | API middleware | Every `/api/*` request only | Any API request | Low | Matcher already narrow; not root cause. |
| `dashboard/middleware.ts` | dashboard middleware | Every `/api/*` request only | Dashboard API rewrites/CORS | Low | Matcher already narrow; not root cause. |
| `api/src/app/api/cron/*` | scheduled routes | Only on cron schedule | Vercel cron or external scheduler | Low | No every-minute abuse found in code review. Keep schedule review in Vercel. |
| `api/src/app/api/webhooks/*` | webhook routes | Event-driven only | External providers | Low | Not poll-driven. Validate signatures and monitor separately. |
| `desktop/src/components/ServiceMode.tsx`, `desktop/src/components/modules/BibleModule.tsx`, `desktop/src/components/modules/LowerThirdsModule.tsx`, `desktop/src/components/modules/WorshipModule.tsx`, `desktop/src/components/modules/TickerModule.tsx` | OBS polling | 2s to 3s local polls | OBS/live preview state | No Vercel impact | Local-only OBS traffic; not a serverless usage problem. |
| `desktop/src/dock/components/MobileCompanionModal.tsx` | Tauri mobile server status polling | Every 3s | Companion modal open | No Vercel impact | Local Tauri IPC only; no backend change needed. |

## Middleware Audit

- `api/src/middleware.ts` only matches `/api/:path*`.
- `dashboard/middleware.ts` only matches `/api/:path*`.
- Neither middleware is querying MongoDB.
- Static assets, `_next/static`, `_next/image`, and downloads are not being pushed through a broad middleware matcher here.

Conclusion: middleware is not the likely cause of the Vercel spike.

## React Query / Retry Audit

- No React Query / TanStack Query usage was found in the audited app surfaces.
- No `axios` usage was found in the audited runtime paths that mattered for this incident.
- A reusable deduplicated request + bounded retry helper was added in `desktop/src/services/requestDedup.ts`.
- Retry rules now cap retries, add jitter, and avoid unbounded loops.

## Changes Implemented

### Desktop / Dashboard request reductions

- Added `desktop/src/services/requestDedup.ts`.
- Replaced desktop dual-route heartbeats with `GET /api/device/bootstrap`.
- Removed 5-second credits polling.
- Lowered desktop forced-update polling from 60 seconds to 5 minutes.
- Lowered dashboard pairing polling from 3 seconds to 5 seconds and stop while hidden.
- Stopped dashboard notifications polling when hidden.
- Lowered dock blocked-state online fallback from 3 seconds to 15 seconds.
- Reduced usage sync from every 5 minutes to every 15 minutes and only while visible.
- Throttled license guard visibility-triggered rechecks to at most once every 15 minutes.

### Cache behavior fixes

- Fixed stale-while-revalidate helpers so they do not fetch on every cached read:
  - `desktop/src/services/desktopConfig.ts`
  - `desktop/src/services/planConfig.ts`
  - `dashboard/src/lib/planConfigService.ts`
  - `desktop/src/hooks/useCountryPricing.ts`

### Backend changes

- Added `api/src/app/api/device/bootstrap/route.ts`.
- Added `api/src/lib/requestMonitoring.ts`.
- Added structured logging to:
  - `/api/device/bootstrap`
  - `/api/device/check`
  - `/api/device/profile`
  - `/api/user/credits`
  - `/api/config/desktop`
  - `/api/plan-config`
  - `/api/pricing/country`
- Added cache headers to:
  - `/api/user/credits`
  - `/api/config/desktop`
  - `/api/plan-config`
  - `/api/pricing/country`
  - `/api/device/profile`
  - `/api/device/bootstrap`

## Old vs New Polling

| Source | Old | New |
| --- | --- | --- |
| Desktop credits badge | 5 seconds | 10 minutes while visible + mount/visibility refresh |
| Desktop auth heartbeat | 30 seconds, 2 routes | 5 minutes, 1 route |
| Forced update/config refresh | 60 seconds | 5 minutes while visible |
| Dock blocked online fallback | 3 seconds | 15 seconds |
| Dashboard pairing poll | 3 seconds | 5 seconds while visible |
| Dashboard notifications bell | 60 seconds even when hidden | 60 seconds while visible only |
| Desktop usage sync | 5 minutes always | 15 minutes while visible + explicit mutation sync |
| License guard visibility refetch | every visibility regain | at most once every 15 minutes |

## Estimated Impact

Assumption set used for estimation:

- 5 active desktop operators
- 6 visible app hours per operator per day
- 30-day month

Estimated request reduction per operator per day:

- Credits polling: old `720/hour * 6 = 4320`, new about `6/hour * 6 + 2 = 38`, reduction `4282`
- Auth heartbeat: old `240/hour * 6 = 1440`, new about `12/hour * 6 + 2 = 74`, reduction `1366`
- Forced update polling: old `60/hour * 6 = 360`, new `12/hour * 6 = 72`, reduction `288`
- Usage sync: old `12/hour * 6 = 72`, new `4/hour * 6 = 24`, reduction `48`

Estimated total reduction:

- Old requests per session per day: about `6192`
- New requests per session per day: about `208`
- Difference per session per day: about `5984`
- Estimated active users: `5`
- Estimated monthly reduction: `5984 * 5 * 30 = 897,600` fewer function invocations

CPU estimate:

- The removed traffic was concentrated on heavier authenticated routes (`/api/user/credits`, `/api/device/profile`, `/api/device/check`, `/api/config/desktop`).
- A reasonable expectation is roughly `65%` to `85%` lower serverless CPU on this workload.
- Against the current `4h 53m` Fluid CPU figure, that suggests a reduction of roughly `3h 10m` to `4h 10m`, which should move usage back below the free-tier CPU limit if these routes were the main source.

## Remaining Routes To Monitor

- `/api/device/bootstrap`
- `/api/device/license`
- `/api/user/credits`
- `/api/user/usage`
- `/api/config/desktop`
- `/api/pairing/poll`
- `/api/notifications`

## Verification Steps In Vercel

1. Deploy this branch.
2. In Vercel Usage, compare the next 24-48 hours against the prior period.
3. Check Function Invocations by route and confirm drops on:
   - `/api/user/credits`
   - `/api/device/profile`
   - `/api/device/check`
   - `/api/config/desktop`
4. Inspect function logs for new `api_request` and `slow_request` JSON events.
5. Confirm there are no sustained spikes from hidden desktop windows or blocked OBS docks.
6. Watch for any unexpected growth on `/api/device/license` and `/api/user/usage`; those are now secondary candidates if usage remains high.

## Tests Performed

- `api`: `npm run build`
- `dashboard`: `npm run build`
- `desktop`: `npm run build`

All three builds completed successfully after the changes.
