/// Objective-C helper for setting the macOS dock icon.
///
/// This file exists because Rust (with `panic = "abort"`) cannot catch
/// Objective-C exceptions — if one crosses a `catch_unwind` boundary the
/// process aborts with "Rust cannot catch foreign exceptions".  By keeping
/// all AppKit calls inside ObjC with @try/@catch, we prevent that.
///
/// AppKit is not thread-safe — setApplicationIconImage: must run on the main
/// thread.  We use dispatch_sync to the main queue so the icon update happens
/// synchronously and the C function can return a success/failure result.

#import <Foundation/Foundation.h>
#import <AppKit/NSImage.h>
#import <AppKit/NSApplication.h>

/// Set the application dock icon from raw image bytes (PNG or JPEG).
/// Dispatches the AppKit call to the main thread and returns true on success.
bool mce_set_app_icon(const uint8_t *data, size_t len) {
    __block bool result = false;

    dispatch_sync(dispatch_get_main_queue(), ^{
        @autoreleasepool {
            @try {
                NSData *nsData = [[NSData alloc] initWithBytes:data length:len];
                if (nsData == nil) return;

                NSImage *nsImage = [[NSImage alloc] initWithData:nsData];
                if (nsImage == nil) {
                    [nsData release];
                    return;
                }

                [[NSApplication sharedApplication] setApplicationIconImage:nsImage];

                [nsImage release];
                [nsData release];
                result = true;
            }
            @catch (NSException *exception) {
                NSLog(@"[AppIcon] ObjC exception caught: %@", exception);
            }
        }
    });

    return result;
}
