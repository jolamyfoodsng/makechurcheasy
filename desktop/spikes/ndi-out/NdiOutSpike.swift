// NdiOutSpike.swift: feasibility spike for NDI® out from a Studio output window (not shipping code).
//
// Opens a transparent, borderless window with a WKWebView showing a test lower third (or any URL),
// grabs its pictures natively and, optionally, sends them as an NDI source and receives them back
// to check frame rate and transparency. See ../../docs/ndi-out-spike.md for the findings.
//
// Build:  ./build.sh   (swiftc, no Xcode project needed)
// Run:    ./ndi-out-spike --capture sck --window offscreen --ndi --recv --seconds 10
//
// Options
//   --capture sck|snapshot|none   ScreenCaptureKit window capture, WKWebView.takeSnapshot, or nothing (baseline)
//   --window onscreen|offscreen|hidden|alpha0|behind   where the output window is
//   --opaque                 opaque window + white page background (to compare)
//   --size WxH               capture size in pixels (default 1920x1080)
//   --points WxH             window size in points (default = capture size / backing scale)
//   --fps N                  capture rate (default 30)
//   --ndi                    send the pictures as "MakeChurchEazy – Lower Third"
//   --unpremul               un-premultiply alpha before sending (NDI expects straight alpha)
//   --no-throttle            ask WebKit not to slow down a hidden / covered page (private WebKit keys)
//   --keymatte               also send a second source with the alpha as a black/white key
//   --recv                   receive the source back in this process and check pixels
//   --url URL                load this page instead of the built-in test lower third
//   --png PATH               save the 60th snapshot as a PNG (alpha kept) to look at
//   --seconds N              how long to run (default 10)

import Accelerate
import AppKit
import CoreMedia
import CoreVideo
import ImageIO
import ScreenCaptureKit
import WebKit

// MARK: Options

struct Options {
    var capture = "sck"
    var window = "onscreen"
    var opaque = false
    var width = 1920, height = 1080
    var pointsW: CGFloat = 0, pointsH: CGFloat = 0
    var fps = 30
    var ndi = false
    var unpremul = false
    var keymatte = false
    var noThrottle = false
    var png: String? = nil
    var recv = false
    var url: String? = nil
    var seconds = 10.0
}

func parseOptions() -> Options {
    var o = Options()
    var args = Array(CommandLine.arguments.dropFirst())
    func size(_ s: String) -> (Int, Int) {
        let p = s.split(separator: "x").compactMap { Int($0) }
        return (p[0], p[1])
    }
    while !args.isEmpty {
        let a = args.removeFirst()
        switch a {
        case "--capture": o.capture = args.removeFirst()
        case "--window": o.window = args.removeFirst()
        case "--opaque": o.opaque = true
        case "--size": (o.width, o.height) = size(args.removeFirst())
        case "--points": let (w, h) = size(args.removeFirst()); o.pointsW = CGFloat(w); o.pointsH = CGFloat(h)
        case "--fps": o.fps = Int(args.removeFirst())!
        case "--ndi": o.ndi = true
        case "--unpremul": o.unpremul = true
        case "--keymatte": o.keymatte = true
        case "--no-throttle": o.noThrottle = true
        case "--png": o.png = args.removeFirst()
        case "--recv": o.recv = true
        case "--url": o.url = args.removeFirst()
        case "--seconds": o.seconds = Double(args.removeFirst())!
        default: fatalError("unknown option \(a)")
        }
    }
    return o
}

setvbuf(stdout, nil, _IOLBF, 0)
let opts = parseOptions()

// Where to look in the picture (fractions of width/height) and what the test page puts there.
let probes: [(String, Double, Double)] = [
    ("empty (want A=0)", 0.10, 0.40),
    ("red box (want R=255 A=255)", 0.90, 0.19),
    ("blue bar 60% (want B=255 A=153 straight / B=153 premultiplied)", 0.78, 0.83),
]

func testPage(opaque: Bool) -> String {
    """
    <!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:\(opaque ? "#fff" : "transparent")}
    #box{position:absolute;right:5%;top:10%;width:10%;height:18%;background:#f00}
    #bar{position:absolute;left:0;right:0;bottom:8%;height:18%;background:rgba(0,0,255,.6);color:#fff;
      font:600 5vh -apple-system,sans-serif;display:flex;align-items:center;padding-left:5%}
    </style></head><body><div id="box"></div><div id="bar">Amazing Grace&nbsp;<span id="n"></span></div>
    <script>let i=0;(function t(){n.textContent=i++;box.style.transform='rotate('+(i%360)+'deg) scale(.6)';requestAnimationFrame(t)})()</script>
    </body></html>
    """
}

// MARK: NDI (loaded at run time, like studio_ndi.rs)

final class Ndi: @unchecked Sendable {
    let handle: UnsafeMutableRawPointer
    init?() {
        guard let h = dlopen("/usr/local/lib/libndi.dylib", RTLD_NOW) else { return nil }
        handle = h
        guard sym("NDIlib_initialize", ndi_initialize_fn.self)() else { return nil }
    }
    func sym<T>(_ name: String, _: T.Type) -> T {
        unsafeBitCast(dlsym(handle, name)!, to: T.self)
    }
}

final class NdiSender {
    let ndi: Ndi
    let sender: UnsafeMutableRawPointer
    let sendVideo: ndi_send_video_fn
    let connections: ndi_send_connections_fn
    let name: String
    init(_ ndi: Ndi, name: String) {
        self.ndi = ndi
        self.name = name
        let create = ndi.sym("NDIlib_send_create", ndi_send_create_fn.self)
        sendVideo = ndi.sym("NDIlib_send_send_video_v2", ndi_send_video_fn.self)
        connections = ndi.sym("NDIlib_send_get_no_connections", ndi_send_connections_fn.self)
        sender = name.withCString { n in
            var s = ndi_send_create_t(p_ndi_name: n, p_groups: nil, clock_video: false, clock_audio: false)
            return create(&s)!
        }
    }
    func send(_ data: UnsafeMutableRawPointer, width: Int, height: Int, stride: Int, alpha: Bool, fps: Int) {
        var f = ndi_video_frame_v2_t()
        f.xres = Int32(width); f.yres = Int32(height)
        f.fourcc = alpha ? fourcc("BGRA") : fourcc("BGRX")
        f.frame_rate_n = Int32(fps); f.frame_rate_d = 1
        f.picture_aspect_ratio = Float(width) / Float(height)
        f.frame_format_type = 1 // progressive
        f.timecode = Int64.max // let NDI fill it in
        f.p_data = data.assumingMemoryBound(to: UInt8.self)
        f.line_stride_in_bytes = Int32(stride)
        sendVideo(sender, &f)
    }
}

func fourcc(_ s: String) -> UInt32 {
    s.utf8.enumerated().reduce(UInt32(0)) { $0 | (UInt32($1.element) << (8 * UInt32($1.offset))) }
}

/// Receives `name` in this process for `seconds`, reporting frame rate, format and probe pixels.
func receive(_ ndi: Ndi, matching name: String, seconds: Double) {
    let findCreate = ndi.sym("NDIlib_find_create_v2", ndi_find_create_fn.self)
    let findWait = ndi.sym("NDIlib_find_wait_for_sources", ndi_find_wait_fn.self)
    let findSources = ndi.sym("NDIlib_find_get_current_sources", ndi_find_sources_fn.self)
    let recvCreate = ndi.sym("NDIlib_recv_create_v3", ndi_recv_create_fn.self)
    let recvCapture = ndi.sym("NDIlib_recv_capture_v2", ndi_recv_capture_fn.self)
    let recvFree = ndi.sym("NDIlib_recv_free_video_v2", ndi_recv_free_video_fn.self)
    var fc = ndi_find_create_t(show_local_sources: true, p_groups: nil, p_extra_ips: nil)
    let finder = findCreate(&fc)!
    var found: (String, ndi_source_t)? = nil
    let deadline = Date().addingTimeInterval(10)
    while found == nil && Date() < deadline {
        _ = findWait(finder, 500)
        var n: UInt32 = 0
        if let list = findSources(finder, &n) {
            for i in 0..<Int(n) {
                let s = list[i]
                let full = String(cString: s.p_ndi_name)
                if full.contains(name) { found = (full, s) }
            }
        }
    }
    guard let (full, source) = found else { print("[recv] source \(name) not found"); return }
    print("[recv] found \"\(full)\"")
    var rc = ndi_recv_create_v3_t(source_to_connect_to: source, color_format: 0 /* BGRX_BGRA */,
                                  bandwidth: 100, allow_video_fields: false, p_ndi_recv_name: nil)
    let recv = recvCreate(&rc)!
    var frames = 0
    var first: Date? = nil
    var last = ndi_video_frame_v2_t()
    let end = Date().addingTimeInterval(seconds)
    while Date() < end {
        var f = ndi_video_frame_v2_t()
        if recvCapture(recv, &f, nil, nil, 200) == 1 {
            if first == nil { first = Date() } else { frames += 1 }
            if Date().addingTimeInterval(0.5) >= end || frames % 60 == 1 {
                let fcc = String(bytes: withUnsafeBytes(of: f.fourcc) { Array($0) }, encoding: .ascii) ?? "?"
                var line = "[recv] \(f.xres)x\(f.yres) \(fcc) stride \(f.line_stride_in_bytes):"
                for (label, fx, fy) in probes {
                    let x = Int(Double(f.xres) * fx), y = Int(Double(f.yres) * fy)
                    let p = f.p_data + y * Int(f.line_stride_in_bytes) + x * 4
                    line += " \(label.split(separator: " ").prefix(2).joined(separator: " ")) BGRA(\(p[0]),\(p[1]),\(p[2]),\(p[3]))"
                }
                print(line)
            }
            last = f
            recvFree(recv, &f)
        }
    }
    _ = last
    if let first {
        let rate = Double(frames) / Date().timeIntervalSince(first)
        print(String(format: "[recv] %d frames, %.1f fps received", frames, rate))
    } else {
        print("[recv] no video arrived")
    }
}

// MARK: Measuring

final class Meter {
    var frames = 0, complete = 0, idle = 0
    var start = Date()
    var cpuStart = Meter.cpuSeconds()
    var probed = false
    var convertMs: Double = 0
    var distinct = 0
    var lastSum: UInt64 = 0
    /// Counts pictures whose text line differs from the previous one (the page's counter ticks every frame).
    func noteContent(_ base: UnsafeRawPointer, width: Int, height: Int, stride: Int) {
        var sum: UInt64 = 0
        for fy in [0.80, 0.83, 0.86] {
            let row = base.advanced(by: Int(Double(height) * fy) * stride).assumingMemoryBound(to: UInt8.self)
            for x in 0..<(width * 4 / 2) { sum = sum &* 31 &+ UInt64(row[x]) }
        }
        if sum != lastSum { distinct += 1; lastSum = sum }
    }
    static func cpuSeconds() -> Double {
        var u = rusage()
        getrusage(RUSAGE_SELF, &u)
        return Double(u.ru_utime.tv_sec) + Double(u.ru_utime.tv_usec) / 1e6 + Double(u.ru_stime.tv_sec) + Double(u.ru_stime.tv_usec) / 1e6
    }
    func reset() { distinct = 0; frames = 0; complete = 0; idle = 0; convertMs = 0; start = Date(); cpuStart = Meter.cpuSeconds() }
    func report(_ label: String) {
        let t = Date().timeIntervalSince(start)
        let cpu = (Meter.cpuSeconds() - cpuStart) / t * 100
        print(String(format: "[%@] %.1f s: %d callbacks, %d new pictures (%.1f fps), %d different (%.1f fps), %d idle; this process %.0f%% of one core; convert %.2f ms/frame",
                     label, t, frames, complete, Double(complete) / t, distinct, Double(distinct) / t, idle, cpu, complete > 0 ? convertMs / Double(complete) : 0))
    }
}

let meter = Meter()

func probe(_ base: UnsafeRawPointer, width: Int, height: Int, stride: Int, label: String) {
    var line = "[\(label)] \(width)x\(height) stride \(stride):"
    for (name, fx, fy) in probes {
        let x = Int(Double(width) * fx), y = Int(Double(height) * fy)
        let p = base.advanced(by: y * stride + x * 4).assumingMemoryBound(to: UInt8.self)
        line += "\n    \(name): BGRA(\(p[0]),\(p[1]),\(p[2]),\(p[3]))"
    }
    print(line)
}

// MARK: Key matte (fill + key as two sources, for receivers that drop alpha)

final class KeyMatte {
    var buffer: [UInt8]
    let width: Int, height: Int
    init(width: Int, height: Int) { self.width = width; self.height = height; buffer = [UInt8](repeating: 255, count: width * height * 4) }
    /// Writes A into B, G and R so the key is a grey picture (white = solid, black = see-through).
    func fill(from base: UnsafeRawPointer, stride: Int) {
        buffer.withUnsafeMutableBytes { out in
            let o = out.baseAddress!.assumingMemoryBound(to: UInt8.self)
            for y in 0..<height {
                let row = base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self)
                let dst = o + y * width * 4
                for x in 0..<width {
                    let a = row[x * 4 + 3]
                    dst[x * 4] = a; dst[x * 4 + 1] = a; dst[x * 4 + 2] = a; dst[x * 4 + 3] = 255
                }
            }
        }
    }
}

// MARK: Sending one captured picture

var sender: NdiSender? = nil
var keySender: NdiSender? = nil
var keyMatte: KeyMatte? = nil
var straight: [UInt8] = []

func deliver(base: UnsafeMutableRawPointer, width: Int, height: Int, stride: Int) {
    guard let sender else { return }
    let t0 = DispatchTime.now().uptimeNanoseconds
    var data = base, outStride = stride
    if opts.unpremul && !opts.opaque {
        if straight.count != width * height * 4 { straight = [UInt8](repeating: 0, count: width * height * 4) }
        straight.withUnsafeMutableBytes { out in
            var src = vImage_Buffer(data: base, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: stride)
            var dst = vImage_Buffer(data: out.baseAddress!, height: vImagePixelCount(height), width: vImagePixelCount(width), rowBytes: width * 4)
            vImageUnpremultiplyData_RGBA8888(&src, &dst, vImage_Flags(kvImageNoFlags))
        }
        data = straight.withUnsafeMutableBytes { $0.baseAddress! }
        outStride = width * 4
    }
    if let keyMatte { keyMatte.fill(from: base, stride: stride) }
    meter.convertMs += Double(DispatchTime.now().uptimeNanoseconds - t0) / 1e6
    sender.send(data, width: width, height: height, stride: outStride, alpha: !opts.opaque, fps: opts.fps)
    if let keySender, let keyMatte {
        keyMatte.buffer.withUnsafeMutableBytes { k in
            keySender.send(k.baseAddress!, width: width, height: height, stride: width * 4, alpha: false, fps: opts.fps)
        }
    }
}

// MARK: ScreenCaptureKit window capture

final class SckOutput: NSObject, SCStreamOutput, SCStreamDelegate {
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen else { return }
        meter.frames += 1
        guard let attachments = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = attachments.first?[.status] as? Int, let status = SCFrameStatus(rawValue: raw) else { return }
        if status == .idle { meter.idle += 1; return }
        guard status == .complete, let pb = CMSampleBufferGetImageBuffer(sb) else { return }
        meter.complete += 1
        CVPixelBufferLockBaseAddress(pb, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pb, .readOnly) }
        let base = CVPixelBufferGetBaseAddress(pb)!
        let (w, h, stride) = (CVPixelBufferGetWidth(pb), CVPixelBufferGetHeight(pb), CVPixelBufferGetBytesPerRow(pb))
        if !meter.probed || meter.complete == 90 {
            meter.probed = true
            probe(base, width: w, height: h, stride: stride, label: "sck frame \(meter.complete)")
        }
        meter.noteContent(base, width: w, height: h, stride: stride)
        deliver(base: base, width: w, height: h, stride: stride)
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("[sck] stopped: \(error)")
    }
}

var scStream: SCStream? = nil
let sckOutput = SckOutput()

@MainActor
func startSck(window: NSWindow) async throws {
    let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
    let wid = CGWindowID(window.windowNumber)
    guard let scw = content.windows.first(where: { $0.windowID == wid }) else {
        print("[sck] window \(wid) is not offered by ScreenCaptureKit (state: \(opts.window)); \(content.windows.count) windows listed")
        return
    }
    print("[sck] capturing window \(wid) frame \(scw.frame) onScreen=\(scw.isOnScreen)")
    let filter = SCContentFilter(desktopIndependentWindow: scw)
    let cfg = SCStreamConfiguration()
    cfg.width = opts.width
    cfg.height = opts.height
    cfg.pixelFormat = kCVPixelFormatType_32BGRA
    cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(opts.fps))
    cfg.showsCursor = false
    cfg.queueDepth = 5
    cfg.backgroundColor = .clear
    cfg.ignoreShadowsSingleWindow = true
    cfg.shouldBeOpaque = false
    let stream = SCStream(filter: filter, configuration: cfg, delegate: sckOutput)
    try stream.addStreamOutput(sckOutput, type: .screen, sampleHandlerQueue: DispatchQueue(label: "sck"))
    try await stream.startCapture()
    scStream = stream
}

// MARK: WKWebView.takeSnapshot

@MainActor
final class Snapshotter {
    let web: WKWebView
    var running = true
    var ctx: CGContext
    init(web: WKWebView) {
        self.web = web
        ctx = CGContext(data: nil, width: opts.width, height: opts.height, bitsPerComponent: 8, bytesPerRow: opts.width * 4,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue)!
    }
    func next() {
        guard running else { return }
        let c = WKSnapshotConfiguration()
        c.afterScreenUpdates = false
        c.snapshotWidth = NSNumber(value: Double(opts.width) / Double(web.window?.backingScaleFactor ?? 1))
        let asked = Date()
        web.takeSnapshot(with: c) { image, error in
            meter.frames += 1
            guard let image, let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
                print("[snapshot] error \(String(describing: error))"); return
            }
            meter.complete += 1
            let t0 = Date()
            self.ctx.clear(CGRect(x: 0, y: 0, width: opts.width, height: opts.height))
            self.ctx.draw(cg, in: CGRect(x: 0, y: 0, width: opts.width, height: opts.height))
            meter.convertMs += Date().timeIntervalSince(t0) * 1000
            let base = self.ctx.data!
            if !meter.probed || meter.complete == 60 {
                meter.probed = true
                print(String(format: "[snapshot] round trip %.1f ms, image %dx%d", Date().timeIntervalSince(asked) * 1000, cg.width, cg.height))
                probe(base, width: opts.width, height: opts.height, stride: opts.width * 4, label: "snapshot \(meter.complete)")
                if meter.complete == 60, let path = opts.png, let img = self.ctx.makeImage(),
                   let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, "public.png" as CFString, 1, nil) {
                    CGImageDestinationAddImage(dest, img, nil)
                    print("[snapshot] saved \(path): \(CGImageDestinationFinalize(dest))")
                }
            }
            meter.noteContent(base, width: opts.width, height: opts.height, stride: opts.width * 4)
            deliver(base: base, width: opts.width, height: opts.height, stride: opts.width * 4)
            // Pace to the asked rate: the next snapshot is due one frame after this one was asked for.
            let wait = 1.0 / Double(opts.fps) - Date().timeIntervalSince(asked)
            if wait > 0 { DispatchQueue.main.asyncAfter(deadline: .now() + wait) { self.next() } } else { self.next() }
        }
    }
}

// MARK: The output window

@MainActor
final class Spike: NSObject, NSApplicationDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var web: WKWebView!
    var snapshotter: Snapshotter?
    var cover: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let scale = NSScreen.main?.backingScaleFactor ?? 2
        let pw = opts.pointsW > 0 ? opts.pointsW : CGFloat(opts.width) / scale
        let ph = opts.pointsH > 0 ? opts.pointsH : CGFloat(opts.height) / scale
        window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: pw, height: ph), styleMask: [.borderless], backing: .buffered, defer: false)
        window.isReleasedWhenClosed = false
        window.title = "MakeChurchEazy – Lower Third (NDI spike)"
        if !opts.opaque {
            window.isOpaque = false
            window.backgroundColor = .clear
            window.hasShadow = false
        }
        let cfg = WKWebViewConfiguration()
        if opts.noThrottle {
            // Private WebKit switches (macOS): keep painting at full rate while hidden or covered.
            for key in ["hiddenPageDOMTimerThrottlingEnabled", "hiddenPageDOMTimerThrottlingAutoIncreases",
                        "pageVisibilityBasedProcessSuppressionEnabled", "backgroundTimerThrottlingEnabled"] {
                let setter = "_set" + key.prefix(1).uppercased() + key.dropFirst() + ":"
                if cfg.preferences.responds(to: NSSelectorFromString(setter)) {
                    cfg.preferences.setValue(false, forKey: key) // KVC finds the private _setKey: setter
                } else { print("[webkit] no \(setter)") }
            }
        }
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: pw, height: ph), configuration: cfg)
        web.navigationDelegate = self
        if !opts.opaque { web.setValue(false, forKey: "drawsBackground") }
        // -[WKWebView _setWindowOcclusionDetectionEnabled:]
        if opts.noThrottle { web.setValue(false, forKey: "windowOcclusionDetectionEnabled") }
        window.contentView = web
        if let u = opts.url { web.load(URLRequest(url: URL(string: u)!)) } else { web.loadHTMLString(testPage(opaque: opts.opaque), baseURL: nil) }

        switch opts.window {
        case "onscreen": window.orderFrontRegardless()
        case "offscreen":
            window.orderFrontRegardless()
            window.setFrameOrigin(NSPoint(x: -20000, y: -20000))
        case "alpha0":
            window.alphaValue = 0
            window.orderFrontRegardless()
        case "behind":
            window.orderFrontRegardless()
            // An opaque window over it, like the operator's main window would be.
            let c = NSWindow(contentRect: window.frame.insetBy(dx: -50, dy: -50), styleMask: [.borderless], backing: .buffered, defer: false)
            c.backgroundColor = .darkGray
            c.level = .floating
            c.orderFrontRegardless()
            cover = c
        case "hidden": break // never ordered in
        default: fatalError("unknown window state")
        }
        print("[window] \(opts.window): \(pw)x\(ph) points, backing scale \(window.backingScaleFactor), capture \(opts.width)x\(opts.height), opaque=\(opts.opaque)")
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Task { @MainActor in
            // Let the page settle before measuring.
            try? await Task.sleep(nanoseconds: 1_000_000_000)
            if opts.ndi, let ndi = Ndi() {
                sender = NdiSender(ndi, name: "MakeChurchEazy – Lower Third")
                if opts.keymatte {
                    keySender = NdiSender(ndi, name: "MakeChurchEazy – Lower Third (Key)")
                    keyMatte = KeyMatte(width: opts.width, height: opts.height)
                }
                print("[ndi] sending \"MakeChurchEazy – Lower Third\"\(opts.keymatte ? " + key" : "")")
                if opts.recv {
                    let secs = opts.seconds
                    Thread.detachNewThread { receive(ndi, matching: "MakeChurchEazy – Lower Third", seconds: secs) }
                    if opts.keymatte {
                        Thread.detachNewThread { receive(ndi, matching: "Lower Third (Key)", seconds: secs) }
                    }
                }
            } else if opts.ndi {
                print("[ndi] runtime not found at /usr/local/lib/libndi.dylib")
            }
            meter.reset()
            if opts.capture == "sck" {
                do { try await startSck(window: self.window) } catch { print("[sck] could not start: \(error)") }
            } else if opts.capture == "snapshot" {
                let s = Snapshotter(web: self.web)
                self.snapshotter = s
                s.next()
            }
            try? await Task.sleep(nanoseconds: UInt64(opts.seconds * 1e9))
            meter.report(opts.capture)
            if let c = sender?.connections, let s = sender?.sender { print("[ndi] receivers connected: \(c(s, 0))") }
            try? await scStream?.stopCapture()
            self.snapshotter?.running = false
            try? await Task.sleep(nanoseconds: 1_500_000_000)
            exit(0)
        }
    }
}

// --capture listen: only receive an NDI source whose name contains --url's text (default "MakeChurchEazy").
if opts.capture == "listen" {
    guard let ndi = Ndi() else { print("[ndi] runtime not found"); exit(1) }
    receive(ndi, matching: opts.url ?? "MakeChurchEazy", seconds: opts.seconds)
    exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let spike = MainActor.assumeIsolated { Spike() }
app.delegate = spike
app.run()
