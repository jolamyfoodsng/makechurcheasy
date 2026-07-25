# MakeChurchEasy Tutorial & Onboarding System

Version: 1.0
Last Updated: July 2026

---

# Purpose

This document defines the standard for interactive guided tutorials across every page of MakeChurchEasy. Developers and AI agents must follow these standards to ensure a consistent onboarding experience.

No user should ever be left wondering how a feature works. Every page provides immediate access to a guided walkthrough, and incomplete tutorials are clearly indicated until completed.

---

# Architecture Overview

Every tutorial follows the same pattern:

1. A **Tour Component** (React) that renders a floating panel + dark overlay + target element highlighting.
2. A **CSS file** that styles the panel, overlay, and glow animation.
3. **`data-tutorial` attributes** on the page that the tour targets via CSS selectors.
4. **i18n keys** in `app-en.json` for all user-facing text.
5. **localStorage** for completion persistence.

---

# Tour Component Structure

Every tour component lives in `src/pages/` and follows this naming convention:

| Page | Component File | CSS File | i18n Prefix | localStorage Key |
|------|---------------|----------|-------------|-----------------|
| Transcript Library | `TranscriptTutorial.tsx` | `TranscriptTutorial.css` | `tutorial.step{N}.*` | `mce.transcript.tutorial.completed` |
| Transcript Detail | `TranscriptDetailTutorial.tsx` | `TranscriptDetailTutorial.css` | `detailTutorial.step{N}.*` | `mce.transcript-detail.tutorial.completed` |
| Theme Settings | `ThemeSettingsTour.tsx` | `ThemeSettingsTour.css` | `themeSettings.tour.step{N}.*` | `mce.theme-settings-tour.completed` |

When creating a new tour for a new page, follow this pattern exactly.

---

# Tour Component Contract

Every tour component MUST export:

```tsx
export default function PageTour({ ... }: PageTourProps) { ... }

export function isPageTourCompleted(): boolean { ... }
export function markPageTourCompleted(): void { ... }
export function resetPageTour(): void { ... }
```

## Props Interface

```tsx
interface PageTourProps {
  /** Whether the tour is currently active and should render */
  isActive: boolean;
  /** Called when the user dismisses the tour (skip, close, escape) */
  onClose: () => void;
  /** Called when the user completes the final step */
  onFinish: () => void;
  /** Called when the tour needs to auto-switch tabs (optional, for multi-tab pages) */
  onTabSwitch?: (tab: string) => void;
}
```

## Step Definition

Every step follows this interface:

```tsx
interface TutorialStep {
  /** CSS selector for the element to highlight */
  target: string;
  /** i18n key for the step title */
  titleKey: string;
  /** i18n key for the step description */
  descKey: string;
  /** i18n key for the action hint */
  actionKey: string;
  /** Completion event type */
  trigger: "click" | "focus" | "view-change" | "none";
  /** Selector to watch for the trigger (if different from target) */
  triggerSelector?: string;
  /** Optional: skip this step if condition is true */
  skipIf?: () => boolean;
  /** Panel position relative to target */
  panelPosition: "right" | "left" | "top" | "bottom";
  /** Auto-switch to this tab when the step becomes active (optional) */
  switchTab?: string;
}
```

### Trigger Types

| Type | Behavior | Next Button State |
|------|----------|------------------|
| `"none"` | User clicks Next to advance | Always enabled |
| `"click"` | Waits for user to click the target | Disabled until click detected |
| `"focus"` | Waits for user to focus/click the target | Disabled until interaction |
| `"view-change"` | Waits for a view/tab change | Disabled until change detected |

---

# Target Elevation System

Target elements are highlighted by elevating them above the dark backdrop using z-index manipulation. This works for ALL element types automatically.

## How It Works

1. **Scan positioned ancestors** — Walk up the DOM tree, boost z-index to `10005` for every element with `position !== "static"`.
2. **Elevate target** — Set target z-index to `10006` and `position: relative` if currently static.
3. **Visual effects** — Apply `box-shadow` glow, `outline` border, and CSS custom properties for pulse animation.
4. **Cleanup** — Restore all original values when the step changes.

## Z-Index Stack

| Layer | z-index | Purpose |
|-------|---------|---------|
| Page content | (default) | Normal page elements |
| Tour overlay | `9998` | Dark backdrop |
| Tour panel | `10000` | Floating instruction panel |
| Elevated ancestors | `10005` | Positioned parents of target |
| Target element | `10006` | The highlighted element |

## Implementation

```tsx
function elevateTarget(el: HTMLElement, interactive: boolean): () => void {
  const primaryRgb = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary-rgb").trim() || "99,102,241";

  // Elevate positioned ancestors
  const ancestors: Array<[HTMLElement, string]> = [];
  let parent = el.parentElement;
  while (parent && parent !== document.documentElement) {
    if (getComputedStyle(parent).position !== "static") {
      ancestors.push([parent, parent.style.zIndex]);
      parent.style.zIndex = "10005";
    }
    parent = parent.parentElement;
  }

  // Elevate target
  if (getComputedStyle(el).position === "static") {
    el.style.position = "relative";
  }
  el.style.zIndex = "10006";

  // Visual effects
  const glow = `0 0 0 16px rgba(${primaryRgb},0.2), 0 0 30px 8px rgba(${primaryRgb},0.35), 0 0 60px 4px rgba(${primaryRgb},0.15)`;
  el.style.boxShadow = glow;
  el.style.outline = `2px solid rgba(${primaryRgb},0.7)`;
  el.style.outlineOffset = "6px";

  // Pulse animation for interactive targets
  if (interactive) el.classList.add("mce-tutorial-glow-pulse");

  // Return cleanup function
  return () => {
    el.classList.remove("mce-tutorial-glow-pulse");
    el.style.boxShadow = "";
    el.style.outline = "";
    el.style.zIndex = "";
    el.style.position = "";
    for (const [node, z] of ancestors) {
      node.style.zIndex = z;
    }
  };
}
```

---

# Data Attributes Convention

Every element that a tour step targets MUST have a `data-tutorial` attribute.

## Naming Convention

```html
data-tutorial="page-name-element"
```

Examples for a hypothetical "Worship Settings" page:

```html
<header data-worship-tutorial="header">...</header>
<button data-worship-tutorial="song-search">...</button>
<div data-worship-tutorial="song-list">...</div>
```

The attribute name format is: `data-{pagePrefix}-tutorial="{element-name}"`

This allows tours to use CSS selectors like `[data-worship-tutorial="header"]`.

---

# Tour Panel Structure

Every tour panel renders this layout:

```
┌─────────────────────────┐
│ [Progress Bar]          │  3px, primary color fill
├─────────────────────────┤
│ [Step Badge]    [Close] │  "1 / 10" badge + X button
├─────────────────────────┤
│ [Icon]                  │  36px lightbulb icon
│ Title                   │  Bold, 15px
│ Description             │  Muted, 13px
│ [Action Hint]           │  Arrow + instruction text
├─────────────────────────┤
│ [Skip]    [←] [Next →] │  Footer navigation
└─────────────────────────┘
```

## Final Step (Completion Screen)

```
┌─────────────────────────┐
│        [Sparkles]       │  52px icon
│   You're All Set!       │  Bold title
│  Description text...    │
│                         │
│  ✓ Checklist item 1     │  Green check icons
│  ✓ Checklist item 2     │
│  ✓ Checklist item 3     │
│  ✓ Checklist item 4     │
│  ✓ Checklist item 5     │
│                         │
│  [Start Customizing]    │  Primary button
└─────────────────────────┘
```

---

# CSS Standards

Every tour CSS file uses the prefix `{page-abbreviation}-` (e.g., `tst-` for Theme Settings Tour, `tt-` for Transcript Tutorial, `tdt-` for Transcript Detail Tutorial).

The shared glow animation class `.mce-tutorial-glow-pulse` is duplicated in each CSS file since each component imports its own stylesheet:

```css
.mce-tutorial-glow-pulse {
  animation: mce-tutorial-glow-pulse 2s ease-in-out infinite;
}

@keyframes mce-tutorial-glow-pulse {
  0%, 100% { box-shadow: var(--mce-glow); }
  50% { box-shadow: var(--mce-glow-dim); }
}
```

### Panel positioning

- Panel width: `340px` (regular), `400px` (final step)
- Gap from target: `20px`
- Fallback: if panel goes off-screen, reposition to the opposite side or center
- Responsive: below `720px` width, panel takes full width minus padding

### Overlay

```css
position: fixed;
inset: 0;
background: rgba(0, 0, 0, 0.65);
z-index: 9998;
pointer-events: none;  /* clicks pass through to page */
```

The panel itself has `pointer-events: auto` so it remains interactive.

---

# Completion Tracking

## Storage

Each tour uses a unique localStorage key:

```ts
const TOUR_STORAGE_KEY = "mce.{page-slug}.tutorial.completed";
```

## States

| State | localStorage Value | Behavior |
|-------|-------------------|----------|
| Not Started | `null` or absent | Auto-start on first visit |
| In Progress | (not stored) | Tour is active, no localStorage entry yet |
| Skipped | `null` (via `onClose`) | Same as Not Started — banner reappears |
| Completed | `"true"` | Tour never auto-starts again |

## Completion Logic

- **On Finish**: Call `markPageTourCompleted()` which sets `localStorage.setItem(TOUR_STORAGE_KEY, "true")`. Tour closes.
- **On Skip/Close**: Call `onClose()` which does NOT set localStorage. The tour remains "not completed". The banner reappears on next visit.
- **On Escape key**: Same as Skip.

---

# Banner for Incomplete Tutorials

When a tour is not completed, display a persistent banner at the top of the page.

## Banner Content

```
⚠ Tutorial Not Completed
Learn how to use [Page Name] effectively.
[Continue Tutorial]  [Restart Tutorial]  [Dismiss]
```

## Banner Behavior

- **Continue Tutorial**: Sets tour active, starts from step 0.
- **Restart Tutorial**: Resets any in-progress state, starts from step 0.
- **Dismiss**: Hides the banner for the current session only (not persisted).
- **Banner visibility**: Shown whenever `!isPageTourCompleted()` and no tour is currently active.

## Banner Styling

```css
background: rgba(var(--primary-rgb), 0.08);
border: 1px solid rgba(var(--primary-rgb), 0.2);
border-radius: 8px;
padding: 10px 16px;
```

---

# Wiring Into Pages

## Pattern

```tsx
import PageTour, { isPageTourCompleted, markPageTourCompleted } from "./PageTour";

function PageComponent() {
  const [tourActive, setTourActive] = useState(false);

  // Auto-start on first visit
  useEffect(() => {
    if (!loading && !isPageTourCompleted()) {
      const timer = setTimeout(() => setTourActive(true), 600);
      return () => clearTimeout(timer);
    }
  }, [loading]);

  return (
    <div className="app-page">
      {/* Page header with tutorial button */}
      <header className="app-page__header">
        <h1>Page Title</h1>
        <button onClick={() => setTourActive(true)}>
          <Icon name="help_outline" size={16} />
          Tutorial
        </button>
      </header>

      {/* Incomplete tutorial banner */}
      {!tourActive && !isPageTourCompleted() && (
        <div className="tutorial-banner">
          <Icon name="warning" size={14} />
          <span>{t("page.tutorial.banner")}</span>
          <button onClick={() => setTourActive(true)}>
            {t("page.tutorial.continue")}
          </button>
          <button onClick={() => {
            resetPageTour();
            setTourActive(true);
          }}>
            {t("page.tutorial.restart")}
          </button>
        </div>
      )}

      {/* Page content... */}

      {/* Tour component */}
      <PageTour
        isActive={tourActive}
        onClose={() => setTourActive(false)}
        onFinish={() => {
          markPageTourCompleted();
          setTourActive(false);
        }}
      />
    </div>
  );
}
```

## Auto-Start Rules

1. Wait for page data to load before starting the tour.
2. Use a `600ms` delay after loading to allow DOM to settle.
3. Only auto-start if `!isPageTourCompleted()`.
4. Never auto-start if the user has already completed or skipped the tour.

---

# i18n Requirements

All user-facing tour text MUST use translation keys via the i18n system.

## Key Naming Convention

```
{pagePrefix}.tour.step{N}.title
{pagePrefix}.tour.step{N}.desc
{pagePrefix}.tour.step{N}.action
{pagePrefix}.tour.final.title
{pagePrefix}.tour.final.desc
{pagePrefix}.tour.final.check{N}
{pagePrefix}.tour.final.finish
{pagePrefix}.tour.common.skip
{pagePrefix}.tour.common.next
{pagePrefix}.tour.banner
{pagePrefix}.tour.banner.continue
{pagePrefix}.tour.banner.restart
```

## Content Guidelines

Every step description must explain **WHY** the user would use the feature, not just what the button does.

### Bad

> "Click this button to create a theme."

### Good

> "Click this button to open the Theme Creator. You'll pick a template, choose your colors and fonts, add a background image or video, and save it — all without writing any code."

### Bad

> "This is the search bar."

### Good

> "Quickly find any sermon by title, speaker, date, or scripture reference. Your search filters the list in real time as you type."

---

# Adding a New Tutorial

Follow these steps when adding a tutorial to a new page:

1. **Create `src/pages/PageTour.tsx`** following the component contract above.
2. **Create `src/pages/PageTour.css`** with the page-specific prefix.
3. **Add `data-{pagePrefix}-tutorial` attributes** to every element the tour targets.
4. **Add i18n keys** to `src/locales/app-en.json`.
5. **Wire the tour** into the page component following the wiring pattern.
6. **Add the "Tutorial" button** to the page header.
7. **Add the incomplete tutorial banner** below the header.
8. **Test**: Verify auto-start, skip, resume, completion persistence, and tab switching (if applicable).

---

# Development Rule

Before merging any feature with a tutorial:

- Every step must have a `data-tutorial` attribute on its target element.
- Every user-facing string must use i18n keys.
- The tour must handle all trigger types correctly.
- The target elevation cleanup must restore all original values.
- Completion must persist across app restarts.
- The banner must reappear when the tutorial is incomplete.
- No hardcoded text in the tour component.
