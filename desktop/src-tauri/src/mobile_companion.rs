/**
 * mobile_companion.rs — Local WebSocket server for the Flutter mobile companion.
 *
 * Runs on port 8765. Accepts connections from the Flutter app, validates
 * pairing tokens, and relays commands to OBS WebSocket. Pushes state
 * updates (OBS connected, current song, current slide, current scripture)
 * back to all connected mobile clients.
 *
 * Flow:
 *   Phone → WebSocket → This server → OBS WebSocket → OBS
 *   OBS → OBS WebSocket → This server → WebSocket → Phone
 */
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;
use tauri::Emitter;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, oneshot, Mutex, RwLock};
use tokio::time::Duration;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use uuid::Uuid;

// ── Public state shared with the rest of the app ────────────────────────────

static MOBILE_SERVER_PORT: AtomicU16 = AtomicU16::new(0);

pub fn mobile_server_port() -> u16 {
    MOBILE_SERVER_PORT.load(Ordering::Relaxed)
}

fn pairing_token_store() -> &'static RwLock<Option<String>> {
    static STORE: OnceLock<RwLock<Option<String>>> = OnceLock::new();
    STORE.get_or_init(|| RwLock::new(None))
}

#[derive(Clone, Debug)]
struct MobileAccessPolicy {
    allowed: bool,
    plan: String,
    reason: String,
}

fn mobile_access_policy_store() -> &'static RwLock<MobileAccessPolicy> {
    static STORE: OnceLock<RwLock<MobileAccessPolicy>> = OnceLock::new();
    STORE.get_or_init(|| {
        RwLock::new(MobileAccessPolicy {
            allowed: false,
            plan: "free".into(),
            reason: "Mobile control requires an eligible paid plan. Upgrade in MakeChurchEasy on your desktop.".into(),
        })
    })
}

pub async fn set_mobile_access_policy(allowed: bool, plan: String, reason: Option<String>) {
    let mut policy = mobile_access_policy_store().write().await;
    policy.allowed = allowed;
    policy.plan = if plan.trim().is_empty() { "free".into() } else { plan };
    policy.reason = reason.unwrap_or_else(|| {
        "Mobile control requires an eligible paid plan. Upgrade in MakeChurchEasy on your desktop.".into()
    });
}

pub async fn mobile_access_error() -> Option<String> {
    let policy = mobile_access_policy_store().read().await;
    if policy.allowed { None } else { Some(policy.reason.clone()) }
}

/// OBS connection details provided by the dock.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ObsConnectionInfo {
    pub url: String,
    pub password: String,
}

fn obs_connection_store() -> &'static RwLock<Option<ObsConnectionInfo>> {
    static STORE: OnceLock<RwLock<Option<ObsConnectionInfo>>> = OnceLock::new();
    STORE.get_or_init(|| RwLock::new(None))
}

fn mobile_state_store() -> &'static RwLock<MobileState> {
    static STORE: OnceLock<RwLock<MobileState>> = OnceLock::new();
    STORE.get_or_init(|| RwLock::new(MobileState::default()))
}

fn state_broadcast() -> &'static broadcast::Sender<String> {
    static STORE: OnceLock<broadcast::Sender<String>> = OnceLock::new();
    STORE.get_or_init(|| {
        let (tx, _) = broadcast::channel(64);
        tx
    })
}

fn pending_commands() -> &'static Mutex<HashMap<String, oneshot::Sender<MobileCommandCompletion>>> {
    static STORE: OnceLock<Mutex<HashMap<String, oneshot::Sender<MobileCommandCompletion>>>> =
        OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

fn app_data_dir() -> Result<PathBuf, String> {
    let base = dirs::data_dir().ok_or("Could not determine app data directory")?;
    let dir = base.join("MakeChurchEasy");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create app data directory: {}", e))?;
    Ok(dir)
}

fn pairing_token_path() -> Result<PathBuf, String> {
    Ok(app_data_dir()?.join("mobile-pairing-token.txt"))
}

// ── Messages from Flutter ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MobileCommand {
    /// Request pairing details from a trusted local discovery connection.
    /// UDP discovery is not delivered through the Android Emulator NAT, so
    /// the mobile client uses this only through the emulator host gateway.
    Discover,
    Auth {
        token: String,
    },
    ShowScripture {
        reference: String,
        #[serde(default)]
        translation: Option<String>,
        #[serde(default)]
        verse_text: Option<String>,
        #[serde(default)]
        display_reference_label: Option<String>,
        #[serde(default)]
        overlay_mode: Option<String>,
        #[serde(default)]
        compare_enabled: Option<bool>,
        #[serde(default)]
        compare_layout: Option<String>,
        #[serde(default)]
        compare_mode: Option<String>,
        #[serde(default)]
        translation_a: Option<String>,
        #[serde(default)]
        translation_b: Option<String>,
        #[serde(default)]
        compare_verse_text_a: Option<String>,
        #[serde(default)]
        compare_verse_text_b: Option<String>,
        #[serde(default)]
        compare_passages: Option<serde_json::Value>,
    },
    ClearScripture,
    ShowSlide {
        song_id: String,
        slide_index: usize,
        #[serde(default)]
        song_title: Option<String>,
        #[serde(default)]
        artist: Option<String>,
        #[serde(default)]
        slide_text: Option<String>,
        #[serde(default)]
        section_label: Option<String>,
        #[serde(default)]
        overlay_mode: Option<String>,
    },
    NextSlide {
        #[serde(default)]
        song_id: Option<String>,
        #[serde(default)]
        slide_index: Option<usize>,
    },
    PrevSlide {
        #[serde(default)]
        song_id: Option<String>,
        #[serde(default)]
        slide_index: Option<usize>,
    },
    ClearWorship,
    ShowLowerThird {
        name: String,
        title: String,
        #[serde(default)]
        theme_id: Option<String>,
        #[serde(default)]
        values: Option<serde_json::Value>,
        #[serde(default)]
        size: Option<String>,
    },
    GetLowerThirdThemes,
    GetSceneRoute {
        module: String,
    },
    SaveSceneRoute {
        module: String,
        route: serde_json::Value,
    },
    ClearLowerThird,
    BlankLowerThird,
    GetBibleTranslations,
    GetBibleChapter {
        book: String,
        chapter: usize,
        translation: String,
    },
    GetBiblePresentationStyle,
    GetTextPresentationStyle {
        surface: String,
    },
    SavePresentationBackground {
        surface: String,
        #[serde(default)]
        overlay_mode: Option<String>,
        background_type: String,
        #[serde(default)]
        background_color: Option<String>,
        #[serde(default)]
        background_color_end: Option<String>,
        #[serde(default)]
        background_pattern: Option<String>,
        #[serde(default)]
        background_image: Option<String>,
        #[serde(default)]
        background_image_file_path: Option<String>,
        #[serde(default)]
        background_video: Option<String>,
        #[serde(default)]
        background_video_file_path: Option<String>,
    },
    SaveTextPresentationControls {
        surface: String,
        #[serde(default)]
        patch: Option<serde_json::Value>,
        #[serde(default)]
        line_count: Option<usize>,
        #[serde(default)]
        line_mode: Option<String>,
        #[serde(default)]
        quick_alignment: Option<String>,
    },
    GetBibleSearchSuggestions {
        #[serde(default)]
        query: Option<String>,
        #[serde(default)]
        translation: Option<String>,
    },
    RecordBibleSearch {
        label: String,
    },
    GetWorshipLibrary,
    GetNotes,
    SaveNotes {
        notes: serde_json::Value,
    },
    ShowNote {
        note: serde_json::Value,
    },
    ClearNotes,
    GetMediaLibrary,
    GetMediaThumbnail {
        media_id: String,
    },
    RegisterUploadedMedia {
        media_id: String,
        name: String,
        media_type: String,
        disk_file_name: String,
        #[serde(default)]
        file_size: Option<u64>,
        #[serde(default)]
        mime_type: Option<String>,
    },
    ShowMedia {
        media_id: String,
        #[serde(default)]
        muted: Option<bool>,
        #[serde(default)]
        looping: Option<bool>,
        #[serde(default)]
        fit_mode: Option<String>,
        #[serde(default)]
        transition: Option<String>,
    },
    SendMediaToScene {
        media_id: String,
        scene_name: String,
        #[serde(default)]
        muted: Option<bool>,
        #[serde(default)]
        looping: Option<bool>,
        #[serde(default)]
        fit_mode: Option<String>,
    },
    ClearMedia,
    ShowTicker {
        #[serde(default)]
        badge: Option<String>,
        ticker_text: String,
        #[serde(default)]
        messages: Option<Vec<String>>,
        #[serde(default)]
        speed: Option<f64>,
        #[serde(default)]
        position: Option<String>,
        #[serde(default)]
        looping: Option<bool>,
        #[serde(default)]
        divider: Option<String>,
        #[serde(default)]
        message_spacing: Option<u32>,
        #[serde(default)]
        text_color: Option<String>,
        #[serde(default)]
        background_color: Option<String>,
        #[serde(default)]
        paused: Option<bool>,
    },
    ClearTicker,
    GetTickerMessages,
    GetTickerPresentationStyle,
    SaveTickerMessages {
        messages: serde_json::Value,
    },
    SaveTickerSettings {
        #[serde(default)]
        speed: Option<f64>,
        #[serde(default)]
        position: Option<String>,
        #[serde(default)]
        looping: Option<bool>,
        #[serde(default)]
        theme_id: Option<String>,
        #[serde(default)]
        heading: Option<String>,
        #[serde(default)]
        message_spacing: Option<u32>,
        #[serde(default)]
        divider: Option<String>,
        #[serde(default)]
        colors: Option<serde_json::Value>,
    },
    GetCountdowns,
    ShowCountdown {
        config: serde_json::Value,
        #[serde(default)]
        sync: Option<serde_json::Value>,
    },
    ClearCountdown,
    GetMultiviewCards,
    ClearMultiview {
        scene_name: String,
        #[serde(default)]
        multiview_id: Option<String>,
    },
    GetCurrentState,
    GetScenes,
    SwitchScene {
        scene_name: String,
    },
    SetPreviewScene {
        scene_name: String,
    },
    SetStudioMode {
        enabled: bool,
    },
    GetSceneScreenshot {
        scene_name: String,
        #[serde(default)]
        image_width: Option<u32>,
    },
    ToggleStreaming,
    ToggleRecording,
    ToggleMic,
    GetMacros,
    SaveMacro {
        macro_data: serde_json::Value,
    },
    DeleteMacro {
        macro_id: String,
    },
    ExecuteMacro {
        macro_id: String,
    },
    ExecuteAutomation {
        macro_id: String,
    },
    GetAutomationRules,
    SaveAutomationRule {
        rule_data: serde_json::Value,
    },
    DeleteAutomationRule {
        rule_id: String,
    },
    ToggleAutomationRule {
        rule_id: String,
        enabled: bool,
    },
    GetAutomationLogs,
    ClearAutomationLogs,
    Ping,
}

// ── Messages to Flutter ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MobileResponse {
    DiscoveryInfo {
        ws_port: u16,
        api_port: u16,
        pairing_token: String,
        desktop_name: String,
    },
    AuthOk,
    AuthFailed {
        reason: String,
    },
    StateUpdate {
        obs_connected: bool,
        current_song: Option<String>,
        current_slide: Option<usize>,
        current_scripture: Option<String>,
        current_lower_third: Option<String>,
    },
    Pong,
    Error {
        message: String,
    },
    CommandResult {
        command_id: String,
        ok: bool,
        payload: serde_json::Value,
        error: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileCommandEvent {
    pub command_id: String,
    pub command: MobileCommand,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MobileCommandCompletion {
    pub ok: bool,
    #[serde(default)]
    pub payload: serde_json::Value,
    #[serde(default)]
    pub error: Option<String>,
}

// ── Global state broadcast to all connected mobile clients ───────────────────

#[derive(Debug, Clone, Default, Serialize)]
pub struct MobileState {
    pub obs_connected: bool,
    pub current_song: Option<String>,
    pub current_slide: Option<usize>,
    pub current_scripture: Option<String>,
    pub current_lower_third: Option<String>,
}

// ── Public API for updating state from outside ──────────────────────────────

pub async fn update_mobile_state<F: FnOnce(&mut MobileState)>(f: F) {
    let mut state = mobile_state_store().write().await;
    f(&mut state);
    let snapshot = state.clone();
    drop(state);

    if let Ok(json) = serde_json::to_string(&MobileResponse::StateUpdate {
        obs_connected: snapshot.obs_connected,
        current_song: snapshot.current_song,
        current_slide: snapshot.current_slide,
        current_scripture: snapshot.current_scripture,
        current_lower_third: snapshot.current_lower_third,
    }) {
        let _ = state_broadcast().send(json);
    }
}

pub async fn set_obs_connected(connected: bool) {
    update_mobile_state(|s| s.obs_connected = connected).await;
}

pub async fn set_current_song(title: Option<String>) {
    update_mobile_state(|s| s.current_song = title).await;
}

pub async fn set_current_slide(index: Option<usize>) {
    update_mobile_state(|s| s.current_slide = index).await;
}

pub async fn set_current_scripture(reference: Option<String>) {
    update_mobile_state(|s| s.current_scripture = reference).await;
}

pub async fn set_current_lower_third(name: Option<String>) {
    update_mobile_state(|s| s.current_lower_third = name).await;
}

pub async fn get_mobile_state() -> MobileState {
    mobile_state_store().read().await.clone()
}

// ── Pairing token management ────────────────────────────────────────────────

fn generate_pairing_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let t = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let chars: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut token = String::with_capacity(6);
    let mut val = t;
    for _ in 0..6 {
        token.push(chars[(val % chars.len() as u128) as usize] as char);
        val /= chars.len() as u128;
    }
    token
}

pub async fn generate_new_pairing_token() -> String {
    let token = generate_pairing_token();
    let mut stored = pairing_token_store().write().await;
    *stored = Some(token.clone());
    if let Ok(path) = pairing_token_path() {
        if let Err(error) = fs::write(path, &token) {
            eprintln!(
                "[MobileCompanion] Failed to persist pairing token: {}",
                error
            );
        }
    }
    token
}

pub async fn get_or_create_pairing_token() -> String {
    if let Some(token) = get_pairing_token().await {
        if !token.trim().is_empty() {
            return token;
        }
    }

    if let Ok(path) = pairing_token_path() {
        if let Ok(token) = fs::read_to_string(path) {
            let token = token.trim().to_string();
            if !token.is_empty() {
                let mut stored = pairing_token_store().write().await;
                *stored = Some(token.clone());
                return token;
            }
        }
    }

    generate_new_pairing_token().await
}

pub async fn get_pairing_token() -> Option<String> {
    pairing_token_store().read().await.clone()
}

pub async fn set_obs_connection(info: ObsConnectionInfo) {
    let mut conn = obs_connection_store().write().await;
    *conn = Some(info);
    drop(conn);
    set_obs_connected(true).await;
    println!("[MobileCompanion] OBS connection details updated");
}

pub async fn complete_mobile_command(
    command_id: String,
    completion: MobileCommandCompletion,
) -> Result<(), String> {
    let sender = pending_commands()
        .lock()
        .await
        .remove(&command_id)
        .ok_or_else(|| "Mobile command is no longer pending".to_string())?;

    sender
        .send(completion)
        .map_err(|_| "Mobile command receiver is gone".to_string())
}

async fn dispatch_command_to_desktop(
    app_handle: &tauri::AppHandle,
    command_id: String,
    command: MobileCommand,
) -> MobileResponse {
    let (tx, rx) = oneshot::channel();
    pending_commands()
        .lock()
        .await
        .insert(command_id.clone(), tx);

    let event = MobileCommandEvent {
        command_id: command_id.clone(),
        command,
    };

    if let Err(error) = app_handle.emit("mobile-companion-command", event) {
        pending_commands().lock().await.remove(&command_id);
        return MobileResponse::CommandResult {
            command_id,
            ok: false,
            payload: serde_json::Value::Null,
            error: Some(format!("Failed to dispatch to desktop: {}", error)),
        };
    }

    match tokio::time::timeout(Duration::from_secs(12), rx).await {
        Ok(Ok(completion)) => MobileResponse::CommandResult {
            command_id,
            ok: completion.ok,
            payload: completion.payload,
            error: completion.error,
        },
        Ok(Err(_)) => MobileResponse::CommandResult {
            command_id,
            ok: false,
            payload: serde_json::Value::Null,
            error: Some("Desktop command handler disconnected".into()),
        },
        Err(_) => {
            pending_commands().lock().await.remove(&command_id);
            MobileResponse::CommandResult {
                command_id,
                ok: false,
                payload: serde_json::Value::Null,
                error: Some("Desktop command timed out".into()),
            }
        }
    }
}

// ── Handle a single mobile client WebSocket connection ──────────────────────

async fn handle_mobile_client(
    stream: TcpStream,
    state_tx: broadcast::Sender<String>,
    app_handle: tauri::AppHandle,
    api_port: u16,
) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            eprintln!("[MobileCompanion] WebSocket accept failed: {}", e);
            return;
        }
    };

    let (mut write, mut read) = ws.split();
    let mut rx = state_tx.subscribe();
    let mut authenticated = false;

    let pairing_token = get_pairing_token().await.unwrap_or_default();
    loop {
        tokio::select! {
            // Messages from the mobile client
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let raw: serde_json::Value = match serde_json::from_str(&text) {
                            Ok(v) => v,
                            Err(e) => {
                                let _ = write.send(Message::Text(
                                    serde_json::to_string(&MobileResponse::Error {
                                        message: format!("Invalid JSON: {}", e),
                                    })
                                    .unwrap()
                                    .into(),
                                )).await;
                                continue;
                            }
                        };

                        let command_id = raw
                            .get("command_id")
                            .and_then(|v| v.as_str())
                            .map(|v| v.to_string())
                            .unwrap_or_else(|| Uuid::new_v4().to_string());

                        let cmd: MobileCommand = match serde_json::from_value(raw) {
                            Ok(c) => c,
                            Err(e) => {
                                let _ = write.send(Message::Text(
                                    serde_json::to_string(&MobileResponse::Error {
                                        message: format!("Invalid command: {}", e),
                                    })
                                    .unwrap()
                                    .into(),
                                )).await;
                                continue;
                            }
                        };

                        match &cmd {
                            MobileCommand::Discover => {
                                let _ = write.send(Message::Text(
                                    serde_json::to_string(&MobileResponse::DiscoveryInfo {
                                        ws_port: mobile_server_port(),
                                        api_port,
                                        pairing_token: pairing_token.clone(),
                                        desktop_name: "MakeChurchEasy Desktop".into(),
                                    })
                                    .unwrap()
                                    .into(),
                                )).await;
                            }
                            MobileCommand::Auth { token } => {
                                if token == &pairing_token && !pairing_token.is_empty() {
                                    if let Some(reason) = mobile_access_error().await {
                                        let _ = write.send(Message::Text(
                                            serde_json::to_string(&MobileResponse::AuthFailed { reason })
                                                .unwrap()
                                                .into(),
                                        )).await;
                                        return;
                                    }
                                    authenticated = true;
                                    let _ = write.send(Message::Text(
                                        serde_json::to_string(&MobileResponse::AuthOk)
                                            .unwrap()
                                            .into(),
                                    )).await;
                                    println!("[MobileCompanion] Client authenticated");

                                    // Send initial state
                                    let state = mobile_state_store().read().await.clone();
                                    let _ = write.send(Message::Text(
                                        serde_json::to_string(&MobileResponse::StateUpdate {
                                            obs_connected: state.obs_connected,
                                            current_song: state.current_song,
                                            current_slide: state.current_slide,
                                            current_scripture: state.current_scripture,
                                            current_lower_third: state.current_lower_third,
                                        })
                                        .unwrap()
                                        .into(),
                                    )).await;
                                } else {
                                    let _ = write.send(Message::Text(
                                        serde_json::to_string(&MobileResponse::AuthFailed {
                                            reason: "Invalid pairing token".into(),
                                        })
                                        .unwrap()
                                        .into(),
                                    )).await;
                                    return;
                                }
                            }
                            MobileCommand::Ping => {
                                let _ = write.send(Message::Text(
                                    serde_json::to_string(&MobileResponse::Pong)
                                        .unwrap()
                                        .into(),
                                )).await;
                            }
                            _ if !authenticated => {
                                let _ = write.send(Message::Text(
                                    serde_json::to_string(&MobileResponse::AuthFailed {
                                        reason: "Not authenticated".into(),
                                    })
                                    .unwrap()
                                    .into(),
                                )).await;
                            }
                            _ => {
                                if let Some(reason) = mobile_access_error().await {
                                    let response = MobileResponse::CommandResult {
                                        command_id,
                                        ok: false,
                                        payload: serde_json::Value::Null,
                                        error: Some(reason),
                                    };
                                    let _ = write.send(Message::Text(
                                        serde_json::to_string(&response).unwrap().into(),
                                    )).await;
                                    continue;
                                }
                                let response = dispatch_command_to_desktop(&app_handle, command_id, cmd.clone()).await;
                                let ok = matches!(&response, MobileResponse::CommandResult { ok: true, .. });
                                if ok {
                                    set_obs_connected(true).await;
                                    match &cmd {
                                        MobileCommand::ShowScripture { reference, .. } => {
                                            set_current_scripture(Some(reference.clone())).await;
                                            set_current_song(None).await;
                                            set_current_slide(None).await;
                                        }
                                        MobileCommand::ClearScripture => {
                                            set_current_scripture(None).await;
                                        }
                                        MobileCommand::ShowSlide { slide_index, song_title, .. } => {
                                            set_current_song(song_title.clone()).await;
                                            set_current_slide(Some(*slide_index)).await;
                                        }
                                        MobileCommand::ClearWorship => {
                                            set_current_song(None).await;
                                            set_current_slide(None).await;
                                        }
                                        MobileCommand::ShowLowerThird { name, .. } => {
                                            set_current_lower_third(Some(name.clone())).await;
                                        }
                                        MobileCommand::ClearLowerThird => {
                                            set_current_lower_third(None).await;
                                        }
                                        MobileCommand::BlankLowerThird => {
                                            set_current_lower_third(None).await;
                                        }
                                        _ => {}
                                    }
                                } else {
                                    set_obs_connected(false).await;
                                }

                                let _ = write.send(Message::Text(
                                    serde_json::to_string(&response).unwrap().into(),
                                )).await;
                            }
                        }
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    _ => {}
                }
            }
            // State updates broadcast to all clients
            state_msg = rx.recv() => {
                if let Ok(text) = state_msg {
                    let _ = write.send(Message::Text(text.into())).await;
                }
            }
        }
    }

    println!("[MobileCompanion] Client disconnected");
}

// ── UDP broadcast beacon for auto-discovery ─────────────────────────────────

const DISCOVERY_PORT: u16 = 9999;

async fn run_discovery_beacon(ws_port: u16, api_port: u16) {
    use std::net::SocketAddr;
    use tokio::net::UdpSocket;

    let socket = match UdpSocket::bind("0.0.0.0:0").await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[MobileCompanion] Failed to bind discovery beacon: {}", e);
            return;
        }
    };

    if let Err(e) = socket.set_broadcast(true) {
        eprintln!("[MobileCompanion] Failed to set broadcast: {}", e);
        return;
    }

    let broadcast_addr: SocketAddr = format!("255.255.255.255:{}", DISCOVERY_PORT)
        .parse()
        .unwrap();

    println!(
        "[MobileCompanion] Discovery beacon started on UDP port {}",
        DISCOVERY_PORT
    );

    loop {
        let pairing_token = get_or_create_pairing_token().await;
        let payload = serde_json::json!({
            "service": "makechurcheasy",
            "port": ws_port,
            "apiPort": api_port,
            "desktopName": "MakeChurchEasy Desktop",
            "pairingToken": pairing_token,
            "version": "1",
        })
        .to_string();
        let _ = socket.send_to(payload.as_bytes(), broadcast_addr).await;
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

// ── Main server loop ────────────────────────────────────────────────────────

pub async fn start_mobile_server(
    preferred_port: u16,
    api_port: u16,
    app_handle: tauri::AppHandle,
) -> Result<(), String> {
    let preferred_addr = format!("0.0.0.0:{}", preferred_port);
    let listener = match TcpListener::bind(&preferred_addr).await {
        Ok(listener) => listener,
        Err(preferred_error) => {
            eprintln!(
                "[MobileCompanion] Port {} unavailable: {}. Trying an available LAN port.",
                preferred_port, preferred_error
            );
            TcpListener::bind("0.0.0.0:0").await.map_err(|fallback_error| {
                format!(
                    "Failed to bind mobile server on {} ({}) or its fallback port: {}",
                    preferred_addr, preferred_error, fallback_error
                )
            })?
        }
    };

    let bound_port = listener
        .local_addr()
        .map_err(|e| format!("Could not determine mobile server port: {}", e))?
        .port();
    if bound_port == 0 {
        return Err("Mobile server bound to an invalid port 0".to_string());
    }

    MOBILE_SERVER_PORT.store(bound_port, Ordering::Relaxed);
    let state_tx = state_broadcast().clone();

    // Start UDP discovery beacon for auto-connect
    tokio::spawn(run_discovery_beacon(bound_port, api_port));

    println!(
        "[MobileCompanion] WebSocket server started on 0.0.0.0:{}",
        bound_port
    );

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                println!("[MobileCompanion] New connection from {}", peer);
                let tx = state_tx.clone();
                let handle = app_handle.clone();
                tokio::spawn(async move {
                    handle_mobile_client(stream, tx, handle, api_port).await;
                });
            }
            Err(e) => {
                eprintln!("[MobileCompanion] Accept error: {}", e);
            }
        }
    }
}
