/**
 * overlay_relay.rs — Local WebSocket relay for instant overlay communication.
 *
 * Listens on 127.0.0.1:17891. Both the dock and the overlay HTML (running
 * inside OBS Browser Source) connect once at startup.
 *
 * Features:
 *   - Retains the latest overlay-update **and** mode-change per channel
 *     separately so that a mode-change never overwrites the retained content.
 *   - Broadcasts each incoming message to all other clients.
 *   - If port 17891 is already in use (another MCE instance), logs a
 *     diagnostic. The dock/overlay will connect to the existing relay.
 *
 * Connection flow:
 *   Dock ──WebSocket──► Local Relay (17891) ──WebSocket──► Overlay (OBS CEF)
 */
use futures_util::{SinkExt, StreamExt};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicU16, Ordering};
use std::sync::{Mutex, OnceLock};
use tokio::net::TcpListener;
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};

static OVERLAY_RELAY_PORT: AtomicU16 = AtomicU16::new(0);

pub fn relay_port() -> u16 {
    OVERLAY_RELAY_PORT.load(Ordering::Relaxed)
}

fn relay_broadcast() -> &'static broadcast::Sender<String> {
    static STORE: OnceLock<broadcast::Sender<String>> = OnceLock::new();
    STORE.get_or_init(|| {
        let (tx, _) = broadcast::channel(128);
        tx
    })
}

/// Retains the latest overlay-update per channel (content packets).
fn latest_overlay_update() -> &'static Mutex<HashMap<String, String>> {
    static STORE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Retains the latest mode-change per channel (mode-only packets).
fn latest_mode_change() -> &'static Mutex<HashMap<String, String>> {
    static STORE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    STORE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Extract the `channel` field from a JSON message, defaulting to "general".
fn extract_channel(text: &str) -> String {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|v| v.get("channel").and_then(|c| c.as_str().map(String::from)))
        .unwrap_or_else(|| "general".to_string())
}

/// Check whether a packet is a mode-change (true) or overlay-update (false).
fn is_mode_change(text: &str) -> bool {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|v| {
            v.get("type")
                .and_then(|t| t.as_str().map(|s| s == "mode-change"))
        })
        .unwrap_or(false)
}

/// Check whether a packet contains the latest overlay content. Render ACKs
/// are broadcast to the dock, but must not replace the retained content that
/// a newly connected browser source needs to render.
fn is_overlay_update(text: &str) -> bool {
    serde_json::from_str::<Value>(text)
        .ok()
        .and_then(|v| {
            v.get("type")
                .and_then(|t| t.as_str().map(|s| s == "overlay-update"))
        })
        .unwrap_or(false)
}

pub async fn start_overlay_relay(port: u16) -> Result<(), String> {
    let addr = format!("127.0.0.1:{}", port);

    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!(
                "[OverlayRelay] Port {} is in use (another MCE instance?): {}. \
                 The overlay bridge will connect to the existing relay.",
                port, e
            );
            OVERLAY_RELAY_PORT.store(port, Ordering::Relaxed);
            return Ok(());
        }
    };

    OVERLAY_RELAY_PORT.store(port, Ordering::Relaxed);
    let broadcast_tx = relay_broadcast().clone();

    println!("[OverlayRelay] WebSocket relay started on {}", addr);

    loop {
        match listener.accept().await {
            Ok((stream, peer)) => {
                println!("[OverlayRelay] New connection from {}", peer);
                let tx = broadcast_tx.clone();
                let mut rx = broadcast_tx.subscribe();
                let overlay_store = latest_overlay_update();
                let mode_store = latest_mode_change();
                tokio::spawn(async move {
                    match accept_async(stream).await {
                        Ok(ws_stream) => {
                            let (mut ws_sender, mut ws_receiver) = ws_stream.split();

                            // Send retained overlay-update first, then mode-change.
                            let retained_overlay = overlay_store
                                .lock()
                                .ok()
                                .map(|store| store.values().cloned().collect::<Vec<_>>())
                                .unwrap_or_default();
                            for json in &retained_overlay {
                                if ws_sender
                                    .send(Message::Text(json.clone().into()))
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                            }
                            let retained_mode = mode_store
                                .lock()
                                .ok()
                                .map(|store| store.values().cloned().collect::<Vec<_>>())
                                .unwrap_or_default();
                            for json in &retained_mode {
                                if ws_sender
                                    .send(Message::Text(json.clone().into()))
                                    .await
                                    .is_err()
                                {
                                    break;
                                }
                            }

                            // Forward incoming messages to all other clients
                            let tx2 = tx.clone();
                            let overlay_store2 = latest_overlay_update();
                            let mode_store2 = latest_mode_change();
                            let forward_handle = tokio::spawn(async move {
                                while let Some(Ok(msg)) = ws_receiver.next().await {
                                    if let Message::Text(text) = msg {
                                        let channel = extract_channel(&text);
                                        if is_mode_change(&text) {
                                            if let Ok(mut store) = mode_store2.lock() {
                                                store.insert(channel, text.to_string());
                                            }
                                        } else if is_overlay_update(&text) {
                                            if let Ok(mut store) = overlay_store2.lock() {
                                                store.insert(channel, text.to_string());
                                            }
                                        }
                                        let _ = tx2.send(text.to_string());
                                    }
                                }
                            });

                            // Receive broadcasts from other clients
                            while let Ok(text) = rx.recv().await {
                                if ws_sender.send(Message::Text(text.into())).await.is_err() {
                                    break;
                                }
                            }

                            let _ = forward_handle.await;
                        }
                        Err(e) => {
                            eprintln!("[OverlayRelay] WS accept error from {}: {}", peer, e);
                        }
                    }
                });
            }
            Err(e) => {
                eprintln!("[OverlayRelay] Accept error: {}", e);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{is_mode_change, is_overlay_update};

    #[test]
    fn retains_only_overlay_updates_as_content() {
        assert!(is_overlay_update(
            r#"{"channel":"worship","type":"overlay-update","data":{}}"#
        ));
        assert!(!is_overlay_update(
            r#"{"channel":"worship","type":"overlay-render-ack","effectiveFontSize":160}"#
        ));
    }

    #[test]
    fn keeps_mode_changes_separate() {
        assert!(is_mode_change(
            r#"{"channel":"worship","type":"mode-change","mode":"fullscreen"}"#
        ));
        assert!(!is_mode_change(
            r#"{"channel":"worship","type":"overlay-update","data":{}}"#
        ));
    }
}
