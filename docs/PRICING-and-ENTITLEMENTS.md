# Access Control & Feature Restrictions

## Overview

A user's subscription plan determines which features they can access across:

- Desktop App
- OBS Dock
- Mobile App
- Remote Controller
- AI Features
- Collaboration Features
- Cloud Features

All entitlement checks must be enforced consistently across the entire platform.

---

# Free Plan

## Desktop App Access

### Available

- Bible Presentation
- Bible Search
- Up to 3 Bible Versions
- Up to 3 Songs
- Up to 3 Media Uploads
- OBS Integration
- 1 Device
- 1 Lower Third
- Up to 2 Themes
- 20 Credits

### Not Available

- Translation
- Verse AI
- Sermon Transcription
- AI Summary
- Bulk Song Import
- Team Collaboration
- Multiview
- Tickers
- Remote OBS Control
- Mobile App Access
- Mobile Scene Controller
- Cloud Sync

### Upgrade Message

> Upgrade to Basic or Growth to unlock this feature.

---

## OBS Dock Access

### Available

- Bible Display
- Song Display
- Media Display
- Lower Third Display

### Not Available

- Translation
- Verse AI
- Multiview
- Team Collaboration
- Remote Commands
- Shared Control

---

## Mobile App Access

### Status

Not available.

Users cannot sign in to the mobile application.

### Message

> Mobile App access requires a Growth or Pro subscription.

---

## Remote Control Access

### Not Available

Users cannot:

- Change Scenes
- Control Media
- Control Audio
- Start Streams
- Stop Streams
- Control Recordings

---

# Basic Plan

## Desktop App Access

### Available

Everything in Free plus:

- Translation
- Up to 10 Bible Versions
- Up to 70 Songs
- Up to 70 Media Uploads
- Tickers
- Additional Lower Thirds
- Up to 5 Devices
- 250 Credits

### Not Available

- Verse AI
- Sermon Transcription
- AI Summary
- Mobile App Access
- Remote OBS Control
- Team Collaboration
- Multiview
- Bulk Song Import
- Mobile Scene Controller

---

## OBS Dock Access

### Available

- Bible
- Songs
- Media
- Translation
- Tickers
- Lower Thirds

### Not Available

- Verse AI
- Multiview
- Team Collaboration
- Remote Control
- Shared Operators

---

## Mobile App Access

### Status

Not available.

### Message

> Mobile App access is available on Growth and Pro plans.

---

## Remote Control Access

### Not Available

Users cannot:

- Change Scenes
- Control Audio
- Start Streams
- Stop Streams
- Control Recordings

---

# Growth Plan

## Desktop App Access

### Available

Everything in Basic plus:

- Verse AI
- Sermon Transcription
- AI Summary
- Bulk Song Import
- Mobile App Access
- Remote OBS Control
- Team Collaboration
- Multiview
- Unlimited Songs
- Unlimited Media Uploads
- Unlimited Bible Versions
- 500 Credits

### Not Available

- Mobile Scene Controller

---

## OBS Dock Access

### Available

- Bible Presentation
- Songs
- Media
- Translation
- Verse AI
- Tickers
- Team Collaboration
- Multiview
- AI Summary
- Sermon Transcription

### Not Available

- Mobile Scene Controller

---

## Mobile App Access

### Available

- Sign In
- Dashboard
- Bible Library
- Song Library
- Media Library
- Presentation Control
- Verse AI Monitoring
- Translation Monitoring
- Team Monitoring
- Multiview Monitoring
- Remote OBS Control

### Not Available

- Scene Controller Grid
- Scene Switching
- Audio Mixer Control
- Stream Start
- Stream Stop
- Recording Start
- Recording Stop

### Message

> Upgrade to Pro to unlock Mobile Scene Controller.

---

## Remote Control Access

### Available

- Presentation Control
- Bible Navigation
- Song Navigation
- Media Control
- OBS Status Monitoring

### Not Available

- Full Scene Controller
- Audio Mixer Controls
- Stream Controls
- Recording Controls

---

# Pro Plan

## Desktop App Access

### Available

Everything.

No restrictions.

---

## OBS Dock Access

### Available

Everything.

No restrictions.

---

## Mobile App Access

### Available

Everything.

Including:

- Scene Switching
- Scene Groups
- Audio Mixer Control
- Mute / Unmute
- Stream Start
- Stream Stop
- Recording Start
- Recording Stop
- Media Control
- Presentation Control
- Team Control
- Multiview

No restrictions.

---

## Remote Control Access

### Available

Full access to:

- Scenes
- Audio
- Video
- Streams
- Recordings
- Overlays
- Lower Thirds
- Bible Presentation
- Song Presentation
- Media Presentation
- Tickers

No restrictions.

---

# Ambassador Plan

## Availability

Admin Only.

Not publicly purchasable.

---

## Access

Includes everything available in Pro.

Additional benefits:

- Ambassador Badge
- 2,000 Credits
- Full Platform Access

No restrictions.

---

# Team Collaboration Rules

## Free

Not available.

Users cannot:

- Invite Team Members
- Share Presentations
- Assign Roles

---

## Basic

Not available.

Users cannot:

- Invite Team Members
- Share Presentations
- Assign Roles

---

## Growth

Available.

Users can:

- Invite Team Members
- Share Presentations
- Assign Roles
- Collaborate Across Devices

Users cannot:

- Use Mobile Scene Controller

---

## Pro

Available.

Users can:

- Invite Unlimited Team Members
- Assign Roles
- Share Presentations
- Manage Teams
- Collaborate Across Devices

No restrictions.

---

# Mobile App Visibility Rules

## Free

- Hide Mobile App Download Links
- Hide Mobile App Features

---

## Basic

- Hide Mobile App Download Links
- Hide Mobile App Features

---

## Growth

- Show Mobile App Download Links
- Allow Mobile Login

---

## Pro

- Show Mobile App Download Links
- Allow Mobile Login

---

# Upgrade Messages

## Verse AI

> Verse AI is available on Growth and Pro plans.

---

## Sermon Transcription

> Sermon Transcription is available on Growth and Pro plans.

---

## AI Summary

> AI Summary is available on Growth and Pro plans.

---

## Mobile App

> Mobile App access is available on Growth and Pro plans.

---

## Remote OBS Control

> Remote OBS Control is available on Growth and Pro plans.

---

## Team Collaboration

> Team Collaboration is available on Growth and Pro plans.

---

## Multiview

> Multiview is available on Growth and Pro plans.

---

## Mobile Scene Controller

> Mobile Scene Controller is available on the Pro plan.

---

# Development Rules

## Rule 1

Every feature must have a plan requirement.

No feature should be accessible without entitlement validation.

---

## Rule 2

Frontend restrictions alone are not sufficient.

All premium features must also be validated on the backend.

---

## Rule 3

Mobile App, OBS Dock, Desktop App, and Remote Control must share the same entitlement source.

---

## Rule 4

Users must always see an upgrade path when attempting to access a restricted feature.

Never display generic permission errors.

---

## Rule 5

The official supported plans are:

- Free
- Basic
- Growth
- Pro
- Ambassador

All legacy references to Starter or deprecated plans must be removed.