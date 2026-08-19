//! Native, per-user Dock settings storage.
//!
//! The OBS Dock runs in OBS's embedded browser, so browser storage is not a
//! durable source of truth. This module keeps the settings in a small SQLite
//! database owned by the desktop application and exposes simple JSON helpers
//! for the local overlay server and Tauri commands.

use rusqlite::{params, Connection};
use serde_json::{Map, Value};
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const DATABASE_FILE: &str = "makechurcheasy-settings.sqlite3";

fn database_path() -> Result<PathBuf, String> {
    let root = dirs::data_local_dir()
        .or_else(dirs::data_dir)
        .or_else(dirs::home_dir)
        .ok_or_else(|| "Could not determine the desktop app-data directory".to_string())?;
    let directory = root.join("MakeChurchEasy");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Could not create the settings directory: {error}"))?;
    Ok(directory.join(DATABASE_FILE))
}

fn open_database() -> Result<Connection, String> {
    let connection = Connection::open(database_path()?)
        .map_err(|error| format!("Could not open the Dock settings database: {error}"))?;
    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS dock_settings (
                 scope TEXT NOT NULL,
                 setting_key TEXT NOT NULL,
                 value_json TEXT NOT NULL,
                 updated_at INTEGER NOT NULL,
                 PRIMARY KEY (scope, setting_key)
             );
             CREATE INDEX IF NOT EXISTS idx_dock_settings_scope
                 ON dock_settings(scope);",
        )
        .map_err(|error| format!("Could not initialize the Dock settings database: {error}"))?;
    Ok(connection)
}

/// Keep the scope local and predictable. The scope is normally the signed-in
/// desktop user id; the device scope is used before authentication is ready.
pub fn normalize_scope(scope: &str) -> Result<String, String> {
    let value = scope.trim();
    if value.is_empty() {
        return Ok("device".to_string());
    }
    if value.len() > 160
        || !value
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, ':' | '-' | '_' | '.'))
    {
        return Err("Invalid Dock settings scope".to_string());
    }
    Ok(value.to_string())
}

fn normalize_key(key: &str) -> Result<String, String> {
    let value = key.trim();
    if value.is_empty() || value.len() > 240 {
        return Err("Invalid Dock settings key".to_string());
    }
    if !value
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || matches!(character, ':' | '-' | '_' | '.'))
    {
        return Err("Invalid Dock settings key".to_string());
    }
    Ok(value.to_string())
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

pub fn load_settings(scope: &str) -> Result<String, String> {
    let scope = normalize_scope(scope)?;
    let connection = open_database()?;
    let mut statement = connection
        .prepare("SELECT setting_key, value_json FROM dock_settings WHERE scope = ?1")
        .map_err(|error| format!("Could not read Dock settings: {error}"))?;
    let rows = statement
        .query_map(params![scope], |row| {
            let key: String = row.get(0)?;
            let raw: String = row.get(1)?;
            Ok((key, raw))
        })
        .map_err(|error| format!("Could not enumerate Dock settings: {error}"))?;

    let mut values = Map::new();
    for row in rows {
        let (key, raw) = row.map_err(|error| format!("Could not read Dock setting: {error}"))?;
        let value = serde_json::from_str::<Value>(&raw).unwrap_or(Value::String(raw));
        values.insert(key, value);
    }

    serde_json::to_string(&serde_json::json!({
        "scope": scope,
        "values": values,
    }))
    .map_err(|error| format!("Could not encode Dock settings: {error}"))
}

pub fn save_setting(scope: &str, key: &str, value: &Value) -> Result<(), String> {
    let scope = normalize_scope(scope)?;
    let key = normalize_key(key)?;
    let value_json = serde_json::to_string(value)
        .map_err(|error| format!("Could not encode Dock setting: {error}"))?;
    let connection = open_database()?;
    connection
        .execute(
            "INSERT INTO dock_settings(scope, setting_key, value_json, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(scope, setting_key) DO UPDATE SET
                 value_json = excluded.value_json,
                 updated_at = excluded.updated_at",
            params![scope, key, value_json, now_millis()],
        )
        .map_err(|error| format!("Could not save Dock setting: {error}"))?;
    Ok(())
}

pub fn delete_setting(scope: &str, key: &str) -> Result<(), String> {
    let scope = normalize_scope(scope)?;
    let key = normalize_key(key)?;
    let connection = open_database()?;
    connection
        .execute(
            "DELETE FROM dock_settings WHERE scope = ?1 AND setting_key = ?2",
            params![scope, key],
        )
        .map_err(|error| format!("Could not delete Dock setting: {error}"))?;
    Ok(())
}
