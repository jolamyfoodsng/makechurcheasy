/**
 * assemblyAiStream.ts — AssemblyAI Universal Streaming WebSocket client.
 *
 * Streams 16 kHz mono PCM16 audio to AssemblyAI and receives real-time
 * transcripts. Designed to be called from voiceBibleService with the same
 * Float32Array audio chunks the existing mic pipeline already produces.
 */

export type AssemblyAiStatus = "connecting" | "open" | "closed" | "error";

export interface AssemblyAiStreamHandle {
  sendAudio: (pcm16: Int16Array) => void;
  close: () => void;
}

export interface AssemblyAiCallbacks {
  /** Called with each transcript turn. `isFinal` = true when end_of_turn is signalled. */
  onTranscript: (text: string, isFinal: boolean, audioStartMs?: number, audioEndMs?: number) => void;
  /** Connection status changed. */
  onStatus: (status: AssemblyAiStatus) => void;
  /** Error (non-fatal or fatal). */
  onError: (message: string) => void;
}

const WS_BASE = "wss://streaming.assemblyai.com/v3/ws";

/**
 * Converts Float32Array (-1..1) samples to PCM16 little-endian Int16Array.
 */
function float32ToPcm16(input: Float32Array): Int16Array {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return output;
}

/**
 * Connect to AssemblyAI Universal Streaming and return a handle to send audio
 * and close the connection.
 */
export function connectAssemblyAiStream(
  apiKey: string,
  sampleRate: number,
  callbacks: AssemblyAiCallbacks,
): AssemblyAiStreamHandle {
  // universal-streaming-english → fast streaming model
  const url = `${WS_BASE}?sample_rate=${sampleRate}&encoding=pcm_s16le&token=${encodeURIComponent(apiKey)}&speech_model=u3-rt-pro&modes=max_accuracy`;

  let ws: WebSocket | null = null;
  let closed = false;

  function safeClose() {
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try { ws.close(); } catch { /* ignore */ }
    }
    ws = null;
    closed = true;
  }

  try {
    ws = new WebSocket(url);
  } catch (err) {
    callbacks.onError(`WebSocket creation failed: ${err instanceof Error ? err.message : String(err)}`);
    callbacks.onStatus("error");
    return { sendAudio: () => { }, close: () => { } };
  }

  callbacks.onStatus("connecting");

  ws.onopen = () => {
    if (closed) return;
    callbacks.onStatus("open");
  };

  ws.onmessage = (event) => {
    if (closed) return;
    try {
      const data = JSON.parse(event.data as string) as Record<string, unknown>;
      const type = data.type as string | undefined;

      if (type === "Begin") {
        return;
      }

      if (type === "Turn") {
        const transcript = (data.transcript as string) ?? "";
        const endOfTurn = data.end_of_turn === true;
        const audioStartMs = typeof data.audio_start === "number" ? data.audio_start : undefined;
        const audioEndMs = typeof data.audio_end === "number" ? data.audio_end : undefined;
        if (transcript.trim()) {
          callbacks.onTranscript(transcript, endOfTurn, audioStartMs, audioEndMs);
        }
        return;
      }

      if (type === "Termination") {
        callbacks.onStatus("closed");
        safeClose();
        return;
      }
    } catch {
      // ignore parse errors
    }
  };

  ws.onerror = () => {
    if (closed) return;
    callbacks.onError("Voice service connection error");
    callbacks.onStatus("error");
  };

  ws.onclose = () => {
    if (closed) return;
    callbacks.onStatus("closed");
    ws = null;
    closed = true;
  };

  return {
    sendAudio(pcm16: Int16Array) {
      if (closed || !ws || ws.readyState !== WebSocket.OPEN) return;
      ws.send(pcm16.buffer);
    },
    close() {
      if (closed) return;
      // Send empty binary to signal end of audio
      if (ws && ws.readyState === WebSocket.OPEN) {
        try { ws.send(new ArrayBuffer(0)); } catch { /* ignore */ }
      }
      safeClose();
    },
  };
}

/**
 * Convenience: convert Float32Array audio samples to PCM16 and send.
 */
export function sendFloat32Audio(
  handle: { sendAudio: (pcm16: Int16Array) => void },
  samples: Float32Array,
): void {
  handle.sendAudio(float32ToPcm16(samples));
}
