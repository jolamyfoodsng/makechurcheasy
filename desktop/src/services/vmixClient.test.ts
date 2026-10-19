import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_VMIX_SETTINGS,
  VmixClient,
  VmixError,
  buildVmixFunctionUrl,
  describeVmixSetup,
  findMceInput,
  normalizeVmixSettings,
  vmixBaseUrl,
  type VmixStatus,
} from "./vmixClient";

const settings = { ...DEFAULT_VMIX_SETTINGS };

function status(overrides: Partial<VmixStatus> = {}): VmixStatus {
  return {
    version: "27",
    edition: "Pro",
    inputs: [
      { key: "a", number: 1, type: "Capture", title: "Camera 1", state: "Running" },
      { key: "b", number: 4, type: "Browser", title: "MCE Presentation", state: "Running" },
    ],
    overlays: [{ number: 1, inputNumber: null }],
    active: 1,
    preview: 2,
    recording: false,
    streaming: false,
    ...overrides,
  };
}

describe("vMix URLs", () => {
  it("builds the base URL from host and port", () => {
    expect(vmixBaseUrl({ host: "192.168.1.20", port: 8088 })).toBe("http://192.168.1.20:8088/api");
  });

  it("percent-encodes function parameters and skips empty ones", () => {
    const url = buildVmixFunctionUrl(settings, "BrowserNavigate", {
      Input: "MCE Presentation",
      Value: "https://x.test/p.html?token=a&b=c",
      Duration: undefined,
    });
    expect(url).toBe(
      "http://127.0.0.1:8088/api/?Function=BrowserNavigate&Input=MCE%20Presentation&Value=https%3A%2F%2Fx.test%2Fp.html%3Ftoken%3Da%26b%3Dc",
    );
  });
});

describe("vMix settings", () => {
  it("falls back to defaults for bad values", () => {
    const normalized = normalizeVmixSettings({ host: "  ", port: -5, overlayChannel: 9 as never, inputName: "" });
    expect(normalized).toEqual(DEFAULT_VMIX_SETTINGS);
  });
});

describe("vMix setup detection", () => {
  it("finds the MCE Browser input case-insensitively", () => {
    expect(findMceInput(status(), "mce presentation")?.number).toBe(4);
  });

  it("reports a missing input", () => {
    const s = status({ inputs: [status().inputs[0]] });
    const setup = describeVmixSetup(s, settings);
    expect(setup.mceInput).toBeNull();
    expect(setup.wrongType).toBe(false);
  });

  it("reports an input with the right name but the wrong type", () => {
    const s = status({
      inputs: [{ key: "c", number: 4, type: "Video", title: "MCE Presentation", state: "Running" }],
    });
    const setup = describeVmixSetup(s, settings);
    expect(setup.mceInput).toBeNull();
    expect(setup.wrongType).toBe(true);
  });

  it("knows when the input is on the chosen overlay, or when another input holds it", () => {
    const on = describeVmixSetup(status({ overlays: [{ number: 1, inputNumber: 4 }] }), settings);
    expect(on.onOutput).toBe(true);
    expect(on.overlayBusyWith).toBeNull();

    const busy = describeVmixSetup(status({ overlays: [{ number: 1, inputNumber: 1 }] }), settings);
    expect(busy.onOutput).toBe(false);
    expect(busy.overlayBusyWith?.title).toBe("Camera 1");
  });
});

describe("VmixClient", () => {
  const ok = () => new Response("", { status: 200 });

  it("shows and hides the input on an overlay channel", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: unknown) => ok());
    const client = new VmixClient(settings, fetchImpl);
    await client.overlayIn(2, 4);
    await client.overlayOut(2);
    expect(fetchImpl.mock.calls[0][0]).toBe("http://127.0.0.1:8088/api/?Function=OverlayInput2In&Input=4");
    expect(fetchImpl.mock.calls[1][0]).toBe("http://127.0.0.1:8088/api/?Function=OverlayInput2Out");
  });

  it("navigates the browser input to the presentation link", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: unknown) => ok());
    await new VmixClient(settings, fetchImpl).navigateBrowser(4, "https://a.test/p?x=1");
    expect(fetchImpl.mock.calls[0][0]).toContain("Function=BrowserNavigate&Input=4&Value=https%3A%2F%2Fa.test%2Fp%3Fx%3D1");
  });

  it("maps a 500 to an http error and a network failure to unreachable", async () => {
    const http = new VmixClient(settings, async () => new Response("bad", { status: 500 }));
    await expect(http.call("Nope")).rejects.toMatchObject({ code: "http" });

    const down = new VmixClient(settings, async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(down.call("Cut")).rejects.toBeInstanceOf(VmixError);
    await expect(down.call("Cut")).rejects.toMatchObject({ code: "unreachable" });
  });
});
