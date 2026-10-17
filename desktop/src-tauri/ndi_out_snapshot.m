// ndi_out_snapshot.m: pictures of a Studio output page for NDI out (macOS, see studio_ndi_out.rs).
//
// Takes WKWebView snapshots of a hidden, transparent output window a few dozen times a second and
// hands each one to Rust as straight-alpha BGRA (what NDI expects). Snapshots need no Screen
// Recording permission and keep the page's transparency. WebKit stops painting a window it thinks
// nobody can see, so occlusion detection is turned off for this one web view.
// Compiled with ARC by build.rs.

#import <Accelerate/Accelerate.h>
#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>

typedef void (*mce_ndi_frame_cb)(void *user, const uint8_t *bgra, int32_t width, int32_t height, int32_t stride);

@interface MCENdiSnapper : NSObject
@property(nonatomic, weak) WKWebView *web;
@property(nonatomic, strong) NSTimer *timer;
@property(nonatomic) BOOL busy;
@property(nonatomic) BOOL running;
@end

@implementation MCENdiSnapper {
    CGContextRef _ctx;
    uint8_t *_straight;
    int32_t _w, _h;
    mce_ndi_frame_cb _cb;
    void *_user;
}

- (instancetype)initWithWidth:(int32_t)w height:(int32_t)h cb:(mce_ndi_frame_cb)cb user:(void *)user {
    if ((self = [super init])) {
        _w = w; _h = h; _cb = cb; _user = user;
        CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
        _ctx = CGBitmapContextCreate(NULL, w, h, 8, (size_t)w * 4, space,
                                     kCGBitmapByteOrder32Little | kCGImageAlphaPremultipliedFirst);
        CGColorSpaceRelease(space);
        CGContextSetInterpolationQuality(_ctx, kCGInterpolationHigh);
        _straight = malloc((size_t)w * h * 4);
    }
    return self;
}

- (void)dealloc {
    if (_ctx) CGContextRelease(_ctx);
    free(_straight);
}

- (void)tick:(NSTimer *)timer {
    WKWebView *web = self.web;
    if (!self.running || self.busy || !web) return;
    self.busy = YES;
    WKSnapshotConfiguration *config = [[WKSnapshotConfiguration alloc] init];
    config.afterScreenUpdates = NO;
    // The width is in points; the picture comes back at the window's own scale and is redrawn at _w x _h.
    config.snapshotWidth = @(web.bounds.size.width);
    __weak MCENdiSnapper *weakSelf = self;
    [web takeSnapshotWithConfiguration:config completionHandler:^(NSImage *image, NSError *error) {
        (void)error;
        MCENdiSnapper *me = weakSelf;
        if (!me) return;
        if (me.running && image) [me deliver:image];
        me.busy = NO;
    }];
}

- (void)deliver:(NSImage *)image {
    CGImageRef cg = [image CGImageForProposedRect:NULL context:nil hints:nil];
    if (!cg) return;
    CGRect all = CGRectMake(0, 0, _w, _h);
    CGContextClearRect(_ctx, all);
    CGContextDrawImage(_ctx, all, cg);
    // The snapshot is premultiplied; NDI wants straight alpha (else see-through parts look too dark).
    vImage_Buffer src = { CGBitmapContextGetData(_ctx), (vImagePixelCount)_h, (vImagePixelCount)_w, (size_t)_w * 4 };
    vImage_Buffer dst = { _straight, (vImagePixelCount)_h, (vImagePixelCount)_w, (size_t)_w * 4 };
    vImageUnpremultiplyData_RGBA8888(&src, &dst, kvImageNoFlags); // same layout rules for BGRA
    _cb(_user, _straight, _w, _h, _w * 4);
}
@end

/// Starts snapshots of `web_view` (a WKWebView*) in `ns_window` (its NSWindow*). Main thread only.
/// The window is made invisible and click-through; it keeps painting because occlusion detection is off.
void *mce_ndi_snap_start(void *web_view, void *ns_window, int32_t width, int32_t height, int32_t fps,
                         mce_ndi_frame_cb cb, void *user) {
    WKWebView *web = (__bridge WKWebView *)web_view;
    NSWindow *window = (__bridge NSWindow *)ns_window;
    if (!web || !cb || width <= 0 || height <= 0) return NULL;

    SEL occlusion = NSSelectorFromString(@"_setWindowOcclusionDetectionEnabled:");
    if ([web respondsToSelector:occlusion]) {
        [web setValue:@NO forKey:@"windowOcclusionDetectionEnabled"];
    } else {
        NSLog(@"[NDI out] WebKit has no occlusion switch; the picture may freeze while hidden");
    }
    if (window) {
        window.alphaValue = 0;
        window.ignoresMouseEvents = YES;
        window.hasShadow = NO;
        window.collectionBehavior = NSWindowCollectionBehaviorTransient | NSWindowCollectionBehaviorIgnoresCycle |
                                    NSWindowCollectionBehaviorCanJoinAllSpaces;
        window.excludedFromWindowsMenu = YES;
        [window orderBack:nil];
    }

    MCENdiSnapper *snapper = [[MCENdiSnapper alloc] initWithWidth:width height:height cb:cb user:user];
    snapper.web = web;
    snapper.running = YES;
    NSTimeInterval interval = 1.0 / (fps > 0 ? fps : 30);
    snapper.timer = [NSTimer timerWithTimeInterval:interval target:snapper selector:@selector(tick:) userInfo:nil repeats:YES];
    [[NSRunLoop mainRunLoop] addTimer:snapper.timer forMode:NSRunLoopCommonModes];
    return (__bridge_retained void *)snapper;
}

/// Stops and frees what mce_ndi_snap_start returned. Main thread only. No callbacks after it returns.
void mce_ndi_snap_stop(void *handle) {
    if (!handle) return;
    MCENdiSnapper *snapper = (__bridge_transfer MCENdiSnapper *)handle;
    snapper.running = NO;
    [snapper.timer invalidate];
    snapper.timer = nil;
}
