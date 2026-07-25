/**
 * audioProcessor.ts — Reusable Web Audio API microphone processor.
 *
 * Creates a processing graph:
 *   MediaStreamSource → DynamicsCompressor → GainNode → AnalyserNode → MediaStreamDestination
 *
 * The gain is positioned AFTER the compressor so it acts as a post-AGC trim
 * boost (the compressor already normalizes dynamics).  This means:
 *   - Gain 1.0 = unity (no change to the compressed signal)
 *   - Gain < 1.0 = attenuation
 *   - Gain > 1.0 = post-compression boost
 *
 * The AnalyserNode provides real-time level data for UI meters.
 */

// ── Constants ────────────────────────────────────────────────────────────────

/** DynamicsCompressor settings — identical to the VoiceBible chain defaults. */
const COMPRESSOR_THRESHOLD_DB = -24;
const COMPRESSOR_KNEE_DB = 30;
const COMPRESSOR_RATIO = 12;
const COMPRESSOR_ATTACK_S = 0.003;
const COMPRESSOR_RELEASE_S = 0.25;

/** Analyser FFT size — 256 gives 128 frequency bins, good for metering. */
const ANALYSER_FFT_SIZE = 256;
const ANALYSER_SMOOTHING = 0.3;

/** Smoothing time constant for setTargetAtTime (seconds). */
const GAIN_SMOOTHING_S = 0.02;

/** Clipping threshold — peak absolute value >= this is considered clipping. */
const CLIP_THRESHOLD = 0.99;

// ── Types ────────────────────────────────────────────────────────────────────

export interface AudioProcessor {
  /** Set the post-compression gain multiplier (0.0 – 3.0). Smooth transition. */
  setGain(value: number): void;
  /** RMS level of the current analyser frame (0.0 – 1.0). */
  getLevel(): number;
  /** True when the peak absolute sample >= CLIP_THRESHOLD. */
  isClipping(): boolean;
  /** Raw peak absolute sample (0.0 – 1.0) for metering. */
  getPeak(): number;
  /** The processed MediaStream — feed this to the speech engine. */
  getProcessedStream(): MediaStream;
  /** Disconnect all nodes, close AudioContext, stop source tracks. */
  destroy(): void;
}

// ── Internal state ───────────────────────────────────────────────────────────

interface ProcessorState {
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  compressor: DynamicsCompressorNode;
  gain: GainNode;
  analyser: AnalyserNode;
  destination: MediaStreamAudioDestinationNode;
  /** Reusable typed array for analyser data (avoid alloc per frame). */
  _timeData: Float32Array;
  /** Whether the context has been closed. */
  _destroyed: boolean;
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an AudioProcessor wrapping the given raw mic stream.
 *
 * @param rawStream  The stream from getUserMedia().
 * @param initialGain  Initial gain multiplier (0.0 – 3.0).  1.0 = unity.
 */
export function createAudioProcessor(
  rawStream: MediaStream,
  initialGain: number,
): AudioProcessor {
  const ctx = new AudioContext({ sampleRate: rawStream.getAudioTracks()[0]?.getSettings().sampleRate ?? 48000 });

  // Ensure the context is running — browsers suspend AudioContext until a user
  // gesture, and even then the newly-created context may start suspended.
  ctx.resume().catch(() => { });

  const source = ctx.createMediaStreamSource(rawStream);

  // ── DynamicsCompressor (post-AGC normalization) ──
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = COMPRESSOR_THRESHOLD_DB;
  compressor.knee.value = COMPRESSOR_KNEE_DB;
  compressor.ratio.value = COMPRESSOR_RATIO;
  compressor.attack.value = COMPRESSOR_ATTACK_S;
  compressor.release.value = COMPRESSOR_RELEASE_S;

  // ── GainNode (user-controlled trim) ──
  const gain = ctx.createGain();
  gain.gain.value = clampGain(initialGain);

  // ── AnalyserNode (level metering) ──
  const analyser = ctx.createAnalyser();
  analyser.fftSize = ANALYSER_FFT_SIZE;
  analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;

  // ── Destination (output stream for speech engine) ──
  const destination = ctx.createMediaStreamDestination();

  // ── Connect: source → compressor → gain → analyser → destination ──
  source.connect(compressor);
  compressor.connect(gain);
  gain.connect(analyser);
  analyser.connect(destination);

  const state: ProcessorState = {
    ctx,
    source,
    compressor,
    gain,
    analyser,
    destination,
    _timeData: new Float32Array(analyser.fftSize),
    _destroyed: false,
  };

  return {
    setGain(value: number) {
      if (state._destroyed) return;
      // Auto-resume if suspended (browser autoplay policy).
      if (state.ctx.state === "suspended") state.ctx.resume().catch(() => { });
      const target = clampGain(value);
      state.gain.gain.setTargetAtTime(target, state.ctx.currentTime, GAIN_SMOOTHING_S);
    },

    getLevel(): number {
      if (state._destroyed) return 0;
      if (state.ctx.state === "suspended") state.ctx.resume().catch(() => { });
      state.analyser.getFloatTimeDomainData(state._timeData);
      return computeRms(state._timeData);
    },

    getPeak(): number {
      if (state._destroyed) return 0;
      if (state.ctx.state === "suspended") state.ctx.resume().catch(() => { });
      state.analyser.getFloatTimeDomainData(state._timeData);
      return computePeak(state._timeData);
    },

    isClipping(): boolean {
      if (state._destroyed) return false;
      if (state.ctx.state === "suspended") state.ctx.resume().catch(() => { });
      state.analyser.getFloatTimeDomainData(state._timeData);
      return computePeak(state._timeData) >= CLIP_THRESHOLD;
    },

    getProcessedStream(): MediaStream {
      return state.destination.stream;
    },

    destroy() {
      if (state._destroyed) return;
      state._destroyed = true;
      try {
        state.source.disconnect();
        state.compressor.disconnect();
        state.gain.disconnect();
        state.analyser.disconnect();
      } catch { /* already disconnected */ }
      state.ctx.close().catch(() => { });
      // Stop all tracks on the raw stream to release the mic.
      rawStream.getTracks().forEach((t) => t.stop());
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function clampGain(v: number): number {
  return Math.max(0, Math.min(3, Number.isFinite(v) ? v : 1));
}

/** Compute RMS of a time-domain buffer, normalized to 0–1. */
function computeRms(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    sum += s * s;
  }
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  // Map to 0–1 range.  RMS of 0.5 ≈ -6 dBFS → maps to ~0.5.
  return Math.min(1, rms * 2);
}

/** Compute peak absolute value of a time-domain buffer. */
function computePeak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}
