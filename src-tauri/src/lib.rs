// Tauri Rust backend — MakeChurchEasy
//
// Commands:
//   save_bg_image      — persist background image to disk (for OBS image_source)
//   save_upload_file   — persist uploaded logo to disk
//   load_app_data      — read app_data.json (or return "{}" if missing)
//   save_app_data      — write app_data.json
//   get_overlay_port   — return the port of the local overlay HTTP server
//   load_dock_data     — read dock-shared JSON from the uploads directory
// On startup, a lightweight HTTP server is spawned on a localhost port
// to serve overlay HTML files (Bible, Worship, Lower Third) so that OBS
// browser sources can access them. Tauri's internal protocol (tauri:// or
// https://tauri.localhost) is NOT reachable by OBS/CEF, so we need a real
// localhost server.

#[cfg(any(target_os = "windows", target_os = "macos"))]
mod audio_capture;
mod assemblyai_stream;
mod local_llm;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
mod local_llm_stub;
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
use local_llm_stub as local_llm;

use chrono::Utc;
use hmac::{Hmac, Mac};
use quick_xml::de::from_str as from_xml_str;
use scraper::{Html, Selector};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Component, Path};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;
use tauri::Manager;

/// The port the overlay server is running on (set at startup).
static OVERLAY_PORT: AtomicU16 = AtomicU16::new(0);

/// In-memory auth session for the OBS dock.
/// Written by POST /api/auth/session, read by GET /api/auth/status.
/// Avoids file-sync race conditions on app startup.
static AUTH_SESSION: OnceLock<Mutex<Option<String>>> = OnceLock::new();

// ── macOS App Nap prevention ─────────────────────────────────────────────────
// When MakeChurchEasy is transcribing in the background, macOS may throttle the app
// via App Nap. This creates an IOKit power assertion to prevent that.

#[cfg(target_os = "macos")]
mod app_nap {
    use std::sync::atomic::{AtomicU32, Ordering};

    // IOKit power management constants — names match Apple's API
    #[allow(non_upper_case_globals)]
    const kIOPMAssertionTypePreventUserIdleSystemSleep: &str =
        "PreventUserIdleSystemSleep";

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
            unsafe { IOPMAssertionRelease(id); }
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
        unsafe {
            CFStringCreateWithCString(
                std::ptr::null(),
                cstr.as_ptr(),
                kCFStringEncodingUTF8,
            )
        }
    }

    unsafe fn cf_release(cf: CFTypeRef) {
        if !cf.is_null() {
            CFRelease(cf);
        }
    }
}

static LM_STATE: OnceLock<Mutex<String>> = OnceLock::new();
static LM_COMMAND_QUEUE: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
const ONLINE_LYRICS_RESULT_LIMIT: usize = 18;
const ONLINE_LYRICS_USER_AGENT: &str =
    "MakeChurchEasy/1.0 (+https://localhost; worship-online-lyrics)";
const TEMPLATE_VIDEO_PREFIX: &str = "template_videos/";
const TEMPLATE_VIDEO_URL_TTL_SECONDS: u32 = 900;
const TEMPLATE_VIDEO_LIST_TTL_SECONDS: u32 = 300;

type HmacSha256 = Hmac<Sha256>;

/// True if the directory contains the overlay HTML entrypoint(s).
fn has_overlay_assets(dir: &std::path::Path) -> bool {
    dir.join("bible-overlay-fullscreen.html").is_file()
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
    query.insert("X-Amz-Algorithm".to_string(), "AWS4-HMAC-SHA256".to_string());
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
    let parsed: R2ListBucketResult =
        from_xml_str(&xml).map_err(|e| format!("Failed to parse template video listing XML: {}", e))?;

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

    assets.sort_by(|left, right| left.file_name.to_lowercase().cmp(&right.file_name.to_lowercase()));
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

/// Save a remote template background video to the local uploads/backgrounds/videos/
/// folder and return the absolute path plus the overlay-relative URL.
#[tauri::command]
fn save_background_video_file(
    file_name: String,
    file_data: Vec<u8>,
) -> Result<SavedBackgroundVideoFile, String> {
    let videos_dir = app_dir()?.join("uploads").join("backgrounds").join("videos");
    fs::create_dir_all(&videos_dir)
        .map_err(|e| format!("Failed to create background videos directory: {}", e))?;

    let safe_file_name = sanitize_filename_for_storage(&file_name)?;
    let file_path = videos_dir.join(&safe_file_name);
    fs::write(&file_path, &file_data)
        .map_err(|e| format!("Failed to write background video '{}': {}", safe_file_name, e))?;

    let abs_path = file_path
        .to_str()
        .ok_or("Background video path contains invalid UTF-8")?
        .to_string();
    let relative_url = format!("/uploads/backgrounds/videos/{}", encode_path_segments(&safe_file_name));

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

/// Return the device hostname and OS so the frontend can use a real device name.
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
        "the video"
            | "video"
            | "watch the video"
            | "watch video"
            | "related"
            | "more"
            | "print"
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

            let lyrics = prune_lyrics_text(&track.plain_lyrics.unwrap_or_default());
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

            let lrclib_client = client.clone();
            let lrclib_query = search_query.clone();
            let lrclib = scope.spawn(move || search_lrclib(&lrclib_client, &lrclib_query));

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
                lrclib
                    .join()
                    .unwrap_or_else(|_| Err("LRCLIB search worker panicked".to_string())),
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
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create transcripts directory: {}", e))?;
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

    serde_json::to_string(&transcripts).map_err(|e| format!("Failed to serialize transcripts: {}", e))
}

#[tauri::command]
fn save_transcript(transcript: serde_json::Value) -> Result<(), String> {
    let dir = transcripts_dir()?;
    let id = transcript.get("id")
        .and_then(|v| v.as_str())
        .ok_or("Transcript missing id")?;

    let safe_name = id.chars().map(|ch| {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' }
    }).collect::<String>();

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
    let safe_name = id.chars().map(|ch| {
        if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' }
    }).collect::<String>();

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
                            total_duration += val.get("durationSeconds")
                                .and_then(|v| v.as_u64()).unwrap_or(0);
                            total_scriptures += val.get("scriptures")
                                .and_then(|v| v.as_array()).map(|a| a.len() as u64).unwrap_or(0);
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

fn get_opencode_api_key() -> Result<String, String> {
    std::env::var("OPENCODE_API_KEY").map_err(|_| {
        "OPENCODE_API_KEY environment variable not set. \
         Set it in your shell or .env before running the app."
            .to_string()
    })
}

#[tauri::command]
fn translate_transcript(transcript_text: String, target_language: String) -> Result<String, String> {
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

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

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

#[tauri::command]
fn extract_text_from_pdf(file_data: Vec<u8>) -> Result<String, String> {
    use std::io::Write;
    let mut tmp = tempfile::NamedTempFile::new()
        .map_err(|e| format!("Failed to create temp file: {}", e))?;
    tmp.write_all(&file_data)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    let path = tmp.into_temp_path();
    pdf_extract::extract_text(&path)
        .map_err(|e| format!("PDF extraction failed: {}", e))
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

    // Try port 45678 first, then fall back to any available port
    let server = match tiny_http::Server::http("127.0.0.1:45678")
        .or_else(|_| tiny_http::Server::http("127.0.0.1:0"))
    {
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
            // (http://127.0.0.1:<port>/) without a 404.
            let clean = if clean.is_empty() {
                "lower-third-overlay.html"
            } else {
                clean
            };

            // Security: don't allow path traversal
            if clean.contains("..") {
                let resp = tiny_http::Response::from_string("Forbidden").with_status_code(403);
                let _ = request.respond(resp);
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
                    .and_then(|i| url_path[i + 1..].split('&')
                        .find(|p| p.starts_with("path="))
                        .map(|p| &p[5..]))
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
                    Err(error) => {
                        let json = serde_json::json!({ "error": error }).to_string();
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
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Methods",
                            "GET, POST, OPTIONS",
                        )
                        .unwrap())
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Headers",
                            "Content-Type",
                        )
                        .unwrap())
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
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Methods",
                            "GET, POST, OPTIONS",
                        )
                        .unwrap())
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Headers",
                            "Content-Type",
                        )
                        .unwrap())
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
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Methods",
                            "POST, OPTIONS",
                        )
                        .unwrap())
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
                        { std::process::Command::new("open").arg(&url).spawn().is_ok() }
                        #[cfg(target_os = "windows")]
                        { std::process::Command::new("cmd").args(["/c", "start", &url]).spawn().is_ok() }
                        #[cfg(target_os = "linux")]
                        { std::process::Command::new("xdg-open").arg(&url).spawn().is_ok() }
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
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Methods",
                            "GET, OPTIONS",
                        )
                        .unwrap())
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                // Extract ?url= parameter
                let url = if let Some(qpos) = clean.find('?') {
                    let qs = &clean[qpos + 1..];
                    qs.split('&')
                        .find_map(|p| {
                            let (k, v) = p.split_once('=')?;
                            if k == "url" { Some(v.to_string()) } else { None }
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
                        let ct = resp.headers().get("content-type")
                            .and_then(|v| v.to_str().ok())
                            .unwrap_or("application/octet-stream")
                            .to_string();
                        let bytes = resp.bytes().unwrap_or_default();
                        let ct_header = tiny_http::Header::from_bytes("Content-Type", ct.as_str()).unwrap();
                        let resp = tiny_http::Response::from_data(bytes.to_vec())
                            .with_header(ct_header)
                            .with_header(cors);
                        let _ = request.respond(resp);
                    }
                    Err(_) => {
                        let resp = tiny_http::Response::from_string(r#"{"error":"Proxy fetch failed"}"#)
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

                let mem_store = AUTH_SESSION.get_or_init(|| Mutex::new(None));
                let json: String = {
                    let guard = mem_store.lock().unwrap();
                    match guard.as_ref() {
                        Some(session) => session.clone(),
                        None => r#"{"deviceId":null}"#.to_string(),
                    }
                };

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
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Methods",
                            "POST, OPTIONS",
                        )
                        .unwrap())
                        .with_header(tiny_http::Header::from_bytes(
                            "Access-Control-Allow-Headers",
                            "Content-Type",
                        )
                        .unwrap())
                        .with_header(cors);
                    let _ = request.respond(resp);
                    continue;
                }

                let mut body = String::new();
                let has_body = request.as_reader().read_to_string(&mut body).is_ok() && !body.trim().is_empty();
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
                        let resp =
                            tiny_http::Response::from_string("Forbidden").with_status_code(403);
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
                        // Redirect to Vite dev server (localhost:1420) so it handles
                        // module transforms, HMR, etc.
                        let redirect_url = format!("http://localhost:1420/{}", clean);
                        let header =
                            tiny_http::Header::from_bytes("Location", redirect_url.as_str())
                                .unwrap();
                        let cors =
                            tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                .unwrap();
                        let resp =
                            tiny_http::Response::from_string("Redirecting to Vite dev server")
                                .with_status_code(302)
                                .with_header(header)
                                .with_header(cors);
                        let _ = request.respond(resp);
                        continue;
                    }
                }
            }

            if file_path.exists() && file_path.is_file() {
                match fs::read(&file_path) {
                    Ok(data) => {
                        let content_type = match file_path.extension().and_then(|e| e.to_str()) {
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
                        };
                        let header =
                            tiny_http::Header::from_bytes("Content-Type", content_type).unwrap();
                        let cors =
                            tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                .unwrap();
                        let resp = tiny_http::Response::from_data(data)
                            .with_header(header)
                            .with_header(cors);
                        let _ = request.respond(resp);
                    }
                    Err(_) => {
                        let resp = tiny_http::Response::from_string("Internal Server Error")
                            .with_status_code(500);
                        let _ = request.respond(resp);
                    }
                }
            } else {
                // SPA fallback: for client-side routes, serve index.html
                // so React Router can handle them. Note: dedicated HTML files
                // (like dock.html) are resolved above via the .html extension
                // fallback, so this only triggers for true SPA routes.
                let index_path = resource_dir.join("index.html");
                if index_path.exists() && index_path.is_file() {
                    match fs::read(&index_path) {
                        Ok(data) => {
                            let header = tiny_http::Header::from_bytes(
                                "Content-Type",
                                "text/html; charset=utf-8",
                            )
                            .unwrap();
                            let cors =
                                tiny_http::Header::from_bytes("Access-Control-Allow-Origin", "*")
                                    .unwrap();
                            let resp = tiny_http::Response::from_data(data)
                                .with_header(header)
                                .with_header(cors);
                            let _ = request.respond(resp);
                        }
                        Err(_) => {
                            let resp = tiny_http::Response::from_string("Internal Server Error")
                                .with_status_code(500);
                            let _ = request.respond(resp);
                        }
                    }
                } else {
                    let resp = tiny_http::Response::from_string("Not Found").with_status_code(404);
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

    /// Resolve the absolute path to an icon file inside `app_icons/`.
    ///
    /// Resolution order:
    ///   1. `<resource_dir>/app_icons/<filename>`   (bundled production app)
    ///   2. `<project>/public/app_icons/<filename>`  (Vite dev server)
    fn resolve_icon_path(app: &tauri::AppHandle, filename: &str) -> Option<PathBuf> {
        // Bundled production path
        if let Ok(resource_dir) = app.path().resource_dir() {
            let path = resource_dir.join("app_icons").join(filename);
            println!("[AppIcon] Checking bundled path: {:?} exists={}", path, path.exists());
            if path.exists() {
                return Some(path);
            }
        }

        // Dev fallback — walk up from executable to project root
        if let Ok(exe) = std::env::current_exe() {
            if let Some(project_root) = exe
                .parent() // target/{debug|release}
                .and_then(|p| p.parent()) // target
                .and_then(|p| p.parent()) // src-tauri
                .and_then(|p| p.parent()) // project root
            {
                let path = project_root.join("public").join("app_icons").join(filename);
                println!("[AppIcon] Checking dev fallback: {:?} exists={}", path, path.exists());
                if path.exists() {
                    return Some(path);
                }
            }
        }

        println!("[AppIcon] Icon not found: {}", filename);
        None
    }

    /// Tauri command: set the macOS dock icon from a bundled icon file.
    ///
    /// `icon_name` should be one of the known filenames (e.g. "app_icon_general.png").
    /// Returns `Ok(true)` on success, `Ok(false)` if the file was not found,
    /// or `Err(...)` if the native API call failed.
    #[tauri::command]
    pub async fn set_app_icon(app: tauri::AppHandle, icon_name: String) -> Result<bool, String> {
        println!("[AppIcon] set_app_icon called with icon_name: {}", icon_name);

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
            println!("[AppIcon] mce_set_app_icon returned false for: {}", icon_name);
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

            let serve_dir = resolve_bundled_overlay_dir(&resource_dir)
                .or_else(resolve_dev_public_dir)
                .unwrap_or(resource_dir.clone());

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

            app.manage(audio_capture::AudioCaptureState::default());
            app.manage(assemblyai_stream::AssemblyAiStreamState::default());

            // Prevent macOS App Nap — keeps audio capture and transcription
            // running reliably when the app is in the background.
            #[cfg(target_os = "macos")]
            app_nap::prevent_app_nap();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            save_bg_image,
            save_upload_file,
            save_background_video_file,
            load_app_data,
            save_app_data,
            get_overlay_port,
            get_device_info,
            save_dock_data,
            load_dock_data,
            search_online_song_lyrics,
            load_transcripts,
            save_transcript,
            delete_transcript,
            get_transcript_stats,
            translate_transcript,
            extract_text_from_pdf,
            audio_capture::list_audio_devices,
            audio_capture::start_audio_capture,
            audio_capture::stop_audio_capture,
            assemblyai_stream::start_assemblyai_stream,
            assemblyai_stream::stop_assemblyai_stream,
            assemblyai_stream::set_microphone_gain,
            local_llm::get_local_llm_runtime_status,
            local_llm::install_local_llm_model,
            local_llm::generate_local_llm_text,
            app_icon::set_app_icon
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
