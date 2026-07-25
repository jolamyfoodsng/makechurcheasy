
# AI Rule: Global Application Performance Optimization

## Problem

The entire application feels slower than expected.

Logs show:

[DockOBS] Slow call: GetSceneItemList took 1002ms

While this is one symptom, the goal is to optimize the entire application so that UI interactions feel instant, regardless of OBS, database, filesystem, or network latency.

The user should never perceive lag when:

- Opening tabs
- Switching tabs
- Selecting songs
- Selecting Bible verses
- Opening media
- Navigating slides
- Editing content
- Changing themes
- Opening modals
- Managing scenes
- Switching pages

---

# Rule 1: UI Must Never Wait For External Systems

The UI should update immediately.

Never block rendering while waiting for:

- OBS
- Tauri commands
- Filesystem
- Database
- API requests
- Broadcast channels

Bad:

Click button
→ Wait for response
→ Update UI

Good:

Click button
→ Update UI immediately
→ Perform work in background
→ Reconcile if needed

---

# Rule 2: Cache Expensive OBS Requests

The following OBS requests are expensive and must be cached:

GetSceneList
GetSceneItemList
GetInputList
GetSourceScreenshot
GetSceneItemTransform
GetGroupSceneItemList

Never call these repeatedly during normal UI usage.

Build cache layers:

obsSceneCache
obsInputCache
obsSourceCache

Refresh only when:

- OBS reconnects
- User manually refreshes
- Scene structure changes

---

# Rule 3: Eliminate Repeated Computations

Identify expensive functions that run every render.

Examples:

parseLyricSections()
parseBibleReference()
filterMediaItems()
buildThemePreview()
generateSceneTree()
sortLargeLists()

Memoize results.

Only recalculate when actual inputs change.

---

# Rule 4: Large Lists Must Be Virtualized

Any list over 50 items should use virtualization.

Examples:

- Worship songs
- Bible search results
- Media library
- Scene lists
- Theme lists
- Logs
- Templates

Only render visible items.

Use:

react-window
react-virtualized
TanStack Virtual

---

# Rule 5: Aggressive Lazy Loading

Never load everything at startup.

Lazy load:

- Theme editor
- PDF importer
- Analytics
- Translation tools
- AI features
- Theme previews
- Video processing modules
- OBS diagnostic tools

Load only when opened.

---

# Rule 6: Reduce React Re-renders

Audit components using React DevTools Profiler.

Common issues:

- Inline object creation
- Inline arrays
- Inline callbacks
- Missing useMemo
- Missing useCallback

Large components should not rerender because unrelated state changed.

---

# Rule 7: Split Global State

Avoid state updates causing entire sections of the app to rerender.

State should be localized.

Changing:

selectedSlide

should not rerender:

- media browser
- Bible tab
- themes
- scenes
- settings

---

# Rule 8: Debounce Expensive Operations

Debounce:

Search boxes
Theme adjustments
Text formatting
Bible searching
OBS updates
Analytics tracking

Recommended:

Search:
250ms

Theme sliders:
150ms

OBS updates:
100ms

---

# Rule 9: Background Processing

Move heavy work off the UI thread.

Examples:

PDF parsing
Song importing
Theme generation
Image processing
Search indexing
Bible indexing

Use:

- Web Workers
- Rust commands
- Background tasks

The UI thread should remain free for rendering.

---

# Rule 10: Reduce Startup Work

Measure startup.

Do not:

- Load every theme
- Load every song
- Load every scene
- Load every preview image
- Load every cache

Load only what is visible.

Target:

Cold startup:
< 2 seconds

Warm startup:
< 1 second

---

# Rule 11: Avoid Duplicate Requests

Many requests appear repeatedly.

Implement request deduplication.

If:

GetSceneItemList

is already running,

do not start another one.

Return the pending promise instead.

---

# Rule 12: Add Global Performance Monitoring

Track:

Render duration
OBS latency
Tauri latency
Filesystem latency
Search latency
Theme rendering latency

Log:

> 16ms = warning

> 50ms = slow

> 100ms = critical

Example:

[Perf] Theme Render: 8ms
[Perf] Bible Search: 12ms
[Perf] OBS Push: 22ms
[Perf] Scene Cache Refresh: 1045ms

---

# Rule 13: Separate Preview From Backend Work

Every preview in the app should be instant.

Previews should render from:

local state
cached data

Never from:

live OBS queries
filesystem queries
network queries

Backend updates should happen asynchronously.

---

# Rule 14: Audit All 500ms+ Operations

Search codebase for operations exceeding:

500ms

Examples:

GetSceneItemList
PDF imports
Scene refreshes
Theme generation

Profile each one.

Determine:

- Can it be cached?
- Can it be lazy loaded?
- Can it be moved to background?
- Can it be batched?

---

# Target Performance Goals

Tab switching:
< 16ms

Modal open:
< 50ms

Song selection:
< 50ms

Bible verse selection:
< 50ms

Theme preview:
< 50ms

Scene switching:
instant UI feedback

Search:
< 100ms

Startup:
< 2s

No operation should freeze the UI thread.

The application should feel native, instantaneous, and responsive even when OBS, files, or network operations are slow.