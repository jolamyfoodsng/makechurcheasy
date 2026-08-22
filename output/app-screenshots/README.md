# MakeChurchEasy function screenshot library

This library is organized by what the user is doing, not by which screen is open.

Each verified function has:

- an `*-obs.png` capture of the full OBS Studio window after the output was sent;
- a `*-dock-popover.png` (or `*-dock.png`) capture showing the matching dock mode, settings, or popover before projection.

## Verified function captures

### Bible

- `01-bible-full`: Full Bible reading output with Quick Settings visible.
- `02-bible-compare-translations`: KJV/NIV comparison output with comparison controls visible.
- `03-bible-compare-passages`: Two-passage comparison output with the passage controls visible.
- `04-bible-lower-third`: Scripture lower-third output with Bible LT mode visible.

### Worship and Notes

- `05-worship-slide`: Worship slide output with worship settings visible.
- `06-notes-slide`: Notes slide output with notes settings visible.

### Media

- `07-media-image`: Uploaded image output with the image display popover visible.
- `08-media-video`: Uploaded video output with video display controls visible.
- `09-media-pattern`: Pattern output with the pattern browser visible.
- `10-media-text`: Text overlay output with the text editor visible.

### Ministry

- `11-ministry-countdown`: Running Pre-Service countdown with countdown actions visible.
- `12-ministry-ticker`: Ticker output with the ticker color popover visible.
- `13-ministry-lower-third`: Speaker lower-third output with appearance controls visible.

### Multi-View

- `14-multiview`: Multi-View frame/settings controls visible, with the configured `MV: Multiview 1` OBS scene shown as the output proof.

## Empty state captured

- `15-media-animations-empty-dock.png`: Media → Animations empty state. The local library currently reports `0` animations, so there is no honest OBS projection pair for this item yet.

All files are intentionally kept at the capture window size so they can be reused for product documentation, SEO pages, and feature walkthroughs without losing the OBS context.
