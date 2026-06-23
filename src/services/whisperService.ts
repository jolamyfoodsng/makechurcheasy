/**
 * whisperService.ts — Local Whisper model for offline transcription
 *
 * Uses @xenova/transformers to run Whisper in the browser.
 * Falls back to this when AssemblyAI is unavailable (offline).
 */

// Dynamic import to avoid loading the model unless needed
let whisperPipeline: any = null;
let modelLoading = false;
let modelLoaded = false;

export type WhisperStatus = "idle" | "loading" | "ready" | "error";

export interface WhisperCallbacks {
  onStatus?: (status: WhisperStatus) => void;
  onProgress?: (progress: number) => void;
}

/**
 * Load the Whisper model. Call this early to pre-load.
 * Uses whisper-tiny for speed (~40MB), good enough for live captions.
 */
export async function loadWhisperModel(callbacks?: WhisperCallbacks): Promise<boolean> {
  if (modelLoaded) return true;
  if (modelLoading) return false;

  modelLoading = true;
  callbacks?.onStatus?.("loading");

  try {
    const { pipeline } = await import("@xenova/transformers");

    // Use whisper-tiny for fast inference (~40MB)
    // Can upgrade to whisper-base or whisper-small for better accuracy
    whisperPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny", {
      chunk_length_s: 30,
      stride_length_s: 5,
    } as Record<string, unknown>);

    modelLoaded = true;
    callbacks?.onStatus?.("ready");
    return true;
  } catch (err) {
    console.warn("[Whisper] Failed to load model:", err);
    callbacks?.onStatus?.("error");
    return false;
  } finally {
    modelLoading = false;
  }
}

/**
 * Transcribe audio data using the local Whisper model.
 * @param audioData Float32Array of audio samples (16kHz mono)
 * @returns Transcribed text
 */
export async function transcribeAudio(audioData: Float32Array): Promise<string> {
  if (!whisperPipeline) {
    const loaded = await loadWhisperModel();
    if (!loaded) return "";
  }

  try {
    const result = await whisperPipeline(audioData, {
      language: "english",
      task: "transcribe",
      return_timestamps: false,
    });

    // Result can be string or object with text property
    if (typeof result === "string") return result;
    if (result?.text) return result.text;
    if (Array.isArray(result) && result[0]?.text) return result[0].text;
    return "";
  } catch (err) {
    console.warn("[Whisper] Transcription failed:", err);
    return "";
  }
}

/**
 * Check if the Whisper model is loaded and ready.
 */
export function isWhisperReady(): boolean {
  return modelLoaded;
}

/**
 * Check if currently loading the model.
 */
export function isWhisperLoading(): boolean {
  return modelLoading;
}
