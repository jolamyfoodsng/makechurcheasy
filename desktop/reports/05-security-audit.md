# Security Audit Report

**Date:** 2026-04-15
**Auditor:** Qwen Code (automated)
**Scope:** Authentication, API key validation, role-based access, data protection

---

## Authentication Methods

### 1. Cookie-Based Auth (Web Dashboard)
- **Method:** `getAuthUser()` reads `fb-token` cookie
- **Token:** Firebase ID token
- **Storage:** `authService.ts` (in-memory) + cookie
- **Used by:** All `/api/team/*`, `/api/user/*` routes
- **Validation:** `verifyFirebaseToken()` checks expiry, signature

### 2. API Key Auth (Desktop App / External)
- **Method:** `authenticateApiKey()` via `X-Device-Id` header
- **Storage:** `api_keys` collection (hashed)
- **Validation:** Hash comparison + status check + expiry check
- **Rate limiting:** Per-key daily limit tracked in `api_usage`

### 3. Device Pairing
- **Method:** Desktop generates `deviceId`, server validates via pairing code
- **Storage:** `devices` array on user document
- **Limit:** Enforced by `maxDevices` entitlement

## API Key Security

### Key Lifecycle
```
created → active → (revoke) → revoked
                  → (expire) → expired
```

### Validation Chain
1. Look up key by hash in `api_keys` collection
2. Check `status !== "revoked"` and `status !== "expired"`
3. Check `expiresAt` not in the past
4. Check `rateLimit` not exceeded
5. Check `scopes` includes required scope or `*`

### Key Prefix
- Stored for display purposes only (first 12 chars of raw key)
- Never used for authentication — hash is the credential

### Rate Limiting
| Plan | Default Rate Limit |
|------|-------------------|
| Pro | 1000 requests/day |
| Others | Not applicable (API access is Pro-only) |

- Tracked per-key per-day in `api_usage` collection
- `checkRateLimit()` returns `{ allowed, remaining }`
- Exceeding limit → 429 response

### Test Coverage
**File:** `src/services/apiAccess.test.ts` — 18 tests

| Category | Tests |
|----------|-------|
| Key validation | 4 (active, revoked, expired, status override) |
| Rate limiting | 4 (under, at boundary, over, fresh) |
| Scope checking | 3 (wildcard, specific, empty) |
| Key prefix | 2 (normal, short) |
| Plan-gated scopes | 5 (pro, free, basic, growth, unknown) |

## Role-Based Access Control

### Team Roles (4 roles)
| Role | Hierarchy | Capabilities |
|------|-----------|-------------|
| owner | 3 | Full access — team, content, settings, billing |
| admin | 2 | Team management + content + settings (no billing) |
| operator | 1 | Content only (create, edit, present) |
| viewer | 0 | Read-only access |

### Permission Model
- **`outranks(caller, target)`** — Strictly greater-than comparison (owner special-cased)
- **`hasMinimumRole(user, required)`** — Greater-than-or-equal (for minimum role checks)
- **Key invariant:** Admins CANNOT modify other admins (outranks uses `>`, not `>=`)

### Access Matrix

| Action | Owner | Admin | Operator | Viewer |
|--------|-------|-------|----------|--------|
| Invite member | ✅ any role | ✅ viewer/operator only | ❌ | ❌ |
| Update member role | ✅ any non-owner | ✅ operator/viewer | ✅ viewer only | ❌ |
| Remove member | ✅ any non-owner | ✅ operator/viewer | ✅ viewer only | ❌ |
| View members | ✅ | ✅ | ✅ | ✅ |
| Update own profile | ✅ | ✅ | ✅ | ✅ |
| Delete own account | ✅ | ✅ | ✅ | ✅ |

### Test Coverage
**File:** `src/services/teamManagement.test.ts` — 33 tests

| Category | Tests |
|----------|-------|
| Role hierarchy | 6 |
| Invite permissions | 5 |
| Role update permissions | 7 |
| Remove permissions | 6 |
| Member limits | 4 |
| Duplicate detection | 5 |

## Data Protection

### Password Handling
- Passwords stored as Firebase Auth credentials (never in our DB)
- `projection: { password: 0 }` in user queries
- `passwordLastChanged` tracked for security auditing

### Sensitive Data Exclusion
- API routes never return `password`, `keyHash`, or raw API keys
- Key prefix shown for identification only
- Firebase tokens validated server-side, never logged

### Soft Delete Pattern
- User accounts: `status: "deleted"` (not removed)
- Team members: `status: "removed"` (not deleted)
- Preserves audit trail

### Session Management
- `security_sessions` collection with 30-day TTL index
- Session tracking: `userId`, `sessionId`, `lastActive`, `userAgent`
- Old sessions auto-expired by MongoDB TTL

## CORS Configuration

- Origins allowed: `localhost:4000`, `localhost:5173`, `localhost:1420`, production domain
- Tauri origins added for desktop app pairing
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Credentials: allowed for cookie-based auth

## Verification

- [x] `apiAccess.test.ts` — 18 tests passing
- [x] `teamManagement.test.ts` — 33 tests passing
- [x] No raw API keys exposed in responses
- [x] Role hierarchy prevents privilege escalation
- [x] `outranks()` uses strict `>` (admin cannot modify admin)
- [x] All API routes require authentication
- [x] Entitlement checks on protected routes
- [x] Soft-delete preserves audit trail
