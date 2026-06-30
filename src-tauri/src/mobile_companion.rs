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
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, RwLock};
use tokio::time::Duration;
use tokio_tungstenite::{accept_async, tungstenite::Message};

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

// ── Messages from Flutter ───────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
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
    },
    ClearScripture,
    ShowSlide {
        song_id: String,
        slide_index: usize,
    },
    NextSlide,
    PrevSlide,
    ClearWorship,
    ShowLowerThird {
        name: String,
        title: String,
    },
    ClearLowerThird,
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
    token
}

pub async fn get_pairing_token() -> Option<String> {
    pairing_token_store().read().await.clone()
}

pub async fn set_obs_connection(info: ObsConnectionInfo) {
    let mut conn = obs_connection_store().write().await;
    *conn = Some(info);
    println!("[MobileCompanion] OBS connection details updated");
}

// ── OBS WebSocket client (connects to OBS to forward commands) ──────────────

async fn forward_command_to_obs(
    command: &MobileCommand,
    obs_url: &str,
    obs_password: &str,
) -> Result<(), String> {
    let (ws_stream, _) = tokio_tungstenite::connect_async(obs_url)
        .await
        .map_err(|e| format!("Failed to connect to OBS: {}", e))?;

    let (mut write, mut read) = ws_stream.split();

    // Authenticate with OBS
    let auth_msg = serde_json::json!({
        "op": 1,
        "d": { "rpcVersion": 1, "authentication": obs_password }
    });
    write
        .send(Message::Text(auth_msg.to_string().into()))
        .await
        .map_err(|e| format!("Failed to send auth: {}", e))?;

    // Wait for auth response
    if let Some(Ok(Message::Text(text))) = read.next().await {
        let _: serde_json::Value = serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse auth response: {}", e))?;
    }

    // Send the actual command as an OBS WebSocket request (op 6 = Request)
    let rpc_msg = match command {
        MobileCommand::ShowScripture {
            reference,
            translation,
            verse_text,
        } => {
            serde_json::json!({
                "op": 6,
                "d": {
                    "requestType": "SetSceneItemEnabled",
                    "requestData": {
                        "sceneName": "MCE Presentation",
                        "sceneItemId": 0,
                        "sceneItemEnabled": true,
                    }
                },
                "mce": {
                    "action": "show_scripture",
                    "reference": reference,
                    "translation": translation.as_deref().unwrap_or("KJV"),
                    "verseText": verse_text.as_deref().unwrap_or(""),
                    "overlayMode": "fullscreen"
                }
            })
        }
        MobileCommand::ClearScripture => {
            serde_json::json!({
                "op": 6,
                "d": {
                    "requestType": "SetSceneItemEnabled",
                    "requestData": {
                        "sceneName": "MCE Presentation",
                        "sceneItemId": 0,
                        "sceneItemEnabled": false
                    }
                },
                "mce": { "action": "clear_bible" }
            })
        }
        MobileCommand::ShowSlide {
            song_id,
            slide_index,
        } => {
            serde_json::json!({
                "op": 6,
                "d": {
                    "requestType": "SetSceneItemEnabled",
                    "requestData": {
                        "sceneName": "MCE Presentation",
                        "sceneItemId": 0,
                        "sceneItemEnabled": true
                    }
                },
                "mce": {
                    "action": "show_slide",
                    "songId": song_id,
                    "slideIndex": slide_index
                }
            })
        }
        MobileCommand::NextSlide => {
            serde_json::json!({
                "op": 6,
                "d": { "requestType": "GetSceneList" },
                "mce": { "action": "next_slide" }
            })
        }
        MobileCommand::PrevSlide => {
            serde_json::json!({
                "op": 6,
                "d": { "requestType": "GetSceneList" },
                "mce": { "action": "prev_slide" }
            })
        }
        MobileCommand::ClearWorship => {
            serde_json::json!({
                "op": 6,
                "d": { "requestType": "GetSceneList" },
                "mce": { "action": "clear_worship" }
            })
        }
        MobileCommand::ShowLowerThird { name, title } => {
            serde_json::json!({
                "op": 6,
                "d": { "requestType": "GetSceneList" },
                "mce": {
                    "action": "show_lower_third",
                    "name": name,
                    "title": title
                }
            })
        }
        MobileCommand::ClearLowerThird => {
            serde_json::json!({
                "op": 6,
                "d": { "requestType": "GetSceneList" },
                "mce": { "action": "clear_lower_third" }
            })
        }
        MobileCommand::Ping | MobileCommand::Auth { .. } => {
            return Ok(());
        }
    };

    write
        .send(Message::Text(rpc_msg.to_string().into()))
        .await
        .map_err(|e| format!("Failed to send command to OBS: {}", e))?;

    // Brief wait for response
    tokio::time::sleep(Duration::from_millis(100)).await;
    Ok(())
}

// ── Handle a single mobile client WebSocket connection ──────────────────────

async fn handle_mobile_client(stream: TcpStream, state_tx: broadcast::Sender<String>) {
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
    let obs_conn = obs_connection_store().read().await.clone();

    loop {
        tokio::select! {
            // Messages from the mobile client
            msg = read.next() => {
                match msg {
                    Some(Ok(Message::Text(text))) => {
                        let cmd: MobileCommand = match serde_json::from_str(&text) {
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
                                if let Some(ref conn) = obs_conn {
                                    match forward_command_to_obs(&cmd, &conn.url, &conn.password).await {
                                        Ok(()) => {
                                            // Update local state based on command
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
                                        }
                                        Err(e) => {
                                            let _ = write.send(Message::Text(
                                                serde_json::to_string(&MobileResponse::Error {
                                                    message: format!("OBS command failed: {}", e),
                                                })
                                                .unwrap()
                                                .into(),
                                            )).await;
                                        }
                                    }
                                } else {
                                    let _ = write.send(Message::Text(
                                        serde_json::to_string(&MobileResponse::Error {
                                            message: "OBS not connected to desktop".into(),
                                        })
                                        .unwrap()
                                        .into(),
                                    )).await;
                                }
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

    println!("[MobileCompanion] Discovery beacon started on UDP port {}", DISCOVERY_PORT);

    loop {
        let _ = socket.send_to(payload.as_bytes(), broadcast_addr).await;
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

// ── Main server loop ────────────────────────────────────────────────────────

pub async fn start_mobile_server(port: u16) -> Result<(), String> {
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
                tokio::spawn(async move {
                    handle_mobile_client(stream, tx).await;
                });
            }
            Err(e) => {
                eprintln!("[MobileCompanion] Accept error: {}", e);
            }
        }
    }
}
