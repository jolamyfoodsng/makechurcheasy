# MakeChurchEasy: Capability Inventory and Problem-First Content Library

**Verified against the current repository:** 10 August 2026  
**Audience:** MakeChurchEasy founders, content partners, TikTok educators, church media teams  
**Purpose:** turn the product into useful, searchable problem-solving content instead of generic app promotion.

## How to read this document

This is a source-backed inventory of the product surfaces currently represented in the MakeChurchEasy codebase. It is also a content catalogue. Every content idea is written as a problem a church media operator might search for.

Use these labels when planning a video:

- **Implemented surface:** the capability is represented in the current desktop, dashboard, API, or mobile source.
- **Plan-gated:** the capability exists but may require a plan, credits, a connected device, or an OBS connection.
- **Live verification required:** the capability should be tested in a real OBS session before publishing a “works every time” claim.
- **Product gap/test backlog:** this is a real problem to investigate or fix; do not present it as solved until it passes a live test.

The list is intentionally broader than a feature list. A feature becomes useful marketing only when it is connected to a painful moment: a blank browser source, lyrics that need cleaning, a verse that must appear quickly, a volunteer who cannot find the right scene, or a sermon that needs to become readable slides.

## 1. What MakeChurchEasy is

MakeChurchEasy is a church presentation and live-production workspace. It connects a dock or remote controller to OBS, or to a browser-based Presentation Link, so a church team can prepare and send Bible verses, lyrics, notes, sermon points, media, lower thirds, tickers, countdowns, and multi-source layouts during a service.

The product is strongest when explained through these outcomes:

1. A volunteer can find and send church content quickly.
2. A speaker can move from spoken words to Bible references and on-screen scripture.
3. A church can make worship lyrics, notes, announcements, and graphics look consistent.
4. A production team can route different content to the correct OBS scene.
5. A service can be planned before it starts and operated as a checklist while live.
6. A church can control presentation from another laptop or a mobile device.
7. A recording or live sermon can become a searchable, translated, exportable transcript.

## 2. Verified product surface

| Area | What the current product represents | Main source anchors |
|---|---|---|
| OBS and presentation | OBS WebSocket connection, preview/program actions, scene routing, browser-source presentation link, reconnect/sync behavior | `desktop/src/dock/dockObsClient.ts`, `desktop/src/pages/PresentationSetupPage.tsx`, `docs/OBS_SYNC_ARCHITECTURE.md` |
| Bible | Reference and keyword search, book/chapter browsing, installed translations, comparison, full-screen and lower-third output, themes, typography, backgrounds, history, favorites, OBS actions | `desktop/src/dock/tabs/DockBibleTab.tsx`, `desktop/src/bible/` |
| Worship | Song library, manual entry, online search, URL/saved/file import, lyric cleanup, automatic splitting, section labels, slide editing, translation, full-screen/lower-third output | `desktop/src/dock/tabs/DockWorshipTab.tsx`, `desktop/src/worship/` |
| Notes | Saved notes, text formatting, paragraph-to-slide conversion, themes, translation, preview/live output, scene routing | `desktop/src/dock/tabs/DockNotesTab.tsx` |
| Sermon | Quote and point lists, speaker/series attribution, slide styling, local text cleanup, history, Bible and lower-third themes, preview/live output | `desktop/src/dock/tabs/DockSermonTab.tsx` |
| Lower thirds and speaker graphics | Theme templates, speaker presets, variable values, title/role branding, appearance controls, saved designs, animation and duration controls | `desktop/src/dock/tabs/DockLowerThirdEditor.tsx`, `desktop/src/components/modules/LowerThirdsModule.tsx`, `desktop/src/components/modules/SpeakerModule.tsx`, `desktop/src/lowerthirds/` |
| Tickers | Announcements, heading, speed, position, looping, pause/resume, branding, themes, scene routing, clear/show state | `desktop/src/dock/tabs/DockMinistryTab.tsx`, `desktop/src/components/modules/TickerModule.tsx` |
| Countdowns | Timers, titles, subtitles, backgrounds, templates, text styles, animation, audio, looping, visibility, end actions, scene actions | `desktop/src/pages/CountdownsPage.tsx`, `desktop/src/dock/tabs/DockCountdownsTab.tsx` |
| Media | Image/video/document library, uploads, animations, patterns, text overlays, playlists/slideshows, playback, document page control, scene targeting | `desktop/src/dock/tabs/DockMediaTab.tsx` |
| Multi-view | Saved layouts, content slots, OBS scenes/sources, browser and image slots, backgrounds, framing, layers, scene creation, preview/push/clear | `desktop/src/dock/tabs/DockMultiviewTab.tsx`, `desktop/src/multiview/` |
| Quick Merge | Multiple OBS sources composed into overlay, side-by-side, grid, picture-in-picture, or stacked layouts, with preview and live actions | `desktop/src/components/modules/QuickMergePanel.tsx` |
| Voice and Bible AI | Microphone capture, live transcript, Bible-reference detection, scripture suggestions, queue/history, auto-push, auto-navigation, separate AI preview, transcript copy/download | `desktop/src/dock/tabs/DockLmTab.tsx`, `desktop/src/pages/SpeechToScripturePage.tsx`, `desktop/src/services/voiceBibleTypes.ts` |
| Transcripts | Live/imported transcript library, search, scripture highlights, translations, summaries, PDF/DOCX export, local cache and server persistence | `desktop/src/pages/TranscriptLibraryPage.tsx`, `desktop/src/pages/TranscriptDetailPage.tsx`, `desktop/src/transcripts/` |
| Service planning | Plans, dates/statuses, cues, snapshots from Bible/worship/media/sermon, reorder, duplicate, live checklist, next/previous cue navigation | `desktop/src/pages/ServicePlannerPage.tsx`, `desktop/src/dock/tabs/DockPlannerTab.tsx`, `desktop/src/dock/tabs/DockServiceTab.tsx` |
| Live tools | Service-moment tools with preview/program/clear, editable text, countdown duration, backgrounds/media, OBS scene and microphone-source settings | `desktop/src/pages/LiveToolsPage.tsx` |
| Themes and resources | Built-in and custom themes, theme creator, favorites, search, categories, duplicate/edit/delete, background picker, remote production themes | `desktop/src/pages/TemplatesLibraryPage.tsx`, `desktop/src/pages/ProductionThemeSettingsPage.tsx`, `desktop/src/dock/components/BackgroundPickerCard.tsx` |
| Remote operation | Remote OBS on another laptop, Presentation Link, mobile connection wizard, pairing/approval, Bible/worship/media/ministry/scenes control, automation rules and schedules | `desktop/src/pages/PresentationSetupPage.tsx`, `mobile/` or the mobile workspace, dashboard device/pairing surfaces |
| Account and operations | Onboarding, church profile/branding, devices, plans, credits, downloads, tutorials/resources, notifications, referrals, security and sessions | `dashboard/`, `desktop/src/pages/OnboardingPage.tsx`, `desktop/src/pages/CreditsPage.tsx`, `desktop/src/pages/ResourcesPage.tsx` |

## 3. Complete capability inventory

### 3.1 Connection, OBS, and presentation

MakeChurchEasy can:

- connect to OBS through WebSocket;
- connect to OBS running on another laptop on the same network;
- use a browser-based Presentation Link when OBS is not on the same computer;
- expose a presentation/browser link that follows dock actions;
- show connection status and reconnect when the connection is interrupted;
- work with preview and program concepts;
- push, clear, show, and hide presentation sources;
- choose a target scene for supported dock modules;
- keep the default MCE Presentation destination when no alternate route is selected;
- optionally synchronize a routed scene with the MCE Presentation scene;
- keep a routed destination independent when synchronization is not enabled;
- inspect existing OBS scenes and sources;
- synchronize known MakeChurchEasy sources when OBS reconnects or a module opens;
- use idempotent push behavior intended to avoid duplicate sources;
- refresh source and scene state;
- recover from missing or stale source state through the OBS sync path;
- control a remote presentation without moving the operator to the OBS computer;
- preview source screenshots in production and composition workflows.

### 3.2 Bible and scripture

MakeChurchEasy can:

- search scripture by reference;
- search scripture by word or phrase;
- browse books, chapters, and verses;
- move to the next or previous chapter;
- select a specific verse from a verse grid;
- keep recent searches;
- view Bible history;
- filter history by time period;
- sort history by newest, oldest, or most viewed;
- favorite verses or Bible entries;
- install and use multiple Bible translations;
- search available translations;
- select quick translation A and B;
- compare two translations;
- display comparisons line by line;
- display comparisons side by side;
- send a single selected verse to the output;
- send a verse to preview before taking it live;
- show scripture full-screen;
- show scripture as a lower third;
- hide or clear scripture;
- move to the next or previous verse where the active workflow supports it;
- show or hide the Bible version label;
- show or hide verse numbers;
- show a full or shortened reference;
- shorten book names;
- control reference placement and alignment;
- control reference background, opacity, spacing, roundness, and font size;
- change scripture font family, size, weight, line height, letter spacing, width, and alignment;
- move scripture vertically;
- configure safe-area behavior;
- configure automatic text scaling;
- control the number of lines shown per stage;
- use built-in Bible themes;
- use custom Bible themes;
- favorite and reuse themes;
- choose a background preset, image, video, or pattern;
- show a background without scripture text when the selected workflow calls for it;
- use quick settings for recurring style adjustments;
- copy selected scripture to the clipboard;
- push Bible output through a selected scene route;
- optionally synchronize a routed Bible output with the presentation scene;
- use voice-assisted scripture search through the Verse AI workflow.

### 3.3 Worship lyrics and song management

MakeChurchEasy can:

- search a saved song library;
- search recent song queries;
- open cached songs;
- create a song manually;
- edit song metadata and lyrics;
- search for lyrics online;
- import lyrics from a URL;
- import a saved song or saved result;
- import lyrics from a supported file flow;
- review imported lyrics before saving;
- clean imported lyric text;
- remove unwanted verse numbers;
- split lyrics into slides automatically;
- choose how many lines appear on a slide;
- extract or structure a title from imported content;
- apply section labels such as verse, chorus, bridge, or similar song structure;
- convert text to uppercase, lowercase, or capitalized text;
- search within lyrics or slide content;
- preview a particular lyric slide or section;
- send a specific section to preview or live output;
- show or hide a section;
- edit a slide after import;
- delete a slide and restore deleted slides where supported;
- navigate through the song presentation;
- use full-screen lyrics;
- use lower-third lyrics;
- choose a worship theme;
- adjust lyric text styling;
- adjust line count, position, width, and container placement;
- use background-only treatment where supported;
- enable supported reveal, shadow, glow, or subtle zoom effects;
- translate worship sections;
- clear the lyric output;
- route worship output to a chosen scene;
- optionally synchronize the routed worship output with MCE Presentation;
- keep a reusable song library for future services.

### 3.4 Notes and text slides

MakeChurchEasy can:

- create a saved note;
- search notes;
- edit and delete notes;
- paste or type sermon notes;
- format note text;
- turn structured note content into slides;
- use blank lines to separate slide content where supported;
- preview individual note slides;
- display notes full-screen;
- display notes as lower thirds;
- apply Bible or text themes;
- translate note content;
- send a note slide to OBS;
- clear the note output;
- route notes to a selected scene;
- optionally synchronize routed notes with MCE Presentation;
- append text from the LM/AI workflow into a note workflow.

### 3.5 Sermon quotes and points

MakeChurchEasy can:

- create a sermon quote list;
- create a sermon point list;
- attach a speaker name to a quote;
- attach a series name to a quote;
- use the first meaningful line as a point topic;
- split sermon content into slides;
- edit a sermon item;
- edit individual sermon slides;
- preview a sermon slide;
- send a sermon slide live;
- keep recent sermon history;
- select a Bible theme as the sermon visual base;
- select a lower-third template as the sermon visual base;
- choose full-screen or lower-third presentation;
- adjust font family, size, weight, line height, letter spacing, width, alignment, vertical position, uppercase, and safe area;
- apply local text cleanup to a sermon slide;
- use speaker and series attribution in the output;
- configure theme colors where supported;
- clear the sermon output.

### 3.6 Lower thirds, speakers, and branded graphics

MakeChurchEasy can:

- choose built-in lower-third themes;
- choose Bible lower-third themes;
- choose remote or production themes;
- favorite themes;
- search and filter themes;
- enter a speaker name;
- enter a title or role;
- enter a ministry or church label;
- use saved speaker presets;
- create a new speaker preset;
- update a speaker preset;
- remove a speaker preset;
- reorder available speaker themes;
- use theme variables for names, titles, accents, and supporting labels;
- override theme colors;
- edit background and text colors;
- edit accent colors;
- edit borders and visual appearance;
- edit position and placement;
- edit background image and opacity;
- edit logo scale where supported;
- adjust height or container size where supported;
- choose an animation and animation-out behavior;
- set how long a lower third remains visible;
- preview the lower third;
- save a reusable design slot;
- load, rename, reset, or clear a saved design;
- send or clear the lower third;
- route a lower third to a selected scene;
- use Bible lower-third content with Bible references and verse text;
- use custom lower-third text for speaker or announcement graphics.

### 3.7 Tickers and announcements

MakeChurchEasy can:

- create an announcement message;
- edit an announcement message;
- delete a message;
- set a heading;
- keep a message within the supported character limit;
- choose ticker speed;
- place a ticker at the top or bottom;
- loop a ticker;
- pause and resume a ticker;
- show and hide a ticker;
- clear a ticker;
- choose a ticker theme;
- brand the ticker with church name, logo, or brand color;
- use custom ticker colors;
- send a ticker to the selected destination scene;
- optionally synchronize a routed ticker with the presentation scene;
- preserve ticker layer priority over other supported sources;
- run a ticker over an existing program background where the chosen setup supports it.

### 3.8 Countdowns and pre-service graphics

MakeChurchEasy can:

- create a countdown;
- save a countdown for reuse;
- set a duration;
- set a title and subtitle;
- choose a built-in background;
- choose media-library artwork as a background;
- choose a template or text theme;
- change countdown color and font;
- choose supported animation styles;
- add supported audio;
- loop a countdown or run it once;
- show, hide, pause, play, and reset a countdown;
- choose an action at the end;
- do nothing at the end;
- switch scenes at the end;
- hide the countdown at the end;
- show a welcome graphic at the end;
- play a video at the end;
- choose an action scene;
- display a countdown in a supported full-screen or lower-third/circular treatment;
- route countdown output to a chosen scene.

### 3.9 Images, videos, documents, text overlays, and playlists

MakeChurchEasy can:

- browse uploaded media;
- browse recent media;
- filter media by image, video, document, or all;
- search the media library;
- upload images;
- upload videos;
- browse animations;
- save supported animation assets locally;
- browse patterns;
- use saved media backgrounds;
- remove or repair missing-file entries;
- send an image to preview or program;
- send a video to preview or program;
- choose a target scene;
- choose cover, contain, or stretch fit behavior;
- play, pause, restart, mute, or resume media where supported;
- loop media;
- shuffle media in a playlist workflow;
- create a media playlist;
- create a slideshow from selected images where enabled;
- clear media output;
- delete an individual library item;
- clear the local media library where permitted;
- add text-only overlays;
- add boxed text overlays;
- add lower-third text overlays;
- add full-screen text overlays;
- set headline and subline text;
- change text size, color, alignment, and vertical position;
- choose a color, image, or pattern behind text;
- choose full-width or clipped text background;
- change opacity, blur, corner radius, and padding;
- choose no animation, fade, fade-up, slide-up, slide-down, or zoom where available;
- use safe-area positioning;
- apply a text overlay to preview, program, or all supported outputs;
- open PDF, DOCX, and PPTX content through the document workflow;
- navigate document pages;
- send a specific document page;
- choose fit or fill for a document page;
- show or hide a document background;
- show or hide a page label;
- align a document page left, center, or right;
- zoom a page;
- position a page with drag or keyboard controls where supported;
- reset document positioning;
- remove a document deck.

### 3.10 Multi-view and Quick Merge

MakeChurchEasy can:

- create a multi-view layout;
- save a layout;
- edit a layout;
- duplicate a layout;
- rename a layout;
- delete a layout;
- browse layout categories such as speaker focus, cameras, scripture, translation, and hybrid;
- use two-panel, three-panel, four-panel, grid, picture-in-picture, side-by-side, stacked, horizontal split, and vertical split patterns where available;
- assign camera content;
- assign scripture content;
- assign translation content;
- assign lower-third content;
- assign browser content;
- assign image content;
- use an OBS source as a slot;
- use an OBS scene as a slot;
- use a URL/browser source as a slot;
- search available OBS scenes and sources;
- choose no background, color, image, video, pattern, or scene background;
- frame a slot with fit, fill, zoom, pan, and focal-point controls;
- configure rounded corners, opacity, frame color, and layer order;
- preview a layout;
- refresh a preview capture;
- push a layout to OBS;
- create required OBS scenes when the selected workflow supports it;
- assign scenes to outputs;
- clear a layout or content slot;
- compose multiple OBS sources through Quick Merge;
- use overlay, side-by-side, grid, picture-in-picture, or stacked compositions;
- hide or remove individual layers;
- apply a composition to preview;
- transition the composition live;
- refresh source screenshots.

### 3.11 Voice, Verse AI, and live transcripts

MakeChurchEasy can:

- request microphone permission;
- select a microphone;
- start listening;
- stop listening;
- mute or unmute microphone input;
- show a live transcript;
- distinguish interim and finalized transcript lines;
- show a listening timer;
- search transcript text;
- collapse or expand transcript display;
- copy transcript lines;
- download transcript text;
- detect spoken Bible references;
- show semantic scripture suggestions;
- keep a suggestion queue;
- keep detected-verse history;
- pin or unpin a detected verse;
- clear suggestions or queue entries;
- deduplicate repeated references within a configured window;
- expire stale suggestions where configured;
- automatically push a detected verse when enabled;
- automatically navigate the Bible dock when enabled;
- choose the main preview or a separate AI Preview destination;
- choose full-screen or lower-third scripture output;
- choose a Bible translation;
- push a suggested verse to OBS;
- push transcript content into notes or a transcript record;
- show connection/offline/reconnecting state;
- show local speech-model or microphone status where available;
- open the full Speech to Scripture page from the dock;
- save a completed transcript;
- search the transcript library;
- filter transcript sessions by language, time, service, or source;
- sort transcript sessions;
- view transcript totals, duration, and detected scripture counts;
- search inside a transcript;
- identify scripture references in transcript text;
- translate a transcript;
- save a translation;
- copy translated text;
- export a transcript as PDF;
- export a transcript as DOCX;
- export a translated transcript as PDF or DOCX where enabled;
- use AI-assisted summary or points workflows where the account and API support them.

### 3.12 Service planning and live service operation

MakeChurchEasy can:

- create a service plan;
- name a service plan;
- assign a date;
- keep draft, active, and archived plan states;
- duplicate a plan;
- delete a plan;
- add cues;
- reorder cues;
- add Bible cues;
- add worship cues;
- add media cues;
- add sermon point or quote cues;
- add speaker, prayer, offering, announcement, and custom cue types;
- attach reference, translation, verse, song, section, speaker, series, media, or note metadata;
- use a planner view before the service;
- preview a cue from the planner;
- send a cue to program where the workflow supports it;
- move to the next or previous cue;
- load a plan as a live checklist;
- mark live checklist items complete;
- see completion progress;
- reset the checklist;
- use live tools for recurring service moments;
- send live tools to preview or program;
- clear preview or all supported live outputs;
- edit main and secondary text;
- set a moment duration;
- choose a background color or media asset;
- choose an OBS scene;
- configure a microphone source name where supported;
- save and reset live-tool customizations.

### 3.13 Themes, templates, backgrounds, and branding

MakeChurchEasy can:

- browse built-in themes;
- browse custom themes;
- search themes;
- filter themes by all, Bible, worship, or general categories where supported;
- filter by full-screen or lower-third type;
- filter to themes created by the user;
- filter favorites;
- preview a theme;
- create a custom theme;
- edit a custom theme;
- duplicate a theme;
- delete a theme;
- favorite or unfavorite a theme;
- add production themes to the dock;
- configure theme variables;
- change theme color values;
- reuse a theme in Bible, worship, notes, sermon, lower-third, and speaker workflows where compatible;
- pick a background from presets, images, videos, patterns, or scenes;
- upload or save background media where supported;
- preview a background before applying it;
- configure church name, logo, brand color, speaker profiles, and related visual identity settings.

### 3.14 Remote control, devices, and account operations

MakeChurchEasy can:

- onboard a new user;
- pair a browser or mobile controller with the desktop;
- approve a remote desktop connection;
- show connection success or offline state;
- control Bible, worship, media, ministry, and scene surfaces from a remote client;
- use a mobile Bible controller;
- use a mobile worship controller;
- use a mobile media controller;
- use a mobile ministry controller;
- switch or inspect scenes from mobile where enabled;
- create automation rules where enabled;
- schedule automation rules where enabled;
- manage connected devices;
- manage church profile and branding;
- view plan and credit status;
- view downloads and resources;
- access tutorials and help content;
- view notifications and community surfaces;
- use referrals where available;
- manage security, sessions, and two-factor authentication where enabled;
- view subscription, billing, and transaction pages;
- understand feature limits for songs, media, translations, devices, credits, and storage;
- use higher-plan features such as mobile control, bulk import, translation, speech-to-scripture, AI, cloud sync, multiview, tickers, lower thirds, countdowns, and advanced reporting when entitled.

## 4. Problem-first TikTok content library

These are the content topics to give a partner. The wording is intentionally close to what someone might type into TikTok or Google. The “demo” tells the creator what to show on screen.

### A. OBS setup and connection problems

- **OBS-01 — How to connect MakeChurchEasy to OBS for the first time.** Problem: the operator does not know which connection details matter. Demo: connect, show status, send one test verse.
- **OBS-02 — How to add a MakeChurchEasy Bible browser source in OBS.** Problem: the overlay page exists but is not visible in OBS. Demo: add the browser source, confirm the URL and dimensions, refresh once, send a verse.
- **OBS-03 — How to show church lyrics in OBS without opening a second presentation app.** Problem: worship lyrics are being copied manually. Demo: choose a song section and send it to preview/program.
- **OBS-04 — MakeChurchEasy works in the browser but OBS is blank: what to check.** Problem: the URL loads in Arc/browser but not in the OBS browser source. Demo: compare URL, network access, source dimensions, and cache behavior.
- **OBS-05 — How to connect to OBS running on another laptop.** Problem: the presentation computer and operator computer are separate. Demo: same network, IP, port, password, connection test.
- **OBS-06 — How to use MakeChurchEasy without OBS using Presentation Link.** Problem: a church wants to operate with a browser presentation. Demo: open the presentation link and send Bible/worship/media content.
- **OBS-07 — Why OBS and the controller must be on the same network.** Problem: remote connection fails even though both computers are powered on. Demo: show the network requirement and a connection retry.
- **OBS-08 — Preview versus Program: how to avoid sending the wrong thing live.** Problem: a volunteer takes an unreviewed slide live. Demo: preview, verify, then take live.
- **OBS-09 — How to route Bible output to a different OBS scene.** Problem: every tab goes to one default scene. Demo: select a target scene, push, and verify the source in that scene.
- **OBS-10 — How to route worship, media, or lower thirds independently.** Problem: changing one scene unexpectedly changes another. Demo: route one module, leave MCE Presentation untouched, then compare.
- **OBS-11 — What “sync with MCE Presentation” actually means.** Problem: the operator expects independent scenes to mirror automatically. Demo: show independent output, enable sync, compare behavior.
- **OBS-12 — How to clear only the MakeChurchEasy output.** Problem: clearing one overlay removes too much or leaves stale content. Demo: use the module clear action and verify the scene.
- **OBS-13 — How to reconnect after OBS restarts.** Problem: the dock shows disconnected after a restart. Demo: reconnect, let sources synchronize, send a test item.
- **OBS-14 — How to check whether MakeChurchEasy, OBS, and Voice AI are connected.** Problem: the operator cannot tell which part is broken. Demo: use the production status view.
- **OBS-15 — How to recover missing MakeChurchEasy sources in OBS.** Problem: a source disappeared after a scene or profile change. Demo: refresh/synchronize and verify before creating duplicates.
- **OBS-16 — How to control a live presentation from a second laptop.** Problem: the OBS computer is at the front of the room. Demo: remote presentation setup and a safe preview action.
- **OBS-17 — How to control OBS scenes from your phone during church.** Problem: the operator needs to move away from the production desk. Demo: pair mobile, approve connection, switch a scene.
- **OBS-18 — How to test an OBS setup before Sunday service.** Problem: the first test happens when the service starts. Demo: connection, browser source, scene route, Bible, lyrics, media, clear.

### B. Bible search and live scripture problems

- **BIBLE-01 — How to put a Bible verse on screen in seconds.** Problem: searching a verse during service takes too long. Demo: reference search to preview to live.
- **BIBLE-02 — How to find a Bible verse when you only remember a phrase.** Problem: the reference is unknown. Demo: keyword search and result selection.
- **BIBLE-03 — How to browse to a Bible verse without typing the full reference.** Problem: a volunteer prefers navigation. Demo: book, chapter, verse grid.
- **BIBLE-04 — How to move to the next verse without returning to search.** Problem: the speaker is progressing through a passage. Demo: next/previous verse workflow.
- **BIBLE-05 — How to switch Bible translations while live.** Problem: the church needs a different version on screen. Demo: choose an installed translation and resend.
- **BIBLE-06 — How to compare two Bible translations on screen.** Problem: the congregation needs to see wording differences. Demo: translation A/B and compare layout.
- **BIBLE-07 — Line-by-line versus side-by-side Bible comparison.** Problem: comparison is hard to read at the current layout. Demo: switch layouts and explain when to use each.
- **BIBLE-08 — How to install or select the Bible versions your church uses.** Problem: a desired version is missing. Demo: translation library and selection.
- **BIBLE-09 — How to show the Bible reference and version correctly.** Problem: the verse appears but the label is missing or confusing. Demo: reference, book-name, verse-number, and version settings.
- **BIBLE-10 — How to hide verse numbers for a cleaner Bible overlay.** Problem: the display feels crowded. Demo: toggle verse numbers and compare.
- **BIBLE-11 — How to shorten Bible book names and references.** Problem: a long reference wraps or overwhelms the lower third. Demo: shorten book/reference controls.
- **BIBLE-12 — How to make Bible text readable in OBS.** Problem: the text is too small or too wide. Demo: font, size, width, line height, and safe area.
- **BIBLE-13 — How to stop Bible text from being cut off at the edge of the screen.** Problem: the output is outside the safe area. Demo: width, alignment, vertical position, and safe-area controls.
- **BIBLE-14 — How to show one verse full-screen and another as a lower third.** Problem: different service moments need different layouts. Demo: switch overlay mode.
- **BIBLE-15 — How to show only the Bible background temporarily.** Problem: the operator needs a visual without scripture text. Demo: background-only control where supported.
- **BIBLE-16 — How to use an image or video behind a Bible verse.** Problem: a plain background does not match the service. Demo: background picker and output.
- **BIBLE-17 — How to use a pattern behind scripture without designing a graphic.** Problem: the church needs a quick visual treatment. Demo: pattern background.
- **BIBLE-18 — How to save a Bible theme so the style is reusable.** Problem: the operator rebuilds the look every week. Demo: favorite/custom theme workflow.
- **BIBLE-19 — How to make Bible text uppercase, bold, or better aligned.** Problem: a chosen theme is difficult to read. Demo: typography controls.
- **BIBLE-20 — How to change the Bible reference bar color and opacity.** Problem: the reference label disappears into the background. Demo: reference appearance settings.
- **BIBLE-21 — How to see recently used Bible verses.** Problem: the operator needs to return to a passage. Demo: history filter and sort.
- **BIBLE-22 — How to favorite frequently used Bible verses.** Problem: recurring service verses take too long to find. Demo: favorites.
- **BIBLE-23 — How to copy a Bible verse to the clipboard.** Problem: the same verse is needed in notes, captions, or a message. Demo: copy action.
- **BIBLE-24 — How to send only the verse you clicked instead of the previous verse.** Problem: the wrong verse appears live. Demo: click, preview, verify selected ID, send.
- **BIBLE-25 — How to display Bible output in a selected OBS scene.** Problem: the routed scene is not receiving scripture. Demo: scene route and verification.
- **BIBLE-26 — How to keep a routed Bible scene independent from MCE Presentation.** Problem: the operator wants two different scripture outputs. Demo: disable sync and compare sources.
- **BIBLE-27 — How to fix a Bible overlay that is visible in the browser but blank in OBS.** Problem: the output only fails inside OBS. Demo: controlled diagnosis checklist; publish only after live verification.
- **BIBLE-28 — How to stop scripture from flickering when moving to the next verse.** Problem: the output flashes or briefly clears. Demo: reproduce, inspect transition/source update, then show the verified fix; currently a live-verification topic.

### C. Bible style and lower-third appearance problems

- **STYLE-01 — How to make a Bible lower third look like your church brand.** Problem: the default style feels generic. Demo: theme, colors, logo/background, and preview.
- **STYLE-02 — How to choose a readable lower-third theme for Bible verses.** Problem: decorative graphics reduce readability. Demo: compare two themes with the same verse.
- **STYLE-03 — How to keep the reference from colliding with the verse text.** Problem: labels overlap on long references. Demo: reference placement and spacing.
- **STYLE-04 — How to make a lower third wider without changing the whole theme.** Problem: long verse content is clipped. Demo: width/container setting.
- **STYLE-05 — How to make the lower third taller for two or three lines.** Problem: the content is compressed. Demo: height/line-count controls.
- **STYLE-06 — How to change lower-third size presets and verify the output.** Problem: the dock selection changes but the OBS graphic does not. Demo: select preset, send, inspect the routed source; live verification required.
- **STYLE-07 — How to keep lower-third style settings after restarting the app.** Problem: the style resets between services or updates. Demo: save/favorite/persistence workflow; do not claim update-proof persistence until tested.
- **STYLE-08 — How to change the Bible title or reference without changing the whole layout.** Problem: the label needs adjustment only. Demo: reference controls.
- **STYLE-09 — How to make white text readable over a bright background.** Problem: contrast is poor. Demo: background opacity, overlay, text color, and shadow.
- **STYLE-10 — How to add a church logo to a lower third.** Problem: the output is not branded. Demo: theme variable or background/logo workflow where supported.
- **STYLE-11 — How to make a lower third safe for livestream and mobile viewers.** Problem: edge content is cropped on different screens. Demo: safe-area, width, and alignment.
- **STYLE-12 — How to preview a lower third before sending it live.** Problem: a volunteer is afraid to test on air. Demo: preview/program flow.
- **STYLE-13 — How to use the same visual language for Bible, worship, and sermon points.** Problem: every module looks unrelated. Demo: compatible theme selection.
- **STYLE-14 — How to build a reusable church graphics template.** Problem: operators repeatedly change the same colors and positions. Demo: theme creator, save, favorite, reuse.
- **STYLE-15 — How to fix a lower third that shows the wrong title, marker, or theme.** Problem: content variables are not appearing as expected. Demo: inspect variable mapping and output; live verification required.
- **STYLE-16 — How to make a Bible lower third show a verse instead of an unrelated graphic.** Problem: the wrong source or overlay mode is active. Demo: clear stale source, choose Bible lower-third mode, resend.
- **STYLE-17 — How to stop a previous countdown or graphic from appearing behind a Bible lower third.** Problem: multiple sources remain visible. Demo: identify source layers and clear the correct output.
- **STYLE-18 — How to choose between a full-screen scripture theme and a lower-third theme.** Problem: the operator picks the wrong template type. Demo: theme type filters.

### D. Worship lyrics and song problems

- **WORSHIP-01 — How to put worship lyrics on screen in OBS.** Problem: the worship team has lyrics but no live output. Demo: select song, choose slide, preview, live.
- **WORSHIP-02 — How to find a saved worship song quickly.** Problem: the library is crowded. Demo: song search and recent songs.
- **WORSHIP-03 — How to add a new worship song manually.** Problem: the song is not in the library. Demo: add title, lyrics, save, send.
- **WORSHIP-04 — How to import lyrics from a website URL.** Problem: manual copy-paste creates formatting errors. Demo: import URL and review.
- **WORSHIP-05 — How to search online for worship lyrics.** Problem: the operator does not have a prepared file. Demo: online search and import review.
- **WORSHIP-06 — How to import a saved song into the worship library.** Problem: previously prepared content is hard to restore. Demo: saved/import flow.
- **WORSHIP-07 — How to clean copied worship lyrics before showing them.** Problem: pasted lyrics contain junk formatting. Demo: cleanup action and before/after.
- **WORSHIP-08 — How to remove verse numbers from imported lyrics.** Problem: numbers appear on every line. Demo: cleanup tool.
- **WORSHIP-09 — How to split a long worship song into readable slides.** Problem: too many words are on one slide. Demo: auto-split and lines-per-slide.
- **WORSHIP-10 — How to set the number of lyric lines per slide.** Problem: lyrics are too dense or too sparse. Demo: line-count setting.
- **WORSHIP-11 — How to label verses, chorus, bridge, and pre-chorus sections.** Problem: volunteers cannot navigate the song. Demo: section labels.
- **WORSHIP-12 — How to send only the chorus live.** Problem: the operator accidentally sends the wrong section. Demo: select exact section and verify.
- **WORSHIP-13 — How to preview a lyric slide without taking it live.** Problem: the operator wants to check formatting. Demo: single-click preview versus live action.
- **WORSHIP-14 — How to edit one lyric slide after importing a song.** Problem: one line is wrong. Demo: edit slide, save, resend.
- **WORSHIP-15 — How to hide a lyric section temporarily.** Problem: the worship leader skips a section. Demo: hide/show section controls.
- **WORSHIP-16 — How to delete a lyric slide and restore it later.** Problem: a mistaken edit removed content. Demo: delete/restore flow.
- **WORSHIP-17 — How to show lyrics as a lower third instead of full-screen.** Problem: the camera needs to remain visible. Demo: overlay mode.
- **WORSHIP-18 — How to make lyrics readable over a live camera feed.** Problem: white text disappears over the stage. Demo: theme, background, shadow, and opacity.
- **WORSHIP-19 — How to change worship lyric themes quickly.** Problem: the song look does not fit the service. Demo: theme picker and preview.
- **WORSHIP-20 — How to use a custom background for worship lyrics.** Problem: the church wants a service-specific visual. Demo: background picker.
- **WORSHIP-21 — How to translate a worship section.** Problem: multilingual congregations need another language. Demo: translation control; plan/credit gate may apply.
- **WORSHIP-22 — How to search inside a long lyric set.** Problem: the operator cannot find the next line. Demo: lyric/slide search.
- **WORSHIP-23 — How to clear lyrics without clearing the whole OBS scene.** Problem: the stage needs to return to camera-only. Demo: clear lyric output.
- **WORSHIP-24 — How to send worship lyrics to a separate OBS scene.** Problem: the lyric destination must not change the main presentation. Demo: scene route and independent output.
- **WORSHIP-25 — How to fix a worship song that refuses to save.** Problem: the library returns a save error. Demo: capture status/error, retry once, inspect the save-result path; publish as a troubleshooting video only after the fix is verified.

### E. Notes, sermon points, and spoken-word content

- **TEXT-01 — How to show sermon notes in OBS.** Problem: the speaker’s notes are not presentation-ready. Demo: create note, split, preview, send.
- **TEXT-02 — How to turn pasted sermon notes into slides.** Problem: paragraphs are too long for screen display. Demo: structured text and slide creation.
- **TEXT-03 — How blank lines can separate note slides.** Problem: the operator wants a simple way to control breaks. Demo: paste text with deliberate breaks.
- **TEXT-04 — How to save notes for the next service.** Problem: the same teaching material gets rebuilt each week. Demo: note library.
- **TEXT-05 — How to search a note library during a live service.** Problem: the correct point is hard to find. Demo: note search.
- **TEXT-06 — How to show a sermon quote with speaker attribution.** Problem: a quote needs context on screen. Demo: quote item, speaker, series, theme.
- **TEXT-07 — How to show sermon points as clean slides.** Problem: a point list is trapped in a document. Demo: point list and slide send.
- **TEXT-08 — How to change sermon slide font size without changing the theme.** Problem: a long point is too small. Demo: slide typography override.
- **TEXT-09 — How to make sermon points uppercase or bold for emphasis.** Problem: key points do not read from the back of the room. Demo: slide controls.
- **TEXT-10 — How to use safe-area settings for sermon slides.** Problem: text is cropped on livestream output. Demo: safe-area and width.
- **TEXT-11 — How to clean a messy sermon point before putting it on screen.** Problem: copied text includes unnecessary formatting. Demo: local cleanup action.
- **TEXT-12 — How to reuse a sermon theme across quotes and points.** Problem: the visual identity changes between slides. Demo: theme source selection.
- **TEXT-13 — How to preview a sermon point before sending it live.** Problem: the volunteer wants a safe review step. Demo: preview/live.
- **TEXT-14 — How to keep a history of recently used sermon points.** Problem: an earlier quote must be recalled. Demo: history drawer.
- **TEXT-15 — How to send notes or sermon points to a selected scene.** Problem: content must go to a dedicated teaching output. Demo: scene routing.
- **TEXT-16 — How to translate notes for a multilingual service.** Problem: a second-language display is needed quickly. Demo: translation workflow.
- **TEXT-17 — How to clear a sermon slide without leaving a stale source.** Problem: the previous quote remains on screen. Demo: clear and verify.

### F. Lower thirds, speaker identification, and church graphics

- **GRAPHICS-01 — How to show a pastor’s name and title on screen.** Problem: livestream viewers do not know who is speaking. Demo: speaker preset to lower third.
- **GRAPHICS-02 — How to create speaker presets for recurring ministers.** Problem: names and titles are retyped every week. Demo: create and reuse preset.
- **GRAPHICS-03 — How to update a pastor’s title without rebuilding the design.** Problem: a role changed but the graphic is fixed. Demo: variable editing.
- **GRAPHICS-04 — How to add a series name to a sermon quote.** Problem: the quote lacks context. Demo: quote metadata.
- **GRAPHICS-05 — How to make a speaker lower third match the church brand.** Problem: the graphic looks like a template from somewhere else. Demo: theme and color variables.
- **GRAPHICS-06 — How to preview speaker lower thirds with different names.** Problem: spacing breaks on longer names. Demo: preview values.
- **GRAPHICS-07 — How to adjust the position of a lower third.** Problem: it covers captions or the camera subject. Demo: placement controls.
- **GRAPHICS-08 — How to change lower-third background and text colors.** Problem: contrast is poor. Demo: appearance controls.
- **GRAPHICS-09 — How to add or change a lower-third background image.** Problem: the church wants a visual treatment. Demo: background image and opacity.
- **GRAPHICS-10 — How to make a lower third animate in and out cleanly.** Problem: the graphic appears abruptly or stays too long. Demo: animation and duration.
- **GRAPHICS-11 — How to save a finished lower-third design for volunteers.** Problem: only one person knows how to rebuild it. Demo: design slots.
- **GRAPHICS-12 — How to create a new custom graphic theme.** Problem: the church needs a consistent visual system. Demo: theme creator.
- **GRAPHICS-13 — How to search the theme library instead of scrolling through every design.** Problem: a usable theme is hard to find. Demo: filter/search/favorites.
- **GRAPHICS-14 — How to duplicate a theme and make a seasonal version.** Problem: Christmas or conference graphics need a variation. Demo: duplicate/edit.
- **GRAPHICS-15 — How to keep Bible and speaker graphics visually consistent.** Problem: each module uses different colors and fonts. Demo: compatible theme workflows.
- **GRAPHICS-16 — How to show a Bible verse as a branded lower third.** Problem: scripture needs to coexist with the camera. Demo: Bible lower-third theme.
- **GRAPHICS-17 — How to change the size of a lower third and prove it changed in OBS.** Problem: the dock button changes but the output looks the same. Demo: compare screenshots and source state; live verification required.
- **GRAPHICS-18 — How to remove a lower third without removing the camera.** Problem: clearing the scene would take the live shot away. Demo: clear the graphic source only.

### G. Announcements, tickers, and countdowns

- **MINISTRY-01 — How to show a scrolling church announcement in OBS.** Problem: announcements are not visible to online viewers. Demo: ticker message to live output.
- **MINISTRY-02 — How to add a heading to a church ticker.** Problem: a scrolling line has no context. Demo: heading field.
- **MINISTRY-03 — How to place a ticker at the top or bottom of the screen.** Problem: it competes with lower thirds. Demo: position controls.
- **MINISTRY-04 — How to slow down an announcement ticker so people can read it.** Problem: the message moves too quickly. Demo: speed control.
- **MINISTRY-05 — How to loop an announcement until everyone sees it.** Problem: a one-time message is missed. Demo: loop control.
- **MINISTRY-06 — How to pause a ticker during prayer or preaching.** Problem: the announcement is distracting at the wrong moment. Demo: pause/resume.
- **MINISTRY-07 — How to brand a ticker with the church name and colors.** Problem: the message does not look official. Demo: branding controls.
- **MINISTRY-08 — How to send a ticker to a separate OBS scene.** Problem: the announcement should go to a dedicated output. Demo: scene route.
- **MINISTRY-09 — How to keep an announcement above the background but below the important speaker graphic.** Problem: layers appear in the wrong order. Demo: source priority and live test.
- **MINISTRY-10 — How to create a service countdown in OBS.** Problem: pre-service viewers need a clear start time. Demo: duration, background, show.
- **MINISTRY-11 — How to use a countdown over a church flyer or media background.** Problem: a plain timer looks unfinished. Demo: media background.
- **MINISTRY-12 — How to add a title and subtitle to a countdown.** Problem: viewers do not know what is starting. Demo: countdown metadata.
- **MINISTRY-13 — How to pause, resume, and reset a countdown.** Problem: the service start time changed. Demo: timer controls.
- **MINISTRY-14 — How to play a welcome video when the countdown ends.** Problem: the transition into service is manual. Demo: end action.
- **MINISTRY-15 — How to switch OBS scenes automatically when the countdown ends.** Problem: the operator is busy with the service start. Demo: action scene.
- **MINISTRY-16 — How to hide a countdown automatically when it reaches zero.** Problem: the timer remains on screen after service begins. Demo: end action.
- **MINISTRY-17 — How to run a countdown once or loop it.** Problem: pre-service and break workflows need different behavior. Demo: loop/once.
- **MINISTRY-18 — How to make a countdown readable over a busy background.** Problem: the timer disappears into the artwork. Demo: template, color, contrast, and flyer mode.

### H. Media, documents, slideshows, and text overlays

- **MEDIA-01 — How to show a church image in OBS.** Problem: a flyer or announcement graphic needs to go live. Demo: upload, select, preview, program.
- **MEDIA-02 — How to play a church video in OBS from MakeChurchEasy.** Problem: volunteers are switching media players manually. Demo: select, play, mute, clear.
- **MEDIA-03 — How to fit a video without stretching it.** Problem: the image looks distorted. Demo: cover, contain, stretch comparison.
- **MEDIA-04 — How to loop a video during pre-service.** Problem: the video stops before service starts. Demo: loop control.
- **MEDIA-05 — How to mute a media source without muting the whole stream.** Problem: the source audio is not needed. Demo: media mute.
- **MEDIA-06 — How to pause or restart a video from the dock.** Problem: the operator needs to recover from a cue change. Demo: playback controls.
- **MEDIA-07 — How to search uploaded media quickly.** Problem: the library is too large for manual scrolling. Demo: search and filter.
- **MEDIA-08 — How to find recently used church media.** Problem: last week’s artwork must be reused. Demo: recent filter.
- **MEDIA-09 — How to create a slideshow from church images.** Problem: a photo sequence needs to play as one presentation item. Demo: select images and create slideshow.
- **MEDIA-10 — How to create a media playlist for announcements.** Problem: several videos need to play in order. Demo: playlist/shuffle/loop.
- **MEDIA-11 — How to add a text-only announcement over OBS.** Problem: a message does not justify creating a graphic file. Demo: text overlay.
- **MEDIA-12 — How to create a lower-third text overlay without Photoshop.** Problem: the operator needs a quick name or announcement. Demo: lower-third mode.
- **MEDIA-13 — How to add headline and subline text to a church graphic.** Problem: a flyer needs a readable live label. Demo: headline/subline controls.
- **MEDIA-14 — How to add a colored or image background behind text.** Problem: text is unreadable on camera. Demo: background and opacity.
- **MEDIA-15 — How to animate a text announcement.** Problem: a static message is easy to miss. Demo: fade, slide, or zoom options.
- **MEDIA-16 — How to show a PDF page in OBS.** Problem: the church has a document but no presentation slide. Demo: document deck and page send.
- **MEDIA-17 — How to present a DOCX or PPTX page through the media dock.** Problem: a document must be shown without opening another app. Demo: import and page navigation.
- **MEDIA-18 — How to move to the next document page during a service.** Problem: page control is slow or hidden. Demo: page navigation.
- **MEDIA-19 — How to zoom and position a document page.** Problem: the content is too small or cropped. Demo: zoom, drag/keyboard, reset.
- **MEDIA-20 — How to show or hide a document page label.** Problem: page numbers distract from the content. Demo: document settings.
- **MEDIA-21 — How to delete a bad or missing media item.** Problem: the library contains stale entries. Demo: remove missing file or delete item.
- **MEDIA-22 — How to send media to a selected OBS scene.** Problem: a background should not replace the main presentation. Demo: scene targeting.
- **MEDIA-23 — How to send one text overlay to preview, program, or all outputs.** Problem: the operator is unsure where the graphic will appear. Demo: destination actions.
- **MEDIA-24 — How to clear a media overlay without stopping the whole production.** Problem: a graphic remains over the camera. Demo: clear overlay.

### I. Multi-view, cameras, and compositing

- **MULTI-01 — How to put two cameras on screen in OBS.** Problem: the service wants a multi-camera layout. Demo: two-panel layout.
- **MULTI-02 — How to create a four-camera church layout.** Problem: the operator needs a grid without manual transforms. Demo: four-panel/grid template.
- **MULTI-03 — How to make a picture-in-picture preaching layout.** Problem: the speaker and scripture both need to remain visible. Demo: PIP template.
- **MULTI-04 — How to show a camera beside Bible scripture.** Problem: a full-screen verse hides the speaker. Demo: scripture slot and side-by-side layout.
- **MULTI-05 — How to show two Bible translations in a multi-view.** Problem: comparison needs a broadcast layout. Demo: translation slots.
- **MULTI-06 — How to use a lower third as a multi-view content slot.** Problem: a branded label needs a fixed region. Demo: slot assignment.
- **MULTI-07 — How to place a website or browser source in a multi-view.** Problem: a live page needs to appear with other sources. Demo: browser slot.
- **MULTI-08 — How to place a church image in a multi-view layout.** Problem: a flyer must share the canvas with cameras. Demo: image slot.
- **MULTI-09 — How to choose a multi-view background.** Problem: empty space looks unfinished. Demo: color/image/video/pattern/scene background.
- **MULTI-10 — How to crop and zoom a camera inside a multi-view.** Problem: the subject is framed badly. Demo: fit/fill/zoom/pan/focal point.
- **MULTI-11 — How to round camera corners and adjust opacity.** Problem: the layout needs a polished broadcast treatment. Demo: frame controls.
- **MULTI-12 — How to save a multi-view layout for weekly services.** Problem: the same composition is rebuilt repeatedly. Demo: save and reuse.
- **MULTI-13 — How to duplicate a multi-view layout for a new event.** Problem: a conference version should retain the existing structure. Demo: duplicate/rename.
- **MULTI-14 — How to create the required OBS scenes from a multi-view layout.** Problem: manual scene construction is error-prone. Demo: auto-create where supported.
- **MULTI-15 — How to preview a multi-view before taking it live.** Problem: the operator needs to check missing sources. Demo: preview capture and refresh.
- **MULTI-16 — How to compose multiple OBS sources with Quick Merge.** Problem: the team needs a one-off composite quickly. Demo: add layers and choose a preset.
- **MULTI-17 — Overlay versus side-by-side versus picture-in-picture: which layout should a church use?** Problem: volunteers choose by guesswork. Demo: same sources across presets.
- **MULTI-18 — How to hide one layer in a Quick Merge composition.** Problem: one source is temporarily unavailable. Demo: toggle layer.
- **MULTI-19 — How to transition a multi-source composition live.** Problem: changing sources one by one looks unprofessional. Demo: apply preview and take live.

### J. Voice AI, speech-to-scripture, and transcripts

- **AI-01 — How to show a Bible verse automatically while a pastor is preaching.** Problem: a volunteer cannot search every reference fast enough. Demo: mic, detected reference, preview, push.
- **AI-02 — How Verse AI hears Bible references inside a sermon.** Problem: the operator wants to understand the workflow before trusting it. Demo: speak a reference and show the suggestion.
- **AI-03 — How to start and stop Voice AI safely.** Problem: the microphone keeps listening after the service moment. Demo: permission, start, stop, mute.
- **AI-04 — How to choose the correct microphone for speech-to-scripture.** Problem: AI hears the wrong audio source. Demo: mic selection and test.
- **AI-05 — How to use a separate AI Preview instead of changing the live Bible.** Problem: automatic detection should not surprise the operator. Demo: separate preview destination.
- **AI-06 — How to send detected scripture automatically.** Problem: the team wants hands-free verse display. Demo: auto-push toggle; explain the risk and review settings.
- **AI-07 — How to stop repeated Bible references from flooding the queue.** Problem: the same phrase creates duplicate suggestions. Demo: deduplication window.
- **AI-08 — How to review the Verse AI queue before sending anything live.** Problem: speech recognition can suggest the wrong passage. Demo: queue review.
- **AI-09 — How to make Verse AI navigate the Bible dock automatically.** Problem: the operator needs the matching passage ready. Demo: auto-navigation.
- **AI-10 — How to choose full-screen or lower-third output for Verse AI.** Problem: a church wants scripture without covering the camera. Demo: overlay mode.
- **AI-11 — How to choose a translation for Verse AI output.** Problem: detection found the reference but the version is wrong. Demo: translation setting.
- **AI-12 — How to pin a detected verse for later.** Problem: a relevant reference should not disappear in the live queue. Demo: pin/history.
- **AI-13 — How to copy a live transcript from a sermon.** Problem: the speaker’s words are needed for notes or captions. Demo: copy/download.
- **AI-14 — How to save a live sermon transcript.** Problem: the sermon should remain searchable after the service. Demo: save session.
- **AI-15 — How to search old sermon transcripts.** Problem: a quote or scripture was used months ago. Demo: transcript library search.
- **AI-16 — How to find every Bible reference mentioned in a transcript.** Problem: manual scripture indexing takes too long. Demo: detected scriptures panel.
- **AI-17 — How to translate a sermon transcript.** Problem: multilingual ministry needs a written translation. Demo: translation flow.
- **AI-18 — How to export a sermon transcript as a PDF.** Problem: the transcript needs to be shared or archived. Demo: PDF export.
- **AI-19 — How to export a sermon transcript as a Word document.** Problem: the team needs to edit the text after service. Demo: DOCX export.
- **AI-20 — How to export a translated sermon transcript.** Problem: the translated version needs to leave the app. Demo: translation export.
- **AI-21 — How to use transcript summaries or sermon points.** Problem: the message needs a quick post-service outline. Demo: supported summary/points workflow; label beta or gated behavior accurately.
- **AI-22 — How to turn spoken notes into a Bible or text slide workflow.** Problem: an operator wants to capture content without typing. Demo: transcript-to-notes handoff where enabled.
- **AI-23 — What happens when Voice AI loses connection.** Problem: the operator sees offline or reconnecting state. Demo: status handling and safe fallback to manual Bible search.
- **AI-24 — How to test Voice AI before the service starts.** Problem: the first microphone test happens during preaching. Demo: permission, mic, spoken reference, suggestion, clear.
- **AI-25 — How to avoid putting a wrong AI-detected verse on screen.** Problem: recognition is helpful but not infallible. Demo: review-before-live workflow.
- **AI-26 — How to use local speech status and diagnostics when AI is slow.** Problem: the operator cannot tell whether the issue is mic, model, network, or OBS. Demo: diagnostics/status panel.

### K. Service planning and volunteer workflows

- **PLAN-01 — How to build a church service rundown before Sunday.** Problem: the order lives in a chat message or notebook. Demo: create a plan and add cues.
- **PLAN-02 — How to add Bible, worship, media, and sermon cues to one plan.** Problem: content is scattered across tools. Demo: cue types.
- **PLAN-03 — How to reorder service cues when the pastor changes the order.** Problem: last-minute changes create confusion. Demo: reorder.
- **PLAN-04 — How to duplicate last Sunday’s service plan.** Problem: recurring services are rebuilt from scratch. Demo: duplicate and edit.
- **PLAN-05 — How to use draft, active, and archived service plans.** Problem: volunteers open the wrong plan. Demo: statuses.
- **PLAN-06 — How to attach a specific verse or song section to a cue.** Problem: the cue label is not enough to operate live. Demo: metadata.
- **PLAN-07 — How to preview a service cue from the planner.** Problem: the operator wants to prepare the next moment without going live. Demo: click preview.
- **PLAN-08 — How to move through a service with next and previous cue buttons.** Problem: the operator loses the order during a busy service. Demo: planner navigation.
- **PLAN-09 — How to run a service as a live checklist.** Problem: volunteers need to know what has already happened. Demo: checklist and progress.
- **PLAN-10 — How to mark service moments complete without changing the live output.** Problem: planning state and presentation state are confused. Demo: checklist toggle.
- **PLAN-11 — How to reset a service checklist.** Problem: a rehearsal should not leave the live plan completed. Demo: reset.
- **PLAN-12 — How to manage prayer, offering, speaker, and announcement cues.** Problem: non-media service moments are absent from the rundown. Demo: cue types.
- **PLAN-13 — How to use live tools for altar call, offering, or welcome moments.** Problem: repeated service graphics are hard to launch quickly. Demo: live tool preset.
- **PLAN-14 — How to customize the text in a live service tool.** Problem: a generic label does not fit the local church. Demo: main/secondary text.
- **PLAN-15 — How to choose a background and duration for a service moment.** Problem: the operator needs a polished graphic without design software. Demo: background/media/duration.
- **PLAN-16 — How to set the OBS scene and microphone source for a live tool.** Problem: a tool is configured for the wrong production setup. Demo: settings.
- **PLAN-17 — How to make a service plan understandable for a new volunteer.** Problem: the plan contains internal shorthand. Demo: labels, details, icons, and checklist flow.

### L. Remote operation and mobile control

- **REMOTE-01 — How to control church presentation from your phone.** Problem: the operator cannot stay at the OBS desk. Demo: pair and open remote controls.
- **REMOTE-02 — How to pair a mobile device with MakeChurchEasy.** Problem: the phone is not recognized. Demo: connection wizard.
- **REMOTE-03 — How to approve a remote desktop connection.** Problem: pairing is waiting for permission. Demo: desktop approval step.
- **REMOTE-04 — How to control Bible verses from mobile.** Problem: scripture needs to be sent from the floor or stage. Demo: mobile Bible screen.
- **REMOTE-05 — How to control worship lyrics from mobile.** Problem: the lyric operator is away from the main computer. Demo: song/section control.
- **REMOTE-06 — How to control media from mobile.** Problem: video playback needs a second operator. Demo: media control.
- **REMOTE-07 — How to control tickers, lower thirds, and countdowns remotely.** Problem: graphics changes interrupt the main operator. Demo: ministry controls.
- **REMOTE-08 — How to inspect or change scenes from mobile.** Problem: the director needs a remote scene action. Demo: scenes surface.
- **REMOTE-09 — How to recover when the mobile controller goes offline.** Problem: the phone loses the desktop connection. Demo: offline state and reconnect.
- **REMOTE-10 — How to run OBS on one laptop and control it from another.** Problem: the control desk and production computer are separated. Demo: remote OBS setup.
- **REMOTE-11 — How to use Presentation Link when remote OBS control is not practical.** Problem: the team needs a browser-only fallback. Demo: presentation link.
- **REMOTE-12 — How to create a mobile automation rule.** Problem: recurring actions are repeated manually. Demo: automation rule builder where enabled.
- **REMOTE-13 — How to schedule a church presentation automation.** Problem: a pre-service action must happen on time. Demo: schedule screen where enabled.
- **REMOTE-14 — How to test remote control before a live stream.** Problem: the first pairing test happens during service. Demo: pair, send Bible, send media, clear.
- **REMOTE-15 — How to give a volunteer access without giving them the whole production desk.** Problem: teams need role-appropriate operation. Demo: device/access workflow; claim only what the current entitlement model supports.

### M. Themes, templates, and background management

- **THEME-01 — How to find a lower-third theme quickly.** Problem: the theme library is large. Demo: search and filters.
- **THEME-02 — How to filter Bible, worship, and general themes.** Problem: irrelevant designs slow down setup. Demo: categories.
- **THEME-03 — How to see only your favorite themes.** Problem: volunteers need a short approved list. Demo: favorites.
- **THEME-04 — How to create a church-branded theme.** Problem: a church wants its own visual identity. Demo: theme creator.
- **THEME-05 — How to duplicate a theme for a special event.** Problem: a conference needs a variation without losing the base design. Demo: duplicate/edit.
- **THEME-06 — How to rename and organize custom themes.** Problem: “Theme 1” and “Theme 2” are impossible to identify. Demo: rename/library.
- **THEME-07 — How to preview a theme with real speaker or Bible content.** Problem: a design looks good with placeholder text but fails with long content. Demo: variable preview.
- **THEME-08 — How to choose a background from saved images and videos.** Problem: the operator cannot find the correct service artwork. Demo: background picker.
- **THEME-09 — How to use patterns as fast church backgrounds.** Problem: a presentation needs texture without a design workflow. Demo: pattern picker.
- **THEME-10 — How to keep a consistent church look across Bible, lyrics, and lower thirds.** Problem: every operator uses a different style. Demo: approved theme set.
- **THEME-11 — How to create a seasonal Christmas or conference theme.** Problem: the church needs a campaign look quickly. Demo: duplicate, edit, favorite.
- **THEME-12 — How to remove an outdated theme without breaking current output.** Problem: the library has unused designs. Demo: inspect active use before delete.
- **THEME-13 — How to send production themes to the dock.** Problem: a volunteer cannot see the themes approved by the production lead. Demo: production theme settings.
- **THEME-14 — How to set the church logo and brand color once.** Problem: every graphic needs manual branding. Demo: church profile/branding.
- **THEME-15 — How to make a theme readable on both OBS and mobile livestreams.** Problem: the design works in a preview but crops online. Demo: safe area and responsive testing.

### N. Reliability and troubleshooting topics

These are valuable content topics because they match urgent searches, but they must be published only after the current build passes a real OBS test. A code check is not the same as proving a live browser source, scene, cache, or mobile connection.

- **FIX-01 — Bible visible in Arc/browser but blank in OBS.** Verify URL, browser-source size, source visibility, network access, and cache behavior.
- **FIX-02 — Bible is blank every time it is sent.** Reproduce from a clean OBS source and inspect initialization, route packet, and source refresh.
- **FIX-03 — OBS needs a manual cache refresh before Bible appears.** Test source lifecycle and self-healing before claiming a fix.
- **FIX-04 — Worship or notes flicker when moving to the next verse/slide.** Compare the source update path with a stable browser presentation.
- **FIX-05 — A routed scene updates when sync is disabled.** Verify route ownership, source IDs, and whether the default MCE Presentation source is being reused.
- **FIX-06 — A Bible output is replaced by another tab’s content.** Test module-specific routes and source identity.
- **FIX-07 — Clicking a Bible verse does not send the clicked verse.** Trace selected verse state, preview state, and send payload.
- **FIX-08 — The Bible title or reference label is missing.** Verify template variables, reference settings, and output payload.
- **FIX-09 — A Bible lower third shows an unrelated countdown or graphic.** Inspect stale sources, overlay mode, and scene layering.
- **FIX-10 — Lower-third size changes in the dock but not in OBS.** Test each size preset through the final output route, not only React state.
- **FIX-11 — Lower-third size changes once and then returns to the previous size.** Test persistence, route packets, and update ordering.
- **FIX-12 — LG/SM/MD presets behave like the same size.** Compare computed style values and browser-source reload behavior.
- **FIX-13 — Lower-third marker, name, title, or theme does not appear.** Test variable substitution with short and long speaker values.
- **FIX-14 — Styles reset after an app update.** Test user-scoped persistence, migration keys, IndexedDB/local storage, and theme hydration.
- **FIX-15 — OBS shows old content after the dock sends new content.** Compare source URL/cache key, route packet timestamp, and browser reload policy.
- **FIX-16 — A source is duplicated after reconnecting OBS.** Verify idempotent synchronization and source ownership.
- **FIX-17 — Clearing a tab clears content in another scene.** Test clear scope and scene route identity.
- **FIX-18 — The browser link works locally but not from the OBS computer.** Test IP binding, network reachability, and the exact URL used by OBS.
- **FIX-19 — Remote OBS connects but a particular module is blank.** Test module-specific route packets and target scene source state.
- **FIX-20 — Mobile connects but actions do not reach OBS.** Test pairing status, desktop approval, WebSocket state, and action acknowledgements.
- **FIX-21 — Voice AI hears audio but produces no scripture suggestions.** Test microphone selection, transcript finalization, reference parser, and plan/credit state.
- **FIX-22 — Voice AI repeats the same verse.** Test deduplication and queue expiry.
- **FIX-23 — Voice AI pushes a suggestion too early.** Disable auto-push and demonstrate review-before-live.
- **FIX-24 — A transcript saves locally but not to the account.** Verify API response, IndexedDB fallback, authentication, and retry behavior.
- **FIX-25 — Worship song import/save returns HTTP 500.** Capture the failing endpoint and server log, then test a clean retry and malformed-input fallback.
- **FIX-26 — Media shows as missing after a file was moved.** Use the library’s missing-file cleanup/recovery workflow.
- **FIX-27 — A document page is cropped or unreadable in OBS.** Test fit/fill, zoom, alignment, and source dimensions.
- **FIX-28 — A countdown remains after it reaches zero.** Test end action and source visibility state.
- **FIX-29 — A multi-view preview is stale.** Refresh source captures and verify the live output separately.
- **FIX-30 — A theme looks correct in the dock but wrong in OBS.** Compare preview HTML/CSS, font availability, variable substitution, and browser-source dimensions.

### O. Plans, credits, and church operations

- **OPS-01 — How to know which MakeChurchEasy plan unlocks mobile control.** Problem: a church wants remote operation but does not know the requirement. Demo: plan comparison and device flow.
- **OPS-02 — How to check whether a feature is plan-gated.** Problem: a button is unavailable without an explanation. Demo: entitlement/upgrade context.
- **OPS-03 — How credits relate to AI and translation workflows.** Problem: the operator starts a process without knowing the usage cost. Demo: credits page and transparent estimate.
- **OPS-04 — How to manage connected church devices.** Problem: an old phone or laptop still appears as a controller. Demo: devices page.
- **OPS-05 — How to prepare a church account for a new volunteer.** Problem: onboarding is left until service day. Demo: login, pairing, resources, and test.
- **OPS-06 — How to update church branding in one place.** Problem: each graphic has inconsistent names/colors. Demo: profile/branding settings.
- **OPS-07 — How to find MakeChurchEasy tutorials and resources.** Problem: a volunteer needs self-service help. Demo: resources/tutorial surfaces.
- **OPS-08 — How to review downloads and install the correct desktop build.** Problem: the team is using mismatched versions. Demo: downloads page and version check.
- **OPS-09 — How to check subscription, billing, and transaction status.** Problem: an upgrade or renewal is unclear. Demo: billing surfaces; do not promise a payment provider behavior without a current live test.
- **OPS-10 — How to use referrals or invite another church team member.** Problem: growth is happening through informal links. Demo: referral/invite flow if enabled.
- **OPS-11 — How to protect a church account with sessions and two-factor authentication.** Problem: production access is shared too widely. Demo: security settings.
- **OPS-12 — How to decide whether a church needs OBS, Presentation Link, or both.** Problem: teams choose a setup that does not match their hardware. Demo: simple decision guide.

## 5. The content formats to produce

Do not record the product as a long feature tour. Produce these repeatable formats:

### 5.1 Emergency fix

**Hook:** “Bible visible in the browser but blank in OBS? Check these three things.”  
**Structure:** show the failure, name the likely cause, perform the smallest fix, prove the output, give a fallback.

### 5.2 One task, one result

**Hook:** “How to show John 3:16 in OBS in under 30 seconds.”  
**Structure:** open the exact tab, perform one action, show the result, stop.

### 5.3 Before and after

**Hook:** “Your worship lyrics look like this because imported text is not slide-ready.”  
**Structure:** show messy import, clean/split/label it, show the live result.

### 5.4 Operator workflow

**Hook:** “Here is the Sunday workflow I would give a new church media volunteer.”  
**Structure:** connect, load plan, preview, send, clear, recover.

### 5.5 Trust-building test

**Hook:** “I tested the same Bible send in Arc and OBS so you do not have to guess.”  
**Structure:** state the test setup, show both outputs, identify what passed and what did not.

### 5.6 Outcome story

**Hook:** “A small church does not need a full-time graphics operator for this.”  
**Structure:** describe the old manual workflow, show the new task flow, show the result, mention the setup honestly.

## 6. Standard 45-second script template

1. **0–3 seconds:** state the searched problem exactly.
2. **3–8 seconds:** show the bad or slow workflow.
3. **8–28 seconds:** perform the fix in MakeChurchEasy.
4. **28–38 seconds:** show the output in OBS or Presentation Link.
5. **38–45 seconds:** state the next related problem and invite the viewer to follow for the next fix.

Example:

> “Bible is blank in OBS but works in your browser? First, confirm OBS is using the same reachable URL. Then refresh the browser source, verify the source is visible in the target scene, and send one verse from the Bible dock. If it still fails, do not refresh randomly—check the connection and target scene. I’ll show the full OBS checklist in the next video.”

## 7. Search and title rules for the partner

Use the viewer’s problem in the first sentence. Prefer:

- “How to show Bible verses in OBS” over “MakeChurchEasy Bible feature”;
- “How to fix blank OBS browser source” over “Our OBS integration”;
- “How to import and clean worship lyrics” over “Song library demo”;
- “How to display a sermon quote” over “Sermon module walkthrough”;
- “How to control OBS from your phone” over “Mobile app announcement”;
- “How to make a church countdown” over “Countdowns are here”;
- “How to use AI to find Bible verses while preaching” over “Our AI is powerful.”

Use one exact problem per video. Put the feature name after the problem, not before it. A good caption contains the task, the environment, and the result: `How to show Bible verses in OBS with MakeChurchEasy | Bible lower third + preview/live workflow`.

## 8. Claims that require care

Do not promise “no setup,” “always works,” “zero delay,” “AI never gets it wrong,” or “every feature works on every plan.” The actual workflow can depend on OBS, browser-source reachability, scene configuration, network, microphone permission, plan entitlement, credits, local files, and the current build.

For any video about blank output, flicker, routing, persistence, payment, import errors, or live AI:

1. test the exact build;
2. test the real destination (OBS, not only the dock preview);
3. test a fresh session and a reconnect;
4. record the scene, source, route, and browser URL used;
5. state any limitation plainly;
6. do not publish a workaround as a permanent fix.

## 9. Partner production system

For each video, create a card with these fields:

| Field | Required value |
|---|---|
| Content ID | One ID from this document, such as `BIBLE-06` |
| Search question | The exact viewer problem |
| Audience | Pastor, worship leader, OBS operator, volunteer, or church admin |
| Starting state | What is failing or taking too long |
| Setup | OBS version/build, MakeChurchEasy build, scene name, source type, network/mic details |
| Fix | The smallest verified action sequence |
| Proof | What the viewer must see in OBS or Presentation Link |
| Limitation | Plan gate, credits, network, local file, or live-verification note |
| CTA | The next related problem, not a generic “download now” |
| Status | Idea, recording, edited, verified, published |

Recommended ownership:

- **Product/engineering:** verify the workflow and resolve any FIX item.
- **Content partner:** write the hook, record the operator path, and edit for one problem.
- **Church media tester:** run the same workflow in a real OBS scene and report what changed.
- **Founder/marketing:** approve the claim, title, CTA, and plan/credit wording.

## 10. Suggested first 30 videos

Start with high-intent, easy-to-understand problems before advanced features:

1. `OBS-01` — Connect MakeChurchEasy to OBS.
2. `OBS-02` — Add the Bible browser source.
3. `BIBLE-01` — Put a verse on screen quickly.
4. `BIBLE-02` — Find a verse by phrase.
5. `BIBLE-05` — Switch translations.
6. `BIBLE-14` — Full-screen versus lower-third scripture.
7. `BIBLE-27` — Browser works, OBS is blank.
8. `WORSHIP-01` — Send worship lyrics to OBS.
9. `WORSHIP-04` — Import lyrics from a URL.
10. `WORSHIP-08` — Remove lyric verse numbers.
11. `WORSHIP-09` — Split lyrics into readable slides.
12. `WORSHIP-12` — Send only the chorus.
13. `TEXT-01` — Show sermon notes in OBS.
14. `TEXT-06` — Show a quote with speaker attribution.
15. `GRAPHICS-01` — Show a pastor’s name and title.
16. `GRAPHICS-02` — Save speaker presets.
17. `MINISTRY-01` — Add a scrolling announcement.
18. `MINISTRY-10` — Create a pre-service countdown.
19. `MINISTRY-14` — Play a welcome video when the countdown ends.
20. `MEDIA-02` — Play a church video.
21. `MEDIA-11` — Create a text announcement without Photoshop.
22. `MEDIA-16` — Show a PDF page in OBS.
23. `MULTI-03` — Picture-in-picture preaching layout.
24. `MULTI-04` — Camera beside scripture.
25. `AI-01` — Detect a Bible verse while preaching.
26. `AI-05` — Use AI Preview safely.
27. `AI-17` — Translate a sermon transcript.
28. `AI-18` — Export a transcript to PDF.
29. `PLAN-01` — Build a Sunday service rundown.
30. `REMOTE-01` — Control the presentation from a phone.

## 11. The core message

The partner should not sell “an app with many tabs.” The story is:

> “MakeChurchEasy helps a church media team solve the exact problems that happen between the sermon, the camera, the lyrics, the OBS scene, and the livestream. Search for the problem, follow the workflow, and see the result in the real output.”

That positioning gives MakeChurchEasy a durable content engine: every real service problem can become a short, searchable tutorial, a live test, a before/after, or a volunteer training lesson.

