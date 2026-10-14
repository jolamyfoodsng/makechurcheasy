# MakeChurchEazy: what the app does (a brief for a design AI)

Paste this whole file into the design AI, then add your request at the end (for example "Design the Studio screen" or "Design 6 new lower thirds"). Everything here is real: it comes from the product's own notes and code. Where something is planned but not built yet, it says so.

---

## 1. What the product is

**MakeChurchEazy** (also written "Make Church Eazy") is a desktop app for churches that put their services on screen and on live stream. It does two jobs:

1. **Controls what the congregation and the live-stream viewers see.** Bible verses, song lyrics, sermon notes, pictures, videos, lower thirds (name bars), tickers, countdown timers, banners.
2. **Helps a small, often volunteer, production team run the service** without needing a broadcast engineer: schedule, voice-detected Bible verses, one-click graphics, multistreaming.

Website and brand: makechurcheazy.com. Support: support@makechurcheazy.com.

Who uses it: church media volunteers, usually one person on a laptop during a live service, under time pressure, often in a dim room. Many are not technical. Many churches are in Africa (Yoruba, Igbo, Twi and other languages matter), so fonts must support wide Latin character sets. The app is translated into about 17 languages.

Platforms: Mac and Windows desktop app (Tauri + React). A mobile remote exists. A web dashboard handles account, billing, church profile and admin.

---

## 2. How the pieces fit together

The app is one program, but the audience sees its output in three places:

| Surface | What it is | Who sees it |
|---|---|---|
| **The main app window** | Pages: Dashboard, Studio, Themes, Broadcast Graphics, Settings, etc. | The operator |
| **The OBS Dock** (`dock.html`) | A narrow control panel the operator docks inside OBS Studio. It has tabs for Bible, Worship, Notes, Media, Time/Countdowns, Ministry (lower thirds and tickers), Verse AI, Planner. | The operator, inside OBS |
| **Output pages** (overlays) | Transparent web pages (1920 × 1080) that OBS loads as Browser Sources, or a projector window, or a phone via a Wi-Fi link. These are what the audience sees. | Congregation, stream viewers |

So a designer can be asked to design three different things: **operator screens** (app and Dock), **audience output** (themes, graphics, timers), and **marketing/email** (see the end).

Two ways to put things on screen:
- **With OBS:** the app drives OBS (scenes, browser sources, streaming). Best for churches that stream.
- **Without OBS ("Presentation Studio" / presentation link):** a projector window or a web link. Built because OBS plus the app is too heavy for many church laptops. A Free-plan user gets one presentation link.

---

## 3. Visual identity today

Use this as the starting point; the designer may propose improvements.

- **Mode:** dark UI first. A light theme exists.
- **Colours (dark):** page background `#0c0e17`, panels `#131724` / `#111726`, primary indigo `#4F46E5` (hover `#4338CA`), accent blue `#6366F1`, "live" green `#10B981`.
- **In Studio / live-control screens:** orange/amber (`#d97706`) means *next / in Preview*, red (`#dc2626`) means *LIVE / on screen now*, blue highlights the selected item. Keep that meaning everywhere.
- **Fonts (UI):** the operating system's own font (SF Pro on Mac, Segoe UI Variable on Windows). Scripture and worship text use **Questrial** and **Charis SIL** (a book-style serif, broad African-language coverage). Output graphics bundle Montserrat, Saira Semi Condensed, Playfair Display, Arimo, Anton, Tinos and others.
- **Tone:** practical, calm, not flashy. The owner has said several AI-invented designs "look AI" and were rejected. Designs built from real references (his screenshots, EasyWorship, Holyrics, ProPresenter, BibleCast, OBS) are accepted.
- **Layout taste (from his feedback):** compact, few buttons, OBS-like. He asked for fewer buttons ("too much"), one Preview screen instead of Preview + Program in the app, the list of books on the left at full height, and verses in a wide list at the bottom. He reads small text from a distance in a dark room, so contrast must be high; he said one font looked "too faint" and wanted it bolder and brighter.

---

## 4. Main app pages (sidebar)

1. **Dashboard** – start screen. Shows a Free-plan banner if on Free, quick actions, status.
2. **Studio** – the in-app projector control room (details in section 5). Hides the sidebar and fills the window.
3. **Presentation** – set up the projector or the web link: choose the screen, share a Wi-Fi link, link to OBS.
4. **Multi-Stream** (Broadcast) – send one stream to several platforms at once. Speaker/ministry profiles, each with destinations (YouTube, Facebook, etc.) and stream keys. A "Where your stream goes" status panel. Plan-limited (Free = one channel; hours per month by plan).
5. **Resources** – the library: tabs for Worship (songs), Bible (translations), Media (pictures and videos).
6. **Themes** – gallery of ready-made themes for Bible verses, lyrics and notes (see section 7). "Use for: Bible / Worship / Notes" chips, search, sort, a Theme Library for new users.
7. **Broadcast Graphics** – library of lower thirds and graphics (see section 8). Customize, save, add to OBS.
8. **Templates & Graphics / Design Studio** – create and edit templates.
9. **Countdowns** – two tabs: Designs (countdown/clock timer designs) and Rundowns (a running order of timers).
10. **Service Planner / Schedule** – the order of service.
11. **Multi View** – multi-camera/scene layouts (gated by plan).
12. **Transcripts** – saved sermon transcripts from Verse AI.
13. **Speech to Scripture (Verse AI page)** – the full live voice-to-Bible page.
14. **Credits** – usage credits for AI features.
15. **Tutorials**, **Settings** (branding, church info, OBS connection, cloud backup, Dock URL), **Sign out**.

Plan awareness appears everywhere: a coloured top strip says "You're on the Free plan" with the limits, a FREE pill beside the app name, lock badges on paid areas, and an upgrade modal when a limit is hit.

---

## 5. Studio (the live control room) — most important screen to design

Purpose: run the projector for a whole service from the app, no OBS needed. Layout agreed on 2026-10-13:

```
┌────────────────────────────────────────────────────────────────────┐
│ Back · Bible · Worship · Notes · Media · Lower thirds │ Outputs  ⚙ │
├───────────────┬───────────────────────────────┬────────────────────┤
│ LEFT LIST     │  ONE PREVIEW SCREEN           │ Today's schedule   │
│ (full height) │  [Go live]                    │ (service order,    │
│ Bible: books  │  LIVE: what's on the projector│  LIVE / next marked)│
│ that drop     │  Prev / Next                  │                    │
│ down their    │  Fade | Cut                   │                    │
│ chapters;     ├───────────────────────────────┴────────────────────┤
│ Worship:      │ BOTTOM PANEL, two tabs:  [Verses/Slides] [Verse AI]  │
│ songs;        │  content of the open tab, full width                 │
│ Notes, Media  │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
```

Behaviour:
- **One Preview screen** inside the app. The Program output is the projector window or link; a small "LIVE" line says what is on it. Right-click Preview to open a projector on a chosen screen.
- **Click = Preview, double-click = go live.** Space = go live and move on, PageUp = back, B = black screen, F11 = full screen. Black, Logo and Clear are also in a right-click menu.
- **Bible tab:** search box ("j316", "john 3:16", or a phrase), translation picker, all 66 books colour-coded by group (Law, History, Poetry, Prophets, Gospels, Acts, Epistles, Revelation). Click a book and its chapter numbers drop down under it. The bottom panel shows the chapter's verses in a wide readable list (verse number, text, LIVE tag).
- **Worship tab:** song list with search; the bottom shows slide cards coloured by section (Verse, Chorus, Bridge…).
- **Notes tab:** note list; bottom shows note slides.
- **Media tab:** pictures and videos as thumbnails. Videos will need play/pause, loop, mute, fill/fit (not built yet).
- **Lower thirds tab:** banners, logo, camera, looping video laid on top of the words, each with Show/Hide ("Screen Mix").
- **Verse AI tab (always available, in every tab):** three columns: Transcript (live words as spoken; click a line to keep it as a sermon point), Sermon notes (numbered points, "Convert notes to project" turns them into slides in today's schedule), and the verse lists, Queue ("verses named directly", like "John 3:16") and Suggestions ("verses the message seems to be about"). The Start/Stop listening button and microphone picker sit at the top-left of the tab. Requested change not yet made: put the verses column on the right and the notes in the middle.
- **Top bar options:** Outputs (choose HDMI projector or TV, share over Wi-Fi, NDI "coming soon"), Preview-first toggle, Full screen, a gear for settings.

Open design questions from the owner: media folders on the left; Hide-text button for Worship; where Broadcast Graphics lower thirds go on the projector.

---

## 6. The OBS Dock (the same job, in a narrow panel)

A tall, narrow panel docked inside OBS. It must work from about 400 px wide down to a very short height; it auto-fits and compacts. Tabs:

- **Bible:** search, book/chapter/verse, version switch, Compare (two translations side by side), Full screen / Lower third switch, Show/Hide, text size presets, reference and version toggles, quick "Size" panel (text size, reference size, line height, move up/down for lower thirds), text effects (outline, shadow).
- **Worship:** songs and slides, same output controls.
- **Notes:** sermon notes slides.
- **Media:** pictures and videos on screen.
- **Time / Countdowns:** presets (Pre-Service, Worship Set, Sermon Start), clock, and the **Rundown** sub-tab (run timers, add or subtract time, send messages to the presenter).
- **Ministry:** lower-third editor (fill fields, colours, text styles, size, position, motion, Send / Animate out, saved slots, Preview), and tickers.
- **Verse AI (LM / Scripture Assistant):** voice detection, same verse styling as the Bible tab.
- **Planner / Schedule drawer ("QUICK"):** today's service items, click to show.
- Header: no profile pill; the plan/limits are shown elsewhere. A "Send to another scene" (Output) cast button appears in OBS mode only.

---

## 7. Themes (how Bible verses, lyrics and notes look on screen)

A **theme** is a layered design on a 1920 × 1080 canvas: boxes, images, text layers, backgrounds, each with position, size, fonts, colours, effects and animation (in / out / loop). Every theme has two looks: **Full screen** and **Lower third**.

- Layers show tokens: `{text}` (the verse or lyric), `{reference}` ("John 3:16 (KJV)"), a verse-number colour, an optional heading.
- Special feature: **\*important words\*** — a speaker or operator wraps words in asterisks and they appear in the theme's own highlight colour and bolder. Each theme derives a colour and can override it ("Important words colour").
- Built-in themes include Royal Blue Glow (default), Serif Tab Band, Royal Frame, Confetti Frame, Chapter Number, Clean Paper, Navy Scripture, Cinematic Serif, Paper Light, Sunset Bold, Glass Card, Split Chapter, Caption Rule, Broadcast Caption, Glory Blue, Violet Praise, and others (about 18+). New users see only 3 by default; the rest sit in a **Theme Library** they add from. Free plan opens 2 themes; Basic 10.
- Editors: a **Themes gallery** (preview, Use theme, Customize) and a **layer editor** (select, drag with snap, resize, per-layer panel, undo/redo).
- Change on the fly: next verse swaps quickly (about 0.1–0.3 s) so only the first verse plays the full entrance animation.
- OBS constraint: output pages run in an old Chromium (CEF 103). Avoid CSS `:has`, new features without fallbacks, and external web fonts (only bundled fonts load).

---

## 8. Broadcast Graphics (lower thirds, bars, boards)

A library of about 82 built-in graphics plus the user's own saved/customized ones, shown as cards in categories: **Service, Speaker, Giving, Announcements, Logo & Branding, Subscribe, Social, Quotes** (more can be added). Free plan can use 3; Basic 15; Growth unlimited. The first N are open; the rest show a LOCKED badge.

What a graphic does:
- Plays an **in animation**, holds, plays an **out animation**. Some stay until "Animate out"; others auto-hide after N seconds. Social Handles cycles through platforms N times.
- Has **fields** (text boxes with Aa/AA/Ab case/size/weight chips), **colour pickers**, a **size** (S/M/L/XL), **position** (left/centre/right, top/bottom), and optional **pictures** (logo, photo).
- **Auto-fill from the church profile:** the church name, pastor and role, website, phone, email, address and social handles fill in automatically from the church's website profile, and follow later changes. Anything the operator typed is never overwritten.
- Examples already built: Prayer Bar, Website Bar, Live Social Bar, Arrow Logo Bar, Contact Bar, Share Your Testimony, Question & Answer Bar, Moment + Timer (clock / countdown / count-up), Giving Accounts Board (full-screen, up to 6 bank accounts), 8 Quote styles, 4 Sermon Quote graphics (Portrait Card, Clean Panel, Scripture Highlight, Split Portrait), Sunday graphics (minister, prayer, healing, bishop, give, subscribe, socials, ads), and more.
- **Rules for all defaults:** use placeholder data only (yourchurch.org, hello@yourchurch.org, "Your *tomorrow* is not cancelled…"). Never a real church's name, email or quote.
- Graphics are authored as a small package: fields, HTML, CSS, animation steps. Designers can supply a look and a developer converts it; the style must survive OBS's old browser.
- **Tickers:** scrolling bars at the bottom (Sunrise Pill, Ocean Pill, Royal Glow, Emerald Live, Midnight Gold, Minimal, Glass, Rotating Logo, Social Footer…). Speed, spacing, divider, colours, messages, live sync while on air.
- Admins can pause, lock to a plan, or upload new graphics from the web admin.

---

## 9. Countdowns, clocks and rundowns

- **13 built-in countdown designs** (flip clock, red blocks, coral segments, LED white/glow, retro parchment, outline purple, stage timer, welcome crimson/night/violet, brush circle, stamp) built from the same layer editor as Themes. One design serves countdown, count-up, clock and rundown timers.
- Timer tokens available in any text layer: sign, time, minutes, seconds, hours, title, subtitle, message, speaker.
- Features: flip digits, 7-segment digits, warning colours at yellow/red thresholds, progress bars.
- **Rundowns** (like StageTimer): an ordered list of timers (countdown, count-up, time of day) plus quick messages ("Wrap up", flash, colours). Runs from the Dock. A **presenter screen** is a web page for the platform: a phone or tablet shows the big timer and messages.

---

## 10. Verse AI (voice to Bible)

The system listens to the pastor, shows the transcript, **detects verses** (named references and "this sounds like John 3:16"), and offers them as clickable cards. It can also build **sermon notes** from the transcript and turn them into slides. It uses credits and a daily limit on Free (about 15 min a day, 20 on Sundays). Sensitivity slider, a mic level meter, a connection status. The detected verse uses the same theme as the Bible tab.

---

## 11. Other capabilities

- **Multistream in the cloud:** one stream out of OBS to several platforms; monthly hours by plan.
- **Presentation link / projector:** shows Bible, worship, media, tickers, countdowns, graphics on a projector window or a web link on any device.
- **Church profile (on the website):** name, pastor, logo, website, phone, email, address, social links; syncs to the app every few minutes.
- **Cloud backup:** schedule (off/daily/weekly/monthly), pictures and videos optional, storage quota per plan, "new device detected, download your content?" prompt.
- **Offline use:** subscription status is cached; the app syncs every two weeks.
- **Mobile remote:** control from a phone.
- **App updates, announcements and emails:** in-app update flow and announcements; branded transactional emails.
- **Languages:** about 17 translations of the interface.
- **Admin dashboard (web, for the owner):** users, plan config, discounts and win-back offers, announcements, broadcast graphics control, activity.

---

## 12. Plans (affects what designs must show)

| | Free | Basic | Growth / Pro |
|---|---|---|---|
| Broadcast graphics | 3 | 15 | unlimited |
| Themes open | 2 | 10 | all |
| Tickers | 3 themes | unlimited | unlimited |
| Multistream | 1 channel | hours/month (10) | more (20–40) |
| Verse AI | 15 min/day | more | more |
| Cloud backup | no | 5 GB | 20 GB |

A 7-day-style trial counts as Growth. Free state must be obvious in the UI without nagging: top strip, FREE pill, lock badges, upgrade modals. Design these as calm, not pushy.

---

## 13. Design rules and constraints to give the AI

- **Audience screens are 1920 × 1080**, transparent where they overlay video. Lower thirds sit near the bottom and must be readable on a phone-sized stream. Keep safe margins (about 40 px).
- **OBS browser sources use an old Chromium (CEF 103).** Avoid `:has`, container queries, newer CSS; no external web fonts; images as local files or data URLs.
- **Use only bundled fonts**: Montserrat (400–800), Saira Semi Condensed 700, Playfair Display, Arimo 700, Anton, Tinos, Questrial, Charis SIL. Archivo and Manrope are not bundled.
- **Placeholder content only** in any default or example.
- **Make graphics editable:** every colour as a colour field, every text as a field, sizes S–XL, position choices.
- **Animations:** give each graphic an in, an out, and an optional ambient loop; in OBS on weak machines loops are turned off on virtual GPUs.
- **Operator UI is used in the dark under pressure:** big hit targets for Go live and Next, high contrast, bright text, few buttons, live/next/selected states that are obvious without reading.
- **Do not make it look "AI-generated":** avoid gradients-on-everything, generic glassmorphism, random emoji, and stock "SaaS dashboard" looks. Prefer calm broadcast-software conventions (OBS, EasyWorship, ProPresenter, Holyrics).
- **Wide language support:** names and text can be long, in Yoruba, Igbo, Twi and others; allow wrapping and ellipses; never hard-code English widths.

---

## 14. What a designer can be asked to make

- Operator screens: Studio, the Dock tabs, Themes gallery and layer editor, Broadcast Graphics library and editor, Countdown and Rundown editors, Multi-Stream, Presentation setup, Settings, onboarding (including "projector only" vs "OBS" choice), plan/upgrade modals.
- Audience visuals: Bible/lyric themes (full screen and lower third), lower thirds by category, tickers, countdown timer designs, announcement and giving boards, sermon quote graphics.
- Brand and marketing: logo and wordmark refinements for MakeChurchEazy, email templates (there is an email design system), website sections.

When you ask the design AI, say which of these it is, which surface (app / Dock / audience output), and which plan state to show.

---

## 15. Things planned or not finished (don't design as if they exist)

- Studio: video controls (play, loop, mute, fit), Broadcast Graphics lower thirds on the Studio projector, Hide text for Worship, folders in Media, the "projector-only vs OBS" setup question, NDI, stage screen, alternate output.
- Studio schedule column with Done / LIVE / Next states: design explored (boards A–F), not built; the owner rejected a Now / Next / Later strip as taking too much space.
- Themes: stage look, brand kit, converting old themes.
- Dock: Countdown sub-tab still uses 3 fixed presets.
- Everything built recently has been type-checked and rendered in a test browser but has **not yet been run in the real app or in OBS**.
