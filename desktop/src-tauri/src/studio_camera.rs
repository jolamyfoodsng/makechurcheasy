//! studio_camera.rs: the Studio camera, opened ONCE by the app itself (like OBS does).
//!
//! The camera is captured here, in native code. Every newest picture (JPEG) goes into the same
//! frame slot `api/studio-camera` serves, so the Program Projector, a TV link and an OBS browser
//! source all just show that one feed. No window opens a camera of its own, and nothing is
//! negotiated per window, so hiding or showing the camera can never drop or reopen it.
//!
//! Local routes (all on the app's own server, 127.0.0.1):
//!   GET  api/studio-cam/status   -> {"available":true,"running":bool,"name":"..","error":"..","frames":n}
//!   GET  api/studio-cam/devices  -> {"devices":[{"index":0,"name":".."}],"error":".."}
//!   POST api/studio-cam/start    {"index":0}  starts (or switches) the capture, answers at once
//!   POST api/studio-cam/stop     closes the camera

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use nokhwa::pixel_format::RgbFormat;
use nokhwa::utils::{
    ApiBackend, CameraIndex, FrameFormat, RequestedFormat, RequestedFormatType,
};
use nokhwa::{nokhwa_check, nokhwa_initialize, query, Camera};

struct Runner {
    id: u64,
    stop: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    frames: Arc<AtomicU64>,
    name: String,
}

static RUNNER: OnceLock<Mutex<Option<Runner>>> = OnceLock::new();
static LAST_ERROR: OnceLock<Mutex<String>> = OnceLock::new();
static CAPTURE_CONTROL: OnceLock<Mutex<()>> = OnceLock::new();
static FRAME_GATE: OnceLock<Mutex<()>> = OnceLock::new();
static NEXT_RUN_ID: AtomicU64 = AtomicU64::new(0);
static ACTIVE_RUN_ID: AtomicU64 = AtomicU64::new(0);

fn runner() -> &'static Mutex<Option<Runner>> {
    RUNNER.get_or_init(|| Mutex::new(None))
}

fn capture_control() -> &'static Mutex<()> {
    CAPTURE_CONTROL.get_or_init(|| Mutex::new(()))
}

fn frame_gate() -> &'static Mutex<()> {
    FRAME_GATE.get_or_init(|| Mutex::new(()))
}

fn is_current_run(id: u64) -> bool {
    ACTIVE_RUN_ID.load(Ordering::SeqCst) == id
}

fn set_error(message: &str) {
    if let Ok(mut e) = LAST_ERROR.get_or_init(|| Mutex::new(String::new())).lock() {
        *e = message.to_string();
    }
}

fn last_error() -> String {
    LAST_ERROR
        .get_or_init(|| Mutex::new(String::new()))
        .lock()
        .map(|e| e.clone())
        .unwrap_or_default()
}

fn json_escape(text: &str) -> String {
    serde_json::to_string(text).unwrap_or_else(|_| "\"\"".to_string())
}

/// Ask the system for camera access (macOS shows its own question the first time).
fn ensure_permission() -> bool {
    if nokhwa_check() {
        return true;
    }
    nokhwa_initialize(|_| {});
    for _ in 0..100 {
        if nokhwa_check() {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    nokhwa_check()
}

fn list_cameras() -> Result<Vec<(u32, String)>, String> {
    if !ensure_permission() {
        return Err("Camera access is off for MakeChurchEazy.".to_string());
    }
    let infos = query(ApiBackend::Auto).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for (position, info) in infos.iter().enumerate() {
        let index = match info.index() {
            CameraIndex::Index(i) => *i,
            CameraIndex::String(_) => position as u32,
        };
        out.push((index, info.human_name()));
    }
    Ok(out)
}

fn stop_capture_locked(publish: fn(Vec<u8>)) {
    let gate = frame_gate().lock().ok();
    ACTIVE_RUN_ID.store(0, Ordering::SeqCst);
    if let Ok(mut slot) = runner().lock() {
        if let Some(run) = slot.take() {
            run.stop.store(true, Ordering::SeqCst);
        }
    }
    set_error("");
    publish(Vec::new());
    drop(gate);
}

fn stop_capture(publish: fn(Vec<u8>)) {
    if let Ok(_control) = capture_control().lock() {
        stop_capture_locked(publish);
    }
}

fn finish_run(id: u64, publish: fn(Vec<u8>), error: Option<String>) {
    let Ok(_gate) = frame_gate().lock() else {
        return;
    };
    if ACTIVE_RUN_ID
        .compare_exchange(id, 0, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    if let Some(message) = error {
        set_error(&message);
    }
    if let Ok(slot) = runner().lock() {
        if let Some(run) = slot.as_ref().filter(|run| run.id == id) {
            run.running.store(false, Ordering::SeqCst);
        }
    }
    publish(Vec::new());
}

/// Opens camera `index` on its own thread and sends every newest JPEG to `publish`
/// (an empty frame means "camera off"). Switching camera stops the previous capture first.
/// Returns true when this exact camera was already opening or running.
fn start_capture(index: u32, name: String, publish: fn(Vec<u8>)) -> bool {
    let Ok(_control) = capture_control().lock() else {
        set_error("The camera could not be started. Try again.");
        return false;
    };
    let already_open = runner()
        .lock()
        .ok()
        .and_then(|slot| {
            slot.as_ref().map(|run| {
                run.name == name
                    && run.id == ACTIVE_RUN_ID.load(Ordering::SeqCst)
                    && run.id != 0
            })
        })
        .unwrap_or(false);
    if already_open {
        return true;
    }

    stop_capture_locked(publish);
    // Give a previous capture a moment to let go of the device.
    thread::sleep(Duration::from_millis(150));
    let stop = Arc::new(AtomicBool::new(false));
    let running = Arc::new(AtomicBool::new(false));
    let frames = Arc::new(AtomicU64::new(0));
    let id = NEXT_RUN_ID.fetch_add(1, Ordering::SeqCst) + 1;
    if let Ok(mut slot) = runner().lock() {
        *slot = Some(Runner {
            id,
            stop: stop.clone(),
            running: running.clone(),
            frames: frames.clone(),
            name: name.clone(),
        });
    } else {
        set_error("The camera could not be started. Try again.");
        return false;
    }
    set_error("");
    ACTIVE_RUN_ID.store(id, Ordering::SeqCst);
    thread::spawn(move || {
        // `Closest` requires the requested FourCC to exist exactly. FaceTime and Continuity
        // cameras often expose NV12 (or another decodable format), not MJPEG, so asking for
        // 1280x720 MJPEG makes Camera::new fail before capture starts. Let nokhwa choose the
        // first camera format that RgbFormat can decode; frame() can then pass MJPEG through
        // or convert the selected format to JPEG below.
        let format = RequestedFormat::new::<RgbFormat>(RequestedFormatType::None);
        let mut camera = match Camera::new(CameraIndex::Index(index), format) {
            Ok(c) => c,
            Err(e) => {
                finish_run(id, publish, Some(format!("The camera could not be opened: {e}")));
                return;
            }
        };
        if let Err(e) = camera.open_stream() {
            finish_run(id, publish, Some(format!("The camera could not start: {e}")));
            return;
        }
        if !is_current_run(id) || stop.load(Ordering::SeqCst) {
            let _ = camera.stop_stream();
            return;
        }
        running.store(true, Ordering::SeqCst);
        let mut last_sent = Instant::now() - Duration::from_secs(1);
        let mut failures = 0u32;
        let mut terminal_error = None;
        while !stop.load(Ordering::SeqCst) && is_current_run(id) {
            match camera.frame() {
                Ok(buffer) => {
                    failures = 0;
                    // About 30 pictures a second is plenty for a screen.
                    if last_sent.elapsed() < Duration::from_millis(30) {
                        continue;
                    }
                    last_sent = Instant::now();
                    let jpeg: Option<Vec<u8>> = if buffer.source_frame_format() == FrameFormat::MJPEG {
                        // Already a JPEG picture: pass it straight through (cheapest).
                        Some(buffer.buffer().to_vec())
                    } else {
                        match buffer.decode_image::<RgbFormat>() {
                            Ok(img) => {
                                let mut out = Vec::new();
                                let mut enc =
                                    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 82);
                                if enc.encode_image(&img).is_ok() { Some(out) } else { None }
                            }
                            Err(_) => None,
                        }
                    };
                    if let Some(bytes) = jpeg {
                        if let Ok(_gate) = frame_gate().lock() {
                            if is_current_run(id) {
                                frames.fetch_add(1, Ordering::Relaxed);
                                publish(bytes);
                            }
                        }
                    }
                }
                Err(e) => {
                    failures += 1;
                    if failures > 30 {
                        terminal_error = Some(format!("The camera stopped: {e}"));
                        break;
                    }
                    thread::sleep(Duration::from_millis(50));
                }
            }
        }
        let _ = camera.stop_stream();
        finish_run(id, publish, terminal_error);
    });
    false
}

fn respond(request: tiny_http::Request, status: u16, body: String) {
    let resp = tiny_http::Response::from_string(body)
        .with_status_code(status)
        .with_header(
            tiny_http::Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap(),
        )
        .with_header(tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
        .with_header(tiny_http::Header::from_bytes("Cache-Control", "no-store").unwrap());
    let _ = request.respond(resp);
}

/// Handles every `api/studio-cam/...` request. `publish` stores one JPEG for the screens.
pub fn handle(mut request: tiny_http::Request, clean: &str, publish: fn(Vec<u8>)) {
    if request.method() == &tiny_http::Method::Options {
        let resp = tiny_http::Response::from_string("")
            .with_header(tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap())
            .with_header(
                tiny_http::Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap(),
            )
            .with_header(
                tiny_http::Header::from_bytes("Access-Control-Allow-Headers", "Content-Type").unwrap(),
            );
        let _ = request.respond(resp);
        return;
    }
    match clean {
        "api/studio-cam/status" => {
            let (name, running, frames) = runner()
                .lock()
                .ok()
                .and_then(|slot| {
                    slot.as_ref().map(|run| {
                        let current = run.id != 0 && run.id == ACTIVE_RUN_ID.load(Ordering::SeqCst);
                        (
                            run.name.clone(),
                            current && run.running.load(Ordering::SeqCst),
                            if current { run.frames.load(Ordering::Relaxed) } else { 0 },
                        )
                    })
                })
                .unwrap_or_default();
            respond(
                request,
                200,
                format!(
                    r#"{{"available":true,"running":{},"name":{},"error":{},"frames":{}}}"#,
                    running,
                    json_escape(&name),
                    json_escape(&last_error()),
                    frames
                ),
            );
        }
        "api/studio-cam/devices" => match list_cameras() {
            Ok(list) => {
                let items: Vec<String> = list
                    .iter()
                    .map(|(i, n)| format!(r#"{{"index":{},"name":{}}}"#, i, json_escape(n)))
                    .collect();
                respond(request, 200, format!(r#"{{"devices":[{}],"error":""}}"#, items.join(",")));
            }
            Err(e) => respond(request, 200, format!(r#"{{"devices":[],"error":{}}}"#, json_escape(&e))),
        },
        "api/studio-cam/start" => {
            let mut body = String::new();
            let _ = request.as_reader().read_to_string(&mut body);
            let index = serde_json::from_str::<serde_json::Value>(&body)
                .ok()
                .and_then(|v| v.get("index").and_then(|i| i.as_u64()))
                .unwrap_or(0) as u32;
            if !ensure_permission() {
                respond(
                    request,
                    200,
                    r#"{"ok":false,"error":"Camera access is off for MakeChurchEazy."}"#.to_string(),
                );
                return;
            }
            // Same camera already opening/running: leave it alone, so quick state refreshes do not
            // restart capture while the native driver is still opening the device.
            let already = start_capture(index, format!("#{index}"), publish);
            let body = if already {
                r#"{"ok":true,"already":true}"#.to_string()
            } else {
                r#"{"ok":true}"#.to_string()
            };
            respond(request, 200, body);
        }
        "api/studio-cam/stop" => {
            stop_capture(publish);
            respond(request, 200, r#"{"ok":true}"#.to_string());
        }
        _ => respond(request, 404, r#"{"error":"unknown"}"#.to_string()),
    }
}
