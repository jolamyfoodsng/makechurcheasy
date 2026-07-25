# AI Development Rules

These rules are mandatory for every task. They apply to all source code, refactoring, bug fixes, new features, UI changes, API integrations, tests, and documentation.

Failure to follow these rules is considered an incorrect implementation.

---

# Backend Is The Source Of Truth

The backend is the only authoritative source for application data.

The frontend must never invent, estimate, assume, or hardcode values that should come from the backend.

If information is required and is not available from the backend, stop and identify the missing backend field instead of creating fake values.

---

# Never Hardcode Dynamic Values

Any value that represents application data must come from the backend.

This includes, but is not limited to:

- Credits
- Usage
- Remaining balance
- Subscription limits
- Trial days
- Plan limits
- Device limits
- User counts
- Statistics
- Prices
- Currency
- Percentages
- Dates
- Times
- IDs
- Version numbers
- Quotas
- File counts
- Upload limits
- API limits
- Storage limits
- Feature flags
- Account information
- Organization information
- Church information
- Bible statistics
- Analytics values

Never replace backend values with temporary numbers.

Never use "just for now" values.

Never use placeholder numbers.

---

# Never Quote Numbers

Numbers must remain numbers.

Never write:

```ts
credits: "30"
remaining: "15"
trialDays: "7"
deviceLimit: "3"
```

Always use:

```ts
credits: 30
remaining: 15
trialDays: 7
deviceLimit: 3
```

or preferably:

```ts
credits: api.credits
remaining: api.remainingCredits
trialDays: api.trialDays
deviceLimit: api.deviceLimit
```

Only use quoted numbers when the backend explicitly defines the field as a string and changing it would break the API contract.

Never convert numbers into strings for convenience.

---

# Never Invent Backend Data

If the backend does not provide a required value:

❌ Do NOT create one.

❌ Do NOT guess.

❌ Do NOT use placeholder values.

❌ Do NOT fabricate data.

Instead:

- Identify which backend field is missing.
- Explain why it is required.
- Request that it be added or fetched.
- Wait for the backend value.

---

# No Placeholder Data

Never leave behind temporary values such as:

- Example Church
- John Doe
- Test User
- Demo Church
- Sample Name
- 123
- 999
- 100
- 50
- Lorem Ipsum

Unless the task explicitly asks for demo data.

---

# Preserve Data Types

Respect backend types exactly.

If the backend returns:

```ts
credits: number
```

do not convert it into

```ts
credits: string
```

If the backend returns:

```ts
createdAt: Date
```

do not replace it with arbitrary strings.

Never change data types to make implementation easier.

---

# API Contracts Are Authoritative

Never modify response structures without backend changes.

Never rename fields.

Never create aliases.

Never duplicate backend fields.

Never wrap backend values inside unnecessary objects.

Always consume the existing API contract exactly as defined.

---

# Constants vs Dynamic Data

The following may be hardcoded because they are implementation constants:

- CSS spacing
- Border radius
- Colors
- Typography
- Shadows
- Animation duration
- Transition timing
- Icon sizes
- Z-index values
- Layout measurements

Everything else should be assumed to be backend-driven unless explicitly documented otherwise.

---

# Before Completing Any Task

Perform a final verification.

Check that:

- No numbers were hardcoded.
- No backend values were replaced with literals.
- No numeric values were unnecessarily quoted.
- No placeholder data exists.
- All displayed values originate from the backend.
- All data types match the backend contract.
- No fake fallbacks were introduced.
- No assumptions were made about backend data.

If any of the above is violated, the task is not complete.

---

# Golden Rule

**If a value can come from the backend, it MUST come from the backend.**

**Never guess it. Never hardcode it. Never fabricate it. Never wrap numeric values in quotes unless the backend explicitly defines them as strings.**
This is a critical logic bug and it keeps reappearing throughout the dashboard.

The user is currently on an active trial.

When a trial is active, the UI must NEVER display:

* Free Plan
* Inactive
* Free plan limits
* Free plan entitlements
* Free plan messaging

The trial is effectively the user’s current subscription.

Current Incorrect State

Dashboard shows:

Plan: Free
Status: Inactive
Credits: 50 / 50
Devices: 0 / 1

while the user is actually on:

Growth Trial
500 Credits
5 Devices
Premium Features Enabled
Trial Active

This creates confusion because the user sees:

* Trial banner
* Trial features
* Trial onboarding

but the stats cards still say:

Free
Inactive
50 Credits
1 Device

which is contradictory.

⸻

Correct Logic

When:

isOnTrial === true

the dashboard should behave as if the user is on the Trial plan.

Use:

planConfig.plans.trial

or the trial entitlements directly.

Not:

planConfig.plans.free

⸻

Plan Card

Current:

Plan
Free
Inactive

Expected:

Plan
Growth Trial
Active

or

14-Day Trial
Active

⸻

Credits Card

Current:

50 / 50

Expected:
500 / 500


because the trial configuration provides:

{
  "credits": 500
}

⸻

Devices Card

Current:

0 / 1

Expected:

0 / 5

because trial entitlements provide:

{
  "devices": 5
}

⸻

Device Limits

Current code is calculating limits from:

planTier?.entitlements

which appears to be resolving to Free.

When:

isOnTrial === true

limits should come from:

planConfig.plans.trial.entitlements

instead.

⸻

Subscription Status

Current:

Inactive

Expected:

Trial Active

or

Active Trial

A trial is an active subscription state.

It must never be displayed as inactive.

⸻

Root Cause To Investigate

Check where:

planTier
plan
subscription.status
maxCredits
mongoUser.totalAvailable

are being derived.

Most likely:

1. User plan remains “free” in database.
2. Trial state is stored separately.
3. Dashboard reads free-plan entitlements for stats.
4. Dashboard reads trial state for banners.

This causes mixed UI state.

The dashboard needs a single source of truth:

if (isOnTrial) {
  effectivePlan = trialPlan;
} else {
  effectivePlan = actualSubscriptionPlan;
}

All cards should use:

effectivePlan

instead of mixing:

free plan data
+
trial data

throughout the page.

Expected Dashboard For Trial User

Plan
Growth Trial
Active
Credits
500 / 500
Devices
0 / 5
Premium Features Enabled
13 Days Remaining

No part of the dashboard should say:

Free
Inactive
50 Credits
1 Device

while a trial is active.
# Never Reference Non-Existent APIs

Do not create frontend requests to endpoints that do not exist.

Do not add polling, retries, status checks, verification checks, or mutations unless the backend endpoint has been implemented.

Never assume an endpoint exists.

Before using an API route:

- Verify the route exists.
- Verify the method exists.
- Verify the response contract exists.
- Verify error handling exists.

A 404 from an internal application endpoint is considered an implementation bug.

Example:

❌ Frontend calls:

POST /api/pairing/check-verification

when the route does not exist.

❌ Frontend polls an endpoint that has not been implemented.

❌ UI contains buttons that trigger missing routes.

Instead:

- Implement the backend endpoint first.
- Define the API contract.
- Then integrate it in the frontend.

If an API is required but does not exist, stop and identify the missing endpoint instead of inventing requests.


You can give OpenCode a requirement like this:

⸻

Global Tooltip & Help Text Requirement

Every interactive control in the application must provide a clear explanation of its purpose.

Scope

Apply to all:

* Buttons
* Icon buttons
* Toolbar actions
* Navigation icons
* Action menus
* Floating action buttons
* Toggle buttons
* Context menu actions
* Quick action cards
* Settings actions

Requirements

1. Every button must have a tooltip
    * Appears on hover (desktop).
    * Appears on keyboard focus for accessibility.
    * Appears on long press where appropriate.
2. Tooltip text must explain the action
    * Do not simply repeat the button label.
    * Explain what will happen when clicked.
3. Icon-only buttons are mandatory
    * No icon-only button should exist without a tooltip.
4. Use action-oriented language

Good examples:

Refresh Connection
Check the current connection status with OBS.
Push Verse
Send the selected scripture to the active OBS scene.
Start Listening
Begin microphone monitoring for Speech to Scripture detection.
Open MultiView
View OBS Program and Preview feeds in a separate window.

Bad examples:

Refresh
Connection
Click here

5. Complex features should use popovers
    * If a feature needs more than one sentence of explanation, show a popover/help panel instead of a simple tooltip.

Example:

Speech to Scripture
Listens to spoken scripture references and automatically detects likely Bible passages using AI-assisted matching.

6. Accessibility
    * All tooltips must be exposed via:
        * title attribute
        * aria-label
        * aria-describedby where applicable
7. Consistency
    * Create a reusable Tooltip component.
    * No custom implementations per page.
    * Every new button must use the shared component.

Development Rule

Before merging any feature:

If a user can click it,
they must be able to understand it without reading documentation.

Any button, icon, or action without a tooltip should be considered an incomplete implementation and treated as a UX bug.

⸻

This turns tooltips into a platform-wide UX standard rather than something developers add only when they remember.

Add this requirement to OpenCode:

Internationalization (i18n) Requirement

Any new UI text introduced as part of this feature must be added to the translation system.

Requirements:

1. Do not hardcode user-facing text directly in components.
2. Every new label, button text, tooltip, popover text, banner text, tutorial text, onboarding text, status text, modal title, modal description, and help message must be added to:

desktop/src/locales/app-en.json

3. Components must use translation keys via the existing i18n system instead of hardcoded strings.

Example:

❌ Do not do:

<Button>Tutorial</Button>

✅ Do:

<Button>{t("tutorial.start")}</Button>

with:

{
  "tutorial.start": "Start Tutorial"
}

in app-en.json.

4. The English file (app-en.json) is the source language for all future translations.
5. Every string added for:

* Tutorial buttons
* Tutorial banners
* Tutorial completion status
* Continue Tutorial actions
* Restart Tutorial actions
* Skip Tutorial actions
* Help popovers
* Walkthrough instructions
* Empty states
* Tooltips

must be added to app-en.json.

6. Do not leave untranslated hardcoded text in the UI, even temporarily.
7. Before completing the task, verify that all newly added user-facing strings exist in app-en.json and are referenced through translation keys.

Development Rule

If a user can see text on the screen, it should come from the i18n translation system. This ensures the feature can be translated into French, Spanish, Twi, Yoruba, Igbo, and other supported languages without requiring code changes later.

⸻

Add this requirement to OpenCode:

Interactive Tutorial & Onboarding Requirement

Every major page/module in MakeChurchEasy must have an interactive guided walkthrough. No user should ever be left wondering how a feature works.

Full specification: docs/TUTORIAL_SYSTEM.md

Scope

Apply to every page that has:

* Multiple interactive controls
* A workflow the user must learn
* Features a new user would not discover immediately
* Settings or configuration options

Requirements

1. Every major page must have a visible "Tutorial" button in the page header
    * Same priority as other key page actions
    * Easy for new users to find
    * Uses the help_outline icon

2. Clicking the button launches an interactive walkthrough specific to that page
    * Floating panel with step-by-step instructions
    * Dark overlay highlights the current target element
    * Target element is elevated above the overlay via z-index manipulation
    * Visual glow effect draws attention to the target

3. Tutorials must explain the page step-by-step
    * Highlight important controls and actions
    * Explain WHY the user would use each feature, not just what the button does
    * Every step has: title, description, action hint

4. Users must be able to:
    * Start tutorial (via header button)
    * Restart tutorial (via banner or header button)
    * Skip tutorial (via Skip button or Escape key)
    * Complete tutorial (via final step)

5. Track tutorial completion status per page/module
    * Store in localStorage with unique key per page
    * Persist across app restarts
    * States: Not Started, In Progress, Skipped, Completed

6. When a tutorial has not been completed, display a persistent banner:

⚠ Tutorial Not Completed
Learn how to use [Page Name] effectively.
[Continue Tutorial]  [Restart Tutorial]  [Dismiss]

    * Banner remains visible until the tutorial is successfully completed
    * Dismiss hides it for the current session only

7. First-time user experience:
    * Auto-offer the tutorial on first page visit (600ms delay after load)
    * User can skip, but the page remembers the tutorial is incomplete
    * Returning to the page shows the reminder banner

8. All tutorial text must use i18n keys
    * No hardcoded user-facing text in tour components
    * Every string goes through the translation system

Implementation

For the full implementation guide, target element elevation system, CSS standards, wiring pattern, and i18n key conventions, see:

docs/TUTORIAL_SYSTEM.md

Development Rule

Before merging any feature with a tutorial:

- Every step must have a data-tutorial attribute on its target element.
- Every user-facing string must use i18n keys.
- The tour must handle all trigger types correctly.
- Target elevation cleanup must restore all original values.
- Completion must persist across app restarts.
- The banner must reappear when the tutorial is incomplete.
- No hardcoded text in the tour component.

Any page with multiple interactive controls that lacks a tutorial should be considered an incomplete implementation and treated as a UX gap.


