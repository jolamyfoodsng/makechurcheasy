# MakeChurchEasy Release Highlights (v4.1.1)

## 1. Patch Release & Version Alignment
- **Lead:** Refresh the v4.1 release as version 4.1.1 with synchronized application metadata and new Windows and macOS packages.

---

## Previous Release Highlights (v4.1.0)

## 1. Multi-Stream Broadcasting
- **Lead:** Send your OBS stream to YouTube, Facebook, Instagram, TikTok, Twitch, Kick, and custom RTMP destinations. Save profiles for services or speakers, sync them with OBS, check destination status, and track monthly multi-stream hours.

## 2. Upgraded Lower Thirds & Tickers
- **Lead:** Refresh your broadcast with animated speaker lower thirds and more ways to style and manage tickers. Preview and customize graphics, then send them to OBS.

## 3. A Smoother Voice to Scripture
- **Lead:** Improved live transcription and Bible-reference detection let you queue detected verses in sequence while the next verse is prepared.

## 4. Regional Pricing & 30-Day Trials
- **Lead:** Compare plans and features on the public pricing page with region-specific pricing. New signups receive a 30-day free trial.

## 5. More Reliable Signups & Branded Sharing
- **Lead:** Signup and verification updates retry synchronization after temporary service interruptions, and shared links now show branded preview artwork.

## 6. Passkey Sign-In & Account Security
- **Lead:** Sign in with passkeys and manage them from account security settings for a simpler, more secure way to access your account.

## 7. Flexible Offers & Campaigns
- **Lead:** Admins can build discount offers and signup journeys, preview who qualifies, and manage campaigns from the dashboard.

---

## Previous Release Highlights (v3.33.0)

## 1. Service Schedule & Projection History
- **All-in-One Service Queue:** Pre-build and organize your Sunday order of service. Queue Bible passages, worship songs, and sermon notes in one persistent side drawer right next to your active modules.
- **Instant Recall & Projection History:** Look back at everything projected during service and bring any verse, lyric, or note back on screen with one click.
- **Adaptive Card Design:** Schedule cards automatically adapt their height so long scripture references, song titles, and notes never get clipped or truncated.
- **Full Song & Notes Inspector:** Clicking a worship song in your schedule opens the full verse and chorus slides with live drag-and-drop slide reordering and inherited module styles.
- **Sequential Onboarding:** The new step-by-step dock guide runs first, followed smoothly by the Service Schedule & History feature guide without overlapping modals.

## 2. OBS Workflow, Dock Reliability & Networking Fixes
- **Static Canonical Dock URLs (`http://127.0.0.1:45678/dock`):** Replaced legacy `localhost` dock addresses with canonical static loopback URLs (`http://127.0.0.1:45678/dock` and `http://127.0.0.1:45678/lm-dock`). Completely resolves the macOS and OBS Chromium `ERR_CONNECTION_REFUSED` (`localhost refused to connect`) bug caused by IPv6 (`::1`) DNS resolution.
- **Permanent, Network-Independent Setup:** The `127.0.0.1` address is 100% static and never changes across Wi-Fi networks, church router restarts, or DHCP reassignments—configure it once in OBS Custom Browser Docks and it works permanently.
- **Multi-Laptop Wi-Fi Isolation:** Multiple laptops running MakeChurchEasy and OBS on the same church network operate independently via local loopback with zero cross-talk, collision, or interference.
- **Proactive Stale Instance & Port Reclaiming:** If port `45678` is occupied on launch by a crashed, zombie, or background instance from an earlier session, the app automatically terminates the old process and rebinds the overlay server cleanly.
- **Multi-Laptop Remote OBS Helper:** For teams operating OBS on a secondary laptop across the church Wi-Fi, added an integrated one-click copy helper for the host laptop's local LAN IP (`http://<lan-ip>:45678/dock`).
- **Protect Background Music & Audio Sources:** Projecting scriptures, lyrics, or media in OBS will no longer inadvertently mute background music, instrumental pads, or live audio feeds.
- **Unified "How to Connect" Dashboard Card:** Replaced disconnected connection boxes with an integrated, expandable accordion directly on your dashboard status panel.
- **Dual Connection Docks:** Instant access to both the **Bible Overlay Dock** (`/dock`) and **Scripture Assistant** (`/lm-dock`) with one-click URL copying and step-by-step OBS instructions.
- **Zero Window Switching:** Keep your entire service workflow right inside OBS Studio—no second laptops or alt-tabbing while the pastor is preaching.

## 3. Worship Library & PDF Import
- **Reliable PDF Lyrics Import:** Import lyrics, hymns, and chord charts directly from PDF documents into your church worship catalog.
- **Smarter AI Song Splitting:** Improved automatic stanza detection (Verses, Chorus, Bridge) when bulk importing songs into your library.

## 4. Dock Styling, Nigerian Liturgy & Polish
- **Liturgy Scripture Presets:** Simplified scripture shortcodes with default Nigerian liturgy templates and redesigned selection cards.
- **Dock Media Responsiveness:** Media titles, duration badges, and playback controls now stay cleanly readable even in narrow dock widths.
- **Custom Typography & Glass Styling:** Consistent font scaling, theme colors, and glass styling across all schedule and reader panels with full light and dark mode support.
- **Performance & Idle Optimization:** Reduced idle CPU footprint and smoother dock reloads.

## 5. Web Dashboard & Community
- **Medium-Style Church Media Blog:** Read tips, workflows, and updates directly from the web dashboard with an article reader and social sharing.
- **Cleaner Sign-Up & Login Flows:** Streamlined login and registration pages with seamless referral and 2FA protection.
---

## Previous Release Highlights (v3.32.0)

### 1. Multi-View Custom Spacing & Live Preview Sync
- **Custom Outer Margin & Slot Gap:** Adjust outer frame margin (0–200px) and inner slot gaps (0–100px) with interactive stepper controls.
- **Background Lightbox Toggle:** Choose whether custom backdrops shrink neatly with layout margins or extend edge-to-edge.
- **Safe Draft Mode:** Background and spacing tweaks stay in preview and only push live to OBS when you click "Preview".
- **Collapsible Inspector:** Frame, Background, and Spacing properties are grouped in an open-by-default collapsible bar, saving over 50% vertical space while keeping full control at your fingertips.

### 2. Voice AI Speech-to-Scripture Inactivity Guard
- **5-Minute Inactivity Prompt:** If no voice or speech is detected for 5 minutes, an interactive prompt asks if you're still using it.
- **10-Minute Extension:** Click "I'm still using it" to reset the timer and extend active listening by 10 minutes without interruption.
- **Automatic Stop with Notification:** If left unattended for 60 seconds, listening stops automatically and displays a "Stopped due to inactivity" toast.

### 3. OBS Sync & Presentation Performance
- **Instant Layout Switching:** Reduced slot repositioning latency when switching between grid, stacked, and picture-in-picture layouts.
- **Accurate Sub-Pixel Alignment:** Slots and frame borders now align pixel-perfect across standard and ultrawide resolutions.

### 4. Dock Bible Tab Toolbar & Picker Refinements
- **Promoted Quick Edit:** Quick Edit is now immediately accessible directly from the bottom toolbar.
- **Unified Action Menu:** Compare Translations, Bible History, Reload Dock, and Theme toggles are unified in the 3-dots menu—always available even in bottom-only search mode.
- **Compact Book & Chapter Pickers:** Redesigned 5-column book picker with standard initials and 6-column chapter grid for faster navigation.
- **Improved Popover Stacking:** Ensured reference and translation compare popovers always render comfortably above the search bar.

### 5. Stability & Polish Fixes
- **OBS Live Leak Fix:** Resolved an issue where changing background colors in card settings updated OBS prematurely.
- **Localization Cleanup:** Fixed missing translations for frame properties and spacing controls.
