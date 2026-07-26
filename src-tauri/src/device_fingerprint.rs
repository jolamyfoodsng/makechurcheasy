use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Serialize, Deserialize)]
struct DeviceIdentity {
    installation_id: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceFingerprint {
    pub installation_id: String,
    pub fingerprint_hash: String,
}

/// Platform-specific app data directory.
///
/// macOS:   ~/Library/Application Support/MakeChurchEasy
/// Windows: %APPDATA%/MakeChurchEasy
/// Linux:   ~/.local/share/MakeChurchEasy
fn app_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Could not determine app data directory")?;
    let dir = base.join("MakeChurchEasy");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data directory: {}", e))?;
    Ok(dir)
}

fn get_device_file_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("device.json"))
}

fn get_or_create_installation_id() -> Result<String, String> {
    let path = get_device_file_path()?;

    if path.exists() {
        let content =
            fs::read_to_string(&path).map_err(|e| format!("Failed to read device file: {}", e))?;
        let identity: DeviceIdentity = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse device file: {}", e))?;
        return Ok(identity.installation_id);
    }

    let id = Uuid::new_v4().to_string();
    let identity = DeviceIdentity {
        installation_id: id.clone(),
        created_at: chrono::Utc::now().to_rfc3339(),
    };

    let content = serde_json::to_string_pretty(&identity)
        .map_err(|e| format!("Failed to serialize device identity: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write device file: {}", e))?;

    Ok(id)
}

/// Retrieve stable hardware identifiers unique to this physical machine.
///
/// macOS:   IOPlatformUUID (from ioreg — survives OS reinstalls)
/// Windows: MachineGuid + BIOS UUID + motherboard serial
/// Linux:   /etc/machine-id (dbus machine ID)
fn get_hardware_identifiers() -> Vec<String> {
    let mut ids: Vec<String> = Vec::new();

    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if let Some(rest) = line.trim().strip_prefix("\"IOPlatformUUID\" = \"") {
                    if let Some(uuid) = rest.trim_end_matches('"').split('"').next() {
                        if !uuid.is_empty() {
                            ids.push(format!("ioplatformuuid:{}", uuid.trim()));
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("reg")
            .args([
                "QUERY",
                "HKLM\\SOFTWARE\\Microsoft\\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                let trimmed = line.trim();
                if let Some(pos) = trimmed.find("REG_SZ") {
                    let value = trimmed[pos + 6..].trim();
                    if !value.is_empty() {
                        ids.push(format!("machineguid:{}", value));
                    }
                }
            }
        }

        if let Ok(output) = std::process::Command::new("wmic")
            .args(["csproduct", "get", "uuid"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let value = line.trim();
                if !value.is_empty() && value != "FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF" {
                    ids.push(format!("biosuuid:{}", value));
                }
            }
        }

        if let Ok(output) = std::process::Command::new("wmic")
            .args(["baseboard", "get", "serialnumber"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let value = line.trim();
                if !value.is_empty() && !value.eq_ignore_ascii_case("to be filled by o.e.m.") {
                    ids.push(format!("baseboard:{}", value));
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for candidate in &["/etc/machine-id", "/var/lib/dbus/machine-id"] {
            if let Ok(content) = fs::read_to_string(candidate) {
                let trimmed = content.trim().to_string();
                if !trimmed.is_empty() {
                    ids.push(format!("machineid:{}", trimmed));
                }
            }
        }
    }

    ids.sort();
    ids.dedup();
    ids
}

/// Retrieve the machine model identifier.
///
/// macOS:   "MacBookPro18,3" (from sysctl)
/// Windows: "System Model" from wmic
/// Linux:   /sys/devices/virtual/dmi/id/product_name
fn get_machine_model() -> String {
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("sysctl")
            .args(["-n", "hw.model"])
            .output()
        {
            let model = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !model.is_empty() {
                return model;
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("wmic")
            .args(["csproduct", "get", "name"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines().skip(1) {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        for candidate in &[
            "/sys/devices/virtual/dmi/id/product_name",
            "/sys/class/dmi/id/product_name",
        ] {
            if let Ok(content) = fs::read_to_string(candidate) {
                let trimmed = content.trim().to_string();
                if !trimmed.is_empty() {
                    return trimmed;
                }
            }
        }
    }

    String::new()
}

fn generate_fingerprint_hash() -> Result<String, String> {
    let hardware_ids = get_hardware_identifiers();
    let machine_model = get_machine_model();
    let os_name = std::env::consts::OS;

    if hardware_ids.is_empty() {
        return Err("Could not read hardware identifier for this platform".to_string());
    }

    let fingerprint_input = format!(
        "{}|{}|{}|mce_hw_seed_v2",
        hardware_ids.join("|"),
        machine_model,
        os_name
    );

    let mut hasher = Sha256::new();
    hasher.update(fingerprint_input.as_bytes());
    let result = hasher.finalize();

    Ok(format!("{:x}", result))
}

#[tauri::command]
pub fn get_device_fingerprint() -> Result<DeviceFingerprint, String> {
    let installation_id = get_or_create_installation_id()?;
    let fingerprint_hash = generate_fingerprint_hash()?;

    Ok(DeviceFingerprint {
        installation_id,
        fingerprint_hash,
    })
}
