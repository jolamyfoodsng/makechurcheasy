import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LmDockService, type LmDockSnapshot } from "./lmDockService";

const invokeMock = vi.fn();
const listenMock = vi.fn();

vi.mock("./dockBridge", () => ({ dockBridge: { sendState: vi.fn() } }));
vi.mock("./overlayUrl", () => ({ getOverlayBaseUrl: async () => "http://localhost" }));
vi.mock("../multiview/mvStore", () => ({ getSettings: () => ({ inputGain: 100 }) }));
vi.mock("./tauriSafe", () => ({
  hasTauriInvoke: () => true,
  safeTauriInvoke: (...args: unknown[]) => invokeMock(...args),
  safeTauriListen: (...args: unknown[]) => listenMock(...args),
}));
vi.mock("./assemblyAiKey", () => ({
  getAssemblyAiKey: () => "test-api-key",
}));
vi.mock("../bible/bibleEmbeddings", () => ({
  hasEmbeddings: () => false,
  loadBibleEmbeddings: async () => false,
  searchByEmbedding: vi.fn().mockResolvedValue([]),
}));

describe("LmDockService reconnection and connection watchdog", () => {
  let service: LmDockService;

  beforeEach(() => {
    vi.useFakeTimers();
    invokeMock.mockReset();
    listenMock.mockReset();
    invokeMock.mockResolvedValue(undefined);
    listenMock.mockResolvedValue(() => {});
    service = new LmDockService();
  });

  afterEach(() => {
    service.stopListening();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("permits startListening with { reconnect: true } when status is connecting", async () => {
    // Force service snapshot status into 'connecting' as set by recoverFromUnexpectedStreamEnd
    const harness = service as unknown as {
      snapshot: LmDockSnapshot;
      shouldKeepListening: boolean;
      startInFlight: boolean;
    };
    harness.snapshot = { ...service.getSnapshot(), status: "connecting" };
    harness.shouldKeepListening = true;

    // A normal start without reconnect flag should be guarded against duplicate starts
    await service.startListening(undefined, { reconnect: false });
    // invoke should NOT have been called because normal start was blocked
    expect(invokeMock).not.toHaveBeenCalledWith("start_assemblyai_stream", expect.anything());

    // With reconnect: true, it MUST NOT be blocked by status === 'connecting'
    const startPromise = service.startListening(undefined, { reconnect: true });
    await vi.runAllTimersAsync();
    await startPromise;

    // invoke should have been called to start the native stream
    expect(invokeMock).toHaveBeenCalledWith("start_assemblyai_stream", expect.anything());
  });

  it("connection watchdog transitions to error if connecting hangs for 20 seconds", async () => {
    // Start listening normally
    const startPromise = service.startListening();
    await vi.advanceTimersByTimeAsync(100);
    await startPromise;

    // After native start, status is 'connecting' waiting for audio levels / connected events
    expect(service.getSnapshot().status).toBe("connecting");

    // Advance timers past CONNECTION_WATCHDOG_TIMEOUT_MS (20s)
    await vi.advanceTimersByTimeAsync(21_000);

    // Watchdog must have transitioned status to error
    const snap = service.getSnapshot();
    expect(snap.status).toBe("error");
    expect(snap.error).toContain("timed out");
  });

  it("audio level arriving clears the connection watchdog and enters listening", async () => {
    let levelCallback: ((event: { payload: { level: number } }) => void) | null = null;
    listenMock.mockImplementation((event: string, cb: unknown) => {
      if (event === "assemblyai-audio-level") {
        levelCallback = cb as (event: { payload: { level: number } }) => void;
      }
      return Promise.resolve(() => {});
    });

    const startPromise = service.startListening();
    await vi.advanceTimersByTimeAsync(100);
    await startPromise;

    expect(service.getSnapshot().status).toBe("connecting");

    // Audio level event arrives
    expect(levelCallback).not.toBeNull();
    levelCallback!({ payload: { level: 0.15 } });

    expect(service.getSnapshot().status).toBe("listening");

    // Even if 20 seconds elapse, watchdog should NOT fire because it was cleared
    await vi.advanceTimersByTimeAsync(25_000);
    expect(service.getSnapshot().status).toBe("listening");
  });

  it("stopListening cancels connection watchdog and resets to idle", async () => {
    const startPromise = service.startListening();
    await vi.advanceTimersByTimeAsync(100);
    await startPromise;

    expect(service.getSnapshot().status).toBe("connecting");

    service.stopListening();
    expect(service.getSnapshot().status).toBe("idle");

    // Advance 25 seconds — watchdog should not fire
    await vi.advanceTimersByTimeAsync(25_000);
    expect(service.getSnapshot().status).toBe("idle");
  });
});
