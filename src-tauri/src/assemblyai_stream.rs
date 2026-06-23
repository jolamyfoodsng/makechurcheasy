/**
 * assemblyai_stream.rs — Background-safe AssemblyAI Universal Streaming.
 *
 * Captures microphone audio via cpal and streams it to AssemblyAI over a
 * native Rust WebSocket.  Because this runs entirely in the Tauri backend
 * (outside the WebView), it is immune to browser throttling, App Nap,
 * and AudioContext suspension when the app loses focus.
 *
 * Tauri commands:
 *   start_assemblyai_stream — begin mic capture → WS → transcript events
 *   stop_assemblyai_stream  — tear down the stream
 *
 * Tauri events emitted:
 *   "assemblyai-transcript"  { text, end_of_turn, audio_start, audio_end }
 *   "assemblyai-status"      { status: "connected" | "error" | "stopped" }
 *   "assemblyai-audio-level" { level: f32 }  (for the input meter)
 */

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, StreamConfig};
use futures_util::{SinkExt, StreamExt};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;
use tokio_tungstenite::{connect_async, tungstenite::Message};

// ── State ────────────────────────────────────────────────────────────────────

struct StreamBox(Option<cpal::Stream>);
unsafe impl Send for StreamBox {}
unsafe impl Sync for StreamBox {}

/// Managed state for the AssemblyAI streaming pipeline.
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

    let target_rate: u32 = 16_000;
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
                let float_data: Vec<f32> =
                    data.iter().map(|&s| s as f32 / 32768.0).collect();
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
                let float_data: Vec<f32> =
                    data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
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

    // ── 2. Spawn the AssemblyAI WebSocket task ─────────────────────────────
    let ws_app = app.clone();
    let task = tokio::spawn(async move {
        let url = format!(
            "wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&encoding=pcm_s16le&token={}&speech_model=u3-rt-pro&modes=max_accuracy&language_code=en",
            urlencoding::encode(&api_key)
        );

        let ws_result = connect_async(&url).await;

        let ws_stream = match ws_result {
            Ok((ws, _)) => ws,
            Err(e) => {
                eprintln!("[AssemblyAI Stream] WebSocket connect failed: {e}");
                let _ = ws_app.emit(
                    "assemblyai-status",
                    StatusPayload {
                        status: format!("error: {e}"),
                    },
                );
                return;
            }
        };

        let (mut ws_sender, mut ws_receiver) = ws_stream.split();

        let _ = ws_app.emit(
            "assemblyai-status",
            StatusPayload {
                status: "connected".to_string(),
            },
        );
        println!("[AssemblyAI Stream] Connected to AssemblyAI WebSocket");

        // Spawn a task to send audio from the channel to the WS.
        let send_app = ws_app.clone();
        let send_task = tokio::spawn(async move {
            let mut audio_rx = audio_rx;
            while let Some(pcm_bytes) = audio_rx.recv().await {
                if ws_sender.send(Message::Binary(pcm_bytes.into())).await.is_err() {
                    break;
                }
            }
            // Send termination message to gracefully close.
            let _ = ws_sender
                .send(Message::Text(r#"{"type": "Terminate"}"#.into()))
                .await;
        });

        // Receive transcripts and emit events.
        let recv_task = tokio::spawn(async move {
            while let Some(msg) = ws_receiver.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                            let msg_type = json.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            match msg_type {
                                "Turn" => {
                                    let transcript =
                                        json.get("transcript").and_then(|v| v.as_str()).unwrap_or("");
                                    if !transcript.is_empty() {
                                        let end_of_turn = json
                                            .get("end_of_turn")
                                            .and_then(|v| {
                                                if let Some(b) = v.as_bool() {
                                                    return Some(b);
                                                }
                                                v.as_str().map(|s| s == "true")
                                            })
                                            .unwrap_or(false);

                                        let audio_start = json
                                            .get("audio_start")
                                            .and_then(|v| v.as_f64())
                                            .unwrap_or(0.0);
                                        let audio_end = json
                                            .get("audio_end")
                                            .and_then(|v| v.as_f64())
                                            .unwrap_or(0.0);

                                        let payload = TranscriptPayload {
                                            text: transcript.to_string(),
                                            end_of_turn,
                                            audio_start,
                                            audio_end,
                                        };

                                        let _ = send_app.emit("assemblyai-transcript", payload);
                                    }
                                }
                                "Begin" => {
                                    println!("[AssemblyAI Stream] Session started (Begin)");
                                }
                                "Termination" => {
                                    println!("[AssemblyAI Stream] Server terminated session");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                    Ok(Message::Close(_)) => {
                        println!("[AssemblyAI Stream] WebSocket closed by server");
                        break;
                    }
                    Err(e) => {
                        eprintln!("[AssemblyAI Stream] WebSocket error: {e}");
                        break;
                    }
                    _ => {}
                }
            }
        });

        // Wait for either the send task to finish (shutdown signal) or the recv task to end.
        tokio::select! {
            _ = send_task => {},
            _ = recv_task => {},
            _ = shutdown_rx => {
                println!("[AssemblyAI Stream] Shutdown signal received");
            }
        }

        let _ = ws_app.emit(
            "assemblyai-status",
            StatusPayload {
                status: "stopped".to_string(),
            },
        );
        println!("[AssemblyAI Stream] WS task ended");
    });

    {
        let mut h = state.task_handle.lock().map_err(|e| e.to_string())?;
        *h = Some(task);
    }

    println!("[AssemblyAI Stream] Started — native rate {native_rate} Hz, {channels} ch");
    Ok(())
}

#[tauri::command]
pub async fn stop_assemblyai_stream(
    state: State<'_, AssemblyAiStreamState>,
) -> Result<(), String> {
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
        let gain = (target_rms / st.rms_ema).min(10.0).max(0.1); // clamp gain

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

        // Apply gain + gate
        let processed: Vec<f32> = if st.gate_open {
            filtered.iter().map(|s| (s * gain).max(-1.0).min(1.0)).collect()
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
    0.42 - 0.5 * (2.0 * std::f32::consts::PI * n_f).cos() + 0.08 * (4.0 * std::f32::consts::PI * n_f).cos()
}
