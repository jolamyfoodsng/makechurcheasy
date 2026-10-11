//! voice_guard.rs — native safety net for Voice AI (speech-to-scripture).
//!
//! The inactivity prompt and countdown live in the web UI, but a webview's
//! timers are throttled or frozen when the screen turns off or the window is
//! hidden, while the native microphone capture and the speech WebSocket keep
//! running. That is how a session could carry on all night after the laptop
//! screen went dark. This module enforces two rules from Rust, independent of
//! the UI:
//!
//! 1. **Screen off / sleep → stop.** macOS: polls `CGDisplayIsAsleep`.
//!    Windows: `GUID_CONSOLE_DISPLAY_STATE` + suspend notifications.
//! 2. **No speech for too long → stop.** The UI tells us the current prompt
//!    interval (5, 10, 15 min). If no transcript arrives and the user does not
//!    confirm within interval + countdown + grace, the stream is stopped.
//!
//! In both cases the reason is emitted on `assemblyai-status` *before* the
//! stream is stopped, so the UI turns off auto-reconnect before it sees the
//! ordinary "stopped" status.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::assemblyai_stream::AssemblyAiStreamState;

/// Countdown shown in the "Are you still using it?" prompt.
const PROMPT_COUNTDOWN_MS: u64 = 60_000;
/// Extra slack so the UI countdown (when it is running) always wins.
const GRACE_MS: u64 = 20_000;
const DEFAULT_INTERVAL_MS: u64 = 5 * 60_000;

pub const STATUS_STOPPED_INACTIVITY: &str = "stopped-inactivity";
pub const STATUS_STOPPED_SCREEN_OFF: &str = "stopped-screen-off";

static APP: OnceLock<AppHandle> = OnceLock::new();
static LAST_ACTIVITY_MS: AtomicU64 = AtomicU64::new(0);
static IDLE_LIMIT_MS: AtomicU64 = AtomicU64::new(DEFAULT_INTERVAL_MS + PROMPT_COUNTDOWN_MS + GRACE_MS);
static STOPPING: AtomicBool = AtomicBool::new(false);

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Record that real speech (a non-empty transcript) arrived.
pub fn mark_activity() {
    LAST_ACTIVITY_MS.store(now_ms(), Ordering::Relaxed);
}

/// Called by the UI when listening starts and whenever the user answers
/// "Yes, keep listening". `interval_minutes` is the next prompt interval.
#[tauri::command]
pub fn voice_guard_keep_alive(interval_minutes: Option<u32>) {
    let minutes = interval_minutes.unwrap_or(5).clamp(1, 120) as u64;
    IDLE_LIMIT_MS.store(minutes * 60_000 + PROMPT_COUNTDOWN_MS + GRACE_MS, Ordering::Relaxed);
    mark_activity();
}

#[derive(serde::Serialize, Clone)]
struct StatusPayload {
    status: String,
}

fn is_streaming(app: &AppHandle) -> bool {
    app.try_state::<AssemblyAiStreamState>()
        .map(|state| state.is_streaming())
        .unwrap_or(false)
}

/// Stop the native stream with a reason the UI understands.
fn stop_with_reason(app: &AppHandle, reason: &'static str) {
    if !is_streaming(app) {
        return;
    }
    if STOPPING.swap(true, Ordering::AcqRel) {
        return;
    }
    println!("[Voice Guard] Stopping Voice AI: {reason}");
    // Tell the UI first so it disables auto-reconnect before the task's own
    // "stopped" status arrives.
    let _ = app.emit("assemblyai-status", StatusPayload { status: reason.to_string() });

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Some(state) = app.try_state::<AssemblyAiStreamState>() {
            if let Err(error) = crate::assemblyai_stream::stop_assemblyai_stream(state).await {
                eprintln!("[Voice Guard] Failed to stop stream: {error}");
            }
        }
        STOPPING.store(false, Ordering::Release);
    });
}

fn on_screen_off() {
    if let Some(app) = APP.get() {
        stop_with_reason(app, STATUS_STOPPED_SCREEN_OFF);
    }
}

/// Start the watchdog and the platform screen-off watcher. Call once in setup.
pub fn init(app: &AppHandle) {
    if APP.set(app.clone()).is_err() {
        return;
    }

    std::thread::Builder::new()
        .name("voice-guard".into())
        .spawn(|| {
            let mut was_streaming = false;
            loop {
                std::thread::sleep(Duration::from_secs(5));
                let Some(app) = APP.get() else { continue };
                let streaming = is_streaming(app);
                if streaming && !was_streaming && LAST_ACTIVITY_MS.load(Ordering::Relaxed) == 0 {
                    mark_activity();
                }
                was_streaming = streaming;
                if !streaming {
                    continue;
                }
                let last = LAST_ACTIVITY_MS.load(Ordering::Relaxed);
                let limit = IDLE_LIMIT_MS.load(Ordering::Relaxed);
                if last > 0 && now_ms().saturating_sub(last) > limit {
                    stop_with_reason(app, STATUS_STOPPED_INACTIVITY);
                }
            }
        })
        .ok();

    platform::start_screen_watch();
}

// ── macOS: poll the main display's sleep state ────────────────────────────────
#[cfg(target_os = "macos")]
mod platform {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGMainDisplayID() -> u32;
        fn CGDisplayIsAsleep(display: u32) -> i32;
    }

    pub fn start_screen_watch() {
        std::thread::Builder::new()
            .name("voice-guard-display".into())
            .spawn(|| {
                let mut was_asleep = false;
                loop {
                    std::thread::sleep(std::time::Duration::from_secs(2));
                    let asleep = unsafe { CGDisplayIsAsleep(CGMainDisplayID()) != 0 };
                    if asleep && !was_asleep {
                        super::on_screen_off();
                    }
                    was_asleep = asleep;
                }
            })
            .ok();
    }
}

// ── Windows: display-state and suspend notifications (powrprof callbacks) ─────
#[cfg(target_os = "windows")]
mod platform {
    use std::ffi::c_void;

    #[repr(C)]
    struct Guid {
        data1: u32,
        data2: u16,
        data3: u16,
        data4: [u8; 8],
    }

    type Callback = unsafe extern "system" fn(*mut c_void, u32, *mut c_void) -> u32;

    #[repr(C)]
    struct DeviceNotifySubscribeParameters {
        callback: Callback,
        context: *mut c_void,
    }

    #[link(name = "powrprof")]
    extern "system" {
        fn PowerSettingRegisterNotification(
            setting_guid: *const Guid,
            flags: u32,
            recipient: *mut c_void,
            registration_handle: *mut *mut c_void,
        ) -> u32;
        fn PowerRegisterSuspendResumeNotification(
            flags: u32,
            recipient: *mut c_void,
            registration_handle: *mut *mut c_void,
        ) -> u32;
    }

    const DEVICE_NOTIFY_CALLBACK: u32 = 2;
    const PBT_APMSUSPEND: u32 = 0x0004;
    const PBT_POWERSETTINGCHANGE: u32 = 0x8013;

    // {6FE69556-704A-47A0-8F24-C28D936FDA47}
    static GUID_CONSOLE_DISPLAY_STATE: Guid = Guid {
        data1: 0x6fe6_9556,
        data2: 0x704a,
        data3: 0x47a0,
        data4: [0x8f, 0x24, 0xc2, 0x8d, 0x93, 0x6f, 0xda, 0x47],
    };

    unsafe extern "system" fn on_power_event(_ctx: *mut c_void, kind: u32, setting: *mut c_void) -> u32 {
        match kind {
            PBT_APMSUSPEND => super::on_screen_off(),
            PBT_POWERSETTINGCHANGE if !setting.is_null() => {
                // POWERBROADCAST_SETTING { GUID PowerSetting; DWORD DataLength; UCHAR Data[] }
                let base = setting as *const u8;
                let len = std::ptr::read_unaligned(base.add(16) as *const u32);
                if len >= 4 {
                    // 0 = display off, 1 = on, 2 = dimmed
                    let state = std::ptr::read_unaligned(base.add(20) as *const u32);
                    if state == 0 {
                        super::on_screen_off();
                    }
                }
            }
            _ => {}
        }
        0
    }

    pub fn start_screen_watch() {
        // The parameters must outlive the registration, so they are leaked once.
        let params: &'static mut DeviceNotifySubscribeParameters = Box::leak(Box::new(DeviceNotifySubscribeParameters {
            callback: on_power_event,
            context: std::ptr::null_mut(),
        }));
        let recipient = params as *mut DeviceNotifySubscribeParameters as *mut c_void;
        unsafe {
            let mut display_handle: *mut c_void = std::ptr::null_mut();
            let rc = PowerSettingRegisterNotification(
                &GUID_CONSOLE_DISPLAY_STATE,
                DEVICE_NOTIFY_CALLBACK,
                recipient,
                &mut display_handle,
            );
            if rc != 0 {
                eprintln!("[Voice Guard] Display-state notification unavailable (err={rc})");
            }
            let mut suspend_handle: *mut c_void = std::ptr::null_mut();
            let rc = PowerRegisterSuspendResumeNotification(DEVICE_NOTIFY_CALLBACK, recipient, &mut suspend_handle);
            if rc != 0 {
                eprintln!("[Voice Guard] Suspend notification unavailable (err={rc})");
            }
        }
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod platform {
    pub fn start_screen_watch() {}
}
