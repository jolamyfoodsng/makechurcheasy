# MakeChurchEazy Release Highlights (v4.3.3)

## 1. Cleaner Studio Screen
- **Lead:** Removed the Live Output heading, air-status badge, connection dot, and elapsed timer from the Studio panel. The screen preview and its controls remain available.

## 2. Studio Starts Without OBS Prompts
- **Lead:** Studio no longer shows OBS setup or vMix coming-soon prompts. Start with Studio for presentations, or choose OBS during onboarding for OBS controls.

## 3. Reliable Studio Video Playback
- **Lead:** Send a video to Program and it starts without a separate click. Studio prepares formats that the screen cannot play directly on Windows and Mac.

## 4. Refresh Studio Device Lists
- **Lead:** Refresh the microphone and camera lists in Studio after connecting a new device, without restarting the app.

> **How to get it:** Install the update when MakeChurchEazy prompts you, or download it from makechurcheazy.com/downloads.

---

## Previous Release Highlights (v4.3.1)

## 1. Choose Your Workspace
- **Lead:** New users can choose MakeChurchEazy Studio and start preparing presentations without connecting OBS, or choose OBS and follow the existing setup. vMix is shown as coming soon.
- **Lead:** First-time Studio users get a welcome guide to Bible, worship and notes, media, and previewing before projection. OBS setup remains available later from Studio.

## 2. Studio Media Slideshows
- **Lead:** Prepare image and video slideshows from the Media workspace and control playback from one slideshow bar.
- **Lead:** Preview-first mode lets you review slideshow media before projecting it.

> **How to get it:** Install the update when MakeChurchEazy prompts you, or download it from makechurcheazy.com/downloads.

---

## Previous Release Highlights (v4.2.4)

## 1. Easier Live Studio Controls
- **Lead:** Choose what viewers see with one control: Full Screen, Lower Third, Camera, or Camera + Lower Third. The selection goes live straight away.
- **Lead:** The camera stays off when Studio opens and starts only when you choose it or it is already live.

## 2. A More Organized Studio Workspace
- **Lead:** Keep the service schedule on the left and Verse AI or Broadcast Graphics on the right, with Queue, Transcript, and History tabs.
- **Lead:** Studio now shows which broadcast graphic is on screen and gives you a Remove button to take it off.

## 3. More Reliable Projector Windows
- **Lead:** On Windows, projector windows now use the same browser settings as the main app, fixing cases where an output screen closed just after opening.
- **Lead:** If an output screen closes unexpectedly, Studio now reports how long it stayed open and which screen it was opening.

## 4. Windows Build Improvements
- **Lead:** The Windows release build now handles OBS bundle links and build-tool paths more reliably.

> **How to get it:** Install the update when MakeChurchEazy prompts you, or download it from makechurcheazy.com/downloads.

---

## Previous Release Highlights (v4.1.3)

## 1. Voice AI Stops When You Walk Away
- **Stops when the screen turns off:** If your laptop screen goes dark or the computer goes to sleep, Voice AI now stops listening straight away instead of running (and using credits) in the background.
- **"Are you still using Voice AI?" check:** After 5 minutes with no speech you get a prompt with a 60-second countdown. Choose **Yes, keep listening** to carry on or **No, stop** to end it. If nobody answers, it stops on its own. The next checks come after 10 minutes, then every 15 minutes.
- **Works everywhere:** The prompt appears on any page of the app and in the OBS Scripture Assistant dock, and answering it from the dock now works.
- **Room noise no longer counts as speech:** Empty or garbled transcripts no longer keep a session running.

## 2. Scripture Assistant Auto-Push Fix
- **No more old verses coming back:** With auto-push on, a verse that had already been shown could be pushed again minutes or hours later, after you had moved on. Auto-push now only sends verses heard in the last few seconds, only while Voice AI is listening, and never repeats one it already sent. Older detections stay in the queue so you can still click them.
- **Uses your Bible theme:** Auto-pushed verses use the same theme as your Bible tab — only the verse and reference change.

## 3. The Dock Remembers Where You Were
- **Reopens on your last tab:** Reloading the OBS Dock no longer jumps back to Bible. It opens on the tab you were using, even if a verse is still live in OBS.
- **Picks up where you left off:** The selected Bible verse and the open worship song and slide are remembered too. They are only selected again — nothing is sent to OBS on reload.

## 4. Lower Thirds & Broadcast Graphics
- **Lower thirds sit on top:** Sending a lower third no longer hides your lyrics, slides, ticker or media. A second lower third replaces the first. If you prefer the old behaviour, tick **Hide slides and verses while a lower third is showing** in the Dock settings.
- **Easier lower-third editing:** Every text box has a clear heading, a short hint and a Reset link. Your church name, pastor and role are filled in from your church profile, and Send to OBS stays visible at the bottom.
- **Faster Broadcast Graphics page:** Previews load as you scroll, so the page no longer freezes when it first opens. The preview player is larger, with Animate In and Animate Out buttons.
- **OBS sources stay up to date:** After OBS connects, MakeChurchEazy refreshes its own browser sources one at a time so they show the latest version. It never touches a scene that is live, streaming or recording.

## 5. Mac Updates Install In-App Again
- **Updates install on Mac:** On Mac, in-app updates downloaded but then failed with "Update failed". macOS was blocking the app from replacing itself. From this version on, updates install and restart the app on their own.
- **One manual install needed on Mac:** Because of that block, older Mac versions can't install this update themselves. Download it once from makechurcheazy.com/download, open the file, drag MakeChurchEazy into Applications and choose **Replace**. Windows updates as usual.
- **Your data comes with you:** The first time you open this version on Mac, your sign-in, settings, songs and library are carried over automatically.
- **Clear messages if an update can't install:** If MakeChurchEazy is running from the disk image or the Downloads folder, the app now asks you to move it to Applications first. Any other problem shows what went wrong instead of just "Update failed".
- **A backup if an update still fails:** If the in-app update can't finish, the app now opens the installer for you instead of stopping.

## 6. Smaller Fixes
- **Upgrade links open in your browser:** Upgrade buttons in the Dock now open the plans page in your web browser instead of inside the Dock.
- **Links in the app work again:** Announcement buttons and other links that open a web page did nothing when clicked. They now open in your web browser.
- **Your own name in the greeting:** The desktop dashboard greets you by your account name instead of the church's main pastor.

> **How to get it:** On Windows, install the update when the app prompts you. On Mac, download this version once from makechurcheazy.com/download and drag it into Applications. Future Mac updates install from inside the app.

---

## Previous Release Highlights (v4.1.2)

### 1. Broadcast Graphics Fix (Windows & Installed App)
- **Lead:** Fixed blank or plain-text previews on Windows and installed Mac copies. Graphics now show their colours, fonts, and animation in the library, Customize editor, and Dock.
- **Lead:** Graphics sent to OBS now include their styles and animation files. These files ship with the app, so graphics also display correctly offline.

### 2. New Broadcast Graphics
- **Lead:** Live Social Bar adds a gradient title bar, logo tab, LIVE badge, and three social handles, with animated entrance and exit.
- **Lead:** Arrow Logo Bar adds a chevron logo block, gradient arrow, social icons, and website strip, with animated entrance and exit.

> **How to get the fix:** Install the update when the app prompts you, or download the latest version from makechurcheazy.com/downloads. If your graphics already looked fine, nothing changes for you.

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
