//! One-time move of user data out of the old App Sandbox container.
//!
//! Builds up to v4.1.x were sandboxed, so macOS kept everything (settings,
//! songs, login, WebView storage) in
//! `~/Library/Containers/com.makechurcheasy.desktop/Data/Library/...`.
//! Unsandboxed builds read the real `~/Library/...` instead, so without this
//! users would look signed out with empty settings after updating.
//!
//! Runs before any window or webview exists. It only copies (the container is
//! left untouched as a backup), never overwrites anything that already exists,
//! and records a marker so it runs once.

#[cfg(target_os = "macos")]
pub fn migrate_from_sandbox_container(bundle_id: &str) {
    use std::path::{Path, PathBuf};

    // Still sandboxed (old entitlements): nothing to do.
    if std::env::var_os("APP_SANDBOX_CONTAINER_ID").is_some() {
        return;
    }
    let Some(home) = dirs::home_dir() else { return };
    let library = home.join("Library");
    let container_library = library
        .join("Containers")
        .join(bundle_id)
        .join("Data")
        .join("Library");
    let marker_dir = library.join("Application Support").join(bundle_id);
    let marker = marker_dir.join(".sandbox-migration-done");
    if marker.exists() || !container_library.is_dir() {
        return;
    }
    // macOS can refuse access to the container; leave it for the next launch.
    if std::fs::read_dir(&container_library).is_err() {
        eprintln!("[sandbox-migration] cannot read {}", container_library.display());
        return;
    }

    fn copy_recursive(src: &Path, dst: &Path, copied: &mut usize, failed: &mut usize) {
        let Ok(meta) = std::fs::symlink_metadata(src) else { *failed += 1; return };
        if meta.file_type().is_symlink() {
            if let Ok(target) = std::fs::read_link(src) {
                if std::os::unix::fs::symlink(target, dst).is_err() { *failed += 1 }
            }
        } else if meta.is_dir() {
            if std::fs::create_dir_all(dst).is_err() { *failed += 1; return }
            if let Ok(entries) = std::fs::read_dir(src) {
                for entry in entries.flatten() {
                    let to = dst.join(entry.file_name());
                    if !to.exists() {
                        copy_recursive(&entry.path(), &to, copied, failed);
                    }
                }
            }
        } else if std::fs::copy(src, dst).is_ok() {
            *copied += 1;
        } else {
            *failed += 1;
        }
    }

    let mut copied = 0usize;
    let mut failed = 0usize;
    let mut pairs: Vec<(PathBuf, PathBuf)> = Vec::new();

    // Everything the app keeps under Application Support (Tauri app data,
    // "MakeChurchEasy" settings DB, device id, mobile companion...). Skip
    // folders that already exist in the real location (e.g. obs-studio).
    for folder in ["Application Support", "WebKit", "HTTPStorages", "Logs"] {
        let src_root = container_library.join(folder);
        let Ok(entries) = std::fs::read_dir(&src_root) else { continue };
        for entry in entries.flatten() {
            let dst = library.join(folder).join(entry.file_name());
            if !dst.exists() {
                pairs.push((entry.path(), dst));
            }
        }
    }
    // Only our own preference files.
    if let Ok(entries) = std::fs::read_dir(container_library.join("Preferences")) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            if name.to_string_lossy().starts_with(bundle_id) {
                let dst = library.join("Preferences").join(&name);
                if !dst.exists() {
                    pairs.push((entry.path(), dst));
                }
            }
        }
    }

    for (src, dst) in &pairs {
        if let Some(parent) = dst.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        copy_recursive(src, dst, &mut copied, &mut failed);
    }

    let _ = std::fs::create_dir_all(&marker_dir);
    let note = format!(
        "migrated {} items ({} files copied, {} failed) from {}\n",
        pairs.len(),
        copied,
        failed,
        container_library.display()
    );
    eprintln!("[sandbox-migration] {}", note.trim());
    // If macOS refused access to the container, try again next launch.
    if failed == 0 || copied > 0 {
        let _ = std::fs::write(&marker, note);
    }
}

#[cfg(not(target_os = "macos"))]
pub fn migrate_from_sandbox_container(_bundle_id: &str) {}
