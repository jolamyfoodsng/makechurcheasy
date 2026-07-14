use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::OnceLock;
use tiny_http::{Header, Method, Response, Server};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};

use crate::{
    now_unix_millis, presentation_viewer_count, PresentationStateEnvelope,
    PresentationViewerHeartbeat, PRESENTATION_STATE, PRESENTATION_VIEWERS,
};

const PRESENTATION_HTML: &str = include_str!("../../public/presentation.html");
const DEFAULT_HTTP_PORT: u16 = 45679;
const DEFAULT_WS_PORT: u16 = 8766;

static PRESENTATION_HTTP_PORT: AtomicU16 = AtomicU16::new(0);
static PRESENTATION_WS_PORT: AtomicU16 = AtomicU16::new(0);

#[derive(Debug, Clone)]
struct PresentationBroadcast {
    session_id: String,
    state: PresentationStateEnvelope,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresentationSocketMessage {
    #[serde(rename = "type")]
    message_type: String,
    #[serde(default)]
    session_id: String,
    #[serde(default)]
    viewer_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PresentationSocketStateMessage {
    #[serde(rename = "type")]
    message_type: &'static str,
    session_id: String,
    state: PresentationStateEnvelope,
}

fn state_broadcast() -> &'static broadcast::Sender<PresentationBroadcast> {
    static STORE: OnceLock<broadcast::Sender<PresentationBroadcast>> = OnceLock::new();
    STORE.get_or_init(|| {
        let (tx, _) = broadcast::channel(128);
        tx
    })
}

pub fn http_port() -> u16 {
    PRESENTATION_HTTP_PORT.load(Ordering::Relaxed)
}

pub fn ws_port() -> u16 {
    PRESENTATION_WS_PORT.load(Ordering::Relaxed)
}

pub fn broadcast_presentation_state(state: &PresentationStateEnvelope) {
    let _ = state_broadcast().send(PresentationBroadcast {
        session_id: state.session_id.clone(),
        state: state.clone(),
    });
}

fn get_state(session_id: &str) -> Option<PresentationStateEnvelope> {
    PRESENTATION_STATE
        .get_or_init(|| std::sync::Mutex::new(std::collections::BTreeMap::new()))
        .lock()
        .ok()
        .and_then(|store| store.get(session_id).cloned())
}

fn record_viewer(session_id: &str, viewer_id: &str) {
    if session_id.trim().is_empty() || viewer_id.trim().is_empty() {
        return;
    }

    let registry = PRESENTATION_VIEWERS
        .get_or_init(|| std::sync::Mutex::new(std::collections::BTreeMap::new()));
    if let Ok(mut viewers) = registry.lock() {
        let session = viewers
            .entry(session_id.to_string())
            .or_insert_with(std::collections::BTreeMap::new);
        session.insert(viewer_id.to_string(), now_unix_millis());
    }
}

fn remove_viewer(session_id: &str, viewer_id: &str) {
    if session_id.trim().is_empty() || viewer_id.trim().is_empty() {
        return;
    }

    let registry = PRESENTATION_VIEWERS
        .get_or_init(|| std::sync::Mutex::new(std::collections::BTreeMap::new()));
    if let Ok(mut viewers) = registry.lock() {
        if let Some(session) = viewers.get_mut(session_id) {
            session.remove(viewer_id);
            if session.is_empty() {
                viewers.remove(session_id);
            }
        }
    }
}

fn json_header() -> Header {
    Header::from_bytes("Content-Type", "application/json; charset=utf-8").unwrap()
}

fn cors_header() -> Header {
    Header::from_bytes("Access-Control-Allow-Origin", "*").unwrap()
}

fn parse_query_value(url_path: &str, key: &str) -> String {
    let Some(qpos) = url_path.find('?') else {
        return String::new();
    };

    let qs = &url_path[qpos + 1..];
    qs.split('&')
        .find_map(|pair| {
            let (query_key, value) = pair.split_once('=')?;
            if query_key == key {
                Some(urlencoding::decode(value).unwrap_or_default().into_owned())
            } else {
                None
            }
        })
        .unwrap_or_default()
}

fn content_type_for_extension(extension: &str) -> &'static str {
    match extension {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" => "application/javascript; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "svg" => "image/svg+xml",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        _ => "application/octet-stream",
    }
}

fn safe_upload_path(uploads_dir: &Option<PathBuf>, clean: &str) -> Option<PathBuf> {
    let uploads_dir = uploads_dir.as_ref()?;
    let rel = clean.strip_prefix("uploads/")?;
    let decoded = urlencoding::decode(rel).ok()?.into_owned();

    let rel_path = Path::new(&decoded);
    if rel_path.as_os_str().is_empty()
        || rel_path.components().any(|component| {
            matches!(
                component,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return None;
    }

    Some(uploads_dir.join(rel_path))
}

pub fn start_presentation_http_server(uploads_dir: Option<PathBuf>) -> u16 {
    let server = match Server::http(format!("0.0.0.0:{DEFAULT_HTTP_PORT}"))
        .or_else(|_| Server::http("0.0.0.0:0"))
    {
        Ok(server) => server,
        Err(error) => {
            eprintln!("[PresentationRemote] Failed to start HTTP server: {}", error);
            return 0;
        }
    };

    let port = match server.server_addr().to_ip() {
        Some(addr) => addr.port(),
        None => {
            eprintln!("[PresentationRemote] Failed to resolve HTTP server port.");
            return 0;
        }
    };

    PRESENTATION_HTTP_PORT.store(port, Ordering::Relaxed);
    println!(
        "[PresentationRemote] HTTP viewer server started on http://0.0.0.0:{}",
        port
    );

    std::thread::spawn(move || {
        for mut request in server.incoming_requests() {
            let url_path = request.url().to_string();
            let clean = url_path.split('?').next().unwrap_or(&url_path).trim_start_matches('/');
            let clean = if clean.is_empty() { "presentation.html" } else { clean };

            if clean.contains("..") {
                let _ = request.respond(Response::from_string("Forbidden").with_status_code(403));
                continue;
            }

            if request.method() == &Method::Options {
                let response = Response::from_string("")
                    .with_header(Header::from_bytes("Access-Control-Allow-Methods", "GET, POST, OPTIONS").unwrap())
                    .with_header(Header::from_bytes("Access-Control-Allow-Headers", "Content-Type").unwrap())
                    .with_header(cors_header());
                let _ = request.respond(response);
                continue;
            }

            if clean == "presentation.html" {
                let response = Response::from_string(PRESENTATION_HTML)
                    .with_header(Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap())
                    .with_header(cors_header());
                let _ = request.respond(response);
                continue;
            }

            if clean == "api/presentation-state" && request.method() == &Method::Get {
                let session_id = parse_query_value(&url_path, "sessionId");
                if session_id.trim().is_empty() {
                    let response = Response::from_string(r#"{"error":"sessionId is required"}"#)
                        .with_status_code(400)
                        .with_header(json_header())
                        .with_header(cors_header());
                    let _ = request.respond(response);
                    continue;
                }

                let state = get_state(&session_id);
                let viewer_count = presentation_viewer_count(&session_id);
                let response = Response::from_string(
                    serde_json::json!({
                        "state": state,
                        "viewerCount": viewer_count,
                    })
                    .to_string(),
                )
                .with_header(json_header())
                .with_header(cors_header());
                let _ = request.respond(response);
                continue;
            }

            if clean == "api/presentation-viewer" {
                if request.method() == &Method::Post {
                    let mut body = String::new();
                    if request.as_reader().read_to_string(&mut body).is_err() {
                        let _ = request.respond(Response::from_string("Bad Request").with_status_code(400));
                        continue;
                    }

                    match serde_json::from_str::<PresentationViewerHeartbeat>(&body) {
                        Ok(payload) => {
                            record_viewer(&payload.session_id, &payload.viewer_id);
                            let viewer_count = presentation_viewer_count(&payload.session_id);
                            let response = Response::from_string(
                                serde_json::json!({
                                    "ok": true,
                                    "viewerCount": viewer_count,
                                })
                                .to_string(),
                            )
                            .with_header(json_header())
                            .with_header(cors_header());
                            let _ = request.respond(response);
                        }
                        Err(error) => {
                            let response = Response::from_string(
                                serde_json::json!({
                                    "error": format!("Invalid viewer heartbeat: {}", error),
                                })
                                .to_string(),
                            )
                            .with_status_code(400)
                            .with_header(json_header())
                            .with_header(cors_header());
                            let _ = request.respond(response);
                        }
                    }
                    continue;
                }

                let session_id = parse_query_value(&url_path, "sessionId");
                if session_id.trim().is_empty() {
                    let response = Response::from_string(r#"{"error":"sessionId is required"}"#)
                        .with_status_code(400)
                        .with_header(json_header())
                        .with_header(cors_header());
                    let _ = request.respond(response);
                    continue;
                }

                let viewer_count = presentation_viewer_count(&session_id);
                let response = Response::from_string(
                    serde_json::json!({ "viewerCount": viewer_count }).to_string(),
                )
                .with_header(json_header())
                .with_header(cors_header());
                let _ = request.respond(response);
                continue;
            }

            if clean.starts_with("uploads/") {
                match safe_upload_path(&uploads_dir, clean) {
                    Some(file_path) if file_path.is_file() => match fs::read(&file_path) {
                        Ok(data) => {
                            let extension = file_path
                                .extension()
                                .and_then(|value| value.to_str())
                                .unwrap_or_default()
                                .to_ascii_lowercase();
                            let response = Response::from_data(data)
                                .with_header(
                                    Header::from_bytes(
                                        "Content-Type",
                                        content_type_for_extension(&extension),
                                    )
                                    .unwrap(),
                                )
                                .with_header(cors_header());
                            let _ = request.respond(response);
                        }
                        Err(_) => {
                            let _ = request.respond(
                                Response::from_string("Internal Server Error").with_status_code(500),
                            );
                        }
                    },
                    Some(_) => {
                        let _ = request.respond(Response::from_string("Not Found").with_status_code(404));
                    }
                    None => {
                        let _ = request.respond(Response::from_string("Forbidden").with_status_code(403));
                    }
                }
                continue;
            }

            let _ = request.respond(Response::from_string("Not Found").with_status_code(404));
        }
    });

    port
}

async fn send_state_message(
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<TcpStream>,
        Message,
    >,
    state: &PresentationStateEnvelope,
) -> Result<(), tokio_tungstenite::tungstenite::Error> {
    let payload = serde_json::to_string(&PresentationSocketStateMessage {
        message_type: "presentation_state",
        session_id: state.session_id.clone(),
        state: state.clone(),
    })
    .unwrap_or_else(|_| "{}".to_string());

    write.send(Message::Text(payload.into())).await
}

async fn handle_presentation_client(
    stream: TcpStream,
    broadcast_tx: broadcast::Sender<PresentationBroadcast>,
) {
    let ws = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(error) => {
            eprintln!("[PresentationRemote] WebSocket accept failed: {}", error);
            return;
        }
    };

    let (mut write, mut read) = ws.split();
    let mut rx = broadcast_tx.subscribe();
    let mut session_id = String::new();
    let mut viewer_id = String::new();

    loop {
        tokio::select! {
            incoming = read.next() => {
                match incoming {
                    Some(Ok(Message::Text(text))) => {
                        let parsed = match serde_json::from_str::<PresentationSocketMessage>(&text) {
                            Ok(parsed) => parsed,
                            Err(_) => continue,
                        };

                        match parsed.message_type.as_str() {
                            "viewer_hello" => {
                                if parsed.session_id.trim().is_empty() || parsed.viewer_id.trim().is_empty() {
                                    continue;
                                }

                                session_id = parsed.session_id;
                                viewer_id = parsed.viewer_id;
                                record_viewer(&session_id, &viewer_id);

                                if let Some(state) = get_state(&session_id) {
                                    let _ = send_state_message(&mut write, &state).await;
                                }
                            }
                            "viewer_heartbeat" => {
                                if !session_id.is_empty() && !viewer_id.is_empty() {
                                    record_viewer(&session_id, &viewer_id);
                                }
                            }
                            _ => {}
                        }
                    }
                    Some(Ok(Message::Ping(payload))) => {
                        if !session_id.is_empty() && !viewer_id.is_empty() {
                            record_viewer(&session_id, &viewer_id);
                        }
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Err(error)) => {
                        eprintln!("[PresentationRemote] WebSocket client error: {}", error);
                        break;
                    }
                    _ => {}
                }
            }
            broadcast = rx.recv() => {
                match broadcast {
                    Ok(message) if !session_id.is_empty() && message.session_id == session_id => {
                        if send_state_message(&mut write, &message.state).await.is_err() {
                            break;
                        }
                    }
                    Ok(_) => {}
                    Err(_) => break,
                }
            }
        }
    }

    if !session_id.is_empty() && !viewer_id.is_empty() {
        remove_viewer(&session_id, &viewer_id);
    }
}

pub async fn start_presentation_ws_server(port: Option<u16>) -> Result<u16, String> {
    let target_port = port.unwrap_or(DEFAULT_WS_PORT);
    let primary_addr = format!("0.0.0.0:{target_port}");
    let listener = match TcpListener::bind(&primary_addr).await {
        Ok(listener) => listener,
        Err(_) => TcpListener::bind("0.0.0.0:0")
            .await
            .map_err(|error| format!("Failed to bind presentation WebSocket server: {}", error))?,
    };

    let actual_port = listener
        .local_addr()
        .map_err(|error| format!("Failed to resolve presentation WebSocket port: {}", error))?
        .port();

    PRESENTATION_WS_PORT.store(actual_port, Ordering::Relaxed);
    let tx = state_broadcast().clone();

    println!(
        "[PresentationRemote] WebSocket server started on ws://0.0.0.0:{}",
        actual_port
    );

    tokio::spawn(async move {
        loop {
            match listener.accept().await {
                Ok((stream, _)) => {
                    let next_tx = tx.clone();
                    tokio::spawn(async move {
                        handle_presentation_client(stream, next_tx).await;
                    });
                }
                Err(error) => {
                    eprintln!("[PresentationRemote] WebSocket accept error: {}", error);
                }
            }
        }
    });

    Ok(actual_port)
}
