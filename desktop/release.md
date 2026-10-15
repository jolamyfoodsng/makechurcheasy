# Release notes: Presentation Studio update

Date: 15 October 2026

## New and improved

### Broadcast graphics
- Cards now have two buttons (Project, Edit) and a three-dots menu (Preview, Position and time, Delete).
- Graphics can be placed on screen: position (dropdown, e.g. Bottom left), size, and how long they stay.
- Category is a dropdown. The editor shows Content first, with labels on top and two columns.
- "My graphics" sits inside Broadcast graphics, beside "All". Saved graphics can be viewed and edited there.
- Fixed: a projected graphic now appears on the output screen.

### Camera and Show Content
- Camera card: smaller dropdown, a small live preview at the top right, and one Show/Hide button. Hover explains what it does.
- Show Content has the same single Show/Hide button at the top.

### Output screen
- The output now fills taller screens instead of stopping at a 16:9 box (Bible, worship and notes overlays).
- Switching between Lower Third and Full Screen no longer flashes the church logo. The logo appears only after a few seconds of nothing on screen, and a dark screen shows until then.
- Phone link (studio-output): on phones the page loads lighter (layers load when needed, fewer camera updates). This is a best-guess fix for the "a problem repeatedly occurred" crash.

### Logo and Compare
- The logo you set now stays after a refresh, on disk and in the cloud backup.
- Compare no longer turns itself on after a refresh.

### Free plan limits
- Camera: 3 turn-ons per day.
- Project graphics: 5 per day.
- Saved graphics: 3.
- Limits are checked inside the app only.

### Settings
- The Share over Wi-Fi link is at the top, with an explanation (same Wi-Fi or hotspot). NDI is marked "coming soon".

### Messages
- Studio messages now appear as a toast at the bottom right, so the screen no longer moves.

### Windows
- The local speech-status endpoint now sends the private-network permission header. This is meant to keep the Dock LM tab from showing "Offline" on Windows. Untested on Windows.

## Removed for now
- Compare **Passages** is hidden. Save did nothing for you and the cause was not found. The code is still in the project. Translation compare is unchanged.

## Known issues
- Native camera error: "CameraFormat 1920x1080@15FPS YUYV" is not fixed.
- Free plan limits can be bypassed by a determined user (no server check).
- The phone crash fix and the Windows Dock LM fix are unconfirmed.
- Multi-View page: no changes made (design options only).

## Before you deploy
1. `npx tsc --noEmit -p .`
2. `npm run build`
3. `cargo build` (or restart `tauri dev`) for the `lib.rs` change.
4. Test the built app: camera card, Show Content, toast, Broadcast graphics (Project, Edit, ⋯, My graphics), logo after refresh, Wi-Fi link in Settings.
5. Check that `OUTPUT_PAGE_REV` in `studioEngine.ts` matches `PAGE_REV` in `public/studio-output.html`, so open output windows reload once.
6. Reload the output page on a phone, and test Dock LM once on Windows.

All styles were added to `StudioShell.css`, which `StudioPage.tsx` already imports. No new CSS files were added.
