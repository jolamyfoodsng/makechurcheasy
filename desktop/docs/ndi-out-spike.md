# NDI® out from the Studio: feasibility spike

Status: spike only. Nothing user-facing changed, nothing committed. Prototype: `desktop/spikes/ndi-out/` (Swift, macOS).
Date: 2026-10-16. Machine: MacBook Pro M1 Max (10 cores), macOS 27.0, NDI runtime at `/usr/local/lib/libndi.dylib`.

## Question

Can the Studio send its Alternate output (or Program) as an NDI source, ideally with transparency, so that a
switcher (vMix, OBS with DistroAV, NDI Studio Monitor) can lay a lower third over its own video?

## Answer

**Yes, on macOS. Use `WKWebView.takeSnapshot` instead of screen capture.** The snapshots keep alpha, need no Screen
Recording permission, and run at a full 30 fps at 1080p. This works on a window that is invisible (alpha 0) or
off-screen, as long as WebKit's occlusion throttling is turned off. NDI carries the alpha through to the receiver
unchanged: a 60 % bar arrives as A=153 exactly.

Windows needs a different capture path, and that part has not been tested yet (see below).

## What was measured

The prototype opens a borderless, transparent `NSWindow` with a `WKWebView`. That is the same thing Tauri builds
for a projector window with `transparent(true)`. The window shows a test lower third: a 60 % blue bar, a solid red
box, and a counter that changes every frame. The prototype grabs pictures, sends them as
**"MakeChurchEazy – Lower Third"**, and receives them back with the NDI receiver API in the same process to check
pixels and frame rate.

### 1. Getting the pictures

| Capture | Window | Throttling off? | New pictures/s at 1080p30 | Alpha |
|---|---|---|---|---|
| `takeSnapshot` | on screen, visible | n/a | 29.0 – 29.3 | ✅ |
| `takeSnapshot` | on screen, covered by other windows | no | **0.2** (page freezes) | ✅ |
| `takeSnapshot` | on screen, covered by other windows | yes | 28.8 | ✅ |
| `takeSnapshot` | off-screen (origin −20000,−20000) | no | **0.2** | ✅ |
| `takeSnapshot` | off-screen | yes | 28.8 | ✅ |
| `takeSnapshot` | on screen, `alphaValue = 0` (invisible) | no | **0.2** | ✅ |
| `takeSnapshot` | on screen, `alphaValue = 0` | yes | **28.8** | ✅ |
| `takeSnapshot` | never shown (`orderOut`) | yes or no | 0.2 | ✅ |
| ScreenCaptureKit | any | – | not measured (see below) | – |

"New pictures" counts frames whose text line changed, so it measures what a receiver would actually see. Without
the switch, WebKit sees the window as occluded and stops painting. Snapshots still return, but they show the same
old picture. A window that was never ordered in never paints at all.

"Throttling off" means two private WebKit switches, both reachable through KVC with no extra dependencies:

- `-[WKWebView _setWindowOcclusionDetectionEnabled:NO]` is the one that matters.
- On `WKPreferences`: `_setHiddenPageDOMTimerThrottlingEnabled:`, `_setHiddenPageDOMTimerThrottlingAutoIncreases:`
  and `_setPageVisibilityBasedProcessSuppressionEnabled:` set to NO. These keep timers and the WebContent process at
  full speed. The app already ships with `macOSPrivateApi: true`, so this adds no new kind of risk.

The round trip for one snapshot is 8–13 ms. Drawing the `CGImage` into a BGRA buffer takes about 1.1 ms per frame.
That step can move off the main thread.

### 2. Does alpha survive?

Yes, and no fallback is needed. The snapshot comes back as **premultiplied** BGRA:

| Spot | Snapshot (premultiplied) | Received over NDI, sent as-is | Received over NDI, un-premultiplied first |
|---|---|---|---|
| Empty area | (0,0,0,**0**) | (0,0,0,0) | (0,0,0,0) |
| Red box | (0,0,255,**255**) | (0,0,251,255) | (0,0,251,255) |
| Blue bar 60 % | (153,0,0,**153**) | (142,0,0,153) ❌ too dark | (239,0,0,153) ✅ |

NDI expects straight (not premultiplied) alpha. Each picture therefore has to be un-premultiplied before sending
(`vImageUnpremultiplyData_RGBA8888`, about 0.25 ms at 1080p). Without that step, edges and see-through areas
look dark in the switcher. The small colour shifts (255 → 251/239) come from NDI's own compression, which stores
colour at reduced resolution, and are normal for NDI.

**Key matte fallback.** This is for receivers that drop alpha, such as hardware switchers that want fill and key.
The prototype can also send a second source, "MakeChurchEazy – Lower Third (Key)", where alpha is drawn as a
grey picture (white = solid). It works, but it costs about 10 % more of one core. It should be an option, not the
default. vMix, OBS (DistroAV) and NDI Studio Monitor all read NDI alpha directly.

### 3. Sending over NDI

- The source shows up as `TAYO-AKOSILES-MACBOOK-PRO.LOCAL (MakeChurchEazy – Lower Third)`. The en dash survives
  intact.
- The receiver got 1920×1080 BGRA at 25.2–25.9 fps against 28.8 fps sent. The gap is probably the test receiver's
  own loop: it prints and uses 200 ms waits. The real rate should be confirmed in NDI Studio Monitor and vMix, which
  this run did not do (OBS on this Mac has no DistroAV).
- Sending reuses the loading pattern in `studio_ndi.rs`: `NDIlib_send_create` (`clock_video: false`, because the
  snapshot timer does the pacing) and `NDIlib_send_send_video_v2` with fourcc `BGRA`.

### CPU at 1080p30 (`top`, % of one core, M1 Max)

| Setup | App process | WebContent | WebKit GPU | WindowServer |
|---|---|---|---|---|
| Test page animating, no capture (baseline) | 6 % | 9 % | 8 % | 12 % |
| + snapshots at 30 fps | 7 % | 25–27 % | 4 % | 10 % |
| + NDI send, un-premultiply | 26 % | 25 % | 4 % | 11 % |
| + key matte source as well | 37 % | 24 % | 4 % | 12 % |

The extra cost of NDI out is about **35 % of one core**: snapshots about 16 % (in WebContent) plus NDI encoding
about 20 % (in the app). On this machine that is about 4 % of the whole CPU. The test page repaints every frame,
which is the worst case. A real lower third is static most of the time, so the app should only snapshot and send
when the page changes (and resend the last picture about once a second). Older Intel Macs will need about 2–3 times
as much.

### Real Studio page

The prototype loaded `http://127.0.0.1:45678/studio-output.html?feed=alt&nocam=1` (and `?feed=program`) from the
running app, captured them and sent them at the full rate. Nothing was live in the Studio during the test, so the
pictures were empty (Program is black). How the real page looks over NDI still needs checking with a live item.
Today the page is only transparent with `nocam=1`. A real NDI key output needs a small `?key=1` mode in
`studio-output.html`: transparent page, no camera, no idle curtain or logo, and media/backgrounds left out (or
optional).

## ScreenCaptureKit (macOS) and Windows

**ScreenCaptureKit window capture was not measured.** It fails here with
`SCStreamErrorDomain -3801 "The user declined TCCs"`: the host app running the spike does not have Screen Recording
permission. It is the worse route anyway, for four reasons:

- Every church would have to grant Screen Recording.
- macOS shows the recording indicator and, on recent versions, nags about it again from time to time.
- It captures the window as composited by the window server, so the window must stay on screen.
- It costs WindowServer time on top of WebKit's painting.

`takeSnapshot` avoids all of that. The prototype includes the ScreenCaptureKit path (`--capture sck`), so it can be
measured later on a machine where the permission is granted.

**Windows (not tested; no Windows machine in this run).** Tauri uses WebView2 there, which has no fast in-process
snapshot. The options, best first:

1. **WebView2 visual hosting + `GraphicsCaptureItem.CreateFromVisual`** (Windows.Graphics.Capture). Host the page
   with `ICoreWebView2CompositionController` in our own DirectComposition visual tree and capture that visual. Alpha
   is kept, no window has to be visible, there is no capture border, and the GPU does the work (D3D11 texture → map
   → BGRA). Tauri/wry doesn't offer composition hosting, so this means our own WebView2 instance through
   `webview2-com` (already in `Cargo.lock`). Most work, best result.
2. **Windows.Graphics.Capture on the projector HWND** (`CreateForWindow`). Easier. Works while the window is covered
   or off-screen, but not while it is minimised. Set `IsBorderRequired = false` on Windows 11. Windows 10 shows a
   yellow border. Whether alpha survives for a transparent WebView2 window is **unverified** and is the first thing
   to test.
3. `ICoreWebView2.CapturePreview`: PNG/JPEG only, about 5–15 fps. Not good enough for video.

## Recommendation

1. **Build macOS first, with `takeSnapshot`.** Plan:
   - A hidden projector window `studio-projector-ndi-*`, opened through the existing `open_studio_projector`. It
     needs `transparent(true)`, alpha 0 (or off-screen), and must ignore mouse clicks and stay out of Mission
     Control / the Dock.
   - Rust, through `webview.with_webview()` and the `objc2-web-kit` that wry already pulls in: turn off occlusion
     detection, then call `takeSnapshot` only when the page changes (the page can tell Rust "changed", or poll at
     30 fps), at most 30 fps.
   - Copy into BGRA, un-premultiply, then call `NDIlib_send_send_video_v2`. NDI keeps loading on demand as it does
     today.
   - Add `?key=1` to `studio-output.html`.
   - Add a Studio setting "Send as NDI" (Alternate or Program) with an optional key source.
2. **Windows second:** try Windows.Graphics.Capture on the window (option 2) first, because it is quick. If alpha is
   lost, move to visual hosting (option 1).
3. Audio over NDI is out of scope here. Program audio would need its own path (`NDIlib_send_send_audio_v3` fed from
   the page's audio).

### Rough effort

| Piece | Estimate |
|---|---|
| macOS capture + NDI sender in Rust (objc2), hidden window, pacing, change detection | 3–4 days |
| `?key=1` page mode + Studio setting + start/stop/status UI | 1–2 days |
| Testing with vMix / OBS DistroAV / NDI Studio Monitor, long-run stability, sleep/wake, display changes | 2 days |
| **macOS total** | **about 1.5 weeks** |
| Windows, Windows.Graphics.Capture on the window (if alpha survives) | +4–6 days |
| Windows, WebView2 visual hosting (if it doesn't) | +1.5–2 weeks |

### Risks

- The occlusion switch is private WebKit API. It has existed for years (WebKit itself uses it), but a macOS update
  could rename it. The check the prototype already does (`responds(to:)`) should be kept, with a fallback of a
  visible window.
- Snapshots go through WebContent on the CPU, so busy pages (video backgrounds) cost more. Video and media layers
  should be kept out of the key output.
- The send rate needs checking against a real receiver (the measured 26 vs 29 fps gap).

## Running the prototype

```sh
desktop/spikes/ndi-out/build.sh
cd desktop/spikes/ndi-out
# Test lower third, invisible window, sent as NDI with straight alpha, received back and checked:
./ndi-out-spike --capture snapshot --window alpha0 --no-throttle --ndi --unpremul --recv --seconds 10
# The app's own Alternate output (app running):
./ndi-out-spike --capture snapshot --window offscreen --no-throttle --ndi --unpremul \
  --url "http://127.0.0.1:45678/studio-output.html?feed=alt&nocam=1" --seconds 60
# Save one picture to look at:  --png /tmp/frame.png     ScreenCaptureKit instead:  --capture sck
```

While it runs, open NDI Studio Monitor or vMix on any computer on the same network and pick
"… (MakeChurchEazy – Lower Third)".
