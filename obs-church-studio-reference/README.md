# OBS Church Studio

Modern worship presentation and lower-third production tools for OBS Studio.

OBS Church Studio helps churches create beautiful live presentation experiences directly inside OBS using a dock-first workflow.

Built for churches already using OBS.

---

![OBS Church Studio Screenshot](./screenshots/dashboard.png)

---

## Features

### Worship Presentation
- Worship lyric queue management
- Single-click live display
- Lower third and fullscreen lyric modes
- Animated lyric transitions
- Worship themes and templates
- Live queue workflow optimized for operators

### Bible & Scripture
- Scripture lower thirds
- Fullscreen Bible presentation
- Multiple Bible presentation themes
- Animated scripture overlays
- Reference-aware layouts
- Custom typography controls

### Sermon Presentation
- Sermon quote composer
- Prayer overlays
- Scripture + sermon hybrid layouts
- Pastor name and title support
- Theme-based sermon templates
- Lower third and fullscreen sermon modes

### Media & Visuals
- Image backgrounds
- Video backgrounds
- Countdown screens
- Welcome screens
- End screens
- Technical issue overlays
- Motion graphics support

### Production Workflow
- OBS Browser Dock integration
- Dock-first live control workflow
- Studio-mode compatible rendering
- Lightweight HTML/CSS rendering engine
- Live overlay updates
- Production-safe non-blocking UI

---

# Why OBS Church Studio?

Many churches already use OBS Studio for livestreaming,
but lack modern presentation tools for:

- worship lyrics
- scripture overlays
- sermon graphics
- lower thirds
- countdowns
- branded church visuals

OBS Church Studio provides a lightweight presentation layer built specifically for churches using OBS.

Instead of replacing OBS,
it works alongside OBS.

---

# Screenshots

## Dashboard
![Dashboard](./screenshots/dashboard.png)

## Worship Tab
![Worship](./screenshots/worship.png)

## Bible Presentation
![Bible](./screenshots/bible.png)

## Sermon Composer
![Sermon](./screenshots/sermon.png)

## Media Control
![Media](./screenshots/media.png)

---

# Quick Start

## 1. Download OBS Church Studio

Go to:
[Latest Releases](https://github.com/Tayoakosile/obs-church-studio/releases)

Download:
- Windows installer
- macOS build

---

## 2. Open OBS Church Studio

Launch the application.

---

## 3. Copy the Dock URL

Inside the dashboard:

```text
http://127.0.0.1:45678/dock.html
```

Copy the dock address.

---

## 4. Add Browser Dock in OBS

Inside OBS Studio:

```text
View → Docks → Custom Browser Docks
```

Paste the dock URL.

Example:

```text
http://127.0.0.1:45678/dock.html
```

Click:
```text
Apply
```

---

## 5. Start Presenting

You can now control:

- worship lyrics
- scripture overlays
- sermon quotes
- media scenes
- lower thirds
- countdowns

directly from the OBS dock.

---

# How OBS Church Studio Works

OBS Church Studio does NOT replace OBS Studio.

Instead:

- OBS handles livestreaming and transitions
- OBS Church Studio handles presentation content

The app updates:
- browser source overlays
- worship layouts
- lower thirds
- scripture graphics
- presentation themes

inside OBS scenes.

---

# Core Workflow

```text
Edit → Show
```

NOT:

```text
Preview → Program
```

OBS Church Studio focuses on:
stable content rendering,
not broadcast switching.

This makes the app:
- easier to use
- more reliable
- safer during live services

---

# Main Modules

## Worship
Designed for live worship lyric presentation.

Features:
- lyric queue
- fullscreen mode
- lower thirds
- theme support
- live worship workflow

---

## Bible
Present scripture beautifully during services.

Features:
- scripture lower thirds
- fullscreen scripture themes
- animated Bible overlays
- typography customization

---

## Sermon
Fast sermon quote and prayer presentation tools.

Features:
- quote composer
- theme selection
- pastor name support
- fullscreen themes
- lower third templates

---

## Media
Control:
- backgrounds
- videos
- countdowns
- overlays
- technical issue screens

inside OBS.

---

# Theme System

OBS Church Studio uses HTML/CSS-based presentation themes.

This allows:
- beautiful animations
- lightweight rendering
- customizable overlays
- fast updates
- responsive layouts

Theme categories include:
- Worship
- Bible
- Sermon
- Countdown
- Media
- Lower Thirds

---

# System Requirements

## Windows
- Windows 10+
- OBS Studio 30+

## macOS
- macOS Ventura+
- OBS Studio 30+

---

# Recommended OBS Setup

For best experience:

- Use Browser Sources
- Use OBS Studio 30+
- Keep Browser Dock pinned
- Use dedicated presentation scenes

---

# Important Notes

OBS Church Studio is optimized for:
- churches
- ministries
- worship livestreams
- online Bible study
- sermon presentation
- church media teams

This project is NOT affiliated with OBS Studio.

---

# Roadmap

Planned features:

- cloud theme sync
- church branding presets
- multi-language scripture support
- remote presentation control
- service planning workflows
- collaborative media management
- advanced countdown systems
- announcement scheduling

---

# Support

## GitHub Issues
https://github.com/Tayoakosile/obs-church-studio/issues

---

# Contributing

Contributions, suggestions, and feedback are welcome.

Please open:
- issues
- feature requests
- pull requests

---

# License

MIT License

---

# Credits

Built with:
- Electron
- React
- OBS WebSocket
- HTML/CSS animation rendering

Designed for churches using OBS Studio.
