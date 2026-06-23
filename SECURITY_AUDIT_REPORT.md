# MakeChurchEasy Security Audit Report

**Date:** June 19, 2026
**Scope:** Full codebase (Tauri desktop app, Next.js web backend, HTML overlays, Cloudflare Worker)
**Findings:** 6 Critical, 8 High, 7 Medium, 5 Low

---

## Executive Summary

The MakeChurchEasy codebase has **critical security vulnerabilities** that need immediate attention. The most urgent issue is that **nearly every web API endpoint lacks authentication**, allowing any internet user to read, modify, or delete any user's data, credits, and subscriptions by simply guessing or enumerating user IDs. Additionally, hardcoded credentials in HTML overlay files and an unprotected .env file on disk represent active secret exposure risks.

---

## CRITICAL SEVERITY (6 findings)

### C1. No Authentication on API Routes — Full IDOR Exposure

**Every mutating API endpoint in the web backend accepts a `userId` parameter from the request body/query without verifying the caller's identity.** An attacker can enumerate MongoDB ObjectIds (which are sequential) and perform any operation on any user account.

| Endpoint | Method | Vulnerability |
|----------|--------|---------------|
| `/api/user` | GET, PATCH, DELETE | Read/update/delete any user profile |
| `/api/user/credits` | GET, PATCH | Read/set any user's credit balance |
| `/api/credit-transactions/deduct` | POST | Deduct credits from any user |
| `/api/subscriptions` | GET, POST | Read/modify any user's subscription |
| `/api/church-profile` | GET, PUT | Read/modify any church profile |
| `/api/upload` | POST | Unauthenticated file upload |

**Impact:** Full account takeover, credit theft, subscription manipulation, data exfiltration.
**Fix:** Add `getAuthUser()` verification to every API route. See C2 for why the existing helper is insufficient.

### C2. `getUserIdFromRequest()` Fallback Defeats Authentication

**File:** `web/src/lib/auth.ts` (lines 108-116)

```typescript
export async function getUserIdFromRequest(req: Request): Promise<string | null> {
  const authUser = await getAuthUser();
  if (authUser?.mongoUser?._id) {
    return authUser.mongoUser._id.toString();
  }
  // Fallback: userId query param (for device-based requests)
  const url = new URL(req.url);
  return url.searchParams.get("userId");
}
```

Any route using this "auth helper" is trivially bypassed by passing `?userId=<target>` in the request.
**Fix:** Remove the fallback entirely, or add a cryptographic device signature verification for device-based requests.

### C3. Hardcoded Firebase Credentials in Overlay HTML

**File:** `lower_thirds/app.overlays.uno/control/5y3cuKma5r46k8wwuzsYLG.html`

Contains:
- Firebase API key: `AIzaSyAio3OzdJyS0XSVm8_AiUqa7Ux5z716RrA`
- Firebase project: `fiery-torch-2122`
- Full Firebase Admin JWT token (service account identity exposed)
- Singular Live access token: `5y3cuKma5r46k8wwuzsYLG`

**Impact:** Anyone with this file can control the Singular Live overlay and access the Firebase project.
**Fix:** Rotate all exposed credentials. Move to runtime-fetched tokens.

### C4. Hardcoded Firebase Credentials on Disk

**File:** `web/new_makechurcheasy/.env`

Contains live Firebase credentials for project `easybiblemount`:
- API Key: `AIzaSyAuqCQOBAPuWZbzZ8YYRuW2gkwcD24hXPE`
- Full Firebase config (auth domain, project ID, storage bucket, app ID)

While gitignored, these credentials are exposed on disk and need rotation.

### C5. User PII Stored in Repo Directory

**File:** `makechurcheasy-session.json`

Contains: full name, email, user ID, device ID of an actual user. While gitignored, this file should not exist in the repo directory.

### C6. Credit System Bypass via Offline Fallback

**File:** `src/services/credits.ts` (lines 82-86)

```typescript
// Other server error — fall back to local deduction
return deductCredits(amount);
```

When the backend is unreachable, credits are deducted only in localStorage. A user can disconnect network, manipulate localStorage, and use the app without paying.
**Fix:** Never fall back to local credit deduction. Require server confirmation.

---

## HIGH SEVERITY (8 findings)

### H1. Firebase Auth Cookie Set Without `httpOnly`

**Files:** `web/src/components/AuthProvider.tsx` (line 66), `web/new_makechurcheasy/src/contexts/AuthContext.tsx` (line 64)

```typescript
document.cookie = `fb-token=${token}; path=/; max-age=...; SameSite=Lax`;
```

Client-side cookie writes cannot set `httpOnly`, making the Firebase token accessible to XSS.
**Fix:** Remove client-side cookie writes. Use only server-side `setAuthCookie()` from `auth.ts`.

### H2. Desktop Auth Session in localStorage

**File:** `src/services/authService.ts` (lines 29, 38)

Full auth session (user object, deviceId, expiry) stored in localStorage, accessible to any XSS.
**Fix:** Use Tauri's secure storage plugin or OS keychain.

### H3. OBS Password Passed via URL Query Parameter

**File:** `src/dock/dockObsClient.ts`

OBS WebSocket password visible in browser history, logs, referrer headers.
**Fix:** Pass via POST body, header, or Tauri secure storage.

### H4. Wildcard CORS on Pairing/Device Endpoints

**Files:** `web/src/app/api/pairing/poll/route.ts`, `pairing/stream/route.ts`, `device/check/route.ts`

```typescript
"Access-Control-Allow-Origin": "*",
```

These override the middleware CORS policy, allowing any website to make cross-origin requests.
**Fix:** Remove `Access-Control-Allow-Origin: *` and let the middleware handle CORS.

### H5. `innerHTML` with BroadcastChannel Data (XSS)

**Files:** `public/lower-third-overlay.html`, `public/bible-overlay-fullscreen.html`, `public/animated-lower-thirds/lower-thirds/browser-source.html`

HTML overlays receive data via BroadcastChannel and assign to `innerHTML` without sanitization. Template variable substitution (`{{variable}}`) injects values directly into HTML.
**Fix:** Sanitize all BroadcastChannel data before DOM insertion. Use `textContent` where possible.

### H6. `dangerouslySetInnerHTML` in Bible Search Results

**File:** `src/components/modules/BibleModule.tsx` (lines 1963-1967)

```tsx
dangerouslySetInnerHTML={{
  __html: r.snippet.replace(...)
}}
```

Bible search snippets rendered as raw HTML without sanitization.

### H7. Unauthenticated File Upload

**File:** `web/src/app/api/upload/route.ts`

Anyone can upload files to the server. Type/size validated but no auth.
**Fix:** Require Firebase token verification before accepting uploads.

### H8. No Rate Limiting on Auth Endpoints

**File:** `web/src/app/api/auth/signup/route.ts`

No rate limiting, no CAPTCHA on account creation. Enables mass account creation and abuse.

---

## MEDIUM SEVERITY (7 findings)

### M1. Console.log Data Exposure in Production

~884 `console.log`/`console.error` statements across the codebase. Client-side logs may leak sensitive data in production.

### M2. Hardcoded Production URLs

**Files:** `src/services/credits.ts`, `src/dock/DockAuthGate.tsx`, `ConnectionUrls.tsx`

Hardcoded Vercel deployment URL and internal network IP (`192.168.1.45`). Should use environment variables.

### M3. Tauri CSP Allows `unsafe-inline`

**File:** `src-tauri/tauri.conf.json`

```json
"script-src 'self' 'unsafe-inline'"
```

Weakens XSS protections in the Tauri webview context.

### M4. Dynamic External CSS Injection via BroadcastChannel

**File:** `public/lower-third-overlay.html` (lines 1460-1470)

`fontImports` array from BroadcastChannel data loads external stylesheets without validation.

### M5. Client-Side Pro License Validation

**File:** `src/services/proLicense.ts`

SHA-256 hashes of pro keys are embedded in the client bundle. Extractable from compiled binary.

### M6. MongoDB Fallback to Localhost

**File:** `web/scripts/setup-db.js`

`mongodb://localhost:27017/versecast` fallback. Low risk but indicates potential for misconfigured local development leaking into production.

### M7. BroadcastChannel as Control Channel for OBS Overlays

All OBS overlay files use BroadcastChannel for data transport. Same-origin pages (including XSS payloads) can inject messages and control what appears on the live broadcast.

---

## LOW SEVERITY (5 findings)

### L1. CSP Exposes Internal Service URLs
Tauri `connect-src` reveals AssemblyAI, GitHub, R2, PostHog, and other service endpoints.

### L2. Firebase Config in Client Bundle
Standard practice but reveals Firebase project structure.

### L3. MongoDB Aggregation with User Input
Aggregation pipelines use `userId` values. Currently safe due to query parameter stringing, but fragile if patterns change.

### L4. Middleware CORS Allows Localhost Origins
`localhost:4000/3001/3002/1420` — any process on the machine can make authenticated requests.

### L5. Device Auth Gate is Client-Side Only
OBS dock authentication relies on client-side deviceId verification against a public endpoint.

---

## DEPENDENCY VULNERABILITIES

| Package | Severity | Count | Notes |
|---------|----------|-------|-------|
| Desktop app (`verse-cast`) | Critical: 1, High: 25, Moderate: 9, Low: 1 | **36 total** | Primarily `undici` via `vercel`. Fix requires `vercel@50.41.0` (breaking change) |
| Web app (`web/`) | Moderate: 11 | **11 total** | `firebase-admin` transitives (`google-gax`, `google-cloud/storage`), `dompurify` |
| `dompurify` | Moderate | 1 | `ALLOWED_ATTR` pollution via `setConfig()` — CVE in versions ≤3.4.10 |

Run `npm audit fix` for non-breaking fixes. `npm audit fix --force` for all (breaking changes).

---

## PRIORITY REMEDIATION PLAN

### Immediate (Do Today)

1. **Add auth checks to ALL API routes.** Use `getAuthUser()` and return 401 if null. Remove the `userId` query param fallback from `getUserIdFromRequest()`.
2. **Rotate exposed credentials:** Firebase keys for `fiery-torch-2122` and `easybiblemount`, Singular Live token `5y3cuKma5r46k8wwuzsYLG`.
3. **Delete `versecast-session.json`** from the repo directory.
4. **Delete `web/new_makechurcheasy/.env`** from disk (rotate keys first).
5. **Remove `Access-Control-Allow-Origin: *`** from pairing and device endpoints.

### This Week

6. **Sanitize BroadcastChannel data** in all HTML overlay files before DOM insertion.
7. **Move Firebase auth cookie** to server-side only (remove `document.cookie` writes).
8. **Move desktop auth session** to Tauri secure storage or OS keychain.
9. **Remove OBS password from URL** — pass via secure channel.
10. **Add rate limiting** to signup and pairing endpoints.
11. **Run `npm audit fix`** on both packages.

### This Month

12. **Replace `innerHTML` with `textContent`** where possible in overlays.
13. **Add CSP nonce** support and remove `unsafe-inline`.
14. **Sanitize `dangerouslySetInnerHTML`** in BibleModule.
15. **Move hardcoded URLs** to environment variables.
16. **Remove client-side pro license validation** or move hash verification server-side.
17. **Strip console.log** from production builds.
