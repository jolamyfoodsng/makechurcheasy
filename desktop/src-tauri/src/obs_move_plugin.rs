use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MOVE_PLUGIN_VERSION: &str = "3.2.1";
const MOVE_PLUGIN_FOLDER: &str = "obs-move-transition";
const BRIDGE_PLUGIN_VERSION: &str = "1.0.0";
const BRIDGE_PLUGIN_FOLDER: &str = "obs-mce-bridge";
const BRIDGE_PLUGIN_NAME: &str = "mce-obs-bridge";

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ObsMovePluginStatus {
    pub installed: bool,
    pub bundled: bool,
    pub version: Option<String>,
    pub install_path: Option<String>,
    pub bridge_installed: bool,
    pub bridge_bundled: bool,
    pub bridge_version: Option<String>,
    pub bridge_install_path: Option<String>,
    pub platform: String,
    pub restart_required: bool,
    pub message: String,
}

fn platform_folder() -> Option<&'static str> {
    if cfg!(target_os = "macos") {
        Some("macos")
    } else if cfg!(target_os = "windows") {
        Some("windows")
    } else {
        None
    }
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else {
        "Unsupported platform"
    }
}

fn push_unique(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.iter().any(|candidate| candidate == &path) {
        candidates.push(path);
    }
}

fn bundled_resource_root_candidates(app: &AppHandle, folder: &str) -> Vec<PathBuf> {
    let platform = match platform_folder() {
        Some(platform) => platform,
        None => return Vec::new(),
    };
    let mut candidates = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        for root in [
            resource_dir.clone(),
            resource_dir.join("_up_"),
            resource_dir.join("resources"),
        ] {
            push_unique(&mut candidates, root.join(folder).join(platform));
        }
    }

    let manifest_resources = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(folder)
        .join(platform);
    push_unique(&mut candidates, manifest_resources);

    candidates
}

fn bundled_move_plugin_path(app: &AppHandle) -> Option<PathBuf> {
    bundled_resource_root_candidates(app, MOVE_PLUGIN_FOLDER)
        .into_iter()
        .find(|path| {
            if cfg!(target_os = "macos") {
                path.join("move-transition.plugin").is_dir()
            } else {
                path.join("move-transition")
                    .join("bin")
                    .join("64bit")
                    .join("move-transition.dll")
                    .is_file()
            }
        })
}

fn bundled_bridge_plugin_path(app: &AppHandle) -> Option<PathBuf> {
    bundled_resource_root_candidates(app, BRIDGE_PLUGIN_FOLDER)
        .into_iter()
        .find(|path| {
            if cfg!(target_os = "macos") {
                path.join("mce-obs-bridge.plugin").is_dir()
            } else {
                path.join(BRIDGE_PLUGIN_NAME)
                    .join("bin")
                    .join("64bit")
                    .join("mce-obs-bridge.dll")
                    .is_file()
            }
        })
}

fn installed_plugin_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "macos") {
        if let Some(home) = dirs::home_dir() {
            push_unique(
                &mut candidates,
                home.join("Library")
                    .join("Application Support")
                    .join("obs-studio")
                    .join("plugins")
                    .join("move-transition.plugin"),
            );
        }
    } else if cfg!(target_os = "windows") {
        if let Some(data_dir) = dirs::data_dir() {
            push_unique(
                &mut candidates,
                data_dir
                    .join("obs-studio")
                    .join("plugins")
                    .join("move-transition"),
            );
        }
        if let Some(local_data_dir) = dirs::data_local_dir() {
            push_unique(
                &mut candidates,
                local_data_dir
                    .join("obs-studio")
                    .join("plugins")
                    .join("move-transition"),
            );
        }
        if let Ok(program_data) = std::env::var("PROGRAMDATA") {
            push_unique(
                &mut candidates,
                PathBuf::from(program_data)
                    .join("obs-studio")
                    .join("plugins")
                    .join("move-transition"),
            );
        }
    }

    candidates
}

fn installed_bridge_plugin_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if cfg!(target_os = "macos") {
        if let Some(home) = dirs::home_dir() {
            push_unique(
                &mut candidates,
                home.join("Library")
                    .join("Application Support")
                    .join("obs-studio")
                    .join("plugins")
                    .join("mce-obs-bridge.plugin"),
            );
        }
    } else if cfg!(target_os = "windows") {
        if let Some(data_dir) = dirs::data_dir() {
            push_unique(
                &mut candidates,
                data_dir
                    .join("obs-studio")
                    .join("plugins")
                    .join(BRIDGE_PLUGIN_NAME),
            );
        }
        if let Some(local_data_dir) = dirs::data_local_dir() {
            push_unique(
                &mut candidates,
                local_data_dir
                    .join("obs-studio")
                    .join("plugins")
                    .join(BRIDGE_PLUGIN_NAME),
            );
        }
        if let Ok(program_data) = std::env::var("PROGRAMDATA") {
            push_unique(
                &mut candidates,
                PathBuf::from(program_data)
                    .join("obs-studio")
                    .join("plugins")
                    .join(BRIDGE_PLUGIN_NAME),
            );
        }
    }

    candidates
}

fn installed_plugin_path() -> Option<PathBuf> {
    installed_plugin_candidates().into_iter().find(|path| {
        if cfg!(target_os = "macos") {
            path.is_dir()
        } else {
            path.join("bin")
                .join("64bit")
                .join("move-transition.dll")
                .is_file()
        }
    })
}

fn installed_bridge_plugin_path() -> Option<PathBuf> {
    installed_bridge_plugin_candidates()
        .into_iter()
        .find(|path| {
            if cfg!(target_os = "macos") {
                path.is_dir()
            } else {
                path.join("bin")
                    .join("64bit")
                    .join("mce-obs-bridge.dll")
                    .is_file()
            }
        })
}

fn macos_bundle_version(path: &Path) -> Option<String> {
    let contents = fs::read_to_string(path.join("Contents").join("Info.plist")).ok()?;
    let key = "<key>CFBundleShortVersionString</key>";
    let after_key = contents.split_once(key)?.1;
    after_key
        .split_once("<string>")?
        .1
        .split_once("</string>")
        .map(|(version, _)| version.trim().to_string())
}

fn installed_version(path: &Path) -> Option<String> {
    if cfg!(target_os = "macos") {
        return macos_bundle_version(path);
    }

    fs::read_to_string(path.join(".mce-version"))
        .ok()
        .map(|version| version.trim().to_string())
        .filter(|version| !version.is_empty())
}

fn build_status(app: &AppHandle) -> ObsMovePluginStatus {
    let installed_path = installed_plugin_path();
    let installed = installed_path.is_some();
    let bundled = bundled_move_plugin_path(app).is_some();
    let version = installed_path.as_deref().and_then(installed_version);
    let bridge_installed_path = installed_bridge_plugin_path();
    let bridge_installed = bridge_installed_path.is_some();
    let bridge_bundled = bundled_bridge_plugin_path(app).is_some();
    let bridge_version = bridge_installed_path.as_deref().and_then(installed_version);
    let message = match (installed, bridge_installed, bundled, bridge_bundled) {
        (true, true, _, _) => format!(
            "Move Transition {} and the MCE OBS Bridge {} are installed for {}. Restart OBS if it was open during installation.",
            version.as_deref().unwrap_or(MOVE_PLUGIN_VERSION),
            bridge_version.as_deref().unwrap_or(BRIDGE_PLUGIN_VERSION),
            platform_name()
        ),
        (true, false, _, true) => format!(
            "Move Transition {} is installed. The MCE OBS Bridge {} is ready to install.",
            version.as_deref().unwrap_or(MOVE_PLUGIN_VERSION),
            BRIDGE_PLUGIN_VERSION
        ),
        (false, true, true, _) => format!(
            "The MCE OBS Bridge {} is installed. Move Transition {} is ready to install.",
            bridge_version.as_deref().unwrap_or(BRIDGE_PLUGIN_VERSION),
            MOVE_PLUGIN_VERSION
        ),
        (false, false, true, true) => format!(
            "Move Transition {} and the MCE OBS Bridge {} are ready to install.",
            MOVE_PLUGIN_VERSION,
            BRIDGE_PLUGIN_VERSION
        ),
        _ => "Move Transition and the MCE OBS Bridge are not bundled in this build.".to_string(),
    };

    ObsMovePluginStatus {
        installed,
        bundled,
        version,
        install_path: installed_path.and_then(|path| path.to_str().map(str::to_string)),
        bridge_installed,
        bridge_bundled,
        bridge_version,
        bridge_install_path: bridge_installed_path
            .and_then(|path| path.to_str().map(str::to_string)),
        platform: platform_name().to_string(),
        restart_required: installed || bridge_installed,
        message,
    }
}

fn copy_tree(source: &Path, destination: &Path) -> Result<(), String> {
    if source.is_dir() {
        fs::create_dir_all(destination)
            .map_err(|error| format!("Could not create {}: {}", destination.display(), error))?;

        for entry in fs::read_dir(source)
            .map_err(|error| format!("Could not read {}: {}", source.display(), error))?
        {
            let entry = entry.map_err(|error| format!("Could not read plugin entry: {}", error))?;
            let child_source = entry.path();
            let child_destination = destination.join(entry.file_name());
            copy_tree(&child_source, &child_destination)?;
        }
        return Ok(());
    }

    fs::copy(source, destination).map_err(|error| {
        format!(
            "Could not copy {} to {}: {}",
            source.display(),
            destination.display(),
            error
        )
    })?;

    #[cfg(unix)]
    if let Ok(metadata) = fs::metadata(source) {
        use std::os::unix::fs::PermissionsExt;
        let mut permissions = metadata.permissions();
        permissions.set_mode(metadata.permissions().mode() & 0o777);
        let _ = fs::set_permissions(destination, permissions);
    }

    Ok(())
}

fn install_destination() -> Result<PathBuf, String> {
    if cfg!(target_os = "macos") {
        let home = dirs::home_dir()
            .ok_or_else(|| "Could not determine the macOS home folder.".to_string())?;
        return Ok(home
            .join("Library")
            .join("Application Support")
            .join("obs-studio")
            .join("plugins")
            .join("move-transition.plugin"));
    }

    if cfg!(target_os = "windows") {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| "Could not determine the Windows user data folder.".to_string())?;
        return Ok(data_dir
            .join("obs-studio")
            .join("plugins")
            .join("move-transition"));
    }

    Err("Move Transition installation is supported on macOS and Windows builds.".to_string())
}

fn bridge_install_destination() -> Result<PathBuf, String> {
    if cfg!(target_os = "macos") {
        let home = dirs::home_dir()
            .ok_or_else(|| "Could not determine the macOS home folder.".to_string())?;
        return Ok(home
            .join("Library")
            .join("Application Support")
            .join("obs-studio")
            .join("plugins")
            .join("mce-obs-bridge.plugin"));
    }

    if cfg!(target_os = "windows") {
        let data_dir = dirs::data_dir()
            .ok_or_else(|| "Could not determine the Windows user data folder.".to_string())?;
        return Ok(data_dir
            .join("obs-studio")
            .join("plugins")
            .join(BRIDGE_PLUGIN_NAME));
    }

    Err("MCE OBS Bridge installation is supported on macOS and Windows builds.".to_string())
}

#[tauri::command]
pub(crate) fn get_obs_move_plugin_status(app: AppHandle) -> Result<ObsMovePluginStatus, String> {
    Ok(build_status(&app))
}

#[tauri::command]
pub(crate) fn install_obs_move_plugin(app: AppHandle) -> Result<ObsMovePluginStatus, String> {
    let move_source_root = bundled_move_plugin_path(&app)
        .ok_or_else(|| "Move Transition is not included in this app build.".to_string())?;
    let bridge_source_root = bundled_bridge_plugin_path(&app)
        .ok_or_else(|| "The MCE OBS Bridge is not included in this app build.".to_string())?;
    let move_source = if cfg!(target_os = "macos") {
        move_source_root.join("move-transition.plugin")
    } else {
        move_source_root.join("move-transition")
    };
    let bridge_source = if cfg!(target_os = "macos") {
        bridge_source_root.join("mce-obs-bridge.plugin")
    } else {
        bridge_source_root.join(BRIDGE_PLUGIN_NAME)
    };
    let move_destination = install_destination()?;
    let bridge_destination = bridge_install_destination()?;

    for destination in [&move_destination, &bridge_destination] {
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("Could not create OBS plugin folder: {}", error))?;
        }
    }

    copy_tree(&move_source, &move_destination)?;
    copy_tree(&bridge_source, &bridge_destination)?;
    if cfg!(target_os = "windows") {
        fs::write(
            move_destination.join(".mce-version"),
            format!("{}\n", MOVE_PLUGIN_VERSION),
        )
        .map_err(|error| format!("Could not write Move Transition version marker: {}", error))?;
        fs::write(
            bridge_destination.join(".mce-version"),
            format!("{}\n", BRIDGE_PLUGIN_VERSION),
        )
        .map_err(|error| format!("Could not write MCE OBS Bridge version marker: {}", error))?;
    }

    Ok(build_status(&app))
}
