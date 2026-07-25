# Add Authentication & User Management to MakeChurchEasy

We need to introduce a proper authentication system across both the MakeChurchEasy website and the desktop application.

## Goal

Users should no longer be able to directly download or use MakeChurchEasy without creating an account.

Authentication should become the entry point into the MakeChurchEasy ecosystem.

---

## Technology

### Authentication

Use:

- NextAuth/Auth.js
- MongoDB
- JWT Sessions

Providers:

- Google Sign In
- Facebook Sign In
- Apple Sign In (future-ready)
- Email + Password

### Database

MongoDB

Collections:

**users**

```json
{
  "_id": "",
  "email": "",
  "name": "",
  "avatar": "",
  "provider": "google",
  "appId": "VC-XXXXXX",
  "churchName": "",
  "createdAt": "",
  "lastLogin": ""
}
```

**downloads**

```json
{
  "userId": "",
  "downloadedVersion": "",
  "downloadedAt": ""
}
```

**apiKeys**

```json
{
  "userId": "",
  "openaiKey": "",
  "createdAt": ""
}
```

**devices**

```json
{
  "_id": "",
  "userId": "",
  "deviceId": "",
  "deviceName": "",
  "lastSeen": "",
  "createdAt": ""
}
```

**pairingCodes**

```json
{
  "_id": "",
  "code": "ABCD-1234",
  "userId": "",
  "expiresAt": "",
  "used": false
}
```

Pairing codes:

- Expire after 5 minutes
- Single-use
- Deleted after successful authentication

---

## Website Changes

Current:

```
Landing Page → Download
```

New Flow:

```
Landing Page → Sign Up / Login → Dashboard → Download MakeChurchEasy
```

Users must authenticate before downloading.

---

### Landing Page

Add buttons:

- Continue with Google
- Continue with Facebook
- Continue with Apple
- Sign Up with Email

Top-right navigation:

- Login
- Sign Up

---

### User Dashboard

Route: `/app` or `/dashboard`

Protected route. Unauthenticated users redirected to login.

Sections:

**Welcome Card**

- Name
- Email
- Church Name

**App ID**

```
APP ID
VC-9KX72P
```

- Large font
- Copy button
- Visible immediately
- Used for: support, analytics, bug reports, feature requests

**Download MakeChurchEasy**

- Latest Version
- Release Notes
- Download Button

**Tutorials**

- YouTube Playlist
- Documentation

**Community**

- WhatsApp Community
- Feature Request Form
- Bug Report Form

**AI Configuration** (future section, initially disabled)

- Add OpenAI Key
- Add other AI providers later
- Display: "Bring Your Own API Key"

---

## Desktop App Authentication

### Device Pairing System

No email/password inside the desktop app. Use device pairing (like Discord TV Login, Microsoft Device Login, Spotify Device Pairing).

**Login Screen Design:**

```
MakeChurchEasy
Church Presentation Software for OBS

[ Continue in Browser ]

or

[ Enter Pairing Code ]
```

Nothing else. No email fields. No password fields.

---

### Primary Flow: Continue in Browser

1. User opens MakeChurchEasy for the first time
2. Shows: `Welcome to MakeChurchEasy [ Continue in Browser ]`
3. Click generates a temporary pairing code (e.g. `ABCD-1234`)
4. Opens browser to `https://makechurcheasy.app/device`
5. User signs into their MakeChurchEasy account
6. Website asks: `Authorize this device? Device: MakeChurchEasy Code: ABCD-1234 [ Authorize ]`
7. User clicks Authorize
8. Desktop app instantly becomes authenticated

---

### Alternative Flow: Manual Pairing Code

**Desktop App:**

```
Enter Pairing Code
[____________]
```

**Website Dashboard:**

```
Generate Pairing Code
ABCD-1234
```

Paste into app. Authenticate.

---

### App Verification

After login:

- Retrieve user profile
- Retrieve App ID
- Retrieve plan information
- Store session securely

---

### Restrictions

Users should NOT be able to access:

- Bible
- Worship
- Media
- Voice to Scripture
- Settings

until authenticated.

Show: `Please sign in to continue`

---

## Analytics

Track: Signups, Logins, Downloads, Active Users, Church Name, App ID, Feature Usage

Use PostHog. Every event includes:

```json
{
  "appId": "",
  "userId": ""
}
```

---

## Future Plans

Authentication lays the foundation for:

- Subscription plans
- Cloud sync
- Team collaboration
- Shared song libraries
- Shared media libraries
- Remote control
- License management
- AI usage tracking

Build the authentication layer with these future capabilities in mind.

> **Security note:** Don't store OpenAI keys in MongoDB in plain text. Encrypt them before saving, or don't collect user API keys until you actually need the feature.
