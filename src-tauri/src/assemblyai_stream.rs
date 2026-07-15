/**
 * assemblyai_stream.rs — Background-safe AssemblyAI Sync STT capture.
 *
 * Captures microphone audio via cpal, segments completed utterances locally,
 * and submits each short PCM clip to AssemblyAI Sync STT. Because this runs
 * entirely in the Tauri backend
 * (outside the WebView), it is immune to browser throttling, App Nap,
 * and AudioContext suspension when the app loses focus.
 *
 * Tauri commands:
 *   start_assemblyai_stream — begin mic capture → Sync STT → transcript events
 *   stop_assemblyai_stream  — tear down the capture/transcription pipeline
 *   set_microphone_gain     — update user gain (0.0–3.0) at runtime
 *
 * Tauri events emitted:
 *   "assemblyai-transcript"  { text, end_of_turn, audio_start, audio_end }
 *   "assemblyai-status"      { status: "connected" | "error" | "stopped" }
 *   "assemblyai-audio-level" { level: f32 }  (for the input meter)
 */
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, StreamConfig};
use reqwest::multipart::{Form, Part};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

/// User-controlled gain multiplier, stored as f32 bits in an AtomicU32.
/// Positioned AFTER AGC so it doesn't fight the auto-gain.
/// 1.0 = unity (100%), 0.0 = muted (0%), 3.0 = max boost (300%).
static USER_GAIN: AtomicU32 = AtomicU32::new(f32_to_bits(1.0));

const SYNC_TRANSCRIBE_URL: &str = "https://sync.assemblyai.com/transcribe";
const SYNC_MODEL: &str = "universal-3-5-pro";
const TARGET_RATE: u32 = 16_000;
const CHUNK_MS: u64 = 100;
const PRE_ROLL_CHUNKS: usize = 3;
const END_SILENCE_CHUNKS: usize = 8;
const MIN_UTTERANCE_MS: u64 = 300;
const MAX_UTTERANCE_MS: u64 = 115_000;
const SPEECH_LEVEL_THRESHOLD: f32 = 0.015;

// ── State ────────────────────────────────────────────────────────────────────

struct StreamBox(Option<cpal::Stream>);
unsafe impl Send for StreamBox {}
unsafe impl Sync for StreamBox {}

/// Managed state for the AssemblyAI Sync STT capture pipeline.
pub struct AssemblyAiStreamState {
    /// cpal mic stream — dropped to stop capture.
    stream: Mutex<StreamBox>,
    /// Sends `()` to signal the WS forwarding task to shut down.
    shutdown_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
    /// Handle for the async WS task so we can await / abort it.
    task_handle: Mutex<Option<JoinHandle<()>>>,
    is_streaming: Mutex<bool>,
}

impl Default for AssemblyAiStreamState {
    fn default() -> Self {
        Self {
            stream: Mutex::new(StreamBox(None)),
            shutdown_tx: Mutex::new(None),
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

struct PendingUtterance {
    pcm: Vec<u8>,
    audio_start_ms: f64,
    audio_end_ms: f64,
}

#[derive(Deserialize)]
struct SyncTranscriptResponse {
    text: String,
    #[allow(dead_code)]
    confidence: Option<f64>,
    #[allow(dead_code)]
    audio_duration_ms: Option<u64>,
    #[allow(dead_code)]
    session_id: Option<String>,
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
    let chunk_target: usize = (target_rate / 10) as usize; // 100 ms chunks

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
        let mut c = state.is_streaming.lock().map_err(|e| e.to_string())?;
        *c = true;
    }

    // ── 2. Spawn the AssemblyAI Sync STT task ─────────────────────────────
    let sync_app = app.clone();
    let task = tokio::spawn(async move {
        let _ = sync_app.emit(
            "assemblyai-status",
            StatusPayload {
                status: "connected".to_string(),
            },
        );
        println!("[AssemblyAI Sync] Capture pipeline connected");

        let (utterance_tx, mut utterance_rx) = mpsc::channel::<PendingUtterance>(16);

        let transcript_app = sync_app.clone();
        let transcript_key = api_key.clone();
        let transcribe_task = tokio::spawn(async move {
            while let Some(utterance) = utterance_rx.recv().await {
                match transcribe_sync_pcm(&transcript_key, utterance.pcm).await {
                    Ok(result) => {
                        let transcript = result.text.trim();
                        if transcript.is_empty() {
                            continue;
                        }

                        let payload = TranscriptPayload {
                            text: transcript.to_string(),
                            end_of_turn: true,
                            audio_start: utterance.audio_start_ms,
                            audio_end: utterance.audio_end_ms,
                        };

                        let _ = transcript_app.emit("assemblyai-transcript", payload);
                    }
                    Err(e) => {
                        eprintln!("[AssemblyAI Sync] Transcription failed: {e}");
                        let _ = transcript_app.emit(
                            "assemblyai-status",
                            StatusPayload {
                                status: format!("error: {e}"),
                            },
                        );
                    }
                }
            }
        });

        let mut audio_rx = audio_rx;
        let mut shutdown_rx = shutdown_rx;
        let mut pre_roll: VecDeque<(Vec<u8>, u64)> = VecDeque::with_capacity(PRE_ROLL_CHUNKS);
        let mut current_pcm: Vec<u8> = Vec::with_capacity((TARGET_RATE as usize) * 2 * 8);
        let mut current_start_ms = 0_u64;
        let mut current_end_ms = 0_u64;
        let mut audio_cursor_ms = 0_u64;
        let mut in_speech = false;
        let mut trailing_silence_chunks = 0_usize;

        loop {
            tokio::select! {
                _ = &mut shutdown_rx => {
                    println!("[AssemblyAI Sync] Shutdown signal received");
                    if in_speech {
                        queue_utterance(
                            &utterance_tx,
                            std::mem::take(&mut current_pcm),
                            current_start_ms,
                            current_end_ms,
                        ).await;
                    }
                    break;
                }
                maybe_pcm = audio_rx.recv() => {
                    let Some(pcm_bytes) = maybe_pcm else {
                        break;
                    };

                    let chunk_duration_ms = pcm_duration_ms(&pcm_bytes).max(CHUNK_MS);
                    let chunk_end_ms = audio_cursor_ms + chunk_duration_ms;
                    audio_cursor_ms = chunk_end_ms;

                    let level = pcm_level(&pcm_bytes);
                    let is_speech = level >= SPEECH_LEVEL_THRESHOLD;

                    if in_speech {
                        current_pcm.extend_from_slice(&pcm_bytes);
                        current_end_ms = chunk_end_ms;

                        if is_speech {
                            trailing_silence_chunks = 0;
                        } else {
                            trailing_silence_chunks += 1;
                        }

                        if trailing_silence_chunks >= END_SILENCE_CHUNKS ||
                            current_end_ms.saturating_sub(current_start_ms) >= MAX_UTTERANCE_MS
                        {
                            queue_utterance(
                                &utterance_tx,
                                std::mem::take(&mut current_pcm),
                                current_start_ms,
                                current_end_ms,
                            ).await;
                            in_speech = false;
                            trailing_silence_chunks = 0;
                            pre_roll.clear();
                        }
                    } else {
                        pre_roll.push_back((pcm_bytes.clone(), chunk_duration_ms));
                        while pre_roll.len() > PRE_ROLL_CHUNKS {
                            pre_roll.pop_front();
                        }

                        if is_speech {
                            in_speech = true;
                            trailing_silence_chunks = 0;
                            current_pcm.clear();

                            let pre_roll_ms = pre_roll.iter().map(|(_, ms)| *ms).sum::<u64>();
                            current_start_ms = chunk_end_ms.saturating_sub(pre_roll_ms);
                            current_end_ms = chunk_end_ms;

                            for (pcm, _) in pre_roll.drain(..) {
                                current_pcm.extend_from_slice(&pcm);
                            }
                        }
                    }
                }
            }
        }

        drop(utterance_tx);
        transcribe_task.abort();

        let _ = sync_app.emit(
            "assemblyai-status",
            StatusPayload {
                status: "stopped".to_string(),
            },
        );
        println!("[AssemblyAI Sync] Capture task ended");
    });

    {
        let mut h = state.task_handle.lock().map_err(|e| e.to_string())?;
        *h = Some(task);
    }

    println!("[AssemblyAI Sync] Started — native rate {native_rate} Hz, {channels} ch");
    Ok(())
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

async fn queue_utterance(
    utterance_tx: &mpsc::Sender<PendingUtterance>,
    pcm: Vec<u8>,
    audio_start_ms: u64,
    audio_end_ms: u64,
) {
    if pcm.is_empty() {
        return;
    }

    let duration_ms = audio_end_ms.saturating_sub(audio_start_ms);
    if duration_ms < MIN_UTTERANCE_MS {
        return;
    }

    let utterance = PendingUtterance {
        pcm,
        audio_start_ms: audio_start_ms as f64,
        audio_end_ms: audio_end_ms as f64,
    };

    if utterance_tx.send(utterance).await.is_err() {
        eprintln!("[AssemblyAI Sync] Dropped utterance because transcriber stopped");
    }
}

async fn transcribe_sync_pcm(
    api_key: &str,
    pcm: Vec<u8>,
) -> Result<SyncTranscriptResponse, String> {
    let config = serde_json::json!({
        "sample_rate": TARGET_RATE,
        "channels": 1,
        "timestamps": false,
        "prompt": "English Christian church sermon, Bible teaching, worship service, or pastor speaking scripture references, Bible book names, chapters, verses, and short sermon phrases.",
        "keyterms_prompt": [
            "Genesis", "Exodus", "Leviticus", "Numbers", "Deuteronomy",
            "Joshua", "Judges", "Ruth", "Samuel", "Kings", "Chronicles",
            "Ezra", "Nehemiah", "Esther", "Job", "Psalm", "Psalms",
            "Proverbs", "Ecclesiastes", "Isaiah", "Jeremiah", "Ezekiel",
            "Daniel", "Hosea", "Joel", "Amos", "Obadiah", "Jonah",
            "Micah", "Nahum", "Habakkuk", "Zephaniah", "Haggai",
            "Zechariah", "Malachi", "Matthew", "Mark", "Luke", "John",
            "Acts", "Romans", "Corinthians", "Galatians", "Ephesians",
            "Philippians", "Colossians", "Thessalonians", "Timothy",
            "Titus", "Philemon", "Hebrews", "James", "Peter", "Jude",
            "Revelation", "chapter", "verse", "scripture"
        ]
    });

    let audio_part = Part::bytes(pcm)
        .file_name("speech.pcm")
        .mime_str("audio/pcm")
        .map_err(|e| format!("Invalid audio multipart part: {e}"))?;

    let config_part = Part::text(config.to_string())
        .mime_str("application/json")
        .map_err(|e| format!("Invalid config multipart part: {e}"))?;

    let form = Form::new()
        .part("audio", audio_part)
        .part("config", config_part);

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("Failed to create Sync API client: {e}"))?;

    let response = client
        .post(SYNC_TRANSCRIBE_URL)
        .header("Authorization", api_key)
        .header("X-AAI-Model", SYNC_MODEL)
        .multipart(form)
        .send()
        .await
        .map_err(|e| format!("Sync API request failed: {e}"))?;

    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|e| format!("Failed to read Sync API response: {e}"))?;

    if !status.is_success() {
        let message = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| {
                value
                    .get("message")
                    .or_else(|| value.get("detail"))
                    .and_then(|v| v.as_str())
                    .map(ToOwned::to_owned)
            })
            .unwrap_or_else(|| body.trim().to_string());
        return Err(format!("Sync API returned {status}: {message}"));
    }

    serde_json::from_str::<SyncTranscriptResponse>(&body)
        .map_err(|e| format!("Failed to parse Sync API response: {e}"))
}

fn pcm_duration_ms(pcm: &[u8]) -> u64 {
    let sample_count = (pcm.len() / 2) as u64;
    ((sample_count * 1000) / TARGET_RATE as u64).max(1)
}

fn pcm_level(pcm: &[u8]) -> f32 {
    if pcm.len() < 2 {
        return 0.0;
    }

    let mut sum = 0.0_f32;
    let mut count = 0_usize;

    for sample in pcm.chunks_exact(2) {
        let value = i16::from_le_bytes([sample[0], sample[1]]) as f32 / 32768.0;
        sum += value * value;
        count += 1;
    }

    if count == 0 {
        return 0.0;
    }

    ((sum / count as f32).sqrt() * 3.0).min(1.0)
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
