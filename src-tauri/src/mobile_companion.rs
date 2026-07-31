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
        translation_a: Option<String>,
        #[serde(default)]
        translation_b: Option<String>,
        #[serde(default)]
        compare_verse_text_a: Option<String>,
        #[serde(default)]
        compare_verse_text_b: Option<String>,
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
    NextSlide,
    PrevSlide,
    ClearWorship,
    ShowLowerThird {
        name: String,
        title: String,
    },
    ClearLowerThird,
    GetBibleTranslations,
    GetBibleChapter {
        book: String,
        chapter: usize,
        translation: String,
    },
    GetCurrentState,
    GetScenes,
    SwitchScene {
        scene_name: String,
    },
    SetPreviewScene {
        scene_name: String,
    },
    ToggleStreaming,
    ToggleRecording,
    ToggleMic,
    ExecuteAutomation {
        macro_id: String,
    },
    Ping,
}

// ── Messages to Flutter ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum MobileResponse {
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
                            MobileCommand::Auth { token } => {
                                if token == &pairing_token && !pairing_token.is_empty() {
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
                                        MobileCommand::ShowSlide { slide_index, .. } => {
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

async fn run_discovery_beacon(ws_port: u16) {
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

    let payload = serde_json::json!({
        "service": "makechurcheasy",
        "port": ws_port,
        "version": "1",
    })
    .to_string();

    println!(
        "[MobileCompanion] Discovery beacon started on UDP port {}",
        DISCOVERY_PORT
    );

    loop {
        let _ = socket.send_to(payload.as_bytes(), broadcast_addr).await;
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

// ── Main server loop ────────────────────────────────────────────────────────

pub async fn start_mobile_server(port: u16, app_handle: tauri::AppHandle) -> Result<(), String> {
    let addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| format!("Failed to bind mobile server on {}: {}", addr, e))?;

    MOBILE_SERVER_PORT.store(port, Ordering::Relaxed);
    let state_tx = state_broadcast().clone();

    // Start UDP discovery beacon for auto-connect
    tokio::spawn(run_discovery_beacon(port));

    println!("[MobileCompanion] WebSocket server started on {}", addr);

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                println!("[MobileCompanion] New connection from {}", peer);
                let tx = state_tx.clone();
                let handle = app_handle.clone();
                tokio::spawn(async move {
                    handle_mobile_client(stream, tx, handle).await;
                });
            }
            Err(e) => {
                eprintln!("[MobileCompanion] Accept error: {}", e);
            }
        }
    }
}
