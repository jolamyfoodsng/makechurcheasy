import { describe, it, expect, vi, beforeEach } from "vitest";
import { LmDockService } from "./lmDockService";

vi.mock("./dockBridge", () => ({ dockBridge: { sendState: vi.fn() } }));
vi.mock("./overlayUrl", () => ({ getOverlayBaseUrl: async () => "http://localhost" }));
vi.mock("../multiview/mvStore", () => ({ getSettings: () => ({ inputGain: 100 }) }));
vi.mock("./tauriSafe", () => ({
  hasTauriInvoke: () => false,
  safeTauriInvoke: vi.fn().mockResolvedValue(undefined),
  safeTauriListen: vi.fn(),
}));
vi.mock("../bible/bibleEmbeddings", () => ({
  hasEmbeddings: () => false,
  loadBibleEmbeddings: async () => false,
  searchByEmbedding: async () => [],
}));

describe("LmDockService inactivity detection", () => {
  let service: LmDockService;
  let harness: any;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new LmDockService();
    harness = service as any;
    harness.snapshot = {
      ...service.getSnapshot(),
      status: "listening",
      startedAt: Date.now(),
      lastSpeechAt: Date.now(),
    };
    vi.spyOn(harness, "pushStatus").mockImplementation(() => {});
    vi.spyOn(harness, "pushCandidates").mockImplementation(() => {});
  });

  it("does not trigger inactivity prompt before 5 minutes", () => {
    harness.startInactivityMonitor();
    // Advance 4 minutes
    vi.advanceTimersByTime(4 * 60 * 1000);
    expect(service.getSnapshot().inactivityPrompt).toBeNull();
  });

  it("triggers inactivity prompt after 5 minutes of no speech", () => {
    harness.startInactivityMonitor();
    // Advance 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000);
    const snap = service.getSnapshot();
    expect(snap.inactivityPrompt).not.toBeNull();
    expect(snap.inactivityPrompt?.active).toBe(true);
    expect(snap.inactivityPrompt?.remainingSeconds).toBeGreaterThanOrEqual(59);
    expect(snap.inactivityPrompt?.intervalMinutes).toBe(5);
  });

  it("resets inactivity prompt and increases next threshold to 10 minutes when confirmed", () => {
    harness.startInactivityMonitor();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(service.getSnapshot().inactivityPrompt?.active).toBe(true);

    // User confirms "I'm still using it"
    service.confirmStillUsing();
    expect(service.getSnapshot().inactivityPrompt).toBeNull();
    expect(harness.currentInactivityThresholdMs).toBe(10 * 60 * 1000);

    // After another 5 minutes, prompt should NOT fire
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(service.getSnapshot().inactivityPrompt).toBeNull();

    // After reaching 10 minutes, prompt fires again
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(service.getSnapshot().inactivityPrompt?.active).toBe(true);
    expect(service.getSnapshot().inactivityPrompt?.intervalMinutes).toBe(10);
  });

  it("auto-stops transcription and sets inactivity notice when countdown expires", () => {
    harness.startInactivityMonitor();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(service.getSnapshot().inactivityPrompt?.active).toBe(true);

    // Advance 60 seconds (grace period)
    vi.advanceTimersByTime(60 * 1000);
    const snap = service.getSnapshot();
    expect(snap.status).toBe("idle");
    expect(snap.inactivityNotice).toBe("Stopped due to inactivity");
    expect(snap.inactivityPrompt).toBeNull();
  });

  it("stopDueToInactivity immediately halts listening and sets notice", () => {
    service.stopDueToInactivity();
    const snap = service.getSnapshot();
    expect(snap.status).toBe("idle");
    expect(snap.inactivityNotice).toBe("Stopped due to inactivity");
  });

  it("clears inactivity notice on demand", () => {
    service.stopDueToInactivity();
    expect(service.getSnapshot().inactivityNotice).toBe("Stopped due to inactivity");
    service.clearInactivityNotice();
    expect(service.getSnapshot().inactivityNotice).toBeNull();
  });
});

describe("LmDockService inactivity escalation and native guard", () => {
  let service: LmDockService;
  let harness: any;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new LmDockService();
    harness = service as any;
    harness.snapshot = { ...service.getSnapshot(), status: "listening", startedAt: Date.now(), lastSpeechAt: Date.now() };
    vi.spyOn(harness, "pushStatus").mockImplementation(() => {});
    vi.spyOn(harness, "pushCandidates").mockImplementation(() => {});
  });

  it("prompts after 5, then 10, then 15 minutes and stays at 15", () => {
    harness.startInactivityMonitor();
    for (const minutes of [5, 10, 15, 15]) {
      vi.advanceTimersByTime(minutes * 60 * 1000 + 1000);
      expect(service.getSnapshot().inactivityPrompt?.intervalMinutes).toBe(minutes);
      service.confirmStillUsing();
    }
  });

  it("ignores empty or garbage transcripts when counting silence", () => {
    harness.startInactivityMonitor();
    vi.advanceTimersByTime(4 * 60 * 1000);
    service.handleTranscriptStream({ text: "   ", end_of_turn: true, audio_start: 0, audio_end: 0 });
    vi.advanceTimersByTime(60 * 1000 + 1000);
    expect(service.getSnapshot().inactivityPrompt?.active).toBe(true);
  });

  it("real speech while the prompt is open keeps listening", () => {
    harness.startInactivityMonitor();
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(service.getSnapshot().inactivityPrompt?.active).toBe(true);
    harness.onTranscriptFinal = vi.fn();
    service.handleTranscriptStream({ text: "Turn with me to John chapter three", end_of_turn: true, audio_start: 0, audio_end: 1 });
    expect(service.getSnapshot().inactivityPrompt).toBeNull();
  });

  it("stops without reconnecting when the native guard reports the screen turned off", () => {
    harness.shouldKeepListening = true;
    harness.handleNativeGuardStop("screen-off");
    const snap = service.getSnapshot();
    expect(snap.status).toBe("idle");
    expect(snap.inactivityNotice).toBe("Voice AI stopped because the screen turned off");
    expect(harness.shouldKeepListening).toBe(false);
  });
});
