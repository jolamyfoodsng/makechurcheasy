// Tauri Rust backend — MakeChurchEasy
// Commands:
//   save_bg_image      — persist background image to disk (for OBS image_source)
//   save_upload_file   — persist uploaded logo to disk
//   save_countdown_asset — save countdown background asset to managed storage
//   delete_countdown_asset — delete countdown background asset by assetId
//   cleanup_unused_countdown_assets — remove orphaned countdown assets
//   load_app_data      — read app_data.json (or return "{}" if missing)
//   save_app_data      — write app_data.json
//   get_overlay_port   — return the port of the local overlay HTTP server
//   load_dock_data     — read dock-shared JSON from the uploads directory
// On startup, a lightweight HTTP server is spawned on a localhost port
// to serve overlay HTML files (Bible, Worship, Lower Third) so that OBS
// browser sources can access them. Tauri's internal protocol (tauri:// or
// https://tauri.localhost) is NOT reachable by OBS/CEF, so we need a real
// localhost server.

mod assemblyai_stream;
#[cfg(any(target_os = "windows", target_os = "macos"))]
mod audio_capture;
mod device_fingerprint;
#[cfg(target_os = "macos")]
mod local_llm;
#[cfg(not(target_os = "macos"))]
mod local_llm_stub;
mod mobile_companion;
mod obs_move_plugin;
mod overlay_relay;
mod presentation_remote;
#[cfg(not(target_os = "macos"))]
use local_llm_stub as local_llm;

use chrono::Utc;
use hmac::{Hmac, Mac};
use quick_xml::de::from_str as from_xml_str;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::net::{SocketAddr, TcpStream, UdpSocket};
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{mpsc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{image::Image, Emitter, Manager};

/// The port the overlay server is running on (set at startup).
static OVERLAY_PORT: AtomicU16 = AtomicU16::new(0);

/// In-memory auth session for the OBS dock.
/// Written by POST /api/auth/session, read by GET /api/auth/status.
/// Avoids file-sync race conditions on app startup.
static AUTH_SESSION: OnceLock<Mutex<Option<String>>> = OnceLock::new();
static DOCK_NOTES_COMMAND_QUEUE: OnceLock<Mutex<Vec<String>>> = OnceLock::new();

fn dev_window_icon() -> Option<Image<'static>> {
    None
}

// ── macOS App Nap prevention ─────────────────────────────────────────────────
// When MakeChurchEasy is transcribing in the background, macOS may throttle the app
// via App Nap. This creates an IOKit power assertion to prevent that.

#[cfg(target_os = "macos")]
mod app_nap {
    use std::sync::atomic::{AtomicU32, Ordering};

    // IOKit power management constants — names match Apple's API
    #[allow(non_upper_case_globals)]
    const kIOPMAssertionTypePreventUserIdleSystemSleep: &str = "PreventUserIdleSystemSleep";

    #[link(name = "IOKit", kind = "framework")]
    extern "C" {
        fn IOPMAssertionCreateWithName(
            assertion_type: *const core::ffi::c_void,
            assertion_level: u32,
            reason: *const core::ffi::c_void,
            assertion_id: *mut u32,
        ) -> i32;
        fn IOPMAssertionRelease(assertion_id: u32) -> i32;
    }

    static ASSERTION_ID: AtomicU32 = AtomicU32::new(0);

    /// Create a power assertion that prevents macOS from putting the app into
    /// App Nap.  Safe to call multiple times — only the first call has effect.
    pub fn prevent_app_nap() {
        if ASSERTION_ID.load(Ordering::Relaxed) != 0 {
            return; // already held
        }

        // Create CFString for the assertion type
        let assertion_type = cf_string_from_str(kIOPMAssertionTypePreventUserIdleSystemSleep);
        let reason = cf_string_from_str("MakeChurchEasy — live transcription active");
        let mut id: u32 = 0;

        let result = unsafe {
            IOPMAssertionCreateWithName(
                assertion_type as *const _,
                255, // kIOPMAssertionLevelMax
                reason as *const _,
                &mut id,
            )
        };

        // Release the CFStrings — IOKit retains them internally
        unsafe {
            cf_release(assertion_type);
            cf_release(reason);
        }

        if result == 0 && id != 0 {
            ASSERTION_ID.store(id, Ordering::Relaxed);
            println!("[AppNap] Power assertion created (id={id}) — App Nap disabled");
        } else {
            eprintln!("[AppNap] Failed to create power assertion (err={result})");
        }
    }

    /// Release the power assertion, re-enabling App Nap.
    #[allow(dead_code)]
    pub fn allow_app_nap() {
        let id = ASSERTION_ID.swap(0, Ordering::Relaxed);
        if id != 0 {
            unsafe {
                IOPMAssertionRelease(id);
            }
            println!("[AppNap] Power assertion released (id={id}) — App Nap re-enabled");
        }
    }

    // ── CoreFoundation helpers ───────────────────────────────────────────────

    type CFStringRef = *const core::ffi::c_void;
    type CFTypeRef = *const core::ffi::c_void;

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFStringCreateWithCString(
            allocator: CFStringRef,
            c_str: *const core::ffi::c_char,
            encoding: u32,
        ) -> CFStringRef;
        fn CFRelease(cf: CFTypeRef);
    }

    #[allow(non_upper_case_globals)]
    const kCFStringEncodingUTF8: u32 = 0x08000100;

    fn cf_string_from_str(s: &str) -> CFStringRef {
        let cstr = std::ffi::CString::new(s).unwrap();
        unsafe { CFStringCreateWithCString(std::ptr::null(), cstr.as_ptr(), kCFStringEncodingUTF8) }
    }

    unsafe fn cf_release(cf: CFTypeRef) {
        if !cf.is_null() {
            CFRelease(cf);
        }
    }
}

static LM_STATE: OnceLock<Mutex<String>> = OnceLock::new();
static LM_COMMAND_QUEUE: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
pub(crate) static PRESENTATION_STATE: OnceLock<Mutex<BTreeMap<String, PresentationStateEnvelope>>> =
    OnceLock::new();
pub(crate) static PRESENTATION_VIEWERS: OnceLock<Mutex<BTreeMap<String, BTreeMap<String, u64>>>> =
    OnceLock::new();
const ONLINE_LYRICS_RESULT_LIMIT: usize = 18;
const ONLINE_LYRICS_USER_AGENT: &str =
    "MakeChurchEasy/1.0 (+https://localhost; worship-online-lyrics)";
const TEMPLATE_VIDEO_PREFIX: &str = "template_videos/";
const TEMPLATE_VIDEO_URL_TTL_SECONDS: u32 = 900;
const TEMPLATE_VIDEO_LIST_TTL_SECONDS: u32 = 300;

type HmacSha256 = Hmac<Sha256>;

const PRESENTATION_VIEWER_TTL_MS: u64 = 15_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PresentationStateEnvelope {
    pub(crate) session_id: String,
    pub(crate) fullscreen: Option<serde_json::Value>,
    pub(crate) lower_third: Option<serde_json::Value>,
    pub(crate) updated_at: u64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PresentationViewerHeartbeat {
    pub(crate) session_id: String,
    pub(crate) viewer_id: String,
}

pub(crate) fn now_unix_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub(crate) fn presentation_viewer_count(session_id: &str) -> usize {
    let registry = PRESENTATION_VIEWERS.get_or_init(|| Mutex::new(BTreeMap::new()));
    let now = now_unix_millis();
    let mut guard = match registry.lock() {
        Ok(guard) => guard,
        Err(_) => return 0,
    };

    if let Some(viewers) = guard.get_mut(session_id) {
        viewers.retain(|_, seen_at| now.saturating_sub(*seen_at) <= PRESENTATION_VIEWER_TTL_MS);
        let count = viewers.len();
        if count == 0 {
            guard.remove(session_id);
        }
        return count;
    }

    0
}

/// True if the directory contains the overlay HTML entrypoint(s).
fn has_overlay_assets(dir: &std::path::Path) -> bool {
    dir.join("mce-bible-overlay.html").is_file() || dir.join("mce-worship-overlay.html").is_file()
}

/// Resolve where bundled overlay HTML files were placed.
///
/// Depending on platform/packaging mode, Tauri may place resources in different
/// locations relative to resource_dir():
///   - resource_dir/                   ← flat resources
///   - resource_dir/_up_/dist/         ← array-style resources with ../ prefix
///   - exe_dir/                        ← Windows NSIS: alongside the exe
fn resolve_bundled_overlay_dir(resource_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    // Also try the directory containing the executable itself, which on
    // Windows NSIS is the install root and may hold resources directly.
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.to_path_buf()));

    let mut candidates = vec![
        resource_dir.to_path_buf(),
        resource_dir.join("dist"),
        resource_dir.join("_up_"),
        resource_dir.join("_up_").join("dist"),
        resource_dir.join("resources"),
    ];

    if let Some(ref exe) = exe_dir {
        if exe != resource_dir {
            candidates.push(exe.clone());
            candidates.push(exe.join("dist"));
            candidates.push(exe.join("_up_"));
            candidates.push(exe.join("_up_").join("dist"));
            candidates.push(exe.join("resources"));
        }
    }

    for dir in &candidates {
        let found = has_overlay_assets(dir);
        println!(
            "[Overlay Resolve] {:?} → {}",
            dir,
            if found { "FOUND" } else { "miss" }
        );
    }

    candidates.into_iter().find(|dir| has_overlay_assets(dir))
}

/// Dev fallback: locate `<project>/public` from the running executable.
fn resolve_dev_public_dir() -> Option<std::path::PathBuf> {
    let exe = std::env::current_exe().ok()?;
    // exe is typically: <project>/src-tauri/target/{debug|release}/<binary>
    let project_root = exe
        .parent() // .../target/{debug|release}
        .and_then(|p| p.parent()) // .../target
        .and_then(|p| p.parent()) // .../src-tauri
        .and_then(|p| p.parent()); // .../<project>

    if let Some(root) = project_root {
        let public_dir = root.join("public");
        if has_overlay_assets(&public_dir) {
            return Some(public_dir);
        }
    }

    // Last-resort paths during local development.
    let cwd_public = std::path::PathBuf::from("public");
    if has_overlay_assets(&cwd_public) {
        return Some(cwd_public);
    }
    let parent_public = std::path::PathBuf::from("../public");
    if has_overlay_assets(&parent_public) {
        return Some(parent_public);
    }

    None
}

/// Base directory: ~/Documents/MakeChurchEasy/
fn app_dir() -> Result<std::path::PathBuf, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let dir = home.join("Documents").join("MakeChurchEasy");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app directory: {}", e))?;
    Ok(dir)
}

/// Convert a user-provided filename into a safe basename for local storage.
/// Rejects empty names and strips any path components.
fn sanitize_filename_for_storage(file_name: &str) -> Result<String, String> {
    let base = Path::new(file_name)
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Invalid file name")?;

    let safe = base
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '.' || ch == '_' || ch == '-' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    let trimmed = safe.trim_matches('.');
    if trimmed.is_empty() || trimmed == "." || trimmed == ".." {
        return Err("Invalid file name".to_string());
    }

    Ok(trimmed.to_string())
}

#[derive(Clone)]
struct TemplateVideoR2Config {
    account_id: String,
    bucket: String,
    access_key_id: String,
    secret_access_key: String,
    public_base_url: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct TemplateVideoAsset {
    id: String,
    file_name: String,
    video_url: String,
    cloudflare_key: String,
    size: Option<u64>,
    modified: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedBackgroundVideoFile {
    file_path: String,
    relative_url: String,
}

#[derive(Debug, Deserialize)]
struct R2ListBucketResult {
    #[serde(rename = "Contents", default)]
    contents: Vec<R2ListBucketObject>,
}

#[derive(Debug, Deserialize)]
struct R2ListBucketObject {
    #[serde(rename = "Key")]
    key: String,
    #[serde(rename = "LastModified")]
    last_modified: Option<String>,
    #[serde(rename = "Size")]
    size: Option<u64>,
}

fn load_template_video_r2_config() -> Result<TemplateVideoR2Config, String> {
    let account_id = std::env::var("CLOUDFLARE_R2_ACCOUNT_ID")
        .map_err(|_| "Missing CLOUDFLARE_R2_ACCOUNT_ID".to_string())?;
    let bucket = std::env::var("CLOUDFLARE_R2_BUCKET")
        .map_err(|_| "Missing CLOUDFLARE_R2_BUCKET".to_string())?;
    let access_key_id = std::env::var("CLOUDFLARE_R2_ACCESS_KEY_ID")
        .map_err(|_| "Missing CLOUDFLARE_R2_ACCESS_KEY_ID".to_string())?;
    let secret_access_key = std::env::var("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
        .map_err(|_| "Missing CLOUDFLARE_R2_SECRET_ACCESS_KEY".to_string())?;
    let public_base_url = std::env::var("CLOUDFLARE_TEMPLATE_VIDEOS_PUBLIC_BASE_URL")
        .ok()
        .or_else(|| std::env::var("CLOUDFLARE_R2_PUBLIC_BASE_URL").ok())
        .map(|value| value.trim().trim_end_matches('/').to_string())
        .filter(|value| !value.is_empty());

    Ok(TemplateVideoR2Config {
        account_id,
        bucket,
        access_key_id,
        secret_access_key,
        public_base_url,
    })
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push_str(&format!("{:02x}", byte));
    }
    output
}

fn sha256_hex(input: &[u8]) -> String {
    let digest = Sha256::digest(input);
    hex_encode(&digest)
}

fn hmac_sha256(key: &[u8], data: &str) -> Result<Vec<u8>, String> {
    let mut mac =
        HmacSha256::new_from_slice(key).map_err(|e| format!("HMAC init failed: {}", e))?;
    mac.update(data.as_bytes());
    Ok(mac.finalize().into_bytes().to_vec())
}

fn encode_query_component(value: &str) -> String {
    urlencoding::encode(value).into_owned()
}

fn encode_path_segments(path: &str) -> String {
    path.split('/')
        .filter(|segment| !segment.is_empty())
        .map(|segment| urlencoding::encode(segment).into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

fn build_public_template_video_url(base: &str, key: &str) -> String {
    let trimmed = base.trim_end_matches('/');
    let suffix = if trimmed.ends_with("/template_videos") || trimmed.ends_with("template_videos") {
        key.strip_prefix(TEMPLATE_VIDEO_PREFIX).unwrap_or(key)
    } else {
        key
    };
    format!("{}/{}", trimmed, encode_path_segments(suffix))
}

fn build_r2_presigned_get_url(
    config: &TemplateVideoR2Config,
    object_key: Option<&str>,
    extra_query: &[(String, String)],
    expires_in: u32,
) -> Result<String, String> {
    let now = Utc::now();
    let amz_date = now.format("%Y%m%dT%H%M%SZ").to_string();
    let date_stamp = now.format("%Y%m%d").to_string();
    let region = "auto";
    let service = "s3";
    let host = format!("{}.r2.cloudflarestorage.com", config.account_id);
    let canonical_uri = if let Some(key) = object_key {
        format!(
            "/{}/{}",
            encode_path_segments(&config.bucket),
            encode_path_segments(key)
        )
    } else {
        format!("/{}", encode_path_segments(&config.bucket))
    };

    let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, region, service);
    let mut query = BTreeMap::new();
    for (key, value) in extra_query {
        query.insert(key.clone(), value.clone());
    }
    query.insert(
        "X-Amz-Algorithm".to_string(),
        "AWS4-HMAC-SHA256".to_string(),
    );
    query.insert(
        "X-Amz-Credential".to_string(),
        format!("{}/{}", config.access_key_id, credential_scope),
    );
    query.insert("X-Amz-Date".to_string(), amz_date.clone());
    query.insert("X-Amz-Expires".to_string(), expires_in.to_string());
    query.insert("X-Amz-SignedHeaders".to_string(), "host".to_string());

    let canonical_query = query
        .iter()
        .map(|(key, value)| {
            format!(
                "{}={}",
                encode_query_component(key),
                encode_query_component(value)
            )
        })
        .collect::<Vec<_>>()
        .join("&");

    let canonical_headers = format!("host:{}\n", host);
    let canonical_request = format!(
        "GET\n{}\n{}\n{}\nhost\nUNSIGNED-PAYLOAD",
        canonical_uri, canonical_query, canonical_headers
    );
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        amz_date,
        credential_scope,
        sha256_hex(canonical_request.as_bytes())
    );

    let k_date = hmac_sha256(
        format!("AWS4{}", config.secret_access_key).as_bytes(),
        &date_stamp,
    )?;
    let k_region = hmac_sha256(&k_date, region)?;
    let k_service = hmac_sha256(&k_region, service)?;
    let k_signing = hmac_sha256(&k_service, "aws4_request")?;
    let signature = hex_encode(&hmac_sha256(&k_signing, &string_to_sign)?);

    Ok(format!(
        "https://{}{}?{}&X-Amz-Signature={}",
        host, canonical_uri, canonical_query, signature
    ))
}

fn list_template_video_assets_internal() -> Result<Vec<TemplateVideoAsset>, String> {
    let config = load_template_video_r2_config()?;
    let list_url = build_r2_presigned_get_url(
        &config,
        None,
        &[
            ("list-type".to_string(), "2".to_string()),
            ("prefix".to_string(), TEMPLATE_VIDEO_PREFIX.to_string()),
        ],
        TEMPLATE_VIDEO_LIST_TTL_SECONDS,
    )?;

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to create template video client: {}", e))?;
    let response = client
        .get(&list_url)
        .send()
        .map_err(|e| format!("Failed to list template videos: {}", e))?;
    if !response.status().is_success() {
        return Err(format!(
            "Template video listing failed with status {}",
            response.status()
        ));
    }

    let xml = response
        .text()
        .map_err(|e| format!("Failed to read template video listing: {}", e))?;
    let parsed: R2ListBucketResult = from_xml_str(&xml)
        .map_err(|e| format!("Failed to parse template video listing XML: {}", e))?;

    let mut assets = Vec::new();
    for object in parsed.contents {
        let Some(file_name) = object
            .key
            .strip_prefix(TEMPLATE_VIDEO_PREFIX)
            .filter(|value| !value.is_empty() && !value.contains('/'))
        else {
            continue;
        };

        if !file_name.to_ascii_lowercase().ends_with(".mp4") {
            continue;
        }

        let video_url = if let Some(ref public_base_url) = config.public_base_url {
            build_public_template_video_url(public_base_url, &object.key)
        } else {
            build_r2_presigned_get_url(
                &config,
                Some(&object.key),
                &[],
                TEMPLATE_VIDEO_URL_TTL_SECONDS,
            )?
        };

        assets.push(TemplateVideoAsset {
            id: file_name.to_string(),
            file_name: file_name.to_string(),
            video_url,
            cloudflare_key: object.key.clone(),
            size: object.size,
            modified: object.last_modified.clone(),
        });
    }

    assets.sort_by(|left, right| {
        left.file_name
            .to_lowercase()
            .cmp(&right.file_name.to_lowercase())
    });
    Ok(assets)
}

/// Returns true when a relative path is safe to join under a known base directory.
fn is_safe_relative_path(path: &Path) -> bool {
    !path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    })
}

fn overlay_content_type_for_extension(extension: Option<&str>) -> &'static str {
    match extension {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "application/javascript; charset=utf-8",
        Some("json") => "application/json; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("svg") => "image/svg+xml",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("mov") => "video/quicktime",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("ogg") => "audio/ogg",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("ttf") => "font/ttf",
        Some("otf") => "font/otf",
        _ => "application/octet-stream",
    }
}

fn overlay_header(name: &str, value: &str) -> tiny_http::Header {
    tiny_http::Header::from_bytes(name, value).unwrap()
}

fn overlay_header_value(request: &tiny_http::Request, name: &'static str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|header| header.field.equiv(name))
        .map(|header| header.value.as_str().to_string())
}

fn overlay_session_value() -> Option<serde_json::Value> {
    let mem_store = AUTH_SESSION.get_or_init(|| Mutex::new(None));
    let raw = {
        let guard = mem_store.lock().unwrap();
        guard.clone()
    }?;

    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    if let Some(expires_at) = value.get("expiresAt").and_then(|v| v.as_i64()) {
        let now_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        if now_ms >= expires_at {
            return None;
        }
    }

    Some(value)
}

fn overlay_auth_status_json() -> String {
    match overlay_session_value() {
        Some(mut value) => {
            if let Some(obj) = value.as_object_mut() {
                obj.insert("authenticated".to_string(), serde_json::Value::Bool(true));
            }
            serde_json::to_string(&value)
                .unwrap_or_else(|_| r#"{"authenticated":true}"#.to_string())
        }
        None => r#"{"authenticated":false,"deviceId":null}"#.to_string(),
    }
}

fn overlay_has_active_auth_session() -> bool {
    overlay_session_value().is_some()
}

fn overlay_is_allowed_app_document(clean_path: &str) -> bool {
    matches!(
        clean_path,
        ""
            | "index.html"
            | "dock"
            | "dock.html"
            | "lm-dock"
            | "lm-dock.html"
            // OBS/projection renderers must load even before the dock auth
            // session is restored. They receive content through local overlay
            // packets; blocking their HTML turns browser sources into a 401.
            | "mce-bible-overlay.html"
            | "mce-worship-overlay.html"
            | "mce-note.html"
            | "mce-media-overlay.html"
            | "lower-third-overlay.html"
            | "bible-overlay-bg.html"
            | "bible-overlay-lower-third.html"
            | "countdown-overlay.html"
            | "countdown-bg-overlay.html"
            | "pre-service-countdown.html"
            | "pre-service-media.html"
            | "live-tool-overlay.html"
            | "presentation.html"
    )
}

fn overlay_blocked_html_page() -> &'static str {
    r#"<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Authentication Required</title>
    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: Inter, "Open Sans", system-ui, sans-serif;
        background: #0f172a;
        color: #e2e8f0;
      }
      .panel {
        width: min(420px, 100%);
        padding: 28px;
        border: 1px solid rgba(148, 163, 184, 0.22);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.92);
        box-shadow: 0 28px 80px rgba(2, 6, 23, 0.45);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 1.4rem;
        line-height: 1.2;
      }
      p {
        margin: 0 0 16px;
        color: #cbd5e1;
        line-height: 1.5;
      }
      button {
        border: 0;
        border-radius: 10px;
        padding: 11px 16px;
        font: inherit;
        font-weight: 600;
        color: #eff6ff;
        background: #2563eb;
        cursor: pointer;
      }
      .hint {
        margin-top: 14px;
        margin-bottom: 0;
        font-size: 0.92rem;
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <h1>Authentication Required</h1>
      <p>Please open the MakeChurchEasy desktop app and log in first.</p>
      <button type="button" onclick="window.location.reload()">Refresh</button>
      <p class="hint">This page will start working again after the desktop app restores the local session.</p>
    </main>
  </body>
</html>"#
}

fn respond_overlay_auth_blocked(request: tiny_http::Request) {
    let resp = tiny_http::Response::from_string(overlay_blocked_html_page())
        .with_status_code(401)
        .with_header(overlay_header("Content-Type", "text/html; charset=utf-8"))
        .with_header(overlay_header("Access-Control-Allow-Origin", "*"))
        .with_header(overlay_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0",
        ))
        .with_header(overlay_header("Pragma", "no-cache"))
        .with_header(overlay_header("Expires", "0"));
    let _ = request.respond(resp);
}

fn parse_byte_range(range_header: &str, file_size: u64) -> Result<(u64, u64), ()> {
    if file_size == 0 {
        return Err(());
    }

    let range_value = range_header.trim().strip_prefix("bytes=").ok_or(())?;
    if range_value.contains(',') {
        return Err(());
    }

    let (start_raw, end_raw) = range_value.split_once('-').ok_or(())?;

    if start_raw.is_empty() {
        let suffix_len = end_raw.parse::<u64>().map_err(|_| ())?;
        if suffix_len == 0 {
            return Err(());
        }

        let length = suffix_len.min(file_size);
        return Ok((file_size - length, file_size - 1));
    }

    let start = start_raw.parse::<u64>().map_err(|_| ())?;
    if start >= file_size {
        return Err(());
    }

    let end = if end_raw.is_empty() {
        file_size - 1
    } else {
        end_raw.parse::<u64>().map_err(|_| ())?.min(file_size - 1)
    };

    if end < start {
        return Err(());
    }

    Ok((start, end))
}

fn respond_overlay_file_request(request: tiny_http::Request, file_path: &Path, content_type: &str) {
    let range_header = overlay_header_value(&request, "Range");
    let file = match File::open(file_path) {
        Ok(file) => file,
        Err(_) => {
            let _ = request.respond(
                tiny_http::Response::from_string("Internal Server Error")
                    .with_status_code(500)
                    .with_header(
                        tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
                    ),
            );
            return;
        }
    };

    let file_size = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => {
            let _ = request.respond(
                tiny_http::Response::from_string("Internal Server Error")
                    .with_status_code(500)
                    .with_header(
                        tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
                    ),
            );
            return;
        }
    };

    if let Some(range_header) = range_header {
        match parse_byte_range(&range_header, file_size) {
            Ok((start, end)) => {
                let mut file = file;
                let content_length = end - start + 1;
                let Some(content_length_usize) = usize::try_from(content_length).ok() else {
                    let _ = request.respond(
                        tiny_http::Response::from_string("Internal Server Error")
                            .with_status_code(500)
                            .with_header(
                                tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                    .unwrap(),
                            ),
                    );
                    return;
                };

                if file.seek(SeekFrom::Start(start)).is_err() {
                    let _ = request.respond(
                        tiny_http::Response::from_string("Internal Server Error")
                            .with_status_code(500)
                            .with_header(
                                tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                    .unwrap(),
                            ),
                    );
                    return;
                }

                let response = tiny_http::Response::new(
                    tiny_http::StatusCode(206),
                    Vec::new(),
                    file.take(content_length),
                    Some(content_length_usize),
                    None,
                )
                .with_header(overlay_header("Content-Type", content_type))
                .with_header(
                    tiny_http::Header::from_bytes(
                        "Content-Range",
                        format!("bytes {}-{}/{}", start, end, file_size),
                    )
                    .unwrap(),
                )
                .with_header(
                    tiny_http::Header::from_bytes("Content-Length", content_length.to_string())
                        .unwrap(),
                )
                .with_header(overlay_header("Accept-Ranges", "bytes"))
                .with_header(overlay_header("Access-Control-Allow-Origin", "*"))
                .with_header(overlay_header(
                    "Cache-Control",
                    "no-store, no-cache, must-revalidate, max-age=0",
                ))
                .with_header(overlay_header("Pragma", "no-cache"))
                .with_header(overlay_header("Expires", "0"));
                let _ = request.respond(response);
            }
            Err(_) => {
                let response = tiny_http::Response::empty(416)
                    .with_header(
                        tiny_http::Header::from_bytes(
                            "Content-Range",
                            format!("bytes */{}", file_size),
                        )
                        .unwrap(),
                    )
                    .with_header(overlay_header("Accept-Ranges", "bytes"))
                    .with_header(overlay_header("Access-Control-Allow-Origin", "*"))
                    .with_header(overlay_header(
                        "Cache-Control",
                        "no-store, no-cache, must-revalidate, max-age=0",
                    ))
                    .with_header(overlay_header("Pragma", "no-cache"))
                    .with_header(overlay_header("Expires", "0"));
                let _ = request.respond(response);
            }
        }
        return;
    }

    let response = tiny_http::Response::from_file(file)
        .with_header(overlay_header("Content-Type", content_type))
        .with_header(overlay_header("Accept-Ranges", "bytes"))
        .with_header(overlay_header("Access-Control-Allow-Origin", "*"))
        .with_header(overlay_header(
            "Cache-Control",
            "no-store, no-cache, must-revalidate, max-age=0",
        ))
        .with_header(overlay_header("Pragma", "no-cache"))
        .with_header(overlay_header("Expires", "0"));
    let _ = request.respond(response);
}

/// Save a background image to ~/Documents/MakeChurchEasy/backgrounds/
/// Accepts raw image bytes and a hash-based filename.
/// Returns the absolute path to the saved file.
#[tauri::command]
fn save_bg_image(file_name: String, file_data: Vec<u8>) -> Result<String, String> {
    let bg_dir = app_dir()?.join("backgrounds");
    fs::create_dir_all(&bg_dir)
        .map_err(|e| format!("Failed to create backgrounds directory: {}", e))?;

    let safe_file_name = sanitize_filename_for_storage(&file_name)?;
    let file_path = bg_dir.join(&safe_file_name);

    // Skip write if the file already exists (content-addressed by hash name)
    if file_path.exists() {
        let abs_path = file_path
            .to_str()
            .ok_or("File path contains invalid UTF-8")?
            .to_string();
        println!("[Tauri] BG image already exists: {}", abs_path);
        return Ok(abs_path);
    }

    fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to write bg image '{}': {}", safe_file_name, e))?;

    let abs_path = file_path
        .to_str()
        .ok_or("File path contains invalid UTF-8")?
        .to_string();

    println!(
        "[Tauri] Saved BG image: {} ({} bytes)",
        abs_path,
        file_data.len()
    );
    Ok(abs_path)
}

/// Save an uploaded file to ~/Documents/MakeChurchEasy/uploads/
/// Returns the absolute path to the saved file.
#[tauri::command]
fn save_upload_file(file_name: String, file_data: Vec<u8>) -> Result<String, String> {
    let uploads_dir = app_dir()?.join("uploads");
    fs::create_dir_all(&uploads_dir)
        .map_err(|e| format!("Failed to create uploads directory: {}", e))?;

    let safe_file_name = sanitize_filename_for_storage(&file_name)?;
    let file_path = uploads_dir.join(&safe_file_name);
    fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to write file '{}': {}", safe_file_name, e))?;

    let abs_path = file_path
        .to_str()
        .ok_or("File path contains invalid UTF-8")?
        .to_string();

    println!(
        "[Tauri] Saved upload: {} ({} bytes)",
        abs_path,
        file_data.len()
    );
    Ok(abs_path)
}

/// Save a countdown background asset to ~/Documents/MakeChurchEasy/uploads/countdowns/
/// The caller generates the assetId (nanoid) and passes it along with the original file name.
#[tauri::command]
fn save_countdown_asset(
    asset_id: String,
    file_name: String,
    file_data: Vec<u8>,
) -> Result<String, String> {
    let countdowns_dir = app_dir()?.join("uploads").join("countdowns");
    fs::create_dir_all(&countdowns_dir)
        .map_err(|e| format!("Failed to create countdowns directory: {}", e))?;

    let safe_file_name = sanitize_filename_for_storage(&file_name)?;
    let ext = Path::new(&safe_file_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let stored_name = format!("{}.{}", asset_id, ext);
    let file_path = countdowns_dir.join(&stored_name);
    fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to write countdown asset '{}': {}", stored_name, e))?;

    let abs_path = file_path
        .to_str()
        .ok_or("File path contains invalid UTF-8")?
        .to_string();

    println!(
        "[Tauri] Saved countdown asset: {} ({} bytes)",
        abs_path,
        file_data.len()
    );
    Ok(abs_path)
}

/// Delete a countdown background asset by assetId from ~/Documents/MakeChurchEasy/uploads/countdowns/
#[tauri::command]
fn delete_countdown_asset(asset_id: String) -> Result<(), String> {
    let countdowns_dir = app_dir()?.join("uploads").join("countdowns");
    if !countdowns_dir.exists() {
        return Ok(());
    }

    let entries = fs::read_dir(&countdowns_dir)
        .map_err(|e| format!("Failed to read countdowns directory: {}", e))?;

    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with(&format!("{}.", asset_id)) {
            fs::remove_file(entry.path())
                .map_err(|e| format!("Failed to delete countdown asset '{}': {}", name, e))?;
            println!("[Tauri] Deleted countdown asset: {}", name);
            return Ok(());
        }
    }

    // Not found — not an error, asset may have already been cleaned up
    Ok(())
}

/// Clean up unused countdown assets.
/// `used_asset_ids` is a list of assetIds that are still referenced by active countdowns.
/// Any file in the countdowns/ folder not matching a used assetId is deleted.
#[tauri::command]
fn cleanup_unused_countdown_assets(used_asset_ids: Vec<String>) -> Result<u32, String> {
    let countdowns_dir = app_dir()?.join("uploads").join("countdowns");
    if !countdowns_dir.exists() {
        return Ok(0);
    }

    let entries = fs::read_dir(&countdowns_dir)
        .map_err(|e| format!("Failed to read countdowns directory: {}", e))?;

    let mut deleted = 0u32;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // Asset files are named <assetId>.<ext> — extract the ID before the first dot
        let file_asset_id = name.split('.').next().unwrap_or("");
        if !file_asset_id.is_empty() && !used_asset_ids.contains(&file_asset_id.to_string()) {
            fs::remove_file(entry.path())
                .map_err(|e| format!("Failed to cleanup asset '{}': {}", name, e))?;
            println!("[Tauri] Cleaned up unused countdown asset: {}", name);
            deleted += 1;
        }
    }

    Ok(deleted)
}

/// Save a remote template background video to the local uploads/backgrounds/videos/
/// folder and return the absolute path plus the overlay-relative URL.
#[tauri::command]
fn save_background_video_file(
    file_name: String,
    file_data: Vec<u8>,
) -> Result<SavedBackgroundVideoFile, String> {
    let videos_dir = app_dir()?
        .join("uploads")
        .join("backgrounds")
        .join("videos");
    fs::create_dir_all(&videos_dir)
        .map_err(|e| format!("Failed to create background videos directory: {}", e))?;

    let safe_file_name = sanitize_filename_for_storage(&file_name)?;
    let file_path = videos_dir.join(&safe_file_name);
    fs::write(&file_path, &file_data).map_err(|e| {
        format!(
            "Failed to write background video '{}': {}",
            safe_file_name, e
        )
    })?;

    let abs_path = file_path
        .to_str()
        .ok_or("Background video path contains invalid UTF-8")?
        .to_string();
    let relative_url = format!(
        "/uploads/backgrounds/videos/{}",
        encode_path_segments(&safe_file_name)
    );

    println!(
        "[Tauri] Saved background video: {} ({} bytes)",
        abs_path,
        file_data.len()
    );

    Ok(SavedBackgroundVideoFile {
        file_path: abs_path,
        relative_url,
    })
}

/// Load app_data.json — returns file contents or "{}" if it doesn't exist.
#[tauri::command]
fn load_app_data() -> Result<String, String> {
    let path = app_dir()?.join("app_data.json");

    if !path.exists() {
        println!("[Tauri] app_data.json not found — returning empty object");
        return Ok("{}".to_string());
    }

    let contents =
        fs::read_to_string(&path).map_err(|e| format!("Failed to read app_data.json: {}", e))?;

    println!("[Tauri] Loaded app_data.json ({} bytes)", contents.len());
    Ok(contents)
}

/// Save app_data.json — writes the JSON string to disk.
#[tauri::command]
fn save_app_data(data: String) -> Result<(), String> {
    let path = app_dir()?.join("app_data.json");

    fs::write(&path, &data).map_err(|e| format!("Failed to write app_data.json: {}", e))?;

    println!("[Tauri] Saved app_data.json ({} bytes)", data.len());
    Ok(())
}

/// Return the overlay server port so the frontend can build URLs.
#[tauri::command]
fn get_overlay_port() -> u16 {
    OVERLAY_PORT.load(Ordering::Relaxed)
}

fn get_local_ip_for_target(target_host: Option<&str>) -> Option<String> {
    let target = target_host
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("8.8.8.8");
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect(format!("{}:80", target)).ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

/// Return a LAN-accessible overlay base URL for remote OBS browser sources.
#[tauri::command]
fn get_lan_overlay_info(target_host: Option<String>) -> Result<serde_json::Value, String> {
    let port = OVERLAY_PORT.load(Ordering::Relaxed);
    if port == 0 {
        return Err("Overlay server is not running".to_string());
    }

    let ip = get_local_ip_for_target(target_host.as_deref())
        .or_else(get_local_ip)
        .ok_or_else(|| "Could not determine this computer's LAN IP".to_string())?;
    Ok(serde_json::json!({
        "ip": ip,
        "port": port,
        "baseUrl": format!("http://{}:{}", ip, port),
    }))
}

/// Prepare a local media file for remote OBS by ensuring it is served from the
/// MakeChurchEasy uploads directory, then return its LAN URL.
#[tauri::command]
fn prepare_remote_media_url(
    file_path: String,
    file_name: String,
    target_host: Option<String>,
) -> Result<String, String> {
    let port = OVERLAY_PORT.load(Ordering::Relaxed);
    if port == 0 {
        return Err("Overlay server is not running".to_string());
    }

    let trimmed = file_path.trim();
    if trimmed.is_empty() {
        return Err("Media file path is required".to_string());
    }

    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        return Ok(trimmed.to_string());
    }

    let uploads_dir = app_dir()?.join("uploads");
    fs::create_dir_all(&uploads_dir)
        .map_err(|error| format!("Failed to create uploads directory: {}", error))?;

    let decoded_path = if trimmed.starts_with("file://") {
        urlencoding::decode(trimmed.trim_start_matches("file://"))
            .map(|value| value.to_string())
            .unwrap_or_else(|_| trimmed.trim_start_matches("file://").to_string())
    } else {
        trimmed.to_string()
    };

    let source_path = Path::new(&decoded_path);
    let safe_name = source_path
        .file_name()
        .and_then(|value| value.to_str())
        .or_else(|| {
            Path::new(file_name.trim())
                .file_name()
                .and_then(|value| value.to_str())
        })
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Could not determine media file name".to_string())?
        .replace(['/', '\\'], "_");

    let served_path = uploads_dir.join(&safe_name);

    if source_path.exists() {
        let source_canonical = source_path.canonicalize().ok();
        let served_canonical = served_path.canonicalize().ok();
        if source_canonical != served_canonical {
            fs::copy(source_path, &served_path)
                .map_err(|error| format!("Failed to prepare media for remote OBS: {}", error))?;
        }
    } else if !served_path.exists() {
        return Err(format!("Media file is not available: {}", trimmed));
    }

    let ip = get_local_ip_for_target(target_host.as_deref())
        .or_else(get_local_ip)
        .ok_or_else(|| "Could not determine this computer's LAN IP".to_string())?;
    Ok(format!(
        "http://{}:{}/uploads/{}",
        ip,
        port,
        urlencoding::encode(&safe_name)
    ))
}

/// Return device hostname and OS (legacy — kept for backward compat).
#[tauri::command]
fn get_device_info() -> Result<serde_json::Value, String> {
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown Device".to_string());

    let os = std::env::consts::OS;

    Ok(serde_json::json!({
        "hostname": hostname,
        "os": os,
    }))
}

/// Return full hardware profile for the performance detection system.
#[tauri::command]
fn get_system_hardware_info() -> Result<serde_json::Value, String> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();

    // CPU
    let cpu_model = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());
    let cpu_cores = sys.cpus().len() as u32;

    // RAM
    let total_ram_mb = sys.total_memory() / (1024 * 1024);
    let available_ram_mb = sys.available_memory() / (1024 * 1024);

    // GPU — sysinfo 0.35+ removed video_cards(); use platform detection
    let gpu_name = detect_gpu_name();

    // OS version
    let os_version = System::long_os_version().unwrap_or_else(|| "Unknown".to_string());
    let os_name = System::name().unwrap_or_else(|| std::env::consts::OS.to_string());
    let arch = std::env::consts::ARCH;

    // Hostname
    let hostname = hostname::get()
        .map(|h| h.to_string_lossy().to_string())
        .unwrap_or_else(|_| "Unknown Device".to_string());

    Ok(serde_json::json!({
        "hostname": hostname,
        "os": os_name,
        "osVersion": os_version,
        "arch": arch,
        "cpuModel": cpu_model,
        "cpuCores": cpu_cores,
        "totalRAMMB": total_ram_mb,
        "availableRAMMB": available_ram_mb,
        "gpuName": gpu_name,
    }))
}

/// Detect GPU name via platform-specific commands.
fn detect_gpu_name() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("system_profiler")
            .args(["SPDisplaysDataType"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(rest) = line.strip_prefix("          Chipset Model: ") {
                    return rest.trim().to_string();
                }
                if let Some(rest) = line.strip_prefix("          Chip: ") {
                    return rest.trim().to_string();
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Try wmic for GPU name on Windows
        if let Ok(output) = std::process::Command::new("wmic")
            .args(["path", "win32_videocontroller", "get", "name"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let trimmed = line.trim();
                if !trimmed.is_empty() && trimmed != "Name" {
                    return trimmed.to_string();
                }
            }
        }
    }

    "Unknown GPU".to_string()
}

/// Periodic memory check — returns available/total RAM for runtime tier adjustment.
#[tauri::command]
fn get_memory_usage() -> Result<serde_json::Value, String> {
    use sysinfo::System;

    let mut sys = System::new();
    sys.refresh_memory();

    let total_mb = sys.total_memory() / (1024 * 1024);
    let available_mb = sys.available_memory() / (1024 * 1024);
    let used_mb = total_mb - available_mb;
    let fraction = if total_mb > 0 {
        (available_mb as f64 / total_mb as f64 * 100.0).round() / 100.0
    } else {
        1.0
    };

    Ok(serde_json::json!({
        "totalMB": total_mb,
        "availableMB": available_mb,
        "usedMB": used_mb,
        "availableFraction": fraction,
    }))
}

fn resolve_dock_data_path(name: &str) -> Result<(String, std::path::PathBuf), String> {
    let safe = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>();
    if safe.is_empty() {
        return Err("Invalid data name".to_string());
    }

    let uploads_dir = app_dir()?.join("uploads");
    fs::create_dir_all(&uploads_dir).map_err(|e| format!("Failed to create uploads dir: {}", e))?;
    Ok((safe.clone(), uploads_dir.join(format!("{}.json", safe))))
}

fn write_dock_data(name: &str, data: &str) -> Result<(), String> {
    let (safe, path) = resolve_dock_data_path(name)?;
    fs::write(&path, data).map_err(|e| format!("Failed to write dock data: {}", e))?;
    println!("[Tauri] Saved dock data '{}' ({} bytes)", safe, data.len());
    Ok(())
}

/// Save dock-shared data to a JSON file in the uploads directory.
/// The overlay server can then serve it to the dock page.
/// `name` is the filename (e.g. "worship-songs"), `.json` is appended.
#[tauri::command]
fn save_dock_data(name: String, data: String) -> Result<(), String> {
    write_dock_data(&name, &data)
}

/// Load dock-shared data from the uploads directory.
/// Returns an empty string when the file has not been written yet.
#[tauri::command]
fn load_dock_data(name: String) -> Result<String, String> {
    let (safe, path) = resolve_dock_data_path(&name)?;
    if !path.exists() {
        return Ok(String::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read dock data '{}': {}", safe, e))?;
    if !safe.starts_with("dock-voice-bible-") && !safe.starts_with("dock-worship-song-save") {
        println!(
            "[Tauri] Loaded dock data '{}' ({} bytes)",
            safe,
            contents.len()
        );
    }
    Ok(contents)
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct OnlineLyricsSearchResult {
    id: String,
    source_id: String,
    source_name: String,
    title: String,
    artist: String,
    url: String,
    preview: String,
    lyrics: String,
    thumbnail_url: Option<String>,
    #[serde(skip_serializing)]
    score: i32,
}

#[derive(Deserialize)]
struct WpRenderedField {
    rendered: String,
}

#[derive(Deserialize)]
struct WpPost {
    link: String,
    title: WpRenderedField,
    content: WpRenderedField,
    #[serde(default)]
    jetpack_featured_media_url: Option<String>,
}

#[derive(Deserialize)]
struct BloggerFeedResponse {
    feed: BloggerFeed,
}

#[derive(Deserialize)]
struct BloggerFeed {
    #[serde(default)]
    entry: Vec<BloggerEntry>,
}

#[derive(Deserialize)]
struct BloggerTextValue {
    #[serde(rename = "$t")]
    value: String,
}

#[derive(Deserialize)]
struct BloggerLink {
    rel: String,
    href: String,
}

#[derive(Deserialize)]
struct BloggerThumbnail {
    url: String,
}

#[derive(Deserialize)]
struct BloggerEntry {
    title: BloggerTextValue,
    content: BloggerTextValue,
    #[serde(default)]
    link: Vec<BloggerLink>,
    #[serde(rename = "media$thumbnail")]
    thumbnail: Option<BloggerThumbnail>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct LrcLibTrack {
    id: i64,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    track_name: Option<String>,
    #[serde(default)]
    artist_name: Option<String>,
    #[serde(default)]
    instrumental: bool,
    #[serde(default)]
    plain_lyrics: Option<String>,
    #[serde(default)]
    synced_lyrics: Option<String>,
}

fn build_online_lyrics_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .connect_timeout(Duration::from_secs(4))
        .timeout(Duration::from_secs(8))
        .redirect(reqwest::redirect::Policy::limited(5))
        .user_agent(ONLINE_LYRICS_USER_AGENT)
        .build()
        .map_err(|err| format!("Failed to create lyrics search client: {}", err))
}

fn parse_selector(selector: &str) -> Result<Selector, String> {
    Selector::parse(selector).map_err(|err| format!("Invalid selector '{}': {:?}", selector, err))
}

fn clean_inline_text(text: &str) -> String {
    text.replace('\u{00a0}', " ")
        .replace("&nbsp;", " ")
        .replace('\u{2018}', "'")
        .replace('\u{2019}', "'")
        .replace('\u{201c}', "\"")
        .replace('\u{201d}', "\"")
        .replace('\u{2013}', "-")
        .replace('\u{2014}', "-")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn normalize_text_block(text: &str) -> String {
    let mut lines = Vec::new();
    let mut last_blank = false;

    for raw_line in text.lines() {
        let cleaned = clean_inline_text(raw_line);
        if cleaned.is_empty() {
            if !last_blank && !lines.is_empty() {
                lines.push(String::new());
            }
            last_blank = true;
            continue;
        }

        lines.push(cleaned);
        last_blank = false;
    }

    lines.join("\n").trim().to_string()
}

fn html_fragment_to_text(fragment: &str) -> String {
    let normalized_html = fragment
        .replace("<br />", "\n")
        .replace("<br/>", "\n")
        .replace("<br>", "\n")
        .replace("</p>", "\n\n")
        .replace("</div>", "\n\n")
        .replace("</li>", "\n")
        .replace("</h1>", "\n")
        .replace("</h2>", "\n")
        .replace("</h3>", "\n")
        .replace("</h4>", "\n")
        .replace("</h5>", "\n")
        .replace("</h6>", "\n");

    let fragment = Html::parse_fragment(&normalized_html);
    let text = fragment.root_element().text().collect::<Vec<_>>().join("");
    normalize_text_block(&text)
}

fn strip_ascii_ci_prefix(text: &str, prefix: &str) -> String {
    let text = text.trim();
    if let Some(candidate) = text.get(..prefix.len()) {
        if candidate.eq_ignore_ascii_case(prefix) {
            return text
                .get(prefix.len()..)
                .unwrap_or_default()
                .trim()
                .to_string();
        }
    }

    text.to_string()
}

fn strip_ascii_ci_suffix(text: &str, suffix: &str) -> String {
    let text = text.trim();
    if let Some(start) = text.len().checked_sub(suffix.len()) {
        if let Some(candidate) = text.get(start..) {
            if candidate.eq_ignore_ascii_case(suffix) {
                return text.get(..start).unwrap_or_default().trim().to_string();
            }
        }
    }

    text.to_string()
}

fn split_ascii_ci_once<'a>(text: &'a str, separators: &[&str]) -> Option<(&'a str, &'a str)> {
    let lower = text.to_ascii_lowercase();

    for separator in separators {
        let separator_lower = separator.to_ascii_lowercase();
        if let Some(index) = lower.find(&separator_lower) {
            let after_index = index + separator.len();
            return Some((&text[..index], &text[after_index..]));
        }
    }

    None
}

fn cleanup_song_title(raw_title: &str) -> String {
    let mut title = clean_inline_text(raw_title);

    for prefix in [
        "[Download & Lyrics] ",
        "[Download + Lyrics] ",
        "Download & Lyrics ",
        "Download + Lyrics ",
    ] {
        title = strip_ascii_ci_prefix(&title, prefix);
    }

    for suffix in [
        "| Nigerian Gospel Lyrics",
        "| African Gospel Lyrics",
        "| New-age Gospel Lyrics",
        "• New-age Gospel Lyrics",
    ] {
        title = strip_ascii_ci_suffix(&title, suffix);
    }

    for suffix in [
        " (Mp3 & Lyrics)",
        " (Mp3 + Lyrics)",
        " Mp3 & Lyrics",
        " Mp3 + Lyrics",
        "Lyrics in-Full",
        "Lyrics in Full",
        "Full Lyrics and Video",
        "Full Lyrics",
        "Lyrics",
    ] {
        title = strip_ascii_ci_suffix(&title, suffix);
    }

    title
        .trim_matches(|ch: char| matches!(ch, '-' | ':' | '|' | ' '))
        .trim()
        .to_string()
}

fn cleanup_artist_name(raw_artist: &str) -> String {
    let mut artist = clean_inline_text(raw_artist);

    for prefix in ["a song by ", "song by ", "by "] {
        artist = strip_ascii_ci_prefix(&artist, prefix);
    }

    artist
        .trim_matches(|ch: char| matches!(ch, '-' | ':' | '|' | ' '))
        .trim()
        .to_string()
}

fn extract_field_from_lines(text: &str, field_names: &[&str]) -> Option<String> {
    for line in text.lines().take(10) {
        let cleaned = clean_inline_text(line);
        if cleaned.is_empty() {
            continue;
        }

        let lower = cleaned.to_ascii_lowercase();
        for field_name in field_names {
            let normalized_field = field_name.to_ascii_lowercase();
            if lower.starts_with(&normalized_field) {
                if let Some((_, value)) = cleaned.split_once(':') {
                    let value = clean_inline_text(value);
                    if !value.is_empty() {
                        return Some(value);
                    }
                }
            }
        }
    }

    None
}

fn extract_title_artist_from_content_markers(raw_content_text: &str) -> Option<(String, String)> {
    let mut download_fallback = None;

    for line in raw_content_text.lines().take(100) {
        let cleaned = clean_inline_text(line);
        if cleaned.is_empty() {
            continue;
        }

        let lyrics_line = strip_ascii_ci_prefix(&cleaned, "lyrics:");
        if lyrics_line != cleaned {
            if let Some((title, artist)) = split_ascii_ci_once(&lyrics_line, &[" by "]) {
                let title = cleanup_song_title(title);
                let artist = cleanup_artist_name(artist);
                if !title.is_empty() {
                    return Some((title, artist));
                }
            }
        }

        let download_line = strip_ascii_ci_prefix(&cleaned, "download ");
        if download_line != cleaned {
            if let Some((title, artist)) = split_ascii_ci_once(
                &download_line,
                &[" Mp3 Audio by ", " MP3 Audio by ", " Audio by ", " Mp3 by "],
            ) {
                let title = cleanup_song_title(title);
                let artist = cleanup_artist_name(artist);
                if !title.is_empty() && download_fallback.is_none() {
                    download_fallback = Some((title, artist));
                }
            }
        }
    }

    download_fallback
}

fn extract_title_artist(raw_title: &str, raw_content_text: &str) -> (String, String) {
    let content_title = extract_field_from_lines(raw_content_text, &["song title", "song tittle"]);
    let content_artist = extract_field_from_lines(raw_content_text, &["artist"]);
    let content_marker_pair = extract_title_artist_from_content_markers(raw_content_text);

    let normalized_title = clean_inline_text(raw_title);
    let (mut title, mut artist) = if let Some((before, after)) = split_ascii_ci_once(
        &normalized_title,
        &[
            " Lyrics in-Full: a song by ",
            " Lyrics in Full: a song by ",
            " Lyrics by ",
            " lyrics by ",
            " - ",
        ],
    ) {
        (cleanup_song_title(before), cleanup_artist_name(after))
    } else {
        (cleanup_song_title(&normalized_title), String::new())
    };

    if let Some((marker_title, marker_artist)) = content_marker_pair {
        title = marker_title;
        if !marker_artist.is_empty() {
            artist = marker_artist;
        }
    }

    if let Some(content_title) = content_title {
        title = cleanup_song_title(&content_title);
    }

    if let Some(content_artist) = content_artist {
        artist = cleanup_artist_name(&content_artist);
    }

    (title, artist)
}

fn should_break_lyrics(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    matches!(
        lower.as_str(),
        "the video" | "video" | "watch the video" | "watch video" | "related" | "more" | "print"
    ) || lower.contains("thanks for visiting")
        || lower.contains("have a blessed week")
        || lower.contains("property and copyright")
        || lower.contains("personal and educational purpose only")
        || lower.contains("contact us to dmca")
        || lower.starts_with("discover more from")
        || lower.starts_with("subscribe to get")
        || lower.starts_with("share on ")
        || lower.starts_with("email a link")
        || lower.starts_with("like loading")
}

fn should_drop_lyrics_line(line: &str) -> bool {
    let lower = line.to_ascii_lowercase();
    lower.starts_with("song title:")
        || lower.starts_with("song tittle:")
        || lower.starts_with("artist:")
        || lower.starts_with("album:")
        || lower.starts_with("lyrics:")
        || lower == "the full lyrics"
        || lower == "full lyrics"
        || lower == "contents:"
        || lower == "toggle"
        || lower.starts_with("read also")
        || lower.starts_with("share this")
        || lower.starts_with("download")
        || lower.contains("(opens in new window)")
        || lower.contains("download here")
        || lower.contains("get mp3 audio")
        || lower.contains("stream, and share")
        || lower.contains("ceenaija")
        || matches!(
            lower.as_str(),
            "share"
                | "tweet"
                | "pin"
                | "whatsapp"
                | "telegram"
                | "facebook"
                | "email"
                | "pinterest"
                | "tumblr"
                | "x"
        )
}

fn prune_lyrics_text(text: &str) -> String {
    let normalized = normalize_text_block(text);
    let normalized_lines = normalized.lines().collect::<Vec<_>>();
    let start_index = normalized_lines
        .iter()
        .position(|line| {
            let lower = clean_inline_text(line).to_ascii_lowercase();
            lower == "lyrics" || lower.starts_with("lyrics:")
        })
        .map(|index| index + 1)
        .unwrap_or(0);
    let mut lines = Vec::new();
    let mut last_blank = false;

    for line in normalized_lines.into_iter().skip(start_index) {
        if should_break_lyrics(line) {
            break;
        }
        if should_drop_lyrics_line(line) {
            continue;
        }

        if line.trim().is_empty() {
            if !last_blank && !lines.is_empty() {
                lines.push(String::new());
            }
            last_blank = true;
            continue;
        }

        lines.push(line.trim().to_string());
        last_blank = false;
    }

    lines.join("\n").trim().to_string()
}

fn build_preview(text: &str) -> String {
    let joined = text
        .lines()
        .map(clean_inline_text)
        .filter(|line| !line.is_empty())
        .take(3)
        .collect::<Vec<_>>()
        .join(" ");

    let preview = joined.trim();
    let mut chars = preview.chars();
    let mut output = chars.by_ref().take(187).collect::<String>();
    if chars.next().is_some() {
        output.push_str("...");
    }

    output
}

fn strip_lrc_timestamps(text: &str) -> String {
    text.lines()
        .filter_map(|raw_line| {
            let mut line = raw_line.trim();

            while line.starts_with('[') {
                let Some(close) = line.find(']') else {
                    break;
                };
                let tag = &line[1..close];
                let mut tag_parts = tag.split(':');
                let first = tag_parts.next().unwrap_or_default();
                let second = tag_parts.next().unwrap_or_default();
                let is_timestamp = tag_parts.next().is_none()
                    && !first.is_empty()
                    && first.chars().all(|ch| ch.is_ascii_digit())
                    && second.len() >= 2
                    && second.chars().all(|ch| ch.is_ascii_digit() || ch == '.');
                let is_metadata = matches!(
                    first.to_ascii_lowercase().as_str(),
                    "ar" | "ti" | "al" | "by" | "offset"
                );

                if !is_timestamp && !is_metadata {
                    break;
                }
                line = line[close + 1..].trim_start();
            }

            let cleaned = clean_inline_text(line);
            (!cleaned.is_empty()).then_some(cleaned)
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn tokenize_query(query: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();

    for ch in query.chars() {
        if ch.is_ascii_alphanumeric() {
            current.push(ch.to_ascii_lowercase());
        } else if !current.is_empty() {
            tokens.push(current.clone());
            current.clear();
        }
    }

    if !current.is_empty() {
        tokens.push(current);
    }

    tokens
        .into_iter()
        .filter(|token| {
            token.len() > 1
                && !matches!(
                    token.as_str(),
                    "lyrics"
                        | "lyric"
                        | "song"
                        | "songs"
                        | "full"
                        | "video"
                        | "download"
                        | "the"
                        | "and"
                        | "feat"
                        | "ft"
                        | "with"
                        | "for"
                        | "from"
                        | "by"
                )
        })
        .collect()
}

fn fuzzy_prefix(token: &str, min_len: usize, max_len: usize) -> Option<String> {
    let char_count = token.chars().count();
    if char_count < min_len {
        return None;
    }

    Some(token.chars().take(char_count.min(max_len)).collect())
}

fn build_online_lyrics_search_queries(query: &str) -> Vec<String> {
    let tokens = tokenize_query(query);
    let mut queries = vec![clean_inline_text(query)];

    if tokens.len() >= 2 {
        let fuzzy_tokens = tokens
            .iter()
            .filter_map(|token| fuzzy_prefix(token, 3, 4))
            .collect::<Vec<_>>();
        if fuzzy_tokens.len() >= 2 {
            queries.push(fuzzy_tokens.join(" "));
        }

        let mixed_prefix_tokens = tokens
            .iter()
            .enumerate()
            .filter_map(|(index, token)| {
                if index == 0 {
                    fuzzy_prefix(token, 3, 3)
                } else {
                    fuzzy_prefix(token, 3, 4)
                }
            })
            .collect::<Vec<_>>();
        if mixed_prefix_tokens.len() >= 2 {
            queries.push(mixed_prefix_tokens.join(" "));
        }
    }

    if tokens.len() == 1 {
        if let Some(prefix) = fuzzy_prefix(&tokens[0], 3, 5) {
            queries.push(prefix);
        }
    }

    queries
        .into_iter()
        .filter(|query| query.chars().count() >= 3)
        .fold(Vec::new(), |mut unique, query| {
            if !unique
                .iter()
                .any(|item: &String| item.eq_ignore_ascii_case(&query))
            {
                unique.push(query);
            }
            unique
        })
}

fn levenshtein_distance(left: &str, right: &str) -> usize {
    if left == right {
        return 0;
    }

    let left_chars = left.chars().collect::<Vec<_>>();
    let right_chars = right.chars().collect::<Vec<_>>();

    if left_chars.is_empty() {
        return right_chars.len();
    }
    if right_chars.is_empty() {
        return left_chars.len();
    }

    let mut previous = (0..=right_chars.len()).collect::<Vec<_>>();
    let mut current = vec![0; right_chars.len() + 1];

    for (left_index, left_char) in left_chars.iter().enumerate() {
        current[0] = left_index + 1;

        for (right_index, right_char) in right_chars.iter().enumerate() {
            let substitution_cost = if left_char == right_char { 0 } else { 1 };
            current[right_index + 1] = (previous[right_index + 1] + 1)
                .min(current[right_index] + 1)
                .min(previous[right_index] + substitution_cost);
        }

        std::mem::swap(&mut previous, &mut current);
    }

    previous[right_chars.len()]
}

fn fuzzy_token_match_score(query_token: &str, candidate_tokens: &[String]) -> i32 {
    candidate_tokens
        .iter()
        .map(|candidate| {
            if candidate == query_token {
                return 34;
            }
            if candidate.starts_with(query_token) || query_token.starts_with(candidate) {
                return 24;
            }

            let distance = levenshtein_distance(query_token, candidate);
            let max_len = query_token.chars().count().max(candidate.chars().count());
            if max_len >= 5 && distance <= 2 {
                18
            } else if max_len >= 4 && distance <= 1 {
                14
            } else {
                0
            }
        })
        .max()
        .unwrap_or(0)
}

fn compute_result_score(
    query: &str,
    title: &str,
    artist: &str,
    preview: &str,
    lyrics: &str,
) -> i32 {
    let title_lower = title.to_ascii_lowercase();
    let artist_lower = artist.to_ascii_lowercase();
    let preview_lower = preview.to_ascii_lowercase();
    let lyrics_lower = lyrics.to_ascii_lowercase();
    let query_lower = query.trim().to_ascii_lowercase();
    let title_tokens = tokenize_query(title);
    let artist_tokens = tokenize_query(artist);
    let preview_tokens = tokenize_query(preview);
    let lyrics_tokens = tokenize_query(&lyrics.lines().take(24).collect::<Vec<_>>().join(" "));
    let mut score = 0;

    if !query_lower.is_empty() && title_lower.contains(&query_lower) {
        score += 220;
    }
    if !query_lower.is_empty() && artist_lower.contains(&query_lower) {
        score += 70;
    }

    for token in tokenize_query(query) {
        if title_lower.contains(&token) {
            score += 34;
        } else {
            score += fuzzy_token_match_score(&token, &title_tokens);
        }
        if artist_lower.contains(&token) {
            score += 22;
        } else {
            score += fuzzy_token_match_score(&token, &artist_tokens) / 2;
        }
        if preview_lower.contains(&token) {
            score += 12;
        } else {
            score += fuzzy_token_match_score(&token, &preview_tokens) / 3;
        }
        if lyrics_lower.contains(&token) {
            score += 8;
        } else {
            score += fuzzy_token_match_score(&token, &lyrics_tokens) / 4;
        }
    }

    if !artist.is_empty() {
        score += 12;
    }
    if lyrics.len() > 140 {
        score += 18;
    }
    if lyrics.len() > 480 {
        score += 10;
    }

    for penalty in [
        "biography",
        "songs lyrics",
        "songs and lyrics",
        "lyricspedia",
        "ultimate list",
        "top 15",
        "top 10",
        "album",
        "albums",
        "artists",
        "full biography",
    ] {
        if title_lower.contains(penalty) {
            score -= 120;
        }
    }

    score
}

fn build_result(
    source_id: &str,
    source_name: &str,
    raw_title: &str,
    raw_content: &str,
    url: &str,
    thumbnail_url: Option<String>,
    query: &str,
) -> Option<OnlineLyricsSearchResult> {
    let content_text = html_fragment_to_text(raw_content);
    let lyrics = prune_lyrics_text(&content_text);
    let (title, artist) = extract_title_artist(raw_title, &content_text);
    let preview_source = if !lyrics.is_empty() {
        &lyrics
    } else {
        &content_text
    };
    let preview = build_preview(preview_source);
    let score = compute_result_score(query, &title, &artist, &preview, &lyrics);

    if title.is_empty()
        || url.trim().is_empty()
        || (lyrics.len() < 40 && preview.len() < 24)
        || score < 24
    {
        return None;
    }

    Some(OnlineLyricsSearchResult {
        id: format!("{}:{}", source_id, url),
        source_id: source_id.to_string(),
        source_name: source_name.to_string(),
        title,
        artist,
        url: url.to_string(),
        preview,
        lyrics,
        thumbnail_url,
        score,
    })
}

fn search_wordpress_source(
    client: &reqwest::blocking::Client,
    source_id: &str,
    source_name: &str,
    api_url: &str,
    query: &str,
) -> Result<Vec<OnlineLyricsSearchResult>, String> {
    let response = client
        .get(api_url)
        .query(&[
            ("search", query),
            ("per_page", "6"),
            ("_fields", "link,title,content,jetpack_featured_media_url"),
        ])
        .send()
        .map_err(|err| format!("{} search failed: {}", source_name, err))?
        .error_for_status()
        .map_err(|err| format!("{} search failed: {}", source_name, err))?;

    let posts: Vec<WpPost> = response
        .json()
        .map_err(|err| format!("{} search decode failed: {}", source_name, err))?;

    let mut results = posts
        .into_iter()
        .filter_map(|post| {
            build_result(
                source_id,
                source_name,
                &html_fragment_to_text(&post.title.rendered),
                &post.content.rendered,
                &post.link,
                post.jetpack_featured_media_url,
                query,
            )
        })
        .collect::<Vec<_>>();

    results.sort_by(|left, right| right.score.cmp(&left.score));
    Ok(results)
}

fn search_african_gospel_lyrics(
    client: &reqwest::blocking::Client,
    query: &str,
) -> Result<Vec<OnlineLyricsSearchResult>, String> {
    let response = client
        .get("https://africangospellyrics.com/")
        .query(&[("s", query)])
        .send()
        .map_err(|err| format!("African Gospel Lyrics search failed: {}", err))?
        .error_for_status()
        .map_err(|err| format!("African Gospel Lyrics search failed: {}", err))?;

    let search_html = response
        .text()
        .map_err(|err| format!("African Gospel Lyrics search decode failed: {}", err))?;
    let search_doc = Html::parse_document(&search_html);
    let post_selector = parse_selector("div.post")?;
    let title_selector = parse_selector("h2.post-title a")?;
    let content_selector = parse_selector("div.post-content")?;

    let mut results = Vec::new();

    for post in search_doc.select(&post_selector).take(4) {
        let Some(link) = post.select(&title_selector).next() else {
            continue;
        };

        let url = link.value().attr("href").unwrap_or("").trim().to_string();
        if url.is_empty() {
            continue;
        }

        let title = clean_inline_text(&link.text().collect::<Vec<_>>().join(" "));
        let detail_html = client
            .get(&url)
            .send()
            .and_then(|response| response.error_for_status())
            .map_err(|err| format!("African Gospel Lyrics detail fetch failed: {}", err))?
            .text()
            .map_err(|err| format!("African Gospel Lyrics detail decode failed: {}", err))?;
        let detail_doc = Html::parse_document(&detail_html);
        let raw_content = detail_doc
            .select(&content_selector)
            .next()
            .map(|node| node.inner_html())
            .unwrap_or_default();

        if let Some(result) = build_result(
            "africangospellyrics",
            "African Gospel Lyrics",
            &title,
            &raw_content,
            &url,
            None,
            query,
        ) {
            results.push(result);
        }
    }

    results.sort_by(|left, right| right.score.cmp(&left.score));
    Ok(results)
}

fn search_godlyrics(
    client: &reqwest::blocking::Client,
    query: &str,
) -> Result<Vec<OnlineLyricsSearchResult>, String> {
    let response = client
        .get("https://www.godlyrics.com.ng/feeds/posts/default")
        .query(&[("q", query), ("alt", "json")])
        .send()
        .map_err(|err| format!("GodLyrics search failed: {}", err))?
        .error_for_status()
        .map_err(|err| format!("GodLyrics search failed: {}", err))?;

    let payload: BloggerFeedResponse = response
        .json()
        .map_err(|err| format!("GodLyrics search decode failed: {}", err))?;

    let mut results = payload
        .feed
        .entry
        .into_iter()
        .filter_map(|entry| {
            let url = entry
                .link
                .iter()
                .find(|link| link.rel == "alternate")
                .map(|link| link.href.clone())?;

            build_result(
                "godlyrics",
                "GodLyrics",
                &entry.title.value,
                &entry.content.value,
                &url,
                entry.thumbnail.map(|thumbnail| thumbnail.url),
                query,
            )
        })
        .collect::<Vec<_>>();

    results.sort_by(|left, right| right.score.cmp(&left.score));
    Ok(results)
}

fn search_lrclib(
    client: &reqwest::blocking::Client,
    query: &str,
) -> Result<Vec<OnlineLyricsSearchResult>, String> {
    let response = client
        .get("https://lrclib.net/api/search")
        .query(&[("q", query)])
        .send()
        .map_err(|err| format!("LRCLIB search failed: {}", err))?
        .error_for_status()
        .map_err(|err| format!("LRCLIB search failed: {}", err))?;

    let tracks: Vec<LrcLibTrack> = response
        .json()
        .map_err(|err| format!("LRCLIB search decode failed: {}", err))?;

    let mut results = tracks
        .into_iter()
        .filter_map(|track| {
            if track.instrumental {
                return None;
            }

            let plain_lyrics = prune_lyrics_text(&track.plain_lyrics.unwrap_or_default());
            let synced_lyrics = prune_lyrics_text(&strip_lrc_timestamps(
                &track.synced_lyrics.unwrap_or_default(),
            ));
            let lyrics = if plain_lyrics.is_empty() {
                synced_lyrics
            } else {
                plain_lyrics
            };
            let title = clean_inline_text(
                track
                    .track_name
                    .as_deref()
                    .or(track.name.as_deref())
                    .unwrap_or_default(),
            );
            let artist = clean_inline_text(track.artist_name.as_deref().unwrap_or_default());
            let preview = build_preview(&lyrics);
            let score = compute_result_score(query, &title, &artist, &preview, &lyrics);

            if title.is_empty() || lyrics.len() < 40 || score < 12 {
                return None;
            }

            Some(OnlineLyricsSearchResult {
                id: format!("lrclib:{}", track.id),
                source_id: "lrclib".to_string(),
                source_name: "LRCLIB".to_string(),
                title,
                artist,
                url: format!("https://lrclib.net/api/get/{}", track.id),
                preview,
                lyrics,
                thumbnail_url: None,
                score,
            })
        })
        .collect::<Vec<_>>();

    results.sort_by(|left, right| right.score.cmp(&left.score));
    Ok(results)
}

fn append_source_results(
    results: &mut Vec<OnlineLyricsSearchResult>,
    source_results: Result<Vec<OnlineLyricsSearchResult>, String>,
) {
    match source_results {
        Ok(mut items) => results.append(&mut items),
        Err(err) => eprintln!("[OnlineLyrics] {}", err),
    }
}

fn finish_online_lyrics_results(
    mut results: Vec<OnlineLyricsSearchResult>,
) -> Vec<OnlineLyricsSearchResult> {
    let mut seen_urls = Vec::<String>::new();
    results.retain(|result| {
        let url_key = result.url.to_ascii_lowercase();
        if seen_urls.iter().any(|url| url == &url_key) {
            return false;
        }
        seen_urls.push(url_key);
        true
    });
    results.sort_by(|left, right| right.score.cmp(&left.score));
    results.truncate(ONLINE_LYRICS_RESULT_LIMIT);
    results
}

fn search_online_song_lyrics_blocking(
    query: String,
) -> Result<Vec<OnlineLyricsSearchResult>, String> {
    let trimmed_query = clean_inline_text(query.trim());
    if trimmed_query.chars().count() < 3 {
        return Ok(Vec::new());
    }

    let client = build_online_lyrics_client()?;
    let mut results = Vec::new();
    let search_queries = build_online_lyrics_search_queries(&trimmed_query);

    // Prefer LRCLIB because it returns structured track metadata and either
    // plain or synchronized lyrics. The other providers remain a fallback
    // for songs that are not present in LRCLIB.
    for search_query in &search_queries {
        match search_lrclib(&client, search_query) {
            Ok(lrclib_results) => {
                let finished = finish_online_lyrics_results(lrclib_results);
                if !finished.is_empty() {
                    return Ok(finished);
                }
            }
            Err(err) => eprintln!("[OnlineLyrics] {}", err),
        }
    }

    for search_query in &search_queries {
        std::thread::scope(|scope| {
            let gospel_client = client.clone();
            let gospel_query = search_query.clone();
            let gospellyrics = scope.spawn(move || {
                search_wordpress_source(
                    &gospel_client,
                    "gospellyricsng",
                    "GospellyricsNG",
                    "https://gospellyricsng.com/wp-json/wp/v2/posts",
                    &gospel_query,
                )
            });

            let ceenaija_client = client.clone();
            let ceenaija_query = search_query.clone();
            let ceenaija = scope.spawn(move || {
                search_wordpress_source(
                    &ceenaija_client,
                    "ceenaija",
                    "CeeNaija",
                    "https://www.ceenaija.com/wp-json/wp/v2/posts",
                    &ceenaija_query,
                )
            });

            let ng_client = client.clone();
            let ng_query = search_query.clone();
            let nglyrics = scope.spawn(move || {
                search_wordpress_source(
                    &ng_client,
                    "nglyrics",
                    "NgLyrics",
                    "https://www.nglyrics.net/wp-json/wp/v2/posts",
                    &ng_query,
                )
            });

            let godlyrics_client = client.clone();
            let godlyrics_query = search_query.clone();
            let godlyrics =
                scope.spawn(move || search_godlyrics(&godlyrics_client, &godlyrics_query));

            for source_results in [
                gospellyrics
                    .join()
                    .unwrap_or_else(|_| Err("GospellyricsNG search worker panicked".to_string())),
                ceenaija
                    .join()
                    .unwrap_or_else(|_| Err("CeeNaija search worker panicked".to_string())),
                nglyrics
                    .join()
                    .unwrap_or_else(|_| Err("NgLyrics search worker panicked".to_string())),
                godlyrics
                    .join()
                    .unwrap_or_else(|_| Err("GodLyrics search worker panicked".to_string())),
            ] {
                append_source_results(&mut results, source_results);
            }
        });

        let finished = finish_online_lyrics_results(results.clone());
        if !finished.is_empty() {
            return Ok(finished);
        }
    }

    for search_query in &search_queries {
        std::thread::scope(|scope| {
            let african_client = client.clone();
            let african_query = search_query.clone();
            let african =
                scope.spawn(move || search_african_gospel_lyrics(&african_client, &african_query));

            append_source_results(
                &mut results,
                african.join().unwrap_or_else(|_| {
                    Err("African Gospel Lyrics search worker panicked".to_string())
                }),
            );
        });

        let finished = finish_online_lyrics_results(results.clone());
        if !finished.is_empty() {
            return Ok(finished);
        }
    }

    Ok(finish_online_lyrics_results(results))
}

#[tauri::command]
async fn search_online_song_lyrics(query: String) -> Result<Vec<OnlineLyricsSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || search_online_song_lyrics_blocking(query))
        .await
        .map_err(|err| format!("Lyrics search task failed: {}", err))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleanup_song_title_handles_accented_utf8() {
        assert_eq!(cleanup_song_title("Ore Òfé Shá Lyrics"), "Ore Òfé Shá");
    }

    #[test]
    fn build_preview_truncates_utf8_safely() {
        let preview = build_preview(&"Òfé Shá ".repeat(80));

        assert!(preview.ends_with("..."));
        assert!(preview.is_char_boundary(preview.len()));
    }

    #[test]
    fn strip_lrc_timestamps_keeps_lyrics_and_drops_metadata() {
        let lyrics = strip_lrc_timestamps(
            "[ar:Artist]\n[ti:Song]\n[00:01.20][00:02.30]Amazing grace\n[00:04.00]How sweet the sound",
        );

        assert_eq!(lyrics, "Amazing grace\nHow sweet the sound");
    }

    #[test]
    fn fuzzy_search_query_handles_misspelled_title() {
        let queries = build_online_lyrics_search_queries("onidhe iyanf");

        assert!(queries.iter().any(|query| query == "oni iyan"));
        assert!(compute_result_score("onidhe iyanf", "Onise Iyanu", "", "", "") > 24);
    }

    #[test]
    fn ceenaija_content_markers_extract_song_and_lyrics() {
        let text = normalize_text_block(
            "Download Number One Mp3 Audio by Dunsin Oyekan Ft. John Wilds\n\
             Biography copy\n\
             Lyrics: Number One by Dunsin Oyekan\n\
             First things first, You are not another option\n\
             You will always be my Number One",
        );
        let (title, artist) =
            extract_title_artist("Dunsin Oyekan - Number One (Mp3 & Lyrics)", &text);
        let lyrics = prune_lyrics_text(&text);

        assert_eq!(title, "Number One");
        assert_eq!(artist, "Dunsin Oyekan");
        assert!(lyrics.starts_with("First things first"));
        assert!(!lyrics.contains("Biography copy"));
    }

    #[test]
    fn prune_lyrics_removes_subscription_and_share_footer() {
        let text = normalize_text_block(
            "Lyrics:\n\
             You are worthy oh God\n\
             No eyes have seen it\n\
             Discover more from African Gospel Lyrics\n\
             Subscribe to get the latest posts sent to your email.\n\
             Type your email...\n\
             Share on Facebook (Opens in new window)\n\
             Facebook\n\
             Related",
        );
        let lyrics = prune_lyrics_text(&text);

        assert_eq!(lyrics, "You are worthy oh God\nNo eyes have seen it");
        assert!(!lyrics.contains("Discover more"));
        assert!(!lyrics.contains("Facebook"));
        assert!(!lyrics.contains("Related"));
    }
}

// ─── Transcript Library Commands ─────────────────────────────────────────────
// These commands manage the Transcript Library, a completely separate feature
// from Live Speech-to-Scripture. Storage: ~/Documents/MakeChurchEasy/transcripts/

fn transcripts_dir() -> Result<std::path::PathBuf, String> {
    let dir = app_dir()?.join("transcripts");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create transcripts directory: {}", e))?;
    Ok(dir)
}

#[tauri::command]
fn load_transcripts() -> Result<String, String> {
    let dir = transcripts_dir()?;
    let mut transcripts: Vec<serde_json::Value> = Vec::new();

    if dir.exists() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Ok(contents) = fs::read_to_string(&path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contents) {
                            transcripts.push(val);
                        }
                    }
                }
            }
        }
    }

    transcripts.sort_by(|a, b| {
        let a_date = a.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        let b_date = b.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        b_date.cmp(a_date)
    });

    serde_json::to_string(&transcripts)
        .map_err(|e| format!("Failed to serialize transcripts: {}", e))
}

#[tauri::command]
fn save_transcript(transcript: serde_json::Value) -> Result<(), String> {
    let dir = transcripts_dir()?;
    let id = transcript
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or("Transcript missing id")?;

    let safe_name = id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    let path = dir.join(format!("{}.json", safe_name));
    let json = serde_json::to_string_pretty(&transcript)
        .map_err(|e| format!("Failed to serialize transcript: {}", e))?;

    fs::write(&path, json)
        .map_err(|e| format!("Failed to write transcript '{}': {}", safe_name, e))?;

    Ok(())
}

#[tauri::command]
fn delete_transcript(id: String) -> Result<(), String> {
    let dir = transcripts_dir()?;
    let safe_name = id
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>();

    let path = dir.join(format!("{}.json", safe_name));
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|e| format!("Failed to delete transcript '{}': {}", safe_name, e))?;
    }
    Ok(())
}

#[tauri::command]
fn get_transcript_stats() -> Result<String, String> {
    let dir = transcripts_dir()?;
    let mut total_sessions: u64 = 0;
    let mut total_duration: u64 = 0;
    let mut total_scriptures: u64 = 0;

    if dir.exists() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().and_then(|e| e.to_str()) == Some("json") {
                    if let Ok(contents) = fs::read_to_string(&path) {
                        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&contents) {
                            total_sessions += 1;
                            total_duration += val
                                .get("durationSeconds")
                                .and_then(|v| v.as_u64())
                                .unwrap_or(0);
                            total_scriptures += val
                                .get("scriptures")
                                .and_then(|v| v.as_array())
                                .map(|a| a.len() as u64)
                                .unwrap_or(0);
                        }
                    }
                }
            }
        }
    }

    let h = total_duration / 3600;
    let m = (total_duration % 3600) / 60;
    let total_duration_formatted = if h > 0 {
        format!("{}h {}m", h, m)
    } else {
        format!("{}m", m)
    };

    let stats = serde_json::json!({
        "totalSessions": total_sessions,
        "totalDurationFormatted": total_duration_formatted,
        "totalScriptures": total_scriptures,
        "usedThisMonth": total_duration_formatted
    });

    serde_json::to_string(&stats).map_err(|e| format!("Failed to serialize stats: {}", e))
}

const OPENCODE_BASE_URL: &str = "https://opencode.ai/zen/v1";
const OPENCODE_MODEL: &str = "mimo-v2.5-free";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportAiStatus {
    ai_configured: bool,
    model: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportReviewRequest {
    songs: Vec<WorshipImportReviewSongInput>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportReviewSongInput {
    id: String,
    title: String,
    hymn_number: Option<String>,
    language: Option<String>,
    confidence: f64,
    raw_text: String,
    warnings: Vec<String>,
    section_hints: Vec<WorshipImportReviewSectionHint>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportReviewSectionHint {
    label: String,
    #[serde(rename = "type")]
    section_type: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportReviewResponse {
    songs: Vec<WorshipImportReviewSongOutput>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportReviewSongOutput {
    id: String,
    title: Option<String>,
    hymn_number: Option<String>,
    confidence: Option<f64>,
    warnings: Option<Vec<String>>,
    review_notes: Option<Vec<String>>,
    sections: Option<Vec<WorshipImportReviewSectionOutput>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportReviewSectionOutput {
    #[serde(rename = "type")]
    section_type: Option<String>,
    label: Option<String>,
    number: Option<String>,
    content: Option<String>,
    warnings: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportStructureRequest {
    chunk_index: usize,
    total_chunks: usize,
    text: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportStructureResponse {
    songs: Vec<WorshipImportStructureSong>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportStructureSong {
    title: String,
    hymn_number: Option<String>,
    warnings: Option<Vec<String>>,
    sections: Vec<WorshipImportStructureSection>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorshipImportStructureSection {
    #[serde(rename = "type")]
    section_type: String,
    label: Option<String>,
    number: Option<String>,
    content: String,
}

fn get_opencode_api_key() -> Result<String, String> {
    if let Ok(value) = std::env::var("OPENCODE_API_KEY") {
        if !value.trim().is_empty() {
            return Ok(value);
        }
    }

    for candidate in opencode_dotenv_candidates() {
        if let Some(value) = read_env_file_value(&candidate, "OPENCODE_API_KEY") {
            return Ok(value);
        }
    }

    if let Some(value) = option_env!("OPENCODE_API_KEY") {
        if !value.trim().is_empty() {
            return Ok(value.to_string());
        }
    }

    Err("OPENCODE_API_KEY environment variable not set. \
         Set it in your shell, .env, or GitHub Actions release secret."
        .to_string())
}

fn opencode_dotenv_candidates() -> Vec<std::path::PathBuf> {
    let mut candidates = Vec::new();

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join(".env"));
        candidates.push(current_dir.join("../.env"));
        candidates.push(current_dir.join("../../.env"));
    }

    candidates
}

fn read_env_file_value(path: &std::path::Path, key: &str) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let (name, value) = trimmed.split_once('=')?;
        if name.trim() != key {
            continue;
        }

        let normalized = value
            .trim()
            .trim_matches('"')
            .trim_matches('\'')
            .trim()
            .to_string();

        if !normalized.is_empty() {
            return Some(normalized);
        }
    }

    None
}

fn build_opencode_client(timeout_secs: u64) -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(timeout_secs))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))
}

fn extract_json_payload(text: &str) -> &str {
    let trimmed = text.trim();
    if trimmed.starts_with('{') && trimmed.ends_with('}') {
        return trimmed;
    }

    let start = trimmed.find('{');
    let end = trimmed.rfind('}');
    match (start, end) {
        (Some(s), Some(e)) if s < e => &trimmed[s..=e],
        _ => trimmed,
    }
}

fn build_worship_import_review_prompt(
    request: &WorshipImportReviewRequest,
) -> Result<String, String> {
    let payload = serde_json::to_string_pretty(request)
        .map_err(|e| format!("Failed to serialize review request: {}", e))?;

    Ok(format!(
        "You are a worship document review assistant.\n\
         Your job is to structure already-extracted worship songs for import.\n\
         HARD RULES:\n\
         - Do NOT write new lyrics.\n\
         - Do NOT translate.\n\
         - Do NOT summarize.\n\
         - Do NOT paraphrase.\n\
         - Do NOT normalize spelling.\n\
         - Do NOT fix OCR errors by changing words. If you suspect OCR issues, keep the original text and mention them in warnings.\n\
         - Use ONLY text that already exists in each song's rawText or sectionHints.\n\
         - Keep section content verbatim except for grouping existing lines into the right section.\n\
         - Never move lines from one song into another song.\n\
         - If uncertain, preserve the local structure and lower confidence.\n\n\
         TASK:\n\
         For each input song, identify title, hymnNumber, and sections such as verse, chorus, refrain, bridge, pre-chorus, tag, intro, outro, or other.\n\
         Detect broken stanza boundaries, repeated choruses, page continuations, and likely OCR mistakes.\n\
         Return structured JSON only.\n\n\
         RESPONSE SCHEMA:\n\
         {{\n\
           \"songs\": [\n\
             {{\n\
               \"id\": \"same as input\",\n\
               \"title\": \"string\",\n\
               \"hymnNumber\": \"string or omitted\",\n\
               \"confidence\": 0.0,\n\
               \"warnings\": [\"string\"],\n\
               \"reviewNotes\": [\"string\"],\n\
               \"sections\": [\n\
                 {{\n\
                   \"type\": \"verse|chorus|refrain|bridge|pre-chorus|tag|intro|outro|other\",\n\
                   \"label\": \"display label\",\n\
                   \"number\": \"optional section number\",\n\
                   \"content\": \"exact lyric text from the input only\",\n\
                   \"warnings\": [\"string\"]\n\
                 }}\n\
               ]\n\
             }}\n\
           ]\n\
         }}\n\n\
         INPUT SONGS:\n{payload}"
    ))
}

fn build_worship_import_system_prompt() -> &'static str {
    r#"You are a worship document parser.

ABSOLUTE RULES - VIOLATION WILL TERMINATE THE SESSION:
- Output EXACTLY ONE valid JSON object. Nothing before. Nothing after. No code fences. No markdown. No ``` . Just raw JSON.
- Do NOT write new lyrics.
- Do NOT translate.
- Do NOT summarize.
- Do NOT paraphrase.
- Do NOT normalize spelling.
- Do NOT fix OCR errors by changing words. If you suspect OCR issues, keep the original text and mention them in warnings.
- Use ONLY text that already exists in the input.
- Keep section content verbatim.
- Escape all JSON string content correctly, including quotes, backslashes, and lyric line breaks.
- Put lyric line breaks inside JSON strings as \n, not as literal unescaped newlines.
- If a title is unclear, use the first line as title and add a warning.
- If no hymn number is present, omit it.
- One object per song.
- Identify sections as: verse, chorus, refrain, bridge, pre-chorus, tag, intro, outro, other, stanza, response, solo, congregation, men, women, all, leader, choir.

RESPONSE MUST BE EXACTLY THIS FORMAT:
{"songs":[{"title":"Song title","hymnNumber":"optional","warnings":[],"sections":[{"type":"verse","label":"Verse 1","number":"1","content":"exact lyric text"}]}]}

Return valid JSON only. No markdown. No code fences. No explanation. Just JSON."#
}

fn build_worship_import_user_prompt(request: &WorshipImportStructureRequest) -> String {
    let chunk_context = if request.total_chunks > 1 {
        format!(
            "\nThis is chunk {} of {}. Songs may be split across chunks. Only extract songs that appear complete in this chunk.",
            request.chunk_index + 1,
            request.total_chunks
        )
    } else {
        String::new()
    };

    format!(
        "You are processing church worship documents.\n\
These documents may originate from:\n\
- Hymn books\n\
- Worship sheets\n\
- Choir documents\n\
- Sunday service song lists\n\
- CCC hymn books\n\
- Anglican hymn books\n\
- Methodist hymn books\n\
- Catholic hymn books\n\
- Redeemed Christian Church hymn books\n\
- Assemblies of God hymn books\n\
- Hand-typed church documents\n\
- OCR-scanned PDFs\n\
- Historical church publications\n\
The formatting may be inconsistent.\n\
Do not assume modern song formatting.\n\
Many documents use:\n\
- Stanza\n\
- Verse\n\
- Chorus\n\
- Refrain\n\
- Response\n\
- Solo\n\
- Congregation\n\
- Men\n\
- Women\n\
- All\n\
- Leader\n\
- Choir\n\
These should be preserved whenever possible.\n\
Some hymn books use numbering formats such as:\n\
1.\n\
2.\n\
3.\n\
or\n\
I.\n\
II.\n\
III.\n\
or\n\
(1)\n\
(2)\n\
(3)\n\
These often indicate verses.\n\
Do not automatically treat every numbered section as a new song.\n\
A song may span multiple pages.\n\
A hymn number often appears near the title.\n\
Examples:\n\
101 Amazing Grace\n\
Hymn 101\n\
No. 101\n\
101.\n\
101\n\
However page numbers may appear similarly.\n\
Be conservative.\n\
When uncertain, preserve rather than guess.\n\
Documents may contain:\n\
- Page numbers\n\
- Running headers\n\
- Running footers\n\
- Copyright notices\n\
- Publisher information\n\
- Index pages\n\
- Table of contents pages\n\
These are not songs.\n\
Exclude them only when confidence is very high.\n\
If confidence is low, preserve the text and add a warning.\n\
Many scanned hymn books contain OCR mistakes.\n\
Examples:\n\
G0D instead of GOD\n\
L0RD instead of LORD\n\
rn instead of m\n\
l instead of I\n\
Only correct errors when the intended text is obvious.\n\
Otherwise preserve the original.\n\
Church documents frequently repeat choruses.\n\
Repeated text does not necessarily mean duplication.\n\
Do not remove repeated sections.\n\
Preserve all meaningful content.\n\n\
Since many Nigerian churches use CCC books:\n\
Documents may contain bilingual content.\n\
Examples:\n\
English + Yoruba\n\
English + Twi\n\
English + French\n\
Do not separate bilingual sections into different songs.\n\
Keep them together when they clearly belong to the same hymn.\n\
Examples:\n\
Verse 1 (English)\n\
Verse 1 (Yoruba)\n\
should remain inside the same song.\n\
Do not translate.\n\
Do not merge languages.\n\
Preserve original ordering.{}\n\n\
INPUT TEXT:\n{}",
        chunk_context, request.text
    )
}

#[tauri::command]
fn get_worship_import_ai_status() -> WorshipImportAiStatus {
    WorshipImportAiStatus {
        ai_configured: get_opencode_api_key()
            .map(|value| !value.trim().is_empty())
            .unwrap_or(false),
        model: OPENCODE_MODEL.to_string(),
    }
}

#[tauri::command]
fn structure_worship_import_chunk(
    request: WorshipImportStructureRequest,
) -> Result<WorshipImportStructureResponse, String> {
    let api_key = get_opencode_api_key()?;
    let client = build_opencode_client(45)?;
    let system_prompt = build_worship_import_system_prompt();
    let user_prompt = build_worship_import_user_prompt(&request);

    let request_body = serde_json::json!({
        "model": OPENCODE_MODEL,
        "messages": [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        "temperature": 0.0,
        "max_tokens": 32768,
        "response_format": { "type": "json_object" }
    });

    let mut resp = client
        .post(format!("{}/chat/completions", OPENCODE_BASE_URL))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&request_body)
        .send()
        .map_err(|e| format!("Worship import structure request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();

        if status.as_u16() == 400 && text.to_lowercase().contains("response_format") {
            let fallback_body = serde_json::json!({
                "model": OPENCODE_MODEL,
                "messages": [
                    { "role": "system", "content": system_prompt },
                    { "role": "user", "content": user_prompt }
                ],
                "temperature": 0.0,
                "max_tokens": 32768
            });

            resp = client
                .post(format!("{}/chat/completions", OPENCODE_BASE_URL))
                .header("Content-Type", "application/json")
                .header("Authorization", format!("Bearer {}", api_key))
                .json(&fallback_body)
                .send()
                .map_err(|e| format!("Worship import structure retry failed: {}", e))?;

            if !resp.status().is_success() {
                let retry_status = resp.status();
                let retry_text = resp.text().unwrap_or_default();
                return Err(format!(
                    "OpenCode API returned {}: {}",
                    retry_status, retry_text
                ));
            }
        } else {
            return Err(format!("OpenCode API returned {}: {}", status, text));
        }
    }

    let data: serde_json::Value = resp
        .json()
        .map_err(|e| format!("Failed to parse worship structure response: {}", e))?;

    let content = data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("Worship import structure returned empty content")?;

    let payload = extract_json_payload(content);
    serde_json::from_str::<WorshipImportStructureResponse>(payload)
        .map_err(|e| format!("Failed to parse worship import structure JSON: {}", e))
}

#[tauri::command]
fn review_worship_import_batch(
    request: WorshipImportReviewRequest,
) -> Result<WorshipImportReviewResponse, String> {
    let api_key = get_opencode_api_key()?;
    let prompt = build_worship_import_review_prompt(&request)?;
    let client = build_opencode_client(120)?;

    let body = serde_json::json!({
        "model": OPENCODE_MODEL,
        "messages": [
            { "role": "system", "content": "Return valid JSON only. Never generate or rewrite lyrics." },
            { "role": "user", "content": prompt }
        ],
        "temperature": 0.0
    });

    let resp = client
        .post(format!("{}/chat/completions", OPENCODE_BASE_URL))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .map_err(|e| format!("Worship import review request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().unwrap_or_default();
        return Err(format!(
            "Worship import review API returned {}: {}",
            status, text
        ));
    }

    let data: serde_json::Value = resp
        .json()
        .map_err(|e| format!("Failed to parse worship review response: {}", e))?;

    let content = data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("Worship import review returned empty content")?;

    let payload = extract_json_payload(content);
    serde_json::from_str::<WorshipImportReviewResponse>(payload)
        .map_err(|e| format!("Failed to parse worship import review JSON: {}", e))
}

#[tauri::command]
fn translate_transcript(
    transcript_text: String,
    target_language: String,
) -> Result<String, String> {
    let api_key = get_opencode_api_key()?;

    let prompt = format!(
        "Translate the following sermon transcript into {target_language}.\n\
         STRICT REQUIREMENTS:\n\
         - Produce fluent, natural, native-quality {target_language}.\n\
         - Use the official writing system and orthography of {target_language}.\n\
         - Preserve ALL language-specific characters, accents, diacritics, tone marks, vowel marks, underdots, cedillas, umlauts, tildes, ligatures, and other orthographic symbols required for correct writing.\n\
         - Never transliterate into plain ASCII.\n\
         - Never remove, simplify, or replace language-specific characters.\n\
         - Use the spelling conventions used by educated native speakers, published literature, news media, and religious texts in {target_language}.\n\
         - Maintain the original meaning, tone, and intent.\n\
         - Preserve speaker labels exactly.\n\
         - Preserve all timestamps (HH:MM:SS) exactly as they appear.\n\
         - Preserve Bible references exactly.\n\
         - Preserve verse numbers exactly.\n\
         - Preserve paragraph breaks and formatting where possible.\n\
         - Do not summarize.\n\
         - Do not omit content.\n\
         - Do not explain the translation.\n\
         - Do not add translator notes.\n\
         - Do not add commentary.\n\
         - Output ONLY the translated transcript.\n\n\
         QUALITY CHECK BEFORE RESPONDING:\n\
         Verify that the translation uses the correct native orthography for {target_language} and includes all required language-specific characters and diacritics where appropriate. If the language normally uses accented or marked characters, they must be present in the final output.\n\n\
         EXAMPLES OF CORRECT ORTHOGRAPHY:\n\
         English: God is good.\n\
         French: Dieu est bon.\n\
         Spanish: Dios es bueno.\n\
         Portuguese: Deus é bom.\n\
         Yoruba: Ọlọ́run dára.\n\
         Vietnamese: Chúa thật tốt.\n\
         Use the same level of orthographic accuracy for the target language.\n\n\
         Transcript:\n{transcript_text}"
    );

    let client = build_opencode_client(120)?;

    let body = serde_json::json!({
        "model": OPENCODE_MODEL,
        "messages": [{ "role": "user", "content": prompt }],
        "temperature": 0.3
    });

    let resp = client
        .post(format!("{}/chat/completions", OPENCODE_BASE_URL))
        .header("Content-Type", "application/json")
        .header("Authorization", format!("Bearer {}", api_key))
        .json(&body)
        .send()
        .map_err(|e| format!("Translation request failed: {}", e))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().unwrap_or_default();
        return Err(format!("Translation API returned {}: {}", status, text));
    }

    let data: serde_json::Value = resp
        .json()
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    let content = data
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
        .ok_or("Translation returned empty content")?
        .to_string();

    Ok(content)
}

/// Fix WinAnsi-mapped Twi/Akan text extracted from PDFs.
///
/// Mobile app PDFs use custom fonts (Capecoast, Wogyaf, TwiTimes) with WinAnsi
/// encoding that map ASCII codes to Twi glyphs:
///   - '4' (0x34) → ɔ (U+0254)
///   - '1' (0x31) → ɛ (U+025B)
///   - '$' (0x24) → ɛ (U+025B)  (at word start)
///   - '!' (0x21) → Ɔ (U+0186)  (at word start, capital ɔ)
///
/// pdftotext extracts the raw ASCII codes, not the visual glyphs.
/// This function replaces them when they appear in word-internal positions.
fn fix_winansi_twi(text: String) -> String {
    let chars: Vec<char> = text.chars().collect();
    let len = chars.len();
    let mut result = String::with_capacity(text.len());

    for i in 0..len {
        let ch = chars[i];
        if ch == '4' || ch == '1' {
            // Adjacent to lowercase letter → inside a Twi word
            let prev_lower = i > 0 && chars[i - 1].is_ascii_lowercase();
            let next_lower = i + 1 < len && chars[i + 1].is_ascii_lowercase();
            if prev_lower || next_lower {
                result.push(if ch == '4' { 'ɔ' } else { 'ɛ' });
                continue;
            }
        } else if ch == '$' {
            // '$' at start of word followed by lowercase → Twi 'ɛ'
            let next_lower = i + 1 < len && chars[i + 1].is_ascii_lowercase();
            let prev_not_letter = i == 0 || !chars[i - 1].is_ascii_alphabetic();
            if next_lower && prev_not_letter {
                result.push('ɛ');
                continue;
            }
        } else if ch == '!' {
            // '!' at start of word followed by lowercase → Twi 'Ɔ' (capital)
            let next_lower = i + 1 < len && chars[i + 1].is_ascii_lowercase();
            let prev_not_letter = i == 0 || !chars[i - 1].is_ascii_alphabetic();
            if next_lower && prev_not_letter {
                result.push('\u{0186}'); // Ɔ
                continue;
            }
        }
        result.push(ch);
    }
    result
}

#[tauri::command]
fn extract_text_from_pdf(file_data: Vec<u8>) -> Result<String, String> {
    use std::io::Write;
    let mut tmp =
        tempfile::NamedTempFile::new().map_err(|e| format!("Failed to create temp file: {}", e))?;
    tmp.write_all(&file_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    let path = tmp.into_temp_path();

    // pdftotext (Poppler) handles CMap/Unicode encodings correctly for
    // African-language fonts (Twi, Yoruba, Igbo) where the pdf-extract
    // crate corrupts ɛ→1 and ɔ→4 by falling back to raw glyph indices.
    //
    // Tauri-packaged apps have a minimal PATH, so we probe known install
    // locations on macOS and Linux before relying on bare PATH lookup.
    let pdftotext_candidates: &[&str] = &[
        "pdftotext",                   // PATH lookup (dev mode)
        "/opt/homebrew/bin/pdftotext", // Homebrew — Apple Silicon
        "/usr/local/bin/pdftotext",    // Homebrew — Intel Mac
        "/usr/bin/pdftotext",          // system / apt install
        "/usr/bin/pdftotext",          // Linux package manager
        "/snap/bin/pdftotext",         // Linux snap
    ];

    let mut last_error = String::new();

    if let Some(path_str) = path.to_str() {
        for candidate in pdftotext_candidates {
            eprintln!("[pdf-extract] trying: {} on file {}", candidate, path_str);
            match std::process::Command::new(candidate)
                .arg("-layout")
                .arg("-enc")
                .arg("UTF-8")
                .arg(path_str)
                .arg("-")
                .output()
            {
                Ok(output) => {
                    if output.status.success() {
                        let text = String::from_utf8_lossy(&output.stdout).to_string();
                        if !text.trim().is_empty() {
                            eprintln!(
                                "[pdf-extract] SUCCESS with {} — {} bytes",
                                candidate,
                                text.len()
                            );
                            return Ok(fix_winansi_twi(text));
                        }
                        last_error = format!("{} produced empty output", candidate);
                        eprintln!("[pdf-extract] {} produced empty output", candidate);
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                        last_error = format!(
                            "{} failed (exit {:?}): {}",
                            candidate,
                            output.status.code(),
                            stderr
                        );
                        eprintln!("[pdf-extract] {} failed: {}", candidate, stderr);
                    }
                }
                Err(e) => {
                    last_error = format!("{} not found: {}", candidate, e);
                    eprintln!("[pdf-extract] {} not found: {}", candidate, e);
                }
            }
        }
    }

    eprintln!(
        "[pdf-extract] all pdftotext candidates failed ({}), falling back to pdf-extract crate",
        last_error
    );

    // pdf-extract fallback — known to corrupt non-Latin Unicode characters
    // when PDF fonts use non-standard glyph names. Last resort only.
    pdf_extract::extract_text(&path)
        .map(fix_winansi_twi)
        .map_err(|e| format!("PDF extraction failed: {}", e))
}

// ── Layout-aware PDF extraction (lopdf) ────────────────────────────────────

/// Minimal PDF content stream parser — produces lopdf Operations from raw bytes.
/// Handles only the operators needed for text extraction (BT, ET, Tf, Tm, Td, TD, Tj, TJ, T*)
/// plus enough of the operand grammar to reach them.
fn parse_content_stream(raw: &[u8]) -> Vec<lopdf::content::Operation> {
    let mut ops = Vec::new();
    let mut operands: Vec<lopdf::Object> = Vec::new();
    let bytes = raw;
    let len = bytes.len();
    let mut i = 0;

    while i < len {
        let b = bytes[i];
        match b {
            // Skip whitespace
            b' ' | b'\t' | b'\r' | b'\n' | b'\x0C' => {
                i += 1;
            }
            // Skip comments (% to end of line)
            b'%' => {
                while i < len && bytes[i] != b'\n' {
                    i += 1;
                }
            }
            // Integer or real number
            b'0'..=b'9' | b'-' | b'+' | b'.' => {
                let start = i;
                i += 1;
                while i < len && matches!(bytes[i], b'0'..=b'9' | b'.' | b'-' | b'+') {
                    i += 1;
                }
                let s = std::str::from_utf8(&bytes[start..i]).unwrap_or("0");
                if s.contains('.') {
                    if let Ok(v) = s.parse::<f64>() {
                        operands.push(lopdf::Object::Real(v as f32));
                    }
                } else if let Ok(v) = s.parse::<i64>() {
                    operands.push(lopdf::Object::Integer(v));
                }
            }
            // Name object (/Something)
            b'/' => {
                i += 1;
                let start = i;
                while i < len {
                    match bytes[i] {
                        b' ' | b'\t' | b'\r' | b'\n' | b'/' | b'(' | b')' | b'<' | b'>' | b'['
                        | b']' | b'{' | b'}' => break,
                        _ => {
                            i += 1;
                        }
                    }
                }
                let name = bytes[start..i].to_vec();
                operands.push(lopdf::Object::Name(name));
            }
            // Literal string (text in parentheses)
            b'(' => {
                i += 1;
                let mut s = Vec::new();
                let mut depth = 0i32;
                while i < len {
                    match bytes[i] {
                        b'(' => {
                            depth += 1;
                            s.push(b'(');
                            i += 1;
                        }
                        b')' => {
                            if depth > 0 {
                                depth -= 1;
                                s.push(b')');
                                i += 1;
                            } else {
                                i += 1;
                                break;
                            }
                        }
                        b'\\' => {
                            i += 1;
                            if i < len {
                                match bytes[i] {
                                    b'n' => s.push(b'\n'),
                                    b'r' => s.push(b'\r'),
                                    b't' => s.push(b'\t'),
                                    b'\\' => s.push(b'\\'),
                                    b'(' => s.push(b'('),
                                    b')' => s.push(b')'),
                                    d @ b'0'..=b'7' => {
                                        let mut oct = (d - b'0') as u32;
                                        i += 1;
                                        for _ in 0..2 {
                                            if i < len && matches!(bytes[i], b'0'..=b'7') {
                                                oct = oct * 8 + (bytes[i] - b'0') as u32;
                                                i += 1;
                                            } else {
                                                break;
                                            }
                                        }
                                        s.push(oct as u8);
                                        continue; // already advanced i
                                    }
                                    other => s.push(other),
                                }
                                i += 1;
                            }
                        }
                        _ => {
                            s.push(bytes[i]);
                            i += 1;
                        }
                    }
                }
                operands.push(lopdf::Object::String(s, lopdf::StringFormat::Literal));
            }
            // Hex string <AABB>
            b'<' => {
                i += 1;
                let mut hex = Vec::new();
                while i < len && bytes[i] != b'>' {
                    hex.push(bytes[i]);
                    i += 1;
                }
                if i < len {
                    i += 1;
                } // skip >
                  // Pad to even length
                if hex.len() % 2 != 0 {
                    hex.push(b'0');
                }
                let mut bytes_out = Vec::new();
                for chunk in hex.chunks(2) {
                    if let Ok(h) = std::str::from_utf8(chunk) {
                        if let Ok(b) = u8::from_str_radix(h, 16) {
                            bytes_out.push(b);
                        }
                    }
                }
                operands.push(lopdf::Object::String(
                    bytes_out,
                    lopdf::StringFormat::Hexadecimal,
                ));
            }
            // Array [...]
            b'[' => {
                i += 1;
                let mut arr = Vec::new();
                // Parse array elements recursively (simplified — only strings and numbers)
                while i < len && bytes[i] != b']' {
                    match bytes[i] {
                        b' ' | b'\t' | b'\r' | b'\n' => {
                            i += 1;
                        }
                        b'(' => {
                            // literal string inside array
                            i += 1;
                            let mut s = Vec::new();
                            while i < len && bytes[i] != b')' {
                                if bytes[i] == b'\\' && i + 1 < len {
                                    i += 1;
                                    match bytes[i] {
                                        b'n' => s.push(b'\n'),
                                        b'r' => s.push(b'\r'),
                                        b'\\' => s.push(b'\\'),
                                        b'(' => s.push(b'('),
                                        b')' => s.push(b')'),
                                        other => s.push(other),
                                    }
                                } else {
                                    s.push(bytes[i]);
                                }
                                i += 1;
                            }
                            if i < len {
                                i += 1;
                            }
                            arr.push(lopdf::Object::String(s, lopdf::StringFormat::Literal));
                        }
                        b'0'..=b'9' | b'-' | b'+' | b'.' => {
                            let start = i;
                            i += 1;
                            while i < len && matches!(bytes[i], b'0'..=b'9' | b'.' | b'-' | b'+') {
                                i += 1;
                            }
                            let s = std::str::from_utf8(&bytes[start..i]).unwrap_or("0");
                            if s.contains('.') {
                                if let Ok(v) = s.parse::<f64>() {
                                    arr.push(lopdf::Object::Real(v as f32));
                                }
                            } else if let Ok(v) = s.parse::<i64>() {
                                arr.push(lopdf::Object::Integer(v));
                            }
                        }
                        _ => {
                            i += 1;
                        } // skip unknown in arrays
                    }
                }
                if i < len {
                    i += 1;
                } // skip ]
                operands.push(lopdf::Object::Array(arr));
            }
            // Boolean true / false
            b't' if i + 3 < len && &bytes[i..i + 4] == b"true" => {
                operands.push(lopdf::Object::Boolean(true));
                i += 4;
            }
            b'f' if i + 4 < len && &bytes[i..i + 5] == b"false" => {
                operands.push(lopdf::Object::Boolean(false));
                i += 5;
            }
            // Operator (keyword)
            b'A'..=b'Z' | b'a'..=b'z' => {
                let start = i;
                while i < len && matches!(bytes[i], b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'*')
                {
                    i += 1;
                }
                let op = std::str::from_utf8(&bytes[start..i]).unwrap_or("");
                ops.push(lopdf::content::Operation {
                    operator: op.to_string(),
                    operands: operands.drain(..).collect(),
                });
            }
            // Object reference (obj gen R) — skip
            _ => {
                i += 1;
            }
        }
    }
    ops
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct PdfTextElement {
    text: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    font_size: f64,
    is_bold: bool,
    page: u32,
}

/// Decode a PDF string object to UTF-8, trying raw bytes first then Latin-1 fallback.
fn decode_pdf_string(obj: &lopdf::Object) -> Option<String> {
    if let lopdf::Object::String(bytes, _format) = obj {
        if let Ok(s) = String::from_utf8(bytes.clone()) {
            return Some(s);
        }
        // Latin-1 fallback — every byte maps to a valid codepoint
        Some(bytes.iter().map(|&b| b as char).collect())
    } else {
        None
    }
}

/// Build a map of font_name → is_bold from a page's resource dictionary.
fn build_page_font_map(
    doc: &lopdf::Document,
    page_id: lopdf::ObjectId,
) -> std::collections::HashMap<String, bool> {
    let mut font_map = std::collections::HashMap::new();
    let Ok(page) = doc.get_object(page_id) else {
        return font_map;
    };
    let Ok(page_dict) = page.as_dict() else {
        return font_map;
    };
    let Ok(resources) = page_dict.get(b"Resources") else {
        return font_map;
    };
    let Ok(resources_dict) = resources.as_dict() else {
        return font_map;
    };
    let Ok(fonts) = resources_dict.get(b"Font") else {
        return font_map;
    };
    let Ok(font_dict) = fonts.as_dict() else {
        return font_map;
    };

    for (name, font_ref) in font_dict.iter() {
        let name_str = String::from_utf8_lossy(name).to_string();
        // Font dict values can be direct dicts or references — resolve either way
        let font_obj_result = match font_ref {
            lopdf::Object::Reference(id) => doc.get_object(*id),
            other => Ok(other),
        };
        if let Ok(font_obj) = font_obj_result {
            if let Ok(font) = font_obj.as_dict() {
                let is_bold = font
                    .get(b"BaseFont")
                    .and_then(|bf| bf.as_name())
                    .map(|n| {
                        let lower = String::from_utf8_lossy(n).to_lowercase();
                        lower.contains("bold")
                    })
                    .unwrap_or(false);
                font_map.insert(name_str, is_bold);
            }
        }
    }
    font_map
}

/// Extract text elements with position metadata from a page's content stream.
fn extract_page_text_elements(
    operations: &[lopdf::content::Operation],
    font_map: &std::collections::HashMap<String, bool>,
    page_num: u32,
    page_height: f64,
) -> Vec<PdfTextElement> {
    let mut elements = Vec::new();
    // Current text matrix [a, b, c, d, e, f]
    let mut tm = [1.0f64, 0.0, 0.0, 1.0, 0.0, 0.0];
    let mut font_size = 12.0f64;
    let mut is_bold = false;
    let mut buf = String::new();
    let mut line_x = 0.0f64;
    let mut line_y = 0.0f64;

    let flush = |buf: &mut String,
                 elements: &mut Vec<PdfTextElement>,
                 line_x: f64,
                 line_y: f64,
                 font_size: f64,
                 is_bold: bool,
                 page_num: u32,
                 page_height: f64| {
        if !buf.is_empty() {
            let text = fix_winansi_twi(buf.clone());
            let char_count = text.chars().count() as f64;
            elements.push(PdfTextElement {
                text,
                x: line_x,
                y: page_height - line_y, // flip to top-down coordinates
                width: char_count * font_size * 0.6,
                height: font_size * 1.2,
                font_size,
                is_bold,
                page: page_num,
            });
            buf.clear();
        }
    };

    for op in operations {
        match op.operator.as_str() {
            "BT" => {
                // Begin text — flush any pending text
                flush(
                    &mut buf,
                    &mut elements,
                    line_x,
                    line_y,
                    font_size,
                    is_bold,
                    page_num,
                    page_height,
                );
                tm = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];
                line_x = 0.0;
                line_y = 0.0;
            }
            "ET" => {
                flush(
                    &mut buf,
                    &mut elements,
                    line_x,
                    line_y,
                    font_size,
                    is_bold,
                    page_num,
                    page_height,
                );
            }
            "Tf" => {
                // Set font: [name, size]
                if let Some(lopdf::Object::Name(name)) = op.operands.first() {
                    let name_str = String::from_utf8_lossy(name).to_string();
                    if let Some(&bold) = font_map.get(&name_str) {
                        is_bold = bold;
                    }
                }
                if let Some(size_obj) = op.operands.get(1) {
                    font_size = match size_obj {
                        lopdf::Object::Integer(i) => *i as f64,
                        lopdf::Object::Real(r) => *r as f64,
                        _ => font_size,
                    };
                }
            }
            "Tm" => {
                // Set text matrix: [a, b, c, d, e, f]
                if op.operands.len() >= 6 {
                    for i in 0..6 {
                        if let Some(obj) = op.operands.get(i) {
                            tm[i] = match obj {
                                lopdf::Object::Integer(v) => *v as f64,
                                lopdf::Object::Real(v) => *v as f64,
                                _ => tm[i],
                            };
                        }
                    }
                    flush(
                        &mut buf,
                        &mut elements,
                        line_x,
                        line_y,
                        font_size,
                        is_bold,
                        page_num,
                        page_height,
                    );
                    line_x = tm[4];
                    line_y = tm[5];
                }
            }
            "Td" | "TD" => {
                // Relative text move: [tx, ty]
                if op.operands.len() >= 2 {
                    let tx = match &op.operands[0] {
                        lopdf::Object::Integer(v) => *v as f64,
                        lopdf::Object::Real(v) => *v as f64,
                        _ => 0.0,
                    };
                    let ty = match &op.operands[1] {
                        lopdf::Object::Integer(v) => *v as f64,
                        lopdf::Object::Real(v) => *v as f64,
                        _ => 0.0,
                    };
                    // For non-rotated text (b=c=0, a=d=1), Td adds directly
                    line_x += tx * tm[0] + ty * tm[2];
                    line_y += tx * tm[1] + ty * tm[3];
                    flush(
                        &mut buf,
                        &mut elements,
                        line_x,
                        line_y,
                        font_size,
                        is_bold,
                        page_num,
                        page_height,
                    );
                }
            }
            "Tj" => {
                // Show text string
                if let Some(text_obj) = op.operands.first() {
                    if let Some(text) = decode_pdf_string(text_obj) {
                        if buf.is_empty() {
                            line_x = tm[4];
                            line_y = tm[5];
                        }
                        buf.push_str(&text);
                    }
                }
            }
            "TJ" => {
                // Show text with individual glyph positioning: array of strings and numbers
                if let Some(lopdf::Object::Array(items)) = op.operands.first() {
                    for item in items {
                        match item {
                            lopdf::Object::String(..) => {
                                if let Some(text) = decode_pdf_string(item) {
                                    if buf.is_empty() {
                                        line_x = tm[4];
                                        line_y = tm[5];
                                    }
                                    buf.push_str(&text);
                                }
                            }
                            lopdf::Object::Integer(offset) => {
                                // Large negative offset → kerning gap, flush segment
                                if *offset < -100 && !buf.is_empty() {
                                    flush(
                                        &mut buf,
                                        &mut elements,
                                        line_x,
                                        line_y,
                                        font_size,
                                        is_bold,
                                        page_num,
                                        page_height,
                                    );
                                }
                            }
                            lopdf::Object::Real(offset) => {
                                if (*offset as f64) < -100.0 && !buf.is_empty() {
                                    flush(
                                        &mut buf,
                                        &mut elements,
                                        line_x,
                                        line_y,
                                        font_size,
                                        is_bold,
                                        page_num,
                                        page_height,
                                    );
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            "T*" => {
                // Move to next line (vertical tab) — default leading = font_size
                if !buf.is_empty() {
                    flush(
                        &mut buf,
                        &mut elements,
                        line_x,
                        line_y,
                        font_size,
                        is_bold,
                        page_num,
                        page_height,
                    );
                }
                line_y -= font_size;
            }
            _ => {}
        }
    }

    // Flush any remaining text
    flush(
        &mut buf,
        &mut elements,
        line_x,
        line_y,
        font_size,
        is_bold,
        page_num,
        page_height,
    );
    elements
}

/// Extract text elements with full position and font metadata from a PDF.
///
/// Returns a JSON-serializable array of `{ text, x, y, width, height, fontSize, isBold, page }`.
/// Coordinates use top-down y (y=0 at top of page). Font sizes are in PDF points (1/72 inch).
#[tauri::command]
fn extract_text_elements_from_pdf(file_data: Vec<u8>) -> Result<Vec<PdfTextElement>, String> {
    let doc = lopdf::Document::load_mem(&file_data)
        .map_err(|e| format!("Failed to parse PDF with lopdf: {}", e))?;

    let pages = doc.get_pages();
    let mut all_elements = Vec::new();

    for (&page_num, &page_id) in pages.iter() {
        // Get page height from MediaBox
        let page_height = {
            let mut h = 792.0; // default letter size
            if let Ok(page) = doc.get_object(page_id) {
                if let Ok(dict) = page.as_dict() {
                    if let Ok(mb) = dict.get(b"MediaBox") {
                        if let Ok(arr) = mb.as_array() {
                            if arr.len() >= 4 {
                                h = match &arr[3] {
                                    lopdf::Object::Integer(v) => *v as f64,
                                    lopdf::Object::Real(v) => *v as f64,
                                    _ => h,
                                };
                            }
                        }
                    }
                }
            }
            h
        };

        let font_map = build_page_font_map(&doc, page_id);

        // Decode content stream using our custom parser
        let raw_content = match doc.get_page_content(page_id) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };
        let operations = parse_content_stream(&raw_content);

        let elements = extract_page_text_elements(&operations, &font_map, page_num, page_height);
        all_elements.extend(elements);
    }

    Ok(all_elements)
}

/// Start a tiny HTTP server that serves files from the frontend dist folder.
/// Runs in a background thread. Returns the port it bound to, or 0 if it failed.
fn start_overlay_server(resource_dir: std::path::PathBuf) -> u16 {
    // Resolve the uploads directory for serving user-uploaded files
    let uploads_dir = app_dir().ok().map(|d| d.join("uploads"));

    // In dev mode, resource_dir points to <project>/public/ but Vite multi-page
    // entry points (dock.html) live in the project root. Resolve the project
    // root so we can use it as a fallback when a file isn't found in resource_dir.
    let project_root_dir: Option<std::path::PathBuf> = {
        // resource_dir is <project>/public in dev — parent is the project root
        let parent = resource_dir.parent().map(|p| p.to_path_buf());
        // Only use this fallback if the parent contains dock.html (i.e. we're in dev)
        parent.filter(|p| p.join("dock.html").is_file())
    };

    // Use a fixed port so the OBS dock / overlay URL never changes
    let server = match tiny_http::Server::http("0.0.0.0:45678") {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[Overlay Server] Failed to start: {}. Overlay URLs will fall back to window.location.origin.", e);
            return 0;
        }
    };

    let port = match server.server_addr().to_ip() {
        Some(addr) => addr.port(),
        None => {
            eprintln!("[Overlay Server] Could not determine server port.");
            return 0;
        }
    };
    OVERLAY_PORT.store(port, Ordering::Relaxed);
    println!(
        "[Overlay Server] Serving files from {:?} on http://127.0.0.1:{}",
        resource_dir, port
    );

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let url_path = request.url().to_string();
            // Strip query string and leading slash
            let clean = url_path.split('?').next().unwrap_or(&url_path);
            let clean = clean.trim_start_matches('/');

            // Friendly default route: allow opening the base URL directly
            // (http://<lan-ip>:<port>/) from another laptop to verify reachability.
            if clean.is_empty() || clean == "health" {
                let body = if clean == "health" {
                    r#"{"ok":true,"service":"MakeChurchEasy overlay server"}"#.to_string()
                } else {
                    format!(
                        r#"<!doctype html>
<html><head><meta charset="utf-8"><title>MakeChurchEasy Overlay Server</title>
<style>body{{margin:0;min-height:100vh;display:grid;place-items:center;background:#0F172A;color:#F8FAFC;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}}main{{max-width:680px;padding:32px;border:1px solid #334155;border-radius:16px;background:#111827}}h1{{margin:0 0 12px;font-size:28px}}p{{margin:0 0 12px;color:#CBD5E1;line-height:1.6}}code{{display:block;margin-top:8px;padding:10px 12px;border-radius:10px;background:#1F2937;color:#93C5FD}}</style>
</head><body><main>
<h1>MakeChurchEasy overlay server is running</h1>
<p>This address is reachable. OBS browser sources should load specific overlay files from this server.</p>
<p>Test Bible overlay:</p>
<code>http://&lt;this-ip&gt;:{}/mce-bible-overlay.html</code>
<p>Health check:</p>
<code>http://&lt;this-ip&gt;:{}/health</code>
</main></body></html>"#,
                        port, port
                    )
                };
                let content_type = if clean == "health" {
                    "application/json; charset=utf-8"
                } else {
                    "text/html; charset=utf-8"
                };
                let header = tiny_http::Header::from_bytes("Content-Type", content_type).unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let resp = tiny_http::Response::from_string(body)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // Security: don't allow path traversal
            if clean.contains("..") {
                let resp = tiny_http::Response::from_string("Forbidden").with_status_code(403);
                let _ = request.respond(resp);
                continue;
            }

            // API: save a complete Dock session export to the user's Downloads folder.
            // The Dock can run inside OBS's embedded browser, where Blob downloads can
            // create a zero-byte file. Writing through the local server keeps the export
            // reliable in that environment.
            if clean == "api/save-dock-session" && request.method() == &tiny_http::Method::Options {
                let resp = tiny_http::Response::from_string("")
                    .with_header(overlay_header("Access-Control-Allow-Origin", "*"))
                    .with_header(overlay_header(
                        "Access-Control-Allow-Methods",
                        "POST, OPTIONS",
                    ))
                    .with_header(overlay_header(
                        "Access-Control-Allow-Headers",
                        "Content-Type",
                    ));
                let _ = request.respond(resp);
                continue;
            }

            if clean == "api/save-dock-session" && request.method() == &tiny_http::Method::Post {
                let mut body = String::new();
                if request.as_reader().read_to_string(&mut body).is_err() || body.trim().is_empty()
                {
                    let resp = tiny_http::Response::from_string(
                        r#"{"error":"A Dock session JSON body is required"}"#,
                    )
                    .with_status_code(400);
                    let _ = request.respond(resp);
                    continue;
                }

                let is_dock_session = serde_json::from_str::<serde_json::Value>(&body)
                    .ok()
                    .and_then(|value| {
                        value
                            .get("_format")
                            .and_then(|format| format.as_str())
                            .map(|format| format == "makechurch-easy-dock-session")
                    })
                    .unwrap_or(false);
                if !is_dock_session {
                    let resp = tiny_http::Response::from_string(
                        r#"{"error":"Invalid MakeChurchEasy Dock session"}"#,
                    )
                    .with_status_code(400);
                    let _ = request.respond(resp);
                    continue;
                }

                let requested_name = url_path
                    .find('?')
                    .and_then(|index| {
                        url_path[index + 1..]
                            .split('&')
                            .find(|part| part.starts_with("filename="))
                            .map(|part| &part[9..])
                    })
                    .map(|value| urlencoding::decode(value).unwrap_or_default().into_owned())
                    .unwrap_or_else(|| "makechurch-easy-dock-session.json".to_string());
                let safe_name = match sanitize_filename_for_storage(&requested_name) {
                    Ok(name) => name,
                    Err(error) => {
                        let json = serde_json::json!({ "error": error }).to_string();
                        let resp = tiny_http::Response::from_string(json).with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }
                };
                let downloads_dir = match dirs::download_dir()
                    .or_else(|| dirs::home_dir().map(|home| home.join("Downloads")))
                {
                    Some(path) => path,
                    None => {
                        let resp = tiny_http::Response::from_string(
                            r#"{"error":"Could not determine the Downloads folder"}"#,
                        )
                        .with_status_code(500);
                        let _ = request.respond(resp);
                        continue;
                    }
                };

                if let Err(error) = fs::create_dir_all(&downloads_dir) {
                    let json = serde_json::json!({
                        "error": format!("Could not create Downloads folder: {}", error)
                    })
                    .to_string();
                    let resp = tiny_http::Response::from_string(json).with_status_code(500);
                    let _ = request.respond(resp);
                    continue;
                }

                let destination = downloads_dir.join(safe_name);
                match fs::write(&destination, body.as_bytes()) {
                    Ok(()) => {
                        let path = destination.to_string_lossy().to_string();
                        println!(
                            "[Overlay API] Saved Dock session: {} ({} bytes)",
                            path,
                            body.len()
                        );
                        let json = serde_json::json!({
                            "path": path,
                            "bytes": body.len()
                        })
                        .to_string();
                        let resp = tiny_http::Response::from_string(json)
                            .with_header(overlay_header(
                                "Content-Type",
                                "application/json; charset=utf-8",
                            ))
                            .with_header(overlay_header("Access-Control-Allow-Origin", "*"));
                        let _ = request.respond(resp);
                    }
                    Err(error) => {
                        let json = serde_json::json!({
                            "error": format!("Could not save Dock session: {}", error)
                        })
                        .to_string();
                        let resp = tiny_http::Response::from_string(json).with_status_code(500);
                        let _ = request.respond(resp);
                    }
                }
                continue;
            }

            // API: list uploaded files as JSON array
            if clean == "api/uploads" {
                let mut files: Vec<String> = Vec::new();
                if let Some(ref udir) = uploads_dir {
                    if udir.exists() {
                        if let Ok(entries) = fs::read_dir(udir) {
                            for entry in entries.flatten() {
                                if let Ok(ft) = entry.file_type() {
                                    if ft.is_file() {
                                        if let Some(name) = entry.file_name().to_str() {
                                            // Multiview frame/pattern assets are implementation
                                            // details for OBS, not user media.
                                            if name.starts_with("mv-frame-")
                                                || name.starts_with("mv-pattern-")
                                            {
                                                continue;
                                            }
                                            files.push(name.to_string());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                files.sort();
                let json = serde_json::to_string(&files).unwrap_or_else(|_| "[]".to_string());
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let resp = tiny_http::Response::from_string(json)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: return the absolute path to the uploads directory
            if clean == "api/uploads-dir" {
                let dir_path = uploads_dir
                    .as_ref()
                    .and_then(|d| d.to_str())
                    .unwrap_or("")
                    .to_string();
                let json = serde_json::json!({ "path": dir_path }).to_string();
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let resp = tiny_http::Response::from_string(json)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: check whether a local file exists.
            // GET /api/file-exists?path=/absolute/path/to/file
            if clean == "api/file-exists" {
                let file_path = url_path
                    .find('?')
                    .and_then(|i| {
                        url_path[i + 1..]
                            .split('&')
                            .find(|p| p.starts_with("path="))
                            .map(|p| &p[5..])
                    })
                    .map(|v| urlencoding::decode(v).unwrap_or_default().into_owned())
                    .unwrap_or_default();
                let exists = !file_path.is_empty() && std::path::Path::new(&file_path).is_file();
                let json = serde_json::json!({ "exists": exists }).to_string();
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let resp = tiny_http::Response::from_string(json)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: list template background videos from Cloudflare R2.
            if clean == "api/template-videos" {
                match list_template_video_assets_internal() {
                    Ok(items) => {
                        let json =
                            serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string());
                        let header = tiny_http::Header::from_bytes(
                            "Content-Type",
                            "application/json; charset=utf-8",
                        )
                        .unwrap();
                        let cors =
                            tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                .unwrap();
                        let resp = tiny_http::Response::from_string(json)
                            .with_header(header)
                            .with_header(cors);
                        let _ = request.respond(resp);
                    }
                    Err(error) => {
                        let json = serde_json::json!({ "error": error }).to_string();
                        let header = tiny_http::Header::from_bytes(
                            "Content-Type",
                            "application/json; charset=utf-8",
                        )
                        .unwrap();
                        let cors =
                            tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                .unwrap();
                        let resp = tiny_http::Response::from_string(json)
                            .with_status_code(500)
                            .with_header(header)
                            .with_header(cors);
                        let _ = request.respond(resp);
                    }
                }
                continue;
            }

            // API: save a base64-encoded media file to disk, return absolute path
            // POST /api/save-media with JSON body { "fileName": "...", "dataUrl": "data:...;base64,..." }
            if clean == "api/save-media" && request.method() == &tiny_http::Method::Post {
                let mut body = String::new();
                if let Err(_) = request.as_reader().read_to_string(&mut body) {
                    let resp =
                        tiny_http::Response::from_string("Bad Request").with_status_code(400);
                    let _ = request.respond(resp);
                    continue;
                }
                let parsed: Result<serde_json::Value, _> = serde_json::from_str(&body);
                match parsed {
                    Ok(val) => {
                        let file_name = val.get("fileName").and_then(|v| v.as_str()).unwrap_or("");
                        let data_url = val.get("dataUrl").and_then(|v| v.as_str()).unwrap_or("");

                        if file_name.is_empty() || data_url.is_empty() {
                            let resp = tiny_http::Response::from_string(
                                r#"{"error":"fileName and dataUrl required"}"#,
                            )
                            .with_status_code(400);
                            let _ = request.respond(resp);
                            continue;
                        }

                        // Decode data-URL: "data:<mime>;base64,<data>"
                        let base64_data = if let Some(pos) = data_url.find(",") {
                            &data_url[pos + 1..]
                        } else {
                            data_url
                        };

                        use base64::Engine as _;
                        match base64::engine::general_purpose::STANDARD.decode(base64_data) {
                            Ok(bytes) => {
                                let file_bytes: &[u8] = &bytes;
                                if let Some(ref udir) = uploads_dir {
                                    let _ = fs::create_dir_all(udir);
                                    let safe_name = Path::new(file_name)
                                        .file_name()
                                        .and_then(|n| n.to_str())
                                        .unwrap_or(file_name);
                                    let dest = udir.join(safe_name);
                                    match fs::write(&dest, file_bytes) {
                                        Ok(_) => {
                                            let abs = dest.to_str().unwrap_or("").to_string();
                                            println!(
                                                "[Overlay API] Saved media: {} ({} bytes)",
                                                abs,
                                                bytes.len()
                                            );
                                            let json =
                                                serde_json::json!({ "path": abs }).to_string();
                                            let header = tiny_http::Header::from_bytes(
                                                "Content-Type",
                                                "application/json; charset=utf-8",
                                            )
                                            .unwrap();
                                            let cors = tiny_http::Header::from_bytes(
                                                "Access-Control-Allow-Origin",
                                                "*",
                                            )
                                            .unwrap();
                                            let resp = tiny_http::Response::from_string(json)
                                                .with_header(header)
                                                .with_header(cors);
                                            let _ = request.respond(resp);
                                        }
                                        Err(e) => {
                                            let json = serde_json::json!({ "error": format!("Write failed: {}", e) }).to_string();
                                            let resp = tiny_http::Response::from_string(json)
                                                .with_status_code(500);
                                            let _ = request.respond(resp);
                                        }
                                    }
                                } else {
                                    let resp = tiny_http::Response::from_string(
                                        r#"{"error":"uploads dir not available"}"#,
                                    )
                                    .with_status_code(500);
                                    let _ = request.respond(resp);
                                }
                            }
                            Err(e) => {
                                let json = serde_json::json!({ "error": format!("Base64 decode failed: {}", e) }).to_string();
                                let resp =
                                    tiny_http::Response::from_string(json).with_status_code(400);
                                let _ = request.respond(resp);
                            }
                        }
                        continue;
                    }
                    Err(_) => {
                        let resp = tiny_http::Response::from_string(r#"{"error":"Invalid JSON"}"#)
                            .with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }
                }
            }

            // API: save arbitrary dock JSON payloads to uploads/<name>.json
            // POST /api/save-dock-data with JSON body { "name": "...", "data": "..." }
            if clean == "api/save-dock-data" && request.method() == &tiny_http::Method::Post {
                let mut body = String::new();
                if request.as_reader().read_to_string(&mut body).is_err() {
                    let resp =
                        tiny_http::Response::from_string("Bad Request").with_status_code(400);
                    let _ = request.respond(resp);
                    continue;
                }

                let parsed: Result<serde_json::Value, _> = serde_json::from_str(&body);
                match parsed {
                    Ok(val) => {
                        let name = val.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let data = val.get("data").and_then(|v| v.as_str()).unwrap_or("");

                        if name.is_empty() {
                            let resp =
                                tiny_http::Response::from_string(r#"{"error":"name is required"}"#)
                                    .with_status_code(400);
                            let _ = request.respond(resp);
                            continue;
                        }

                        match write_dock_data(name, data) {
                            Ok(_) => {
                                let header = tiny_http::Header::from_bytes(
                                    "Content-Type",
                                    "application/json; charset=utf-8",
                                )
                                .unwrap();
                                let cors = tiny_http::Header::from_bytes(
                                    "Access-Control-Allow-Origin",
                                    "*",
                                )
                                .unwrap();
                                let resp = tiny_http::Response::from_string(r#"{"ok":true}"#)
                                    .with_header(header)
                                    .with_header(cors);
                                let _ = request.respond(resp);
                            }
                            Err(err) => {
                                let json = serde_json::json!({ "error": err }).to_string();
                                let resp =
                                    tiny_http::Response::from_string(json).with_status_code(500);
                                let _ = request.respond(resp);
                            }
                        }
                    }
                    Err(_) => {
                        let resp = tiny_http::Response::from_string(r#"{"error":"Invalid JSON"}"#)
                            .with_status_code(400);
                        let _ = request.respond(resp);
                    }
                }
                continue;
            }

            // API: save dock favorites — POST /api/save-dock-favorites with JSON body [...]
            // This allows the dock CEF browser to persist favorites back to the
            // overlay server even when it can't use Tauri invoke.
            if clean == "api/save-dock-favorites" && request.method() == &tiny_http::Method::Post {
                let mut body = String::new();
                if request.as_reader().read_to_string(&mut body).is_err() {
                    let resp =
                        tiny_http::Response::from_string("Bad Request").with_status_code(400);
                    let _ = request.respond(resp);
                    continue;
                }
                // Validate it's valid JSON array
                let parsed: Result<Vec<String>, _> = serde_json::from_str(&body);
                match parsed {
                    Ok(_) => {
                        if let Some(ref udir) = uploads_dir {
                            let _ = fs::create_dir_all(udir);
                            let path = udir.join("dock-lt-favorites.json");
                            match fs::write(&path, &body) {
                                Ok(_) => {
                                    println!(
                                        "[Overlay API] Saved dock-lt-favorites ({} bytes)",
                                        body.len()
                                    );
                                    let header = tiny_http::Header::from_bytes(
                                        "Content-Type",
                                        "application/json; charset=utf-8",
                                    )
                                    .unwrap();
                                    let cors = tiny_http::Header::from_bytes(
                                        "Access-Control-Allow-Origin",
                                        "*",
                                    )
                                    .unwrap();
                                    let resp = tiny_http::Response::from_string(r#"{"ok":true}"#)
                                        .with_header(header)
                                        .with_header(cors);
                                    let _ = request.respond(resp);
                                }
                                Err(e) => {
                                    let json = format!(r#"{{"error":"Write failed: {}"}}"#, e);
                                    let resp = tiny_http::Response::from_string(json)
                                        .with_status_code(500);
                                    let _ = request.respond(resp);
                                }
                            }
                        } else {
                            let resp = tiny_http::Response::from_string(
                                r#"{"error":"uploads dir not available"}"#,
                            )
                            .with_status_code(500);
                            let _ = request.respond(resp);
                        }
                    }
                    Err(_) => {
                        let resp =
                            tiny_http::Response::from_string(r#"{"error":"Invalid JSON array"}"#)
                                .with_status_code(400);
                        let _ = request.respond(resp);
                    }
                }
                continue;
            }

            // API: LM state relay — GET returns current state, POST updates it
            // Used for cross-process communication between Tauri app and OBS dock
            if clean == "api/lm-state" {
                let lm_state = LM_STATE.get_or_init(|| Mutex::new("{}".to_string()));
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "GET, POST, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Headers",
                                "Content-Type",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                if request.method() == &tiny_http::Method::Post {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_err() {
                        let resp =
                            tiny_http::Response::from_string("Bad Request").with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }
                    if let Ok(mut state) = lm_state.lock() {
                        *state = body;
                    }
                    let resp = tiny_http::Response::from_string(r#"{"ok":true}"#)
                        .with_header(header)
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                // GET
                let json = lm_state
                    .lock()
                    .map(|s| s.clone())
                    .unwrap_or_else(|_| "{}".to_string());
                let resp = tiny_http::Response::from_string(json)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: LM command relay — POST enqueues a command, GET drains all pending commands
            // Used by the dock (OBS CEF) to send commands to the main app cross-process
            if clean == "api/lm-command" {
                let queue = LM_COMMAND_QUEUE.get_or_init(|| Mutex::new(Vec::new()));
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "GET, POST, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Headers",
                                "Content-Type",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                if request.method() == &tiny_http::Method::Post {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_err() {
                        let resp =
                            tiny_http::Response::from_string("Bad Request").with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }
                    if let Ok(mut q) = queue.lock() {
                        // Cap at 50 commands to prevent unbounded growth
                        if q.len() < 50 {
                            q.push(body);
                        }
                    }
                    let resp = tiny_http::Response::from_string(r#"{"ok":true}"#)
                        .with_header(header)
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                // GET — drain all pending commands
                let json = if let Ok(mut q) = queue.lock() {
                    let cmds: Vec<String> = q.drain(..).collect();
                    serde_json::to_string(&cmds).unwrap_or_else(|_| "[]".to_string())
                } else {
                    "[]".to_string()
                };
                let resp = tiny_http::Response::from_string(json)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: Dock notes command relay — POST enqueues an append command,
            // GET drains all pending commands. Used when LM and Notes docks run
            // in separate browser processes or localhost origins.
            if clean == "api/dock-notes-command" {
                let queue = DOCK_NOTES_COMMAND_QUEUE.get_or_init(|| Mutex::new(Vec::new()));
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "GET, POST, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Headers",
                                "Content-Type",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                if request.method() == &tiny_http::Method::Post {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_err() {
                        let resp =
                            tiny_http::Response::from_string("Bad Request").with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }

                    match serde_json::from_str::<serde_json::Value>(&body) {
                        Ok(value) => {
                            let has_command_id = value
                                .get("commandId")
                                .and_then(|v| v.as_str())
                                .map(|v| !v.trim().is_empty())
                                .unwrap_or(false);
                            let has_text = value
                                .get("text")
                                .and_then(|v| v.as_str())
                                .map(|v| !v.trim().is_empty())
                                .unwrap_or(false);

                            if !has_command_id || !has_text {
                                let resp = tiny_http::Response::from_string(
                                    r#"{"error":"Invalid dock notes command"}"#,
                                )
                                .with_status_code(400)
                                .with_header(header)
                                .with_header(cors);
                                let _ = request.respond(resp);
                                continue;
                            }

                            if let Ok(mut q) = queue.lock() {
                                if q.len() < 100 {
                                    q.push(body);
                                }
                            }
                            let resp = tiny_http::Response::from_string(r#"{"ok":true}"#)
                                .with_header(header)
                                .with_header(cors);
                            let _ = request.respond(resp);
                            continue;
                        }
                        Err(_) => {
                            let resp =
                                tiny_http::Response::from_string(r#"{"error":"Invalid JSON"}"#)
                                    .with_status_code(400)
                                    .with_header(header)
                                    .with_header(cors);
                            let _ = request.respond(resp);
                            continue;
                        }
                    }
                }

                let json = if let Ok(mut q) = queue.lock() {
                    let cmds: Vec<String> = q.drain(..).collect();
                    serde_json::to_string(&cmds).unwrap_or_else(|_| "[]".to_string())
                } else {
                    "[]".to_string()
                };
                let resp = tiny_http::Response::from_string(json)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: Presentation state relay — GET returns current session state,
            // POST updates it. Used by Presentation Console + presentation.html.
            if clean == "api/presentation-state" {
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "GET, POST, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Headers",
                                "Content-Type",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                if request.method() == &tiny_http::Method::Post {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_err() {
                        let resp =
                            tiny_http::Response::from_string("Bad Request").with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }

                    match serde_json::from_str::<PresentationStateEnvelope>(&body) {
                        Ok(mut payload) => {
                            if payload.session_id.trim().is_empty() {
                                let resp = tiny_http::Response::from_string(
                                    r#"{"error":"sessionId is required"}"#,
                                )
                                .with_status_code(400)
                                .with_header(header)
                                .with_header(cors);
                                let _ = request.respond(resp);
                                continue;
                            }

                            if payload.updated_at == 0 {
                                payload.updated_at = now_unix_millis();
                            }
                            let session_id = payload.session_id.clone();

                            let state_store =
                                PRESENTATION_STATE.get_or_init(|| Mutex::new(BTreeMap::new()));
                            if let Ok(mut state) = state_store.lock() {
                                state.insert(session_id.clone(), payload.clone());
                            }
                            presentation_remote::broadcast_presentation_state(&payload);

                            let viewer_count = presentation_viewer_count(&session_id);
                            let resp = tiny_http::Response::from_string(
                                serde_json::json!({
                                    "ok": true,
                                    "viewerCount": viewer_count,
                                })
                                .to_string(),
                            )
                            .with_header(header)
                            .with_header(cors);
                            let _ = request.respond(resp);
                        }
                        Err(err) => {
                            let resp = tiny_http::Response::from_string(
                                serde_json::json!({
                                    "error": format!("Invalid presentation state: {}", err),
                                })
                                .to_string(),
                            )
                            .with_status_code(400)
                            .with_header(header)
                            .with_header(cors);
                            let _ = request.respond(resp);
                        }
                    }
                    continue;
                }

                let session_id = if let Some(qpos) = url_path.find('?') {
                    let qs = &url_path[qpos + 1..];
                    qs.split('&')
                        .find_map(|pair| {
                            let (key, value) = pair.split_once('=')?;
                            if key == "sessionId" {
                                Some(urlencoding::decode(value).unwrap_or_default().into_owned())
                            } else {
                                None
                            }
                        })
                        .unwrap_or_default()
                } else {
                    String::new()
                };

                if session_id.trim().is_empty() {
                    let resp =
                        tiny_http::Response::from_string(r#"{"error":"sessionId is required"}"#)
                            .with_status_code(400)
                            .with_header(header)
                            .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                let state_store = PRESENTATION_STATE.get_or_init(|| Mutex::new(BTreeMap::new()));
                let state = state_store
                    .lock()
                    .ok()
                    .and_then(|store| store.get(&session_id).cloned());
                let viewer_count = presentation_viewer_count(&session_id);
                let resp = tiny_http::Response::from_string(
                    serde_json::json!({
                        "state": state,
                        "viewerCount": viewer_count,
                    })
                    .to_string(),
                )
                .with_header(header)
                .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: Presentation viewer heartbeat — POST updates last-seen,
            // GET returns current viewer count for a session.
            if clean == "api/presentation-viewer" {
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "GET, POST, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Headers",
                                "Content-Type",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                if request.method() == &tiny_http::Method::Post {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_err() {
                        let resp =
                            tiny_http::Response::from_string("Bad Request").with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }

                    match serde_json::from_str::<PresentationViewerHeartbeat>(&body) {
                        Ok(payload) => {
                            if payload.session_id.trim().is_empty()
                                || payload.viewer_id.trim().is_empty()
                            {
                                let resp = tiny_http::Response::from_string(
                                    r#"{"error":"sessionId and viewerId are required"}"#,
                                )
                                .with_status_code(400)
                                .with_header(header)
                                .with_header(cors);
                                let _ = request.respond(resp);
                                continue;
                            }

                            let registry =
                                PRESENTATION_VIEWERS.get_or_init(|| Mutex::new(BTreeMap::new()));
                            if let Ok(mut viewers) = registry.lock() {
                                let session = viewers
                                    .entry(payload.session_id.clone())
                                    .or_insert_with(BTreeMap::new);
                                session.insert(payload.viewer_id, now_unix_millis());
                            }

                            let viewer_count = presentation_viewer_count(&payload.session_id);
                            let resp = tiny_http::Response::from_string(
                                serde_json::json!({
                                    "ok": true,
                                    "viewerCount": viewer_count,
                                })
                                .to_string(),
                            )
                            .with_header(header)
                            .with_header(cors);
                            let _ = request.respond(resp);
                        }
                        Err(err) => {
                            let resp = tiny_http::Response::from_string(
                                serde_json::json!({
                                    "error": format!("Invalid viewer heartbeat: {}", err),
                                })
                                .to_string(),
                            )
                            .with_status_code(400)
                            .with_header(header)
                            .with_header(cors);
                            let _ = request.respond(resp);
                        }
                    }
                    continue;
                }

                let session_id = if let Some(qpos) = url_path.find('?') {
                    let qs = &url_path[qpos + 1..];
                    qs.split('&')
                        .find_map(|pair| {
                            let (key, value) = pair.split_once('=')?;
                            if key == "sessionId" {
                                Some(urlencoding::decode(value).unwrap_or_default().into_owned())
                            } else {
                                None
                            }
                        })
                        .unwrap_or_default()
                } else {
                    String::new()
                };

                if session_id.trim().is_empty() {
                    let resp =
                        tiny_http::Response::from_string(r#"{"error":"sessionId is required"}"#)
                            .with_status_code(400)
                            .with_header(header)
                            .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                let viewer_count = presentation_viewer_count(&session_id);
                let resp = tiny_http::Response::from_string(
                    serde_json::json!({ "viewerCount": viewer_count }).to_string(),
                )
                .with_header(header)
                .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: Open URL in system default browser
            // POST /api/open-url  { "url": "https://..." }
            // Used by the OBS dock (CEF) to open links in the real browser.
            if clean == "api/open-url" {
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "POST, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                if request.method() == &tiny_http::Method::Post {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_err() {
                        let resp = tiny_http::Response::from_string(r#"{"error":"Bad Request"}"#)
                            .with_status_code(400);
                        let _ = request.respond(resp);
                        continue;
                    }
                    let url: String = serde_json::from_str::<serde_json::Value>(&body)
                        .ok()
                        .and_then(|v| v.get("url").and_then(|u| u.as_str()).map(String::from))
                        .unwrap_or_default();

                    let ok = if url.starts_with("http://") || url.starts_with("https://") {
                        #[cfg(target_os = "macos")]
                        {
                            std::process::Command::new("open").arg(&url).spawn().is_ok()
                        }
                        #[cfg(target_os = "windows")]
                        {
                            std::process::Command::new("cmd")
                                .args(["/c", "start", &url])
                                .spawn()
                                .is_ok()
                        }
                        #[cfg(target_os = "linux")]
                        {
                            std::process::Command::new("xdg-open")
                                .arg(&url)
                                .spawn()
                                .is_ok()
                        }
                    } else {
                        false
                    };

                    let resp_body = if ok {
                        r#"{"ok":true}"#
                    } else {
                        r#"{"ok":false,"error":"Failed to open URL"}"#
                    };
                    let resp = tiny_http::Response::from_string(resp_body)
                        .with_header(header)
                        .with_header(cors)
                        .with_status_code(if ok { 200 } else { 400 });
                    let _ = request.respond(resp);
                    continue;
                }

                let resp = tiny_http::Response::from_string(r#"{"error":"Method not allowed"}"#)
                    .with_status_code(405)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: Proxy a remote URL (GET only)
            // GET /api/proxy?url=https://... — fetches a remote URL and streams it back
            // Used by the OBS dock to download files without CORS issues.
            if clean == "api/proxy" {
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "GET, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                // Extract ?url= parameter (use url_path which retains the query string — clean already had it stripped)
                let url = if let Some(qpos) = url_path.find('?') {
                    let qs = &url_path[qpos + 1..];
                    qs.split('&')
                        .find_map(|p| {
                            let (k, v) = p.split_once('=')?;
                            if k == "url" {
                                Some(urlencoding::decode(v).unwrap_or_default().into_owned())
                            } else {
                                None
                            }
                        })
                        .unwrap_or_default()
                } else {
                    String::new()
                };

                if !url.starts_with("http://") && !url.starts_with("https://") {
                    let resp = tiny_http::Response::from_string(r#"{"error":"Invalid URL"}"#)
                        .with_status_code(400)
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                // Fetch the remote URL server-side (no CORS) and stream back
                match reqwest::blocking::get(&url) {
                    Ok(resp) => {
                        let ct = resp
                            .headers()
                            .get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("application/octet-stream")
                            .to_string();
                        let bytes = resp.bytes().unwrap_or_default();
                        let ct_header =
                            tiny_http::Header::from_bytes("Content-Type", ct.as_str()).unwrap();
                        let resp = tiny_http::Response::from_data(bytes.to_vec())
                            .with_header(ct_header)
                            .with_header(cors);
                        let _ = request.respond(resp);
                    }
                    Err(_) => {
                        let resp =
                            tiny_http::Response::from_string(r#"{"error":"Proxy fetch failed"}"#)
                                .with_status_code(502)
                                .with_header(cors);
                        let _ = request.respond(resp);
                    }
                }
                continue;
            }

            // API: Auth status — GET /api/auth/status
            // Returns the full stored session (user with plan, deviceId, expiresAt).
            // The dock reads the plan from here for entitlement checks.
            if clean == "api/auth/status" {
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();
                let json = overlay_auth_status_json();

                let resp = tiny_http::Response::from_string(json)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // API: Save auth session — POST /api/auth/session
            // Body: JSON with user/deviceId/expiresAt, or empty body to clear.
            // Stores in memory only — no filesystem. The dock reads this via
            // GET /api/auth/status and verifies against the live backend.
            if clean == "api/auth/session" {
                let header = tiny_http::Header::from_bytes(
                    "Content-Type",
                    "application/json; charset=utf-8",
                )
                .unwrap();
                let cors =
                    tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap();

                if request.method() == &tiny_http::Method::Options {
                    let resp = tiny_http::Response::from_string("")
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Methods",
                                "POST, OPTIONS",
                            )
                            .unwrap(),
                        )
                        .with_header(
                            tiny_http::Header::from_bytes(
                                "Access-Control-Allow-Headers",
                                "Content-Type",
                            )
                            .unwrap(),
                        )
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                let mut body = String::new();
                let has_body = request.as_reader().read_to_string(&mut body).is_ok()
                    && !body.trim().is_empty();
                let is_clear = body.contains(r#""clear""#);

                let mem_store = AUTH_SESSION.get_or_init(|| Mutex::new(None));
                {
                    let mut guard = mem_store.lock().unwrap();
                    if has_body && !is_clear {
                        *guard = Some(body);
                    } else {
                        *guard = None;
                    }
                }

                let resp = tiny_http::Response::from_string(r#"{"ok":true}"#)
                    .with_header(header)
                    .with_header(cors);
                let _ = request.respond(resp);
                continue;
            }

            // Resolve file path — check uploads dir for /uploads/* requests,
            // otherwise serve from the resource dir (public/)
            let mut file_path = if clean.starts_with("uploads/") {
                if let Some(ref udir) = uploads_dir {
                    // Strip the "uploads/" prefix and serve from uploads dir
                    let rel = clean.strip_prefix("uploads/").unwrap_or(clean);
                    let rel_path = Path::new(rel);
                    if !is_safe_relative_path(rel_path) {
                        let resp = tiny_http::Response::from_string("Forbidden")
                            .with_status_code(403)
                            .with_header(
                                tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                    .unwrap(),
                            );
                        let _ = request.respond(resp);
                        continue;
                    }
                    udir.join(rel_path)
                } else {
                    resource_dir.join(clean)
                }
            } else {
                resource_dir.join(clean)
            };

            // Extensionless URL resolution: if the file doesn't exist and
            // has no extension, try appending .html (e.g. /dock → dock.html)
            if !file_path.exists() && file_path.extension().is_none() {
                let with_html = file_path.with_extension("html");
                if with_html.exists() && with_html.is_file() {
                    file_path = with_html;
                }
            }

            // Dev fallback: if the file wasn't found in resource_dir (public/)
            // but a matching Vite multi-page entry exists in the project root
            // (e.g. dock.html), redirect to the Vite dev server so it can
            // properly transform TSX/CSS imports.
            if !file_path.exists() || !file_path.is_file() {
                if let Some(ref root) = project_root_dir {
                    let mut root_candidate = root.join(clean);
                    if !root_candidate.exists() && root_candidate.extension().is_none() {
                        let with_html = root_candidate.with_extension("html");
                        if with_html.exists() && with_html.is_file() {
                            root_candidate = with_html;
                        }
                    }
                    if root_candidate.exists() && root_candidate.is_file() {
                        let is_html_entry = root_candidate
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .map(|ext| ext.eq_ignore_ascii_case("html"))
                            .unwrap_or(false);
                        if is_html_entry
                            && !overlay_is_allowed_app_document(clean)
                            && !overlay_has_active_auth_session()
                        {
                            respond_overlay_auth_blocked(request);
                            continue;
                        }

                        // Redirect to Vite dev server (localhost:1420) so it handles
                        // module transforms, HMR, etc.
                        let redirect_url = format!("http://localhost:1420/{}", clean);
                        let header = overlay_header("Location", redirect_url.as_str());
                        let cors = overlay_header("Access-Control-Allow-Origin", "*");
                        let resp =
                            tiny_http::Response::from_string("Redirecting to Vite dev server")
                                .with_status_code(302)
                                .with_header(header)
                                .with_header(cors)
                                .with_header(overlay_header(
                                    "Cache-Control",
                                    "no-store, no-cache, must-revalidate, max-age=0",
                                ))
                                .with_header(overlay_header("Pragma", "no-cache"))
                                .with_header(overlay_header("Expires", "0"));
                        let _ = request.respond(resp);
                        continue;
                    }
                }
            }

            if file_path.exists() && file_path.is_file() {
                let content_type = overlay_content_type_for_extension(
                    file_path.extension().and_then(|e| e.to_str()),
                );
                if content_type.starts_with("text/html")
                    && !overlay_is_allowed_app_document(clean)
                    && !overlay_has_active_auth_session()
                {
                    respond_overlay_auth_blocked(request);
                    continue;
                }
                respond_overlay_file_request(request, &file_path, content_type);
            } else if Path::new(clean).extension().is_some() {
                // Request has a file extension (e.g. .json, .png) but the
                // file doesn't exist — return 404 instead of SPA fallback.
                let resp = tiny_http::Response::from_string("Not Found")
                    .with_status_code(404)
                    .with_header(
                        tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap(),
                    );
                let _ = request.respond(resp);
            } else {
                // SPA fallback: for client-side routes (no extension), serve
                // index.html so React Router can handle them. Note: dedicated
                // HTML files (like dock.html) are resolved above via the .html
                // extension fallback, so this only triggers for true SPA routes.
                let index_path = resource_dir.join("index.html");
                if index_path.exists() && index_path.is_file() {
                    match fs::read(&index_path) {
                        Ok(data) => {
                            let header = overlay_header("Content-Type", "text/html; charset=utf-8");
                            let cors = overlay_header("Access-Control-Allow-Origin", "*");
                            let resp = tiny_http::Response::from_data(data)
                                .with_header(header)
                                .with_header(cors)
                                .with_header(overlay_header(
                                    "Cache-Control",
                                    "no-store, no-cache, must-revalidate, max-age=0",
                                ))
                                .with_header(overlay_header("Pragma", "no-cache"))
                                .with_header(overlay_header("Expires", "0"));
                            let _ = request.respond(resp);
                        }
                        Err(_) => {
                            let resp = tiny_http::Response::from_string("Internal Server Error")
                                .with_status_code(500)
                                .with_header(
                                    tiny_http::Header::from_bytes(
                                        "Access-Control-Allow-Origin",
                                        "*",
                                    )
                                    .unwrap(),
                                );
                            let _ = request.respond(resp);
                        }
                    }
                } else {
                    let resp = tiny_http::Response::from_string("Not Found")
                        .with_status_code(404)
                        .with_header(
                            tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                .unwrap(),
                        );
                    let _ = request.respond(resp);
                }
            }
        }
    });

    port
}

// ── Dynamic App Icon ─────────────────────────────────────────────────────────
// Changes the macOS dock icon at runtime to reflect application state
// (OBS connection, Speech-to-Scripture listening).
//
// The actual AppKit calls live in `macos_icon.m` (compiled via build.rs / `cc`)
// so that Objective-C exceptions are caught by @try/@catch *before* they can
// cross any Rust `catch_unwind` boundary (which would abort the process with
// "Rust cannot catch foreign exceptions").

#[cfg(target_os = "macos")]
mod app_icon {
    use std::fs;
    use std::path::PathBuf;
    use tauri::Manager;

    extern "C" {
        /// Defined in macos_icon.m.  Returns true on success.
        fn mce_set_app_icon(data: *const u8, len: usize) -> bool;
    }

    fn candidate_icon_names(filename: &str) -> Vec<String> {
        let mut names = Vec::new();

        #[cfg(debug_assertions)]
        if let Some((stem, ext)) = filename.rsplit_once('.') {
            names.push(format!("{stem}-dev.{ext}"));
        }

        names.push(filename.to_string());
        names
    }

    /// Resolve the absolute path to an icon file inside `app_icons/`.
    ///
    /// Resolution order:
    ///   1. `<resource_dir>/app_icons/<filename>`   (bundled production app)
    ///   2. `<project>/public/app_icons/<filename>`  (Vite dev server)
    fn resolve_icon_path(app: &tauri::AppHandle, filename: &str) -> Option<PathBuf> {
        let icon_names = candidate_icon_names(filename);

        // Bundled production path
        if let Ok(resource_dir) = app.path().resource_dir() {
            for icon_name in &icon_names {
                let path = resource_dir.join("app_icons").join(icon_name);
                println!(
                    "[AppIcon] Checking bundled path: {:?} exists={}",
                    path,
                    path.exists()
                );
                if path.exists() {
                    return Some(path);
                }
            }
        }

        // Dev fallback — walk up from executable to project root
        if let Ok(exe) = std::env::current_exe() {
            if let Some(project_root) = exe
                .parent() // target/{debug|release}
                .and_then(|p| p.parent()) // target
                .and_then(|p| p.parent()) // src-tauri
                .and_then(|p| p.parent())
            // project root
            {
                for icon_name in &icon_names {
                    let path = project_root
                        .join("public")
                        .join("app_icons")
                        .join(icon_name);
                    println!(
                        "[AppIcon] Checking dev fallback: {:?} exists={}",
                        path,
                        path.exists()
                    );
                    if path.exists() {
                        return Some(path);
                    }
                }
            }
        }

        println!(
            "[AppIcon] Icon not found: {} (candidates: {:?})",
            filename, icon_names
        );
        None
    }

    /// Tauri command: set the macOS dock icon from a bundled icon file.
    ///
    /// `icon_name` should be one of the known filenames (e.g. "app_icon_general.png").
    /// Returns `Ok(true)` on success, `Ok(false)` if the file was not found,
    /// or `Err(...)` if the native API call failed.
    #[tauri::command]
    pub async fn set_app_icon(app: tauri::AppHandle, icon_name: String) -> Result<bool, String> {
        println!(
            "[AppIcon] set_app_icon called with icon_name: {}",
            icon_name
        );

        let path = resolve_icon_path(&app, &icon_name)
            .ok_or_else(|| format!("Icon file not found: {}", icon_name))?;

        let data = fs::read(&path)
            .map_err(|e| format!("Failed to read icon file {}: {}", path.display(), e))?;

        // Validate with the `image` crate as an extra safety net.
        image::load_from_memory(&data)
            .map_err(|e| format!("Invalid image data in {}: {}", path.display(), e))?;

        // Call the ObjC helper (in macos_icon.m) which has @try/@catch.
        // This runs on the Tokio worker thread, but that's fine — the helper
        // is a plain C function that won't propagate ObjC exceptions into Rust.
        let success = unsafe { mce_set_app_icon(data.as_ptr(), data.len()) };

        if success {
            println!("[AppIcon] Icon set successfully: {}", icon_name);
            Ok(true)
        } else {
            println!(
                "[AppIcon] mce_set_app_icon returned false for: {}",
                icon_name
            );
            Ok(false)
        }
    }
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn set_app_icon(_icon_name: String) -> Result<bool, String> {
    // Dynamic icon switching not supported on this platform
    Ok(false)
}

// ── Mobile Companion Commands ───────────────────────────────────────────────

/// Return stable pairing info for the QR code.
#[tauri::command]
async fn get_mobile_pairing_info() -> Result<serde_json::Value, String> {
    let token = mobile_companion::get_or_create_pairing_token().await;
    let port = mobile_companion::mobile_server_port();

    // Get local IP addresses
    let local_ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());

    Ok(serde_json::json!({
        "version": 1,
        "ip": local_ip,
        "port": port,
        "wsPort": port,
        "apiPort": OVERLAY_PORT.load(Ordering::Relaxed),
        "pairingToken": token,
    }))
}

#[tauri::command]
async fn complete_mobile_command(
    command_id: String,
    ok: bool,
    payload: Option<serde_json::Value>,
    error: Option<String>,
) -> Result<(), String> {
    mobile_companion::complete_mobile_command(
        command_id,
        mobile_companion::MobileCommandCompletion {
            ok,
            payload: payload.unwrap_or(serde_json::Value::Null),
            error,
        },
    )
    .await
}

/// Called by the dock when it connects to OBS — provides credentials
/// so the mobile companion server can also connect to OBS.
#[tauri::command]
async fn save_obs_connection_for_mobile(url: String, password: String) -> Result<(), String> {
    mobile_companion::set_obs_connection(mobile_companion::ObsConnectionInfo { url, password })
        .await;
    Ok(())
}

/// Get the current mobile server status.
#[tauri::command]
async fn get_mobile_server_status() -> Result<serde_json::Value, String> {
    let port = mobile_companion::mobile_server_port();
    let token = mobile_companion::get_pairing_token().await;
    let state = mobile_companion::get_mobile_state().await;

    Ok(serde_json::json!({
        "running": port > 0,
        "port": port,
        "hasToken": token.is_some(),
        "obsConnected": state.obs_connected,
        "currentSong": state.current_song,
        "currentScripture": state.current_scripture,
    }))
}

/// Get the LAN-accessible presentation viewer URL and transport details.
#[tauri::command]
async fn get_presentation_remote_info(session_id: String) -> Result<serde_json::Value, String> {
    let session_id = session_id.trim();
    if session_id.is_empty() {
        return Err("sessionId is required".to_string());
    }

    let http_port = presentation_remote::http_port();
    let ws_port = presentation_remote::ws_port();
    if http_port == 0 {
        return Err("Presentation viewer server is not running".to_string());
    }

    let encoded_session = urlencoding::encode(session_id);
    let local_ip = get_local_ip().unwrap_or_else(|| "127.0.0.1".to_string());
    let local_link = format!("http://127.0.0.1:{}/p/{}", http_port, encoded_session);
    let link = format!("http://{}:{}/p/{}", local_ip, http_port, encoded_session);

    Ok(serde_json::json!({
        "running": http_port > 0 && ws_port > 0,
        "ip": local_ip,
        "httpPort": http_port,
        "wsPort": ws_port,
        "link": link,
        "localLink": local_link,
    }))
}

/// Get local IP addresses (first non-loopback IPv4).
fn get_local_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteObsCandidate {
    host: String,
    port: u16,
    url: String,
    label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteObsDiscoveryResult {
    local_ip: String,
    subnet: String,
    port: u16,
    candidates: Vec<RemoteObsCandidate>,
}

fn host_is_reachable(host: &str, port: u16, timeout_ms: u64) -> bool {
    let socket_addr = match format!("{}:{}", host, port).parse::<SocketAddr>() {
        Ok(addr) => addr,
        Err(_) => return false,
    };

    TcpStream::connect_timeout(&socket_addr, Duration::from_millis(timeout_ms)).is_ok()
}

fn subnet_prefix_from_ip(ip: &str) -> Option<String> {
    let mut parts = ip.split('.');
    let a = parts.next()?;
    let b = parts.next()?;
    let c = parts.next()?;
    let d = parts.next()?;
    if parts.next().is_some() || d.parse::<u8>().is_err() {
        return None;
    }
    Some(format!("{}.{}.{}", a, b, c))
}

/// Discover likely OBS WebSocket servers on the same /24 LAN subnet.
///
/// This intentionally checks only the local subnet and the selected port.
/// The final OBS authentication still happens in the frontend when the user
/// clicks a candidate and supplies the OBS password if required.
#[tauri::command]
async fn discover_remote_obs_hosts(port: Option<u16>) -> Result<RemoteObsDiscoveryResult, String> {
    let port = port.unwrap_or(4455);
    let local_ip =
        get_local_ip().ok_or_else(|| "Could not determine this computer's LAN IP".to_string())?;
    let subnet = subnet_prefix_from_ip(&local_ip)
        .ok_or_else(|| format!("Unsupported LAN IP address: {}", local_ip))?;
    let local_suffix = local_ip
        .split('.')
        .last()
        .and_then(|value| value.parse::<u8>().ok());

    let (tx, rx) = mpsc::channel::<RemoteObsCandidate>();
    let mut handles = Vec::new();
    let timeout_ms = 260;
    let chunk_size = 16usize;

    for chunk_start in (1u16..=254u16).step_by(chunk_size) {
        let tx = tx.clone();
        let subnet = subnet.clone();
        let local_suffix = local_suffix;
        let chunk_end = (chunk_start + chunk_size as u16 - 1).min(254);

        handles.push(std::thread::spawn(move || {
            for suffix in chunk_start..=chunk_end {
                if Some(suffix as u8) == local_suffix {
                    continue;
                }

                let host = format!("{}.{}", subnet, suffix);
                if host_is_reachable(&host, port, timeout_ms) {
                    let _ = tx.send(RemoteObsCandidate {
                        label: format!("OBS candidate at {}", host),
                        url: format!("ws://{}:{}", host, port),
                        host,
                        port,
                    });
                }
            }
        }));
    }

    drop(tx);

    for handle in handles {
        let _ = handle.join();
    }

    let mut candidates: Vec<RemoteObsCandidate> = rx.try_iter().collect();
    candidates.sort_by(|a, b| {
        let a_suffix = a
            .host
            .split('.')
            .last()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(0);
        let b_suffix = b
            .host
            .split('.')
            .last()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(0);
        a_suffix.cmp(&b_suffix)
    });

    Ok(RemoteObsDiscoveryResult {
        local_ip,
        subnet: format!("{}.0/24", subnet),
        port,
        candidates,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env file so Rust commands can read env vars (e.g. OPENCODE_API_KEY)
    dotenvy::dotenv().ok();

    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            // Resolve the directory where overlay HTML files live.
            //
            // Bundled app:
            //   resource_dir() may be:
            //   - .../Contents/Resources/
            //   - .../Contents/Resources/dist/
            //   - .../Contents/Resources/_up_/dist/
            //
            // Local dev:
            //   fall back to <project>/public/.
            let resource_dir = app
                .path()
                .resource_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));

            match local_llm::seed_local_llm_model_from_bundle(&resource_dir) {
                Ok(true) => println!("[Tauri] Local LLM model ready."),
                Ok(false) => println!("[Tauri] No bundled local LLM model found."),
                Err(error) => eprintln!("[Tauri] Failed to seed local LLM model: {}", error),
            }

            // In debug/dev mode, serve the live project `public/` directory
            // first. A stale copied `target/**/dist` directory can otherwise
            // win this lookup and make OBS keep rendering an older overlay
            // (including the removed loading screen and verse transition).
            let serve_dir = if cfg!(debug_assertions) {
                resolve_dev_public_dir()
                    .or_else(|| resolve_bundled_overlay_dir(&resource_dir))
                    .unwrap_or(resource_dir.clone())
            } else {
                resolve_bundled_overlay_dir(&resource_dir)
                    .or_else(resolve_dev_public_dir)
                    .unwrap_or(resource_dir.clone())
            };

            println!("[Tauri] Overlay resource dir : {:?}", resource_dir);
            println!("[Tauri] Overlay serve dir    : {:?}", serve_dir);
            println!("[Tauri] serve dir exists?     {}", serve_dir.exists());
            println!(
                "[Tauri] has overlay assets?   {}",
                has_overlay_assets(&serve_dir)
            );

            // Log what files are actually in the serve directory
            if serve_dir.exists() {
                if let Ok(entries) = fs::read_dir(&serve_dir) {
                    let names: Vec<String> = entries
                        .filter_map(|e| e.ok())
                        .map(|e| e.file_name().to_string_lossy().to_string())
                        .collect();
                    println!(
                        "[Tauri] serve dir contents ({} entries): {:?}",
                        names.len(),
                        &names[..names.len().min(20)]
                    );
                }
            }

            let port = start_overlay_server(serve_dir);
            println!("[Tauri] Overlay server started on port {}", port);

            let presentation_uploads_dir = app_dir().ok().map(|dir| dir.join("uploads"));
            let presentation_http_port =
                presentation_remote::start_presentation_http_server(presentation_uploads_dir);
            println!(
                "[Tauri] Presentation viewer server started on port {}",
                presentation_http_port
            );

            app.manage(audio_capture::AudioCaptureState::default());
            app.manage(assemblyai_stream::AssemblyAiStreamState::default());

            if let Some(window) = app.get_webview_window("main") {
                if let Some(icon) = dev_window_icon() {
                    let _ = window.set_icon(icon);
                }
            }

            #[cfg(all(target_os = "macos", debug_assertions))]
            {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(error) =
                        app_icon::set_app_icon(app_handle, "app_icon_general.png".to_string()).await
                    {
                        eprintln!("[AppIcon] Failed to apply dev startup icon: {}", error);
                    }
                });
            }

            // Prevent macOS App Nap — keeps audio capture and transcription
            // running reliably when the app is in the background.
            #[cfg(target_os = "macos")]
            app_nap::prevent_app_nap();

            // Start the mobile companion WebSocket server
            let mobile_port = 8765u16;
            let mobile_app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let _ = mobile_companion::get_or_create_pairing_token().await;
                if let Err(e) =
                    mobile_companion::start_mobile_server(mobile_port, mobile_app_handle).await
                {
                    eprintln!("[MobileCompanion] Server failed: {}", e);
                }
            });
            println!(
                "[Tauri] Mobile companion server starting on port {}",
                mobile_port
            );

            tauri::async_runtime::spawn(async move {
                if let Err(error) =
                    presentation_remote::start_presentation_ws_server(Some(8766)).await
                {
                    eprintln!("[PresentationRemote] WebSocket server failed: {}", error);
                }
            });
            println!("[Tauri] Presentation WebSocket server starting on port 8766");

            // Start the overlay relay for instant dock-to-overlay communication
            tauri::async_runtime::spawn(async move {
                if let Err(error) = overlay_relay::start_overlay_relay(17891).await {
                    eprintln!("[OverlayRelay] Server failed: {}", error);
                }
            });
            println!("[Tauri] Overlay relay starting on port 17891");

            // macOS menu-bar controls for the main MakeChurchEasy window.
            let show_item = tauri::menu::MenuItem::with_id(
                app,
                "show-main-window",
                "Show MakeChurchEasy",
                true,
                None::<&str>,
            )?;
            let settings_item = tauri::menu::MenuItem::with_id(
                app,
                "show-settings",
                "Show Settings",
                true,
                None::<&str>,
            )?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit_item = tauri::menu::MenuItem::with_id(
                app,
                "quit-makechurcheasy",
                "Quit MakeChurchEasy",
                true,
                None::<&str>,
            )?;
            let tray_menu = tauri::menu::Menu::with_items(
                app,
                &[&show_item, &settings_item, &separator, &quit_item],
            )?;

            let tray_icon = Image::from_bytes(include_bytes!("../icons/icon.png"))
                .expect("bundled MakeChurchEasy tray icon must be valid PNG");
            let _tray = tauri::tray::TrayIconBuilder::with_id("makechurcheasy-tray")
                .icon(tray_icon)
                .icon_as_template(true)
                .tooltip("MakeChurchEasy")
                .menu(&tray_menu)
                .show_menu_on_left_click(true)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show-main-window" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "show-settings" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                        let _ = app.emit("open-settings", ());
                    }
                    "quit-makechurcheasy" => app.exit(0),
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_bg_image,
            save_upload_file,
            save_countdown_asset,
            delete_countdown_asset,
            cleanup_unused_countdown_assets,
            save_background_video_file,
            load_app_data,
            save_app_data,
            get_overlay_port,
            get_lan_overlay_info,
            prepare_remote_media_url,
            get_device_info,
            get_system_hardware_info,
            get_memory_usage,
            save_dock_data,
            load_dock_data,
            search_online_song_lyrics,
            load_transcripts,
            save_transcript,
            delete_transcript,
            get_transcript_stats,
            get_worship_import_ai_status,
            structure_worship_import_chunk,
            review_worship_import_batch,
            translate_transcript,
            extract_text_from_pdf,
            extract_text_elements_from_pdf,
            device_fingerprint::get_device_fingerprint,
            audio_capture::list_audio_devices,
            audio_capture::start_audio_capture,
            audio_capture::stop_audio_capture,
            assemblyai_stream::start_assemblyai_stream,
            assemblyai_stream::stop_assemblyai_stream,
            assemblyai_stream::set_microphone_gain,
            assemblyai_stream::set_assemblyai_stream_speed,
            local_llm::get_local_llm_runtime_status,
            local_llm::install_local_llm_model,
            local_llm::generate_local_llm_text,
            obs_move_plugin::get_obs_move_plugin_status,
            obs_move_plugin::install_obs_move_plugin,
            get_mobile_pairing_info,
            complete_mobile_command,
            save_obs_connection_for_mobile,
            get_mobile_server_status,
            get_presentation_remote_info,
            discover_remote_obs_hosts,
            #[cfg(target_os = "macos")]
            app_icon::set_app_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
