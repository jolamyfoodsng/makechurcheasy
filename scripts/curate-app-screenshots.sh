#!/bin/zsh
set -euo pipefail

ROOT="/Users/pc/Desktop/Code/makechurcheasy/output/app-screenshots"
RAW="$ROOT/raw"
OUT="$ROOT/curated"
MARK="$ROOT/mce-mark.png"

mkdir -p "$OUT"

while IFS=$'\t' read -r file title; do
  [[ -z "$file" ]] && continue
  ffmpeg -hide_banner -loglevel error -y \
    -i "$RAW/$file" \
    -i "$MARK" \
    -filter_complex "[0:v]scale=1480:790:force_original_aspect_ratio=decrease,pad=1480:790:(ow-iw)/2:(oh-ih)/2:color=0x141a2b,pad=1600:1000:60:120:color=0x0d1324,drawbox=x=60:y=100:w=1480:h=2:color=0x2f63ff:t=fill,drawbox=x=60:y=120:w=1480:h=790:color=0x334155:t=2[base];[1:v]format=rgba[mark];[base][mark]overlay=76:20:format=auto[v]" \
    -map "[v]" \
    -frames:v 1 "$OUT/${file%.png}.png"
done <<'SCREENSHOTS'
01-main-dashboard.png	Main Dashboard
03-main-themes.png	Themes
04-main-bible-library.png	Bible Library
05-main-worship-library.png	Worship Library
06-main-media-library.png	Media Library
07-main-multiview-layouts.png	Multi View Layouts
08-main-presentation.png	Presentation Output
09-main-credits.png	Credits and Usage
10-main-settings-general.png	Settings - General
11-main-settings-branding.png	Settings - Branding
12-main-settings-appearance.png	Settings - Appearance
13-main-settings-obs.png	Settings - OBS Connection
14-main-settings-mobile-remote.png	Settings - Mobile Remote
15-main-settings-automations.png	Settings - Automations
16-dock-media-uploads.png	Media - Uploads
17-dock-media-animations.png	Media - Animations
18-dock-media-patterns.png	Media - Patterns
19-dock-media-text.png	Media - Text Overlays
20-dock-media-videos.png	Media - Video Filter
21-dock-media-images.png	Media - Image Filter
23-dock-bible-default.png	Bible Reader
24-dock-bible-compare-translations.png	Bible - Compare Translations
25-dock-bible-compare-passage.png	Bible - Compare Passages
26-dock-bible-lower-third.png	Bible - Lower Third
27-dock-bible-browser.png	Bible - Browse Scripture
28-dock-worship-default.png	Worship Slides
29-dock-notes.png	Worship - Notes
30-dock-worship-lower-third.png	Worship - Lower Third
31-dock-worship-translation.png	Worship - Translation
32-dock-ministry.png	Ministry - Ticker
33-dock-ministry-lower-thirds.png	Ministry - Lower Thirds
34-dock-ministry-countdowns.png	Ministry - Countdowns
35-dock-multiview.png	Dock - Multi View
36-obs-main-with-mce-dock.png	OBS Studio with MCE Dock
SCREENSHOTS

echo "Created $(find "$OUT" -maxdepth 1 -type f -name '*.png' | wc -l | tr -d ' ') curated screenshots in $OUT"
