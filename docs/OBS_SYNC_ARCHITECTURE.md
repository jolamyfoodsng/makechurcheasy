# OBS Synchronization Architecture Rule

## Document Hierarchy

This document is subordinate to:

1. DESIGN_SYSTEM_MASTER.md (if exists)
2. STYLE_DESIGN.md
3. COMPONENT_LIBRARY.md
4. AI_RULES.md

If any conflict exists between this document and the above, the higher-priority document wins.

## Purpose

This document defines the global synchronization architecture between VerseCast Studio and OBS.

Core Principle

> OBS is the Source of Truth.
>
> The application UI, local React state, and cached data are representations of OBS—not the other way around.

The application must never assume that its local state accurately reflects what exists in OBS. Every module should synchronize with OBS before making decisions or performing operations.

---

# Architecture Principles

## 1. OBS is authoritative

Do not rely on:

- React state
- Zustand stores
- Cached scene IDs
- Previous session state
- Local persistence

Instead, always verify against OBS.

Incorrect:

text React State ↓  Scene Exists

Correct:

text OBS ↓  Scan ↓  Update Application State

---

## 2. Synchronize on every important lifecycle event

Every OBS-aware module must synchronize when:

- OBS connects
- OBS reconnects
- The application starts
- The user refreshes the application
- A module is opened
- A workspace is restored
- After Push operations
- After Update operations
- After Clear operations

The UI should always reflect the current state inside OBS.

---

# Global OBS Sync Service

A centralized synchronization service should manage all OBS discovery.

OBS Connected         │         ▼ OBS Sync Service         │         ├── GetSceneList()         ├── GetSceneItemList()         ├── GetInputList()         ├── GetGroupList()         ├── GetCurrentProgramScene()         └── Other OBS queries         │         ▼ Global OBS State         │         ▼ Notify all modules

Individual modules should subscribe to this synchronized state instead of performing duplicate scans independently whenever possible.

---

# Push Operations

Every Push operation must be idempotent.

Workflow:

User clicks Push         │         ▼ Synchronize with OBS         │         ▼ Does resource already exist?         │  ┌──────┴──────┐  │             │ Yes            No  │             │  ▼             ▼ Update UI    Create Resources  │             │  └──────┬──────┘         ▼ Verify creation         ▼ Synchronize OBS         ▼ Refresh UI

A Push operation should never blindly recreate scenes or sources.

---

# Update Operations

When resources already exist:

Update         │         ▼ Locate existing OBS resources         ▼ Apply changes         ▼ Verify         ▼ Synchronize         ▼ Refresh UI

Avoid deleting and recreating resources unless absolutely necessary.

---

# Clear Operations

Clear should never rely on cached IDs.

Workflow:

Clear         │         ▼ Scan OBS         ▼ Locate VerseCast resources         ▼ Delete existing resources         ▼ Verify deletion         ▼ Synchronize OBS         ▼ Refresh UI

This ensures the operation succeeds even if the user manually modified OBS.

---

# Module Requirements

The following modules must implement synchronization.

## Multi-View

Synchronize:

- Existing multiview scenes
- Scene assignments
- Backgrounds
- Push state

Buttons should display based on actual OBS state:

- Not in OBS:    "Push To OBS"
- In OBS:        "Update In OBS" / "Remove From OBS"

Follow STYLE_DESIGN.md button copy rules.

---

## Bible

Synchronize:

- Fullscreen output
- Lower Third output
- Active scripture scene
- Theme currently in use

Restore the correct UI after refresh.

---

## Worship

Synchronize:

- Lyrics output
- Active theme
- Current presentation state

---

## Lower Third

Synchronize:

- Existing lower-third scene
- Active layout
- Current theme
- Running state

---

## Fullscreen

Synchronize:

- Existing fullscreen scene
- Current theme
- Current background

---

## Media

Synchronize:

- Images
- Videos
- Media sources
- Playback state

---

## Ticker

Synchronize:

- Existing ticker
- Running state
- Current configuration

Buttons should change automatically based on OBS state:

- Not running:   "Start Ticker"
- Running:       "Update Ticker" / "Stop Ticker"

Follow STYLE_DESIGN.md button copy rules.

---

## Countdown

Synchronize:

- Existing timer
- Remaining time
- Running state

---

## Production

Synchronize:

- Program scene
- Preview scene
- Active modules
- Assigned themes
- Active outputs

---

# Resource Ownership

Every OBS resource created by VerseCast should be identifiable.

## Metadata Structure

Resources should contain metadata:

Plugin: VerseCast
Module: Bible
Version: 2.x
Resource ID: Unique Identifier
Owner: VerseCast
Created: ISO timestamp
LastSynced: ISO timestamp

This allows the application to confidently determine which OBS resources belong to VerseCast.

## Identification Rules

Avoid relying solely on scene names.

Instead, use a combination of:

1. Name prefix pattern (e.g., "VerseCast MV-001")
2. Metadata tags in source settings
3. Custom scene item data

## Conflict Resolution

If OBS state differs from expected:

1. OBS wins (source of truth)
2. Log the discrepancy to console
3. Notify user of state change via toast
4. Offer repair action if available
5. Never silently overwrite OBS state

---

# UI Rules

Buttons should represent OBS state and follow the Design System copy rules.

## Button Labels

Per STYLE_DESIGN.md, always communicate outcomes:

If resource does not exist:
Push To OBS

If resource exists:
Update In OBS
Remove From OBS

If resource is currently active:
Live

If resource is missing unexpectedly:
Repair

Never use vague labels like "Push" or "Clear".

## Status Badges

Use COMPONENT_LIBRARY.md badge system (24px height, 999px radius):

- Synced:    Green badge "Synced"
- Not Found: Gray badge "Not in OBS"
- Live:      Blue badge "Live"
- Error:     Red badge "Needs Repair"

## Accessibility

- All sync status indicators must meet 4.5:1 contrast ratio
- All buttons must be keyboard navigable
- Button touch targets: minimum 44x44px (desktop), 56px (mobile)
- Screen readers must announce sync state changes via aria-live

## State Transitions

When sync state changes, use STYLE_DESIGN.md animation rules:

- Button text changes: Fade (150ms)
- Status badge updates: Fade (150ms)
- Resource appears/disappears: Slide (200ms)
- Maximum transition: 300ms
- Allowed: Fade, Slide, Scale
- Avoid: Bounce, Shake, Flash

## Mobile Control

When sync controls appear on mobile:

- Minimum touch target: 56px
- Use large button variant only
- Simplified status display

The UI should never be based solely on local state.

---

# Error Handling

Every OBS operation should be transactional.

Disable controls         ▼ Synchronize OBS         ▼ Validate         ▼ Execute sequentially         ▼ Verify         ▼ Synchronize         ▼ Refresh UI         ▼ Enable controls

If any operation fails:

- Stop further execution.
- Report the error using toast notification (STYLE_DESIGN.md: top right, 4000ms).
- Use appropriate validation color: Error = Red (#EF4444).
- Leave OBS in a valid state.
- Refresh synchronization before allowing another operation.

Avoid parallel scene creation unless the OBS API explicitly guarantees safety.

## Error Toast Format

Success:   "Scenes created successfully"
Warning:   "Some scenes may need manual review"
Error:     "Failed to create scenes. Check OBS connection."
Info:      "Syncing with OBS..."

---

# Performance

To reduce unnecessary WebSocket traffic:

- Perform one centralized synchronization.
- Cache the synchronized OBS state.
- Notify subscribed modules of changes.
- Allow modules to request a targeted refresh only when required.

---

# Rule Summary

Every OBS-aware feature must follow these principles:

1. OBS is the single source of truth.
2. Never trust local UI state without verification.
3. Synchronize before Push, Update, or Clear.
4. Synchronize after every operation.
5. Build idempotent operations that never duplicate resources.
6. Restore application state from OBS after refresh or reconnect.
7. Identify VerseCast-owned resources using metadata where possible.
8. Use a centralized synchronization service to avoid duplicate OBS queries.
9. Always keep the UI synchronized with the current OBS state.
10. Design every feature to recover gracefully from refreshes, reconnects, crashes, and manual changes made directly in OBS.
11. Follow STYLE_DESIGN.md button copy rules (always communicate outcomes).
12. Use COMPONENT_LIBRARY.md badge system for status indicators.
13. Meet accessibility requirements (4.5:1 contrast, keyboard nav, touch targets).
14. Use STYLE_DESIGN.md animation rules for state transitions.
15. Support mobile control with 56px minimum touch targets.