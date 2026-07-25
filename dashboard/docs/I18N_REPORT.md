# i18n Groundwork Report — MakeChurchEasy

## Overview

Complete internationalization (i18n) groundwork for the MakeChurchEasy dashboard application. All user-facing UI strings have been extracted into a centralized English translation file (`src/locales/en.json`) and replaced with `t()` translation calls throughout the codebase. **English-only for now — no other languages added.**

## Statistics

| Metric | Count |
|--------|-------|
| **Total translation keys** | 2,210 |
| **Translation namespaces** | 35 |
| **TSX/TS files modified** | 55+ |
| **`t()` call sites** | ~1,800+ |
| **Build status** | ✅ Passing |

## Namespace Breakdown

| Namespace | Keys | Description |
|-----------|------|-------------|
| `common` | 111 | Shared UI strings (buttons, labels, status) |
| `navigation` | 18 | Sidebar and topbar navigation items |
| `pageTitles` | 24 | Page titles and meta |
| `auth` | 77 | Login, signup, forgot password, Firebase actions, 2FA |
| `landing` | 10 | Landing/marketing page |
| `dashboard` | 125 | Dashboard page and widgets |
| `trial` | 29 | Trial-related strings |
| `settings` | 144 | Account settings, email, Google, deactivate |
| `security` | 164 | Security page, sessions, password, 2FA |
| `subscription` | 174 | Subscription plans and change plan |
| `billing` | 85 | Billing and invoices |
| `credits` | 69 | AI credits management |
| `creditsHistory` | 43 | Credit transaction history |
| `devices` | 42 | Device management |
| `churchProfile` | 41 | Church profile setup |
| `community` | 42 | Community features |
| `support` | 26 | Support page |
| `tutorials` | 34 | Tutorials page |
| `downloads` | 5 | Downloads page |
| `error` | 10 | Error pages |
| `device` | 54 | Device pairing flows |
| `pair` | 32 | Pairing code pages |
| `admin` | 413 | Admin dashboard (all 13 settings sections) |
| `unsavedChanges` | 4 | Unsaved changes guard |
| `confirmDialog` | 2 | Confirmation dialog |
| `input` | 1 | Input component |
| `errorScreen` | 3 | Error screen component |
| `countries` | 240 | Country names and codes |
| `changePlan` | 24 | Plan change flow |
| `invoice` | 30 | Invoice page |
| `profileSettings` | 25 | Profile settings |
| `communityExtended` | 35 | Community legacy page |
| `supportExtended` | 20 | Support legacy page |
| `tutorialsExtended` | 29 | Tutorials legacy page |
| `subscriptionExtended` | 25 | Subscription legacy page |

## Infrastructure

### Files Created
- `src/locales/en.json` — Master translation file (2,210 keys)
- `src/i18n/request.ts` — Server-side request config (`getRequestConfig`)
- `src/i18n/provider.tsx` — Client-side `NextIntlClientProvider` wrapper

### Files Modified
- `next.config.ts` — Wrapped with `createNextIntlPlugin`
- `app/layout.tsx` — Wrapped app with `NextIntlClientProvider`

### Architecture
- **Library:** `next-intl` (App Router compatible)
- **Server config:** `getRequestConfig` in `src/i18n/request.ts`
- **Client wrapper:** `NextIntlClientProvider` via `src/i18n/provider.tsx`
- **Component usage:** `useTranslations()` hook from `next-intl`

### Two `useTranslations` Patterns
1. **Full-key pattern:** `useTranslations()` with full keys like `t('dashboard.title')` — used in most pages/components
2. **Namespace pattern:** `useTranslations("admin")` with short keys like `t('title')` — used in admin settings sections

## Pages & Components Modified

### Dashboard Pages (app/)
- `/` — Sidebar, Topbar, TrialBanner, TrialWelcomeModal
- `/dashboard` — Main dashboard
- `/login` — Login page
- `/signup` — Signup page
- `/church-profile` — Church profile setup
- `/settings` — Account settings
- `/settings/email` — Change email
- `/settings/email/confirm` — Email confirmation
- `/settings/email/verified` — Email verified
- `/settings/google` — Google sign-in settings
- `/settings/deactivate` — Account deactivation
- `/security` — Security overview
- `/security/password` — Password management
- `/security/2fa` — Two-factor authentication
- `/security/sessions` — Active sessions management
- `/subscription` — Subscription overview
- `/subscription/plans` — Plan selection
- `/subscription/plans/new_plans_page` — New plans page
- `/billing` — Billing and invoices
- `/credits` — AI credits
- `/credits/history` — Credit transaction history
- `/devices` — Device management
- `/community` — Community features
- `/support` — Support page
- `/tutorials` — Tutorials page
- `/downloads` — Downloads page
- `/device` — Device pairing
- `/error/[type]` — Error pages
- `/auth/action` — Firebase auth action
- `/pair/mobile` — Mobile pairing
- `/pair/google` — Google pairing

### Admin Section Pages
- `/admin` — Admin dashboard
- `/admin/users` — User management
- `/admin/users/[id]` — User detail
- `/admin/analytics` — Analytics
- `/admin/audit-logs` — Audit logs
- `/admin/settings` — Admin settings
- `/admin/settings/sections/` — All 13 sections (AI Settings, Ambassador, Analytics, App Updates, Authentication, Credits, Developer, Notifications, OBS Settings, Security, Storage, Themes, Trial)

### Shared Components
- `src/components/Sidebar.tsx`
- `src/components/Topbar.tsx`
- `src/components/TrialBanner.tsx`
- `src/components/TrialWelcomeModal.tsx`
- `src/components/ErrorScreen.tsx`
- `src/components/ui/Input.tsx`
- `src/lib/useUnsavedChanges.tsx`

### Legacy Pages (react-router-dom)
- `src/components/legacy-pages/ChangePlan.tsx`
- `src/components/legacy-pages/Community.tsx`
- `src/components/legacy-pages/Invoice.tsx`
- `src/components/legacy-pages/ProfileSettings.tsx`
- `src/components/legacy-pages/Subscription.tsx`
- `src/components/legacy-pages/Support.tsx`
- `src/components/legacy-pages/Tutorials.tsx`

## Exclusions (by Design)

The following strings were intentionally **NOT** extracted:
- Bible verse content and references
- User-generated content (church names, sermon titles, etc.)
- Technical identifiers and API strings
- Firebase config values
- CSS class names and color values
- Dynamic data from database (member names, timestamps, etc.)

## How to Add a New Language

1. Copy `src/locales/en.json` to `src/locales/{locale}.json`
2. Translate all values in the new file
3. Add the locale to the `locales` array in `src/i18n/request.ts`
4. Add locale switching UI in settings/navigation

## How to Add New Translations

1. Add the key and English value to `src/locales/en.json` under the appropriate namespace
2. In your component, add `const t = useTranslations()` (or with namespace)
3. Replace hardcoded string with `t('namespace.key')` or `t('key')`

## Strings Still Hardcoded (Edge Cases)

A small number of strings remain hardcoded where extraction would break functionality:
- **Regex patterns and validation strings** — Used in code logic, not displayed to users
- **Date/time format tokens** — Locale-dependent formatting strings
- **CSS values** — Colors, sizes, spacing
- **Component prop defaults** — Internal values never shown to users
