/**
 * audio_capture.rs — Live microphone capture via cpal.
 *
 * Provides Tauri commands:
 *   list_audio_devices     — enumerate available input devices
 *   start_audio_capture    — open a mic stream, emit "audio-chunk" events
 *   stop_audio_capture     — close the mic stream
 *
 * Audio is captured at the device's native sample rate, down-mixed to mono,
 * resampled to 16 kHz, and emitted as PCM16 little-endian bytes encoded
 * in base64.  The payload also includes an RMS level (0..1) for a meter.
 */

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Device, SampleFormat, StreamConfig};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, State};

// ── Wrapper so cpal::Stream can live in managed state ────────────────────────
// cpal::Stream is !Send on some platforms, but Tauri State<T> requires Send + Sync.
// The stream is only touched from command handlers (serialized) and the audio
// callback thread (which captures app_clone, not state).  This is safe.

struct StreamBox(Option<cpal::Stream>);
unsafe impl Send for StreamBox {}
unsafe impl Sync for StreamBox {}

// ── State ────────────────────────────────────────────────────────────────────

pub struct AudioCaptureState {
    stream: Mutex<StreamBox>,
    is_capturing: Mutex<bool>,
}

impl Default for AudioCaptureState {
    fn default() -> Self {
        Self {
            stream: Mutex::new(StreamBox(None)),
            is_capturing: Mutex::new(false),
        }
    }
}

// ── Types ────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone)]
pub struct AudioDevice {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Serialize, Clone)]
pub struct AudioChunkPayload {
    /// Base64-encoded PCM16 little-endian bytes.
    pub data: String,
    /// RMS input level normalised to 0..1.
    pub level: f32,
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_audio_devices() -> Result<Vec<AudioDevice>, String> {
    let host = cpal::default_host();

    let default_name = host
        .default_input_device()
        .and_then(|d| d.name().ok())
        .unwrap_or_default();

    let devices: Vec<AudioDevice> = host
        .input_devices()
        .map_err(|e| format!("Failed to enumerate input devices: {e}"))?
        .filter_map(|device| {
            let name = device.name().ok()?;
            let is_default = name == default_name;
            Some(AudioDevice {
                id: name.clone(),
                name,
                is_default,
            })
        })
        .collect();

    Ok(devices)
}

#[tauri::command]
pub fn start_audio_capture(
    app: AppHandle,
    state: State<'_, AudioCaptureState>,
    device_id: Option<String>,
) -> Result<(), String> {
    // Guard against double-start
    {
        let guard = state.is_capturing.lock().map_err(|e| e.to_string())?;
        if *guard {
            return Ok(());
        }
    }

    let host = cpal::default_host();

    // Resolve device — fall back to default if the requested ID isn't found
    let device: Device = if let Some(ref id) = device_id {
        let found = host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate devices: {e}"))?
            .find(|d| d.name().ok().as_ref() == Some(id));
        match found {
            Some(d) => d,
            None => {
                eprintln!(
                    "[AudioCapture] Device '{id}' not found — using default input device"
                );
                host.default_input_device()
                    .ok_or_else(|| "No default input device found".to_string())?
            }
        }
    } else {
        host.default_input_device()
            .ok_or_else(|| "No default input device found".to_string())?
    };

    // Use the default input config (includes sample format)
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
    let app_clone = app.clone();

    // Accumulator for resampling — filled across callbacks, drained in fixed-size chunks
    let mut accumulator: Vec<f32> = Vec::new();
    // Emit roughly every 100 ms at 16 kHz = 1600 samples
    let chunk_target: usize = (target_rate / 10) as usize;

    let stream = match sample_format {
        SampleFormat::F32 => device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                process_audio_chunk_f32(
                    data,
                    channels,
                    native_rate,
                    target_rate,
                    chunk_target,
                    &mut accumulator,
                    &app_clone,
                );
            },
            |err| eprintln!("[AudioCapture] Stream error: {err}"),
            None,
        ),
        SampleFormat::I16 => device.build_input_stream(
            &stream_config,
            move |data: &[i16], _: &cpal::InputCallbackInfo| {
                let float_data: Vec<f32> =
                    data.iter().map(|&s| s as f32 / 32768.0).collect();
                process_audio_chunk_f32(
                    &float_data,
                    channels,
                    native_rate,
                    target_rate,
                    chunk_target,
                    &mut accumulator,
                    &app_clone,
                );
            },
            |err| eprintln!("[AudioCapture] Stream error: {err}"),
            None,
        ),
        SampleFormat::U16 => device.build_input_stream(
            &stream_config,
            move |data: &[u16], _: &cpal::InputCallbackInfo| {
                let float_data: Vec<f32> =
                    data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
                process_audio_chunk_f32(
                    &float_data,
                    channels,
                    native_rate,
                    target_rate,
                    chunk_target,
                    &mut accumulator,
                    &app_clone,
                );
            },
            |err| eprintln!("[AudioCapture] Stream error: {err}"),
            None,
        ),
        _ => {
            return Err(format!(
                "Unsupported sample format: {sample_format:?}"
            ))
        }
    }
    .map_err(|e| format!("Failed to build audio stream: {e}"))?;

    stream
        .play()
        .map_err(|e| format!("Failed to start audio stream: {e}"))?;

    {
        let mut s = state.stream.lock().map_err(|e| e.to_string())?;
        s.0 = Some(stream);
    }
    {
        let mut c = state.is_capturing.lock().map_err(|e| e.to_string())?;
        *c = true;
    }

    println!("[AudioCapture] Started — device native rate {native_rate} Hz, {channels} ch");
    Ok(())
}

#[tauri::command]
pub fn stop_audio_capture(state: State<'_, AudioCaptureState>) -> Result<(), String> {
    {
        let mut s = state.stream.lock().map_err(|e| e.to_string())?;
        s.0 = None;
    }
    {
        let mut c = state.is_capturing.lock().map_err(|e| e.to_string())?;
        *c = false;
    }
    println!("[AudioCapture] Stopped");
    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Mix multi-channel audio down to mono, resample, and emit chunks.
fn process_audio_chunk_f32(
    data: &[f32],
    channels: usize,
    native_rate: u32,
    target_rate: u32,
    chunk_target: usize,
    accumulator: &mut Vec<f32>,
    app: &AppHandle,
) {
    // Mix down to mono
    let mono: Vec<f32> = if channels > 1 {
        data.chunks(channels)
            .map(|frame| frame.iter().sum::<f32>() / channels as f32)
            .collect()
    } else {
        data.to_vec()
    };

    // Resample to target rate
    let resampled = if native_rate != target_rate {
        resample(&mono, native_rate, target_rate)
    } else {
        mono
    };

    accumulator.extend_from_slice(&resampled);

    // Emit fixed-size chunks
    while accumulator.len() >= chunk_target {
        let chunk: Vec<f32> = accumulator.drain(..chunk_target).collect();

        // RMS level
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

        use base64::Engine;
        let encoded = base64::engine::general_purpose::STANDARD.encode(&pcm16_bytes);

        let _ = app.emit(
            "audio-chunk",
            AudioChunkPayload {
                data: encoded,
                level,
            },
        );
    }
}

/// Simple linear-interpolation resampler.
fn resample(input: &[f32], from_rate: u32, to_rate: u32) -> Vec<f32> {
    if input.is_empty() || from_rate == to_rate {
        return input.to_vec();
    }
    let ratio = from_rate as f64 / to_rate as f64;
    let output_len = (input.len() as f64 / ratio).ceil() as usize;
    let mut output = Vec::with_capacity(output_len);
    for i in 0..output_len {
        let pos = i as f64 * ratio;
        let idx = pos as usize;
        let frac = pos - idx as f64;
        let sample = if idx + 1 < input.len() {
            input[idx] * (1.0 - frac) as f32 + input[idx + 1] * frac as f32
        } else if idx < input.len() {
            input[idx]
        } else {
            0.0
        };
        output.push(sample);
    }
    output
}
