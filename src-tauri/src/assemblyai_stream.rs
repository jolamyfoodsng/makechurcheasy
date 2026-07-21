/**
 * assemblyai_stream.rs — Background-safe AssemblyAI realtime STT capture.
 *
 * Captures microphone audio via cpal and streams PCM frames to AssemblyAI's
 * realtime WebSocket API. Because this runs entirely in the Tauri backend
 * (outside the WebView), it is immune to browser throttling, App Nap,
 * and AudioContext suspension when the app loses focus.
 *
 * Tauri commands:
 *   start_assemblyai_stream — begin mic capture → realtime STT → transcript events
 *   stop_assemblyai_stream  — tear down the capture/transcription pipeline
 *   set_assemblyai_stream_speed — update the active stream timing profile
 *   set_microphone_gain     — update user gain (0.0–3.0) at runtime
 *
 * Tauri events emitted:
 *   "assemblyai-transcript"  { text, end_of_turn, audio_start, audio_end }
 *   "assemblyai-status"      { status: "connected" | "error" | "stopped" }
 *   "assemblyai-audio-level" { level: f32 }  (for the input meter)
 */
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, StreamConfig};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::http::HeaderValue;
use tokio_tungstenite::tungstenite::Message;

/// User-controlled gain multiplier, stored as f32 bits in an AtomicU32.
/// Positioned AFTER AGC so it doesn't fight the auto-gain.
/// 1.0 = unity (100%), 0.0 = muted (0%), 3.0 = max boost (300%).
static USER_GAIN: AtomicU32 = AtomicU32::new(f32_to_bits(1.0));

const REALTIME_WS_URL: &str = "wss://streaming.assemblyai.com/v3/ws";
const REALTIME_MODEL: &str = "universal-3-5-pro";
const TARGET_RATE: u32 = 16_000;
const CHUNK_MS: u64 = 50;
const REALTIME_PROMPT: &str = "English Christian church sermon, Bible teaching, worship service, pastor speech, scripture references, Bible book names, chapters, verses, and worship phrases.";

// ── State ────────────────────────────────────────────────────────────────────

struct StreamBox(Option<cpal::Stream>);
unsafe impl Send for StreamBox {}
unsafe impl Sync for StreamBox {}

#[derive(Clone, Copy)]
struct RealtimeProfile {
    label: &'static str,
    realtime_mode: &'static str,
    min_turn_silence_ms: u32,
    max_turn_silence_ms: u32,
    interruption_delay_ms: u32,
    force_endpoint_min_words: Option<usize>,
    force_endpoint_cooldown_ms: u64,
}

fn realtime_profile(detection_speed: Option<&str>) -> RealtimeProfile {
    match detection_speed {
        Some("fast") => RealtimeProfile {
            label: "fast",
            realtime_mode: "min_latency",
            min_turn_silence_ms: 100,
            max_turn_silence_ms: 700,
            interruption_delay_ms: 0,
            force_endpoint_min_words: Some(8),
            force_endpoint_cooldown_ms: 1_200,
        },
        Some("accurate") => RealtimeProfile {
            label: "accurate",
            realtime_mode: "max_accuracy",
            min_turn_silence_ms: 700,
            max_turn_silence_ms: 1_800,
            interruption_delay_ms: 500,
            force_endpoint_min_words: Some(32),
            force_endpoint_cooldown_ms: 5_000,
        },
        _ => RealtimeProfile {
            label: "balanced",
            realtime_mode: "balanced",
            min_turn_silence_ms: 300,
            max_turn_silence_ms: 1_200,
            interruption_delay_ms: 250,
            force_endpoint_min_words: Some(14),
            force_endpoint_cooldown_ms: 2_500,
        },
    }
}

/// Managed state for the AssemblyAI realtime STT capture pipeline.
pub struct AssemblyAiStreamState {
    /// cpal mic stream — dropped to stop capture.
    stream: Mutex<StreamBox>,
    /// Sends `()` to signal the WS forwarding task to shut down.
    shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    /// Sends runtime timing-profile changes to the WS forwarding task.
    profile_tx: Mutex<Option<mpsc::Sender<RealtimeProfile>>>,
    /// Handle for the async WS task so we can await / abort it.
    task_handle: Mutex<Option<JoinHandle<()>>>,
    is_streaming: Mutex<bool>,
}

impl Default for AssemblyAiStreamState {
    fn default() -> Self {
        Self {
            stream: Mutex::new(StreamBox(None)),
            shutdown_tx: Mutex::new(None),
            profile_tx: Mutex::new(None),
            task_handle: Mutex::new(None),
            is_streaming: Mutex::new(false),
        }
    }
}

// ── Payloads ─────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
struct TranscriptPayload {
    text: String,
    end_of_turn: bool,
    audio_start: f64,
    audio_end: f64,
}

#[derive(Serialize, Clone)]
struct StatusPayload {
    status: String,
}

#[derive(Serialize, Clone)]
struct LevelPayload {
    level: f32,
}

#[derive(Deserialize)]
struct RealtimeWord {
    start: Option<f64>,
    end: Option<f64>,
}

#[derive(Deserialize)]
struct RealtimeTranscriptMessage {
    #[serde(rename = "type")]
    message_type: String,
    turn_order: Option<u64>,
    transcript: Option<String>,
    end_of_turn: Option<bool>,
    words: Option<Vec<RealtimeWord>>,
    error: Option<String>,
    message: Option<String>,
}

struct RealtimeTurnInfo {
    turn_order: Option<u64>,
    end_of_turn: bool,
    word_count: usize,
}

// ── Atomic f32 helpers ───────────────────────────────────────────────────────

/// Store an f32 as its raw bit pattern in an AtomicU32.
const fn f32_to_bits(v: f32) -> u32 {
    v.to_bits()
}

/// Load an f32 from its raw bit pattern in an AtomicU32.
const fn f32_from_bits(bits: u32) -> f32 {
    f32::from_bits(bits)
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn start_assemblyai_stream(
    app: AppHandle,
    api_key: String,
    state: State<'_, AssemblyAiStreamState>,
    device_id: Option<String>,
    detection_speed: Option<String>,
) -> Result<(), String> {
    // Guard against double-start
    {
        let guard = state.is_streaming.lock().map_err(|e| e.to_string())?;
        if *guard {
            return Ok(());
        }
    }

    // Channel: audio capture → WS sender task.
    // Capacity 64 buffers ≈ ~6 s of 100 ms chunks — enough headroom.
    let (audio_tx, audio_rx) = mpsc::channel::<Vec<u8>>(64);
    let (profile_tx, profile_rx) = mpsc::channel::<RealtimeProfile>(4);
    let profile = realtime_profile(detection_speed.as_deref());

    // One-shot: signal the WS task to shut down.
    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    // ── 1. Start cpal mic capture ────────────────────────────────────────────
    let host = cpal::default_host();

    let device: Device = if let Some(ref id) = device_id {
        let found = host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate devices: {e}"))?
            .find(|d| d.name().ok().as_ref() == Some(id));
        match found {
            Some(d) => d,
            None => {
                eprintln!(
                    "[AssemblyAI Stream] Device '{id}' not found — using default input device"
                );
                host.default_input_device()
                    .ok_or_else(|| "No default input device found".to_string())?
            }
        }
    } else {
        host.default_input_device()
            .ok_or_else(|| "No default input device found".to_string())?
    };

    let supported_config = device
        .default_input_config()
        .map_err(|e| format!("Failed to get default input config: {e}"))?;

    let sample_format = supported_config.sample_format();
    let native_rate = supported_config.sample_rate().0;
    let channels = supported_config.channels() as usize;

    let stream_config = StreamConfig {
        channels: supported_config.channels(),
        sample_rate: supported_config.sample_rate(),
        buffer_size: cpal::BufferSize::Default,
    };

    let target_rate: u32 = TARGET_RATE;
    let chunk_target: usize = ((target_rate as u64 * CHUNK_MS) / 1000) as usize;

    let app_clone = app.clone();
    let audio_tx_clone = audio_tx.clone();

    // Accumulator lives inside the audio callback closure.
    let stream = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                process_and_send_f32(
                    data,
                    channels,
                    native_rate,
                    target_rate,
                    chunk_target,
                    &audio_tx_clone,
                    &app_clone,
                );
            },
            |err| eprintln!("[AssemblyAI Stream] cpal error: {err}"),
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                let float_data: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                process_and_send_f32(
                    &float_data,
                    channels,
                    native_rate,
                    target_rate,
                    chunk_target,
                    &audio_tx_clone,
                    &app_clone,
                );
            },
            |err| eprintln!("[AssemblyAI Stream] cpal error: {err}"),
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                let float_data: Vec<f32> = data
                    .iter()
                    .map(|&s| (s as f32 - 32768.0) / 32768.0)
                    .collect();
                process_and_send_f32(
                    &float_data,
                    channels,
                    native_rate,
                    target_rate,
                    chunk_target,
                    &audio_tx_clone,
                    &app_clone,
                );
            },
            |err| eprintln!("[AssemblyAI Stream] cpal error: {err}"),
            None,
        ),
        _ => return Err(format!("Unsupported sample format: {sample_format:?}")),
    }
    .map_err(|e| format!("Failed to build audio stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("Failed to start audio stream: {e}"))?;

    // Store stream and state.
    {
        let mut s = state.stream.lock().map_err(|e| e.to_string())?;
        s.0 = Some(stream);
    }
    {
        let mut sd = state.shutdown_tx.lock().map_err(|e| e.to_string())?;
        *sd = Some(shutdown_tx);
    }
    {
        let mut p = state.profile_tx.lock().map_err(|e| e.to_string())?;
        *p = Some(profile_tx);
    }
    {
        let mut c = state.is_streaming.lock().map_err(|e| e.to_string())?;
        *c = true;
    }

    // ── 2. Spawn the AssemblyAI realtime STT task ─────────────────────────
    let realtime_app = app.clone();
    let task = tokio::spawn(async move {
        if let Err(error) = run_realtime_transcriber(
            realtime_app.clone(),
            api_key,
            audio_rx,
            shutdown_rx,
            profile_rx,
            profile,
        )
        .await
        {
            eprintln!("[AssemblyAI Realtime] Stream failed: {error}");
            let _ = realtime_app.emit(
                "assemblyai-status",
                StatusPayload {
                    status: format!("error: {error}"),
                },
            );
        } else {
            let _ = realtime_app.emit(
                "assemblyai-status",
                StatusPayload {
                    status: "stopped".to_string(),
                },
            );
            println!("[AssemblyAI Realtime] Capture task ended");
        }
    });

    {
        let mut h = state.task_handle.lock().map_err(|e| e.to_string())?;
        *h = Some(task);
    }

    println!(
        "[AssemblyAI Realtime] Started — profile {}, native rate {native_rate} Hz, {channels} ch",
        profile.label
    );
    Ok(())
}

async fn run_realtime_transcriber(
    app: AppHandle,
    api_key: String,
    mut audio_rx: mpsc::Receiver<Vec<u8>>,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    mut profile_rx: mpsc::Receiver<RealtimeProfile>,
    initial_profile: RealtimeProfile,
) -> Result<(), String> {
    let endpoint = build_realtime_endpoint(&initial_profile);
    let mut request = endpoint
        .as_str()
        .into_client_request()
        .map_err(|e| format!("Failed to create realtime request: {e}"))?;
    let auth = HeaderValue::from_str(&api_key)
        .map_err(|e| format!("Invalid AssemblyAI API key header: {e}"))?;
    request.headers_mut().insert("Authorization", auth);

    let (ws_stream, _) = connect_async(request)
        .await
        .map_err(|e| format!("Realtime WebSocket connection failed: {e}"))?;
    let (mut write, mut read) = ws_stream.split();

    let _ = app.emit(
        "assemblyai-status",
        StatusPayload {
            status: "connected".to_string(),
        },
    );
    println!("[AssemblyAI Realtime] WebSocket connected");

    let mut profile = initial_profile;
    let mut forced_turn_order: Option<u64> = None;
    let mut last_force_endpoint_at: Option<Instant> = None;

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => {
                println!("[AssemblyAI Realtime] Shutdown signal received");
                let terminate = serde_json::json!({ "type": "Terminate" }).to_string();
                let _ = write.send(Message::Text(terminate.into())).await;
                let _ = write.close().await;
                break;
            }
            maybe_pcm = audio_rx.recv() => {
                let Some(pcm_bytes) = maybe_pcm else {
                    break;
                };
                write
                    .send(Message::Binary(pcm_bytes.into()))
                    .await
                    .map_err(|e| format!("Failed to send realtime audio: {e}"))?;
            }
            maybe_profile = profile_rx.recv() => {
                if let Some(next_profile) = maybe_profile {
                    send_realtime_profile_update(&mut write, &next_profile).await?;
                    profile = next_profile;
                    forced_turn_order = None;
                    last_force_endpoint_at = None;
                    println!("[AssemblyAI Realtime] Profile updated to {}", profile.label);
                }
            }
            maybe_message = read.next() => {
                let Some(message) = maybe_message else {
                    break;
                };
                match message {
                    Ok(Message::Text(text)) => {
                        if let Some(turn) = handle_realtime_message(&app, text.as_ref())? {
                            maybe_force_endpoint(
                                &mut write,
                                &turn,
                                &profile,
                                &mut forced_turn_order,
                                &mut last_force_endpoint_at,
                            )
                            .await?;
                        }
                    }
                    Ok(Message::Binary(bytes)) => {
                        if let Ok(text) = std::str::from_utf8(bytes.as_ref()) {
                            if let Some(turn) = handle_realtime_message(&app, text)? {
                                maybe_force_endpoint(
                                    &mut write,
                                    &turn,
                                    &profile,
                                    &mut forced_turn_order,
                                    &mut last_force_endpoint_at,
                                )
                                .await?;
                            }
                        }
                    }
                    Ok(Message::Ping(payload)) => {
                        let _ = write.send(Message::Pong(payload)).await;
                    }
                    Ok(Message::Close(frame)) => {
                        if let Some(frame) = frame {
                            println!("[AssemblyAI Realtime] WebSocket closed: {} {}", frame.code, frame.reason);
                        }
                        break;
                    }
                    Ok(_) => {}
                    Err(error) => {
                        return Err(format!("Realtime WebSocket read failed: {error}"));
                    }
                }
            }
        }
    }

    Ok(())
}

fn build_realtime_endpoint(profile: &RealtimeProfile) -> String {
    let language_codes = serde_json::json!(["en"]).to_string();
    let params = [
        ("speech_model", REALTIME_MODEL.to_string()),
        ("encoding", "pcm_s16le".to_string()),
        ("sample_rate", TARGET_RATE.to_string()),
        ("mode", profile.realtime_mode.to_string()),
        ("language_codes", language_codes),
        ("include_partial_turns", "true".to_string()),
        ("continuous_partials", "true".to_string()),
        (
            "interruption_delay",
            profile.interruption_delay_ms.to_string(),
        ),
        ("min_turn_silence", profile.min_turn_silence_ms.to_string()),
        ("max_turn_silence", profile.max_turn_silence_ms.to_string()),
        ("prompt", REALTIME_PROMPT.to_string()),
    ];

    let query = params
        .iter()
        .map(|(key, value)| format!("{key}={}", urlencoding::encode(value)))
        .collect::<Vec<_>>()
        .join("&");

    format!("{REALTIME_WS_URL}?{query}")
}

async fn send_realtime_profile_update<S>(
    write: &mut S,
    profile: &RealtimeProfile,
) -> Result<(), String>
where
    S: SinkExt<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    let update = serde_json::json!({
        "type": "UpdateConfiguration",
        "prompt": REALTIME_PROMPT,
        "min_turn_silence": profile.min_turn_silence_ms,
        "max_turn_silence": profile.max_turn_silence_ms,
    })
    .to_string();

    write
        .send(Message::Text(update.into()))
        .await
        .map_err(|e| format!("Failed to update realtime profile: {e}"))
}

async fn maybe_force_endpoint<S>(
    write: &mut S,
    turn: &RealtimeTurnInfo,
    profile: &RealtimeProfile,
    forced_turn_order: &mut Option<u64>,
    last_force_endpoint_at: &mut Option<Instant>,
) -> Result<(), String>
where
    S: SinkExt<Message> + Unpin,
    <S as futures_util::Sink<Message>>::Error: std::fmt::Display,
{
    if turn.end_of_turn {
        if turn.turn_order.is_some() && turn.turn_order == *forced_turn_order {
            *forced_turn_order = None;
        }
        return Ok(());
    }

    let Some(force_endpoint_min_words) = profile.force_endpoint_min_words else {
        return Ok(());
    };

    if turn.word_count < force_endpoint_min_words {
        return Ok(());
    }

    if let (Some(current), Some(forced)) = (turn.turn_order, *forced_turn_order) {
        if current == forced {
            return Ok(());
        }
    }

    if last_force_endpoint_at
        .map(|instant| {
            instant.elapsed() < Duration::from_millis(profile.force_endpoint_cooldown_ms)
        })
        .unwrap_or(false)
    {
        return Ok(());
    }

    let force_endpoint = serde_json::json!({ "type": "ForceEndpoint" }).to_string();
    write
        .send(Message::Text(force_endpoint.into()))
        .await
        .map_err(|e| format!("Failed to force realtime endpoint: {e}"))?;

    *forced_turn_order = turn.turn_order;
    *last_force_endpoint_at = Some(Instant::now());
    Ok(())
}

fn handle_realtime_message(app: &AppHandle, raw: &str) -> Result<Option<RealtimeTurnInfo>, String> {
    let message: RealtimeTranscriptMessage = serde_json::from_str(raw)
        .map_err(|e| format!("Failed to parse realtime message: {e}: {raw}"))?;

    match message.message_type.as_str() {
        "Turn" => {
            let transcript = message.transcript.unwrap_or_default();
            let transcript = transcript.trim();
            if transcript.is_empty() {
                return Ok(None);
            }

            let (audio_start, audio_end) = extract_realtime_word_range(&message.words);
            let end_of_turn = message.end_of_turn.unwrap_or(false);
            let word_count = transcript.split_whitespace().count();
            let payload = TranscriptPayload {
                text: transcript.to_string(),
                end_of_turn,
                audio_start,
                audio_end,
            };
            let _ = app.emit("assemblyai-transcript", payload);
            return Ok(Some(RealtimeTurnInfo {
                turn_order: message.turn_order,
                end_of_turn,
                word_count,
            }));
        }
        "Begin" => {
            let _ = app.emit(
                "assemblyai-status",
                StatusPayload {
                    status: "connected".to_string(),
                },
            );
        }
        "Termination" => {
            let _ = app.emit(
                "assemblyai-status",
                StatusPayload {
                    status: "stopped".to_string(),
                },
            );
        }
        "Error" => {
            let detail = message
                .error
                .or(message.message)
                .unwrap_or_else(|| "unknown realtime error".to_string());
            let _ = app.emit(
                "assemblyai-status",
                StatusPayload {
                    status: format!("error: {detail}"),
                },
            );
        }
        _ => {}
    }

    Ok(None)
}

fn extract_realtime_word_range(words: &Option<Vec<RealtimeWord>>) -> (f64, f64) {
    let Some(words) = words else {
        return (0.0, 0.0);
    };
    let start = words.iter().find_map(|word| word.start).unwrap_or(0.0);
    let end = words
        .iter()
        .rev()
        .find_map(|word| word.end)
        .unwrap_or(start);
    (start, end)
}

#[tauri::command]
pub async fn stop_assemblyai_stream(state: State<'_, AssemblyAiStreamState>) -> Result<(), String> {
    // Drop the mic stream — stops cpal callbacks immediately.
    {
        let mut s = state.stream.lock().map_err(|e| e.to_string())?;
        s.0 = None;
    }

    // Signal the WS task to shut down.
    {
        let mut sd = state.shutdown_tx.lock().map_err(|e| e.to_string())?;
        if let Some(tx) = sd.take() {
            let _ = tx.send(());
        }
    }
    {
        let mut p = state.profile_tx.lock().map_err(|e| e.to_string())?;
        *p = None;
    }

    // Wait for the WS task to finish.
    // Take the handle out of the Mutex so we don't hold the guard across .await.
    let handle = {
        let mut h = state.task_handle.lock().map_err(|e| e.to_string())?;
        h.take()
    };
    if let Some(handle) = handle {
        let _ = handle.await;
    }

    {
        let mut c = state.is_streaming.lock().map_err(|e| e.to_string())?;
        *c = false;
    }

    println!("[AssemblyAI Stream] Stopped");
    Ok(())
}

/// Update the user-controlled microphone gain at runtime (0.0–3.0).
/// This multiplier is applied AFTER the auto-gain, so it acts as a post-AGC
/// trim control that doesn't fight the dynamic range compression.
#[tauri::command]
pub fn set_microphone_gain(gain: f32) {
    let clamped = gain.clamp(0.0, 3.0);
    USER_GAIN.store(f32_to_bits(clamped), Ordering::Relaxed);
    println!("[AssemblyAI Stream] User gain set to {clamped:.2}");
}

#[tauri::command]
pub async fn set_assemblyai_stream_speed(
    state: State<'_, AssemblyAiStreamState>,
    detection_speed: String,
) -> Result<(), String> {
    let profile = realtime_profile(Some(detection_speed.as_str()));
    let sender = {
        let guard = state.profile_tx.lock().map_err(|e| e.to_string())?;
        guard.clone()
    };

    if let Some(sender) = sender {
        sender
            .send(profile)
            .await
            .map_err(|e| format!("Failed to update AssemblyAI realtime profile: {e}"))?;
    }

    Ok(())
}

// ── Audio processing ─────────────────────────────────────────────────────────

/// Persistent audio state across callbacks (DC offset, gain, noise gate).
struct AudioState {
    /// High-pass filter state (single-pole IIR).
    hp_prev: f32,
    /// Running RMS for auto-gain normalization.
    rms_ema: f32,
    /// Noise gate: true = gate is open (audio passing).
    gate_open: bool,
    /// Gate hold counter — keeps gate open for N chunks after level drops.
    gate_hold: u32,
}

impl AudioState {
    fn new() -> Self {
        Self {
            hp_prev: 0.0,
            rms_ema: 0.001,
            gate_open: false,
            gate_hold: 0,
        }
    }
}

/// Accumulates audio samples, preprocesses (DC removal + auto-gain + noise
/// gate), resamples, converts to PCM16, and sends to the channel.  Runs in
/// the cpal audio thread — must be fast.
fn process_and_send_f32(
    data: &[f32],
    channels: usize,
    native_rate: u32,
    target_rate: u32,
    chunk_target: usize,
    audio_tx: &mpsc::Sender<Vec<u8>>,
    app: &AppHandle,
) {
    use std::cell::RefCell;
    thread_local! {
        static ACCUMULATOR: RefCell<Vec<f32>> = RefCell::new(Vec::with_capacity(8192));
        static STATE: RefCell<AudioState> = RefCell::new(AudioState::new());
    }

    // Mix down to mono
    let mono: Vec<f32> = if channels > 1 {
        data.chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        data.to_vec()
    };

    // ── Preprocessing ────────────────────────────────────────────────────
    STATE.with(|st| {
        let mut st = st.borrow_mut();

        // 1) DC offset removal — single-pole high-pass at ~20 Hz
        let hp_alpha = 0.998;
        let mut prev_input = mono[0];
        let mut filtered = Vec::with_capacity(mono.len());
        for &s in &mono {
            // y[n] = alpha * (y[n-1] + x[n] - x[n-1])
            let out = hp_alpha * (st.hp_prev + s - prev_input);
            prev_input = s;
            st.hp_prev = out;
            filtered.push(out);
        }

        // 2) Running RMS for auto-gain (EMA, slow attack ~50 ms)
        let rms_alpha = 0.005; // slow跟踪
        let target_rms = 0.1; // target RMS level
        let chunk_rms: f32 = {
            let sum: f32 = filtered.iter().map(|s| s * s).sum();
            (sum / filtered.len() as f32).sqrt().max(1e-10)
        };
        st.rms_ema = rms_alpha * chunk_rms + (1.0 - rms_alpha) * st.rms_ema;
        let agc_gain = (target_rms / st.rms_ema).min(10.0).max(0.1);

        // Read user gain from the atomic (lock-free, thread-safe).
        // Positioned AFTER AGC so it doesn't fight the dynamic range compression.
        let user_gain = f32_from_bits(USER_GAIN.load(Ordering::Relaxed));
        let effective_gain = agc_gain * user_gain;

        // 3) Noise gate — hold open for ~200 ms (2 chunks) after level drops
        let gate_threshold = 0.003;
        if chunk_rms > gate_threshold {
            st.gate_open = true;
            st.gate_hold = 3; // ~300 ms hold
        } else if st.gate_hold > 0 {
            st.gate_hold -= 1;
        } else {
            st.gate_open = false;
        }

        // Apply effective gain (AGC × user) + gate
        let processed: Vec<f32> = if st.gate_open {
            filtered
                .iter()
                .map(|s| (s * effective_gain).max(-1.0).min(1.0))
                .collect()
        } else {
            vec![0.0; filtered.len()]
        };

        // ── Resample ─────────────────────────────────────────────────────
        let resampled = if native_rate != target_rate {
            resample(&processed, native_rate, target_rate)
        } else {
            processed
        };

        ACCUMULATOR.with(|acc| {
            let mut acc = acc.borrow_mut();
            acc.extend_from_slice(&resampled);

            while acc.len() >= chunk_target {
                let chunk: Vec<f32> = acc.drain(..chunk_target).collect();

                // RMS level for the input meter
                let sum: f32 = chunk.iter().map(|s| s * s).sum();
                let rms = (sum / chunk.len() as f32).sqrt();
                let level = (rms * 3.0).min(1.0);

                // Convert to PCM16 little-endian bytes
                let pcm16_bytes: Vec<u8> = chunk
                    .iter()
                    .flat_map(|&s| {
                        let clamped = s.max(-1.0).min(1.0);
                        let sample = (clamped * 32767.0) as i16;
                        sample.to_le_bytes()
                    })
                    .collect();

                let _ = audio_tx.try_send(pcm16_bytes);
                let _ = app.emit("assemblyai-audio-level", LevelPayload { level });
            }
        });
    });
}

/// Windowed-sinc resampler — much better quality than linear interpolation.
/// Uses a 64-point Blackman-windowed sinc kernel for anti-aliasing.
fn resample(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if input.is_empty() || from_rate == to_rate {
        return input.to_vec();
    }

    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (input.len() as f64 / ratio).ceil() as usize;
    let sinc_len: i32 = 64; // kernel half-width
    let mut output = Vec::with_capacity(output_len);

    for i in 0..output_len {
        let pos = i as f64 * ratio;
        let center = pos as i32;
        let frac = (pos - center as f64) as f32;

        // Sum Blackman-windowed sinc over kernel
        let mut sample = 0.0f32;
        let mut kernel_sum = 0.0f32;
        for k in -sinc_len..=sinc_len {
            let idx = center + k;
            if idx >= 0 && (idx as usize) < input.len() {
                let x = k as f32 + frac; // fractional offset
                let window = blackman_window(k, sinc_len);
                let sinc_val = sinc(x);
                let contribution = input[idx as usize] * sinc_val * window;
                sample += contribution;
                kernel_sum += sinc_val * window;
            }
        }
        // Normalize kernel
        if kernel_sum.abs() > 1e-10 {
            sample /= kernel_sum;
        }
        output.push(sample.max(-1.0).min(1.0));
    }
    output
}

/// Sinc function: sin(pi * x) / (pi * x)
#[inline]
fn sinc(x: f32) -> f32 {
    if x.abs() < 1e-10 {
        1.0
    } else {
        let pi_x = std::f32::consts::PI * x;
        pi_x.sin() / pi_x
    }
}

/// Blackman window: 0.42 - 0.5 * cos(2*pi*n/N) + 0.08 * cos(4*pi*n/N)
#[inline]
fn blackman_window(n: i32, half_len: i32) -> f32 {
    let n_f = n as f32;
    let n_f = (n_f + half_len as f32) / (2.0 * half_len as f32); // normalize to [0, 1]
    0.42 - 0.5 * (2.0 * std::f32::consts::PI * n_f).cos()
        + 0.08 * (4.0 * std::f32::consts::PI * n_f).cos()
}
