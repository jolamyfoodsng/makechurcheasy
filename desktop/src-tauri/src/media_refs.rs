//! Reference-based media library.
//!
//! Imported media stays where the user keeps it; the library only records a
//! pointer to the original file. Each reference gets a virtual upload name
//! (`ref_<id>.<ext>`) so every existing `/uploads/<name>` consumer keeps
//! working: the overlay server resolves that name through this registry and
//! streams the original file. Deleting a library item removes the pointer,
//! never the user's file.

use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::UNIX_EPOCH;
use uuid::Uuid;

const REGISTRY_FILE: &str = "media_refs.json";
const REFERENCE_PREFIX: &str = "ref_";
/// Library copies made by the optional "copy into library" setting.
const COPIES_DIR: &str = "library-copies";

// Mirrors COMMON_*_EXTENSIONS in src/services/mediaValidation.ts.
const IMAGE_EXTENSIONS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "ico", "tif", "tiff", "avif", "heic", "heif",
];
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv", "ts", "mts", "m2ts", "3gp", "3g2",
    "ogv", "vob", "mpeg", "mpg",
];
const AUDIO_EXTENSIONS: &[&str] = &[
    "mp3", "wav", "ogg", "oga", "flac", "aac", "m4a", "m4b", "wma", "opus", "aiff", "aif", "alac",
    "weba", "amr", "mid", "midi", "ac3", "caf",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredReference {
    path: String,
    /// The user's original path. Differs from `path` once a library copy exists.
    original_path: String,
    extension: String,
    #[serde(default)]
    copied: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaReferenceInfo {
    id: String,
    virtual_name: String,
    path: String,
    original_path: String,
    file_name: String,
    size: u64,
    modified_ms: u64,
    copied: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaReferenceRegistration {
    path: String,
    reference: Option<MediaReferenceInfo>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct MediaReferenceProbe {
    duration_sec: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    thumbnail_data_url: Option<String>,
}

fn registry() -> &'static Mutex<HashMap<String, StoredReference>> {
    static REGISTRY: OnceLock<Mutex<HashMap<String, StoredReference>>> = OnceLock::new();
    REGISTRY.get_or_init(|| Mutex::new(load_registry().unwrap_or_default()))
}

fn registry_path() -> Result<PathBuf, String> {
    Ok(crate::app_dir()?.join(REGISTRY_FILE))
}

fn load_registry() -> Result<HashMap<String, StoredReference>, String> {
    let path = registry_path()?;
    let Ok(raw) = fs::read_to_string(&path) else { return Ok(HashMap::new()) };
    serde_json::from_str(&raw).map_err(|error| format!("Media reference list is unreadable: {error}"))
}

fn save_registry(entries: &HashMap<String, StoredReference>) -> Result<(), String> {
    let path = registry_path()?;
    let json = serde_json::to_string_pretty(entries)
        .map_err(|error| format!("Could not encode media references: {error}"))?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, json).map_err(|error| format!("Could not save media references: {error}"))?;
    fs::rename(&temporary, &path).map_err(|error| format!("Could not save media references: {error}"))
}

fn virtual_name(id: &str, extension: &str) -> String {
    format!("{REFERENCE_PREFIX}{id}.{extension}")
}

/// Extract the reference id from a virtual upload name (`ref_<32 hex>.<ext>`).
pub fn reference_id_from_name(name: &str) -> Option<&str> {
    let rest = name.strip_prefix(REFERENCE_PREFIX)?;
    let id = rest.split('.').next()?;
    (id.len() == 32 && id.chars().all(|ch| ch.is_ascii_hexdigit())).then_some(id)
}

pub fn is_reference_name(name: &str) -> bool {
    reference_id_from_name(name).is_some()
}

/// Resolve a virtual upload name to the file it points at. Only registered
/// references resolve, so the overlay server never serves arbitrary paths.
pub fn resolve_reference_name(name: &str) -> Option<PathBuf> {
    let id = reference_id_from_name(name)?;
    let entries = registry().lock().ok()?;
    let entry = entries.get(id)?;
    let path = PathBuf::from(&entry.path);
    path.is_file().then_some(path)
}

fn supported_extension(path: &Path) -> Option<String> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    [IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS]
        .iter()
        .any(|list| list.contains(&extension.as_str()))
        .then_some(extension)
}

fn file_stats(path: &Path) -> (u64, u64) {
    let Ok(metadata) = fs::metadata(path) else { return (0, 0) };
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0);
    (metadata.len(), modified)
}

fn info_for(id: &str, entry: &StoredReference) -> MediaReferenceInfo {
    let path = Path::new(&entry.path);
    let (size, modified_ms) = file_stats(path);
    let file_name = Path::new(&entry.original_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_string();
    MediaReferenceInfo {
        id: id.to_string(),
        virtual_name: virtual_name(id, &entry.extension),
        path: entry.path.clone(),
        original_path: entry.original_path.clone(),
        file_name,
        size,
        modified_ms,
        copied: entry.copied,
    }
}

fn validate_media_path(raw: &str) -> Result<(PathBuf, String), String> {
    let path = PathBuf::from(raw.trim());
    if !path.is_absolute() {
        return Err("Media path must be absolute".to_string());
    }
    if !path.is_file() {
        return Err("The file could not be found".to_string());
    }
    let extension = supported_extension(&path)
        .ok_or_else(|| "Only image, video and audio files can be added to the library".to_string())?;
    Ok((path, extension))
}

/// Remove prepared Studio videos derived from a reference.
fn clear_studio_cache(name: &str) {
    let Ok(uploads_dir) = crate::app_dir().map(|dir| dir.join("uploads")) else { return };
    let prepared = uploads_dir.join(crate::studio_video_cache_name(name));
    if prepared.is_file() {
        let _ = fs::remove_file(prepared);
    }
}

fn remove_library_copy(entry: &StoredReference) {
    if !entry.copied {
        return;
    }
    let Ok(copies_dir) = crate::app_dir().map(|dir| dir.join("uploads").join(COPIES_DIR)) else { return };
    let path = Path::new(&entry.path);
    // Only delete files MakeChurchEazy created itself.
    if path.starts_with(&copies_dir) && path.is_file() {
        let _ = fs::remove_file(path);
    }
}

/// Register files by path. Nothing is copied, so this returns immediately
/// even for multi-gigabyte videos.
#[tauri::command]
pub fn register_media_references(paths: Vec<String>) -> Result<Vec<MediaReferenceRegistration>, String> {
    let mut entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
    let mut results = Vec::with_capacity(paths.len());
    for raw in paths {
        match validate_media_path(&raw) {
            Ok((path, extension)) => {
                let id = Uuid::new_v4().simple().to_string();
                let path_string = path.to_string_lossy().to_string();
                let entry = StoredReference {
                    path: path_string.clone(),
                    original_path: path_string,
                    extension,
                    copied: false,
                };
                let info = info_for(&id, &entry);
                entries.insert(id, entry);
                results.push(MediaReferenceRegistration { path: raw, reference: Some(info), error: None });
            }
            Err(error) => results.push(MediaReferenceRegistration { path: raw, reference: None, error: Some(error) }),
        }
    }
    save_registry(&entries)?;
    Ok(results)
}

/// Forget a reference. The user's original file is never touched; only a
/// library copy MakeChurchEazy made itself is removed.
#[tauri::command]
pub fn unregister_media_reference(id: String) -> Result<(), String> {
    let mut entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
    if let Some(entry) = entries.remove(&id) {
        remove_library_copy(&entry);
        clear_studio_cache(&virtual_name(&id, &entry.extension));
        save_registry(&entries)?;
    }
    Ok(())
}

/// Point an existing reference at a new location, keeping its id (and so
/// every URL, schedule item and OBS source that uses it).
#[tauri::command]
pub fn relink_media_reference(id: String, path: String) -> Result<MediaReferenceInfo, String> {
    let (path, extension) = validate_media_path(&path)?;
    let mut entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
    let entry = entries.get_mut(&id).ok_or("This media item is no longer registered")?;
    if entry.extension != extension {
        return Err(format!("Choose a .{} file to replace the missing one", entry.extension));
    }
    let path_string = path.to_string_lossy().to_string();
    entry.path = path_string.clone();
    entry.original_path = path_string;
    entry.copied = false;
    let info = info_for(&id, entry);
    clear_studio_cache(&info.virtual_name);
    save_registry(&entries)?;
    Ok(info)
}

/// Forget the reference behind a virtual upload name. Used by the shared
/// upload delete path so every way of deleting a library item drops the
/// pointer without touching the user's original file.
pub fn unregister_reference_name(name: &str) -> Result<(), String> {
    match reference_id_from_name(name) {
        Some(id) => unregister_media_reference(id.to_string()),
        None => Ok(()),
    }
}

/// Return the virtual names that cannot be played. A name resolves when its
/// reference points at an existing file, or when a file with that name sits
/// in the uploads folder (for example after restoring a cloud backup).
#[tauri::command]
pub fn check_media_references(names: Vec<String>) -> Result<Vec<String>, String> {
    let uploads_dir = crate::app_dir()?.join("uploads");
    Ok(names
        .into_iter()
        .filter(|name| {
            is_reference_name(name)
                && resolve_reference_name(name).is_none()
                && !uploads_dir.join(name).is_file()
        })
        .collect())
}

#[tauri::command]
pub fn get_media_reference(id: String) -> Result<Option<MediaReferenceInfo>, String> {
    let entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
    Ok(entries.get(&id).map(|entry| info_for(&id, entry)))
}

/// Copy a referenced file into the library folder in the background and
/// switch the reference to the copy. The original stays where it was.
#[tauri::command]
pub async fn copy_media_reference_into_library(id: String) -> Result<MediaReferenceInfo, String> {
    let entry = {
        let entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
        entries.get(&id).cloned().ok_or("This media item is no longer registered")?
    };
    if entry.copied {
        let entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
        return entries.get(&id).map(|entry| info_for(&id, entry)).ok_or_else(|| "This media item is no longer registered".to_string());
    }
    let source = PathBuf::from(&entry.path);
    let copies_dir = crate::app_dir()?.join("uploads").join(COPIES_DIR);
    let target = copies_dir.join(virtual_name(&id, &entry.extension));
    tauri::async_runtime::spawn_blocking({
        let target = target.clone();
        move || -> Result<(), String> {
            fs::create_dir_all(&copies_dir).map_err(|error| format!("Could not create the library folder: {error}"))?;
            let temporary = target.with_extension("copying");
            fs::copy(&source, &temporary).map_err(|error| {
                let _ = fs::remove_file(&temporary);
                format!("Could not copy the file into the library: {error}")
            })?;
            fs::rename(&temporary, &target).map_err(|error| format!("Could not finish the library copy: {error}"))
        }
    })
    .await
    .map_err(|error| format!("Library copy stopped unexpectedly: {error}"))??;

    let mut entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
    let Some(current) = entries.get_mut(&id) else {
        // Deleted while copying.
        let _ = fs::remove_file(&target);
        return Err("This media item was removed while copying".to_string());
    };
    current.path = target.to_string_lossy().to_string();
    current.copied = true;
    let info = info_for(&id, current);
    save_registry(&entries)?;
    Ok(info)
}

fn probe_with_ffmpeg(ffmpeg: &Path, ffprobe: &Path, input: &Path, is_video: bool) -> MediaReferenceProbe {
    let mut probe = MediaReferenceProbe::default();
    if let Ok(output) = crate::studio_ffmpeg_command(ffprobe)
        .args(["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "json"])
        .arg(input)
        .output()
    {
        if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&output.stdout) {
            let stream = json.get("streams").and_then(|streams| streams.get(0));
            probe.width = stream.and_then(|s| s.get("width")).and_then(serde_json::Value::as_u64).map(|v| v as u32);
            probe.height = stream.and_then(|s| s.get("height")).and_then(serde_json::Value::as_u64).map(|v| v as u32);
            if is_video {
                probe.duration_sec = json
                    .get("format")
                    .and_then(|format| format.get("duration"))
                    .and_then(serde_json::Value::as_str)
                    .and_then(|value| value.parse::<f64>().ok());
            }
        }
    }

    let seek = match probe.duration_sec {
        Some(duration) if duration > 2.0 => "1",
        _ => "0",
    };
    let mut command = crate::studio_ffmpeg_command(ffmpeg);
    command.args(["-hide_banner", "-loglevel", "error"]);
    if is_video {
        command.args(["-ss", seek]);
    }
    if let Ok(output) = command
        .arg("-i")
        .arg(input)
        .args(["-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "5", "-f", "image2", "-c:v", "mjpeg", "pipe:1"])
        .output()
    {
        if output.status.success() && !output.stdout.is_empty() {
            let encoded = base64::engine::general_purpose::STANDARD.encode(&output.stdout);
            probe.thumbnail_data_url = Some(format!("data:image/jpeg;base64,{encoded}"));
        }
    }
    probe
}

/// Read duration, size and a small poster frame for a reference with the
/// bundled FFmpeg. Runs after the item already shows in the library.
#[tauri::command]
pub async fn probe_media_reference(app: tauri::AppHandle, id: String) -> Result<MediaReferenceProbe, String> {
    let (path, extension) = {
        let entries = registry().lock().map_err(|_| "Media reference list is busy".to_string())?;
        let entry = entries.get(&id).ok_or("This media item is no longer registered")?;
        (PathBuf::from(&entry.path), entry.extension.clone())
    };
    if AUDIO_EXTENSIONS.contains(&extension.as_str()) {
        return Ok(MediaReferenceProbe::default());
    }
    let is_video = VIDEO_EXTENSIONS.contains(&extension.as_str());
    let ffmpeg = crate::studio_ffmpeg_path(&app, if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" })?;
    let ffprobe = crate::studio_ffmpeg_path(&app, if cfg!(target_os = "windows") { "ffprobe.exe" } else { "ffprobe" })?;
    tauri::async_runtime::spawn_blocking(move || probe_with_ffmpeg(&ffmpeg, &ffprobe, &path, is_video))
        .await
        .map_err(|error| format!("Media probe stopped unexpectedly: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reference_names_require_a_full_hex_id() {
        let id = "0123456789abcdef0123456789abcdef";
        assert_eq!(reference_id_from_name(&format!("ref_{id}.mp4")), Some(id));
        assert!(reference_id_from_name("ref_123.mp4").is_none());
        assert!(reference_id_from_name("ref_../../etc/passwd").is_none());
        assert!(reference_id_from_name("media_1700000000000_clip.mp4").is_none());
        assert!(!is_reference_name("ref_zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz.png"));
    }

    #[test]
    fn unregistered_reference_names_do_not_resolve() {
        assert!(resolve_reference_name("ref_ffffffffffffffffffffffffffffffff.mp4").is_none());
    }

    #[test]
    fn relative_and_unsupported_paths_are_rejected() {
        assert!(validate_media_path("clip.mp4").is_err());
        let exe = std::env::current_exe().unwrap();
        assert!(validate_media_path(&exe.to_string_lossy()).is_err());
    }
}
