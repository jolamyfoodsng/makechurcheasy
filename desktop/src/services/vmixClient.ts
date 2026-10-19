/**
 * vMix control for the Dock.
 *
 * vMix has no WebSocket. It has an HTTP API (GET requests to /api/, the same
 * address as vMix's Web Controller, port 8088 in vMix's own examples) and a
 * TCP API on port 8099. This file uses the HTTP API only, because the Dock is
 * a web page and cannot open a TCP socket.
 *
 * - `GET /api` with no query returns the whole vMix state as XML.
 * - `GET /api/?Function=<Name>&Input=<number|name|guid>&Value=<value>` runs a
 *   vMix shortcut function. 200 means it ran, 500 means vMix rejected it.
 *
 * Docs: https://www.vmix.com/help29/DeveloperAPI.html
 *       https://www.vmix.com/help29/ShortcutFunctionReference.html
 *
 * vMix cannot create a Web Browser input through the API (AddInput does not
 * list Browser), so the user adds one input once and this file only finds it,
 * shows it on an overlay channel, and removes it again.
 */

export const VMIX_DEFAULT_HOST = "127.0.0.1";
export const VMIX_DEFAULT_PORT = 8088;
/** The name the Dock asks the user to give the Web Browser input. */
export const MCE_VMIX_INPUT_NAME = "MCE Presentation";
export const VMIX_OVERLAY_CHANNELS = [1, 2, 3, 4] as const;
export type VmixOverlayChannel = (typeof VMIX_OVERLAY_CHANNELS)[number];

const SETTINGS_KEY = "mce-dock-vmix-settings";
const REQUEST_TIMEOUT_MS = 2500;

export interface VmixSettings {
  host: string;
  port: number;
  /** Which of vMix's four overlay channels shows the MCE page. */
  overlayChannel: VmixOverlayChannel;
  /** Title of the vMix Web Browser input that holds the MCE page. */
  inputName: string;
}

export const DEFAULT_VMIX_SETTINGS: VmixSettings = {
  host: VMIX_DEFAULT_HOST,
  port: VMIX_DEFAULT_PORT,
  overlayChannel: 1,
  inputName: MCE_VMIX_INPUT_NAME,
};

export function normalizeVmixSettings(raw: Partial<VmixSettings> | null | undefined): VmixSettings {
  const host = String(raw?.host ?? "").trim().replace(/^https?:\/\//i, "").replace(/[/:].*$/, "");
  const port = Math.round(Number(raw?.port));
  const channel = Math.round(Number(raw?.overlayChannel));
  const inputName = String(raw?.inputName ?? "").trim();
  return {
    host: host || DEFAULT_VMIX_SETTINGS.host,
    port: Number.isFinite(port) && port >= 1 && port <= 65535 ? port : DEFAULT_VMIX_SETTINGS.port,
    overlayChannel: (VMIX_OVERLAY_CHANNELS as readonly number[]).includes(channel)
      ? (channel as VmixOverlayChannel)
      : DEFAULT_VMIX_SETTINGS.overlayChannel,
    inputName: inputName || DEFAULT_VMIX_SETTINGS.inputName,
  };
}

export function loadVmixSettings(): VmixSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return normalizeVmixSettings(raw ? (JSON.parse(raw) as Partial<VmixSettings>) : null);
  } catch {
    return { ...DEFAULT_VMIX_SETTINGS };
  }
}

export function saveVmixSettings(settings: VmixSettings): VmixSettings {
  const normalized = normalizeVmixSettings(settings);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    // Storage can be unavailable; the settings then last until the Dock reloads.
  }
  return normalized;
}

// ── State XML ───────────────────────────────────────────────────────────────

export interface VmixInput {
  key: string;
  number: number;
  type: string;
  title: string;
  state: string;
}

export interface VmixOverlay {
  number: number;
  /** Number of the input on this overlay channel, or null when it is empty. */
  inputNumber: number | null;
}

export interface VmixStatus {
  version: string;
  edition: string;
  inputs: VmixInput[];
  overlays: VmixOverlay[];
  active: number;
  preview: number;
  recording: boolean;
  streaming: boolean;
}

export type VmixErrorCode = "unreachable" | "timeout" | "http" | "not_vmix";

export class VmixError extends Error {
  readonly code: VmixErrorCode;
  constructor(code: VmixErrorCode, message: string) {
    super(message);
    this.name = "VmixError";
    this.code = code;
  }
}

function elementText(root: Element | Document, selector: string): string {
  return root.querySelector(selector)?.textContent?.trim() ?? "";
}

function toInt(value: string | null | undefined): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Read vMix's state XML. Accepts an overlay's input either as the element text
 * (`<overlay number="1">3</overlay>`) or as an `input` attribute, because the
 * exact form was not available to check against a real vMix.
 */
export function parseVmixStatus(xml: string): VmixStatus {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement;
  if (!root || root.nodeName !== "vmix" || doc.querySelector("parsererror")) {
    throw new VmixError("not_vmix", "The address answered, but not with a vMix status page.");
  }

  const inputs: VmixInput[] = Array.from(root.querySelectorAll(":scope > inputs > input")).map((el) => ({
    key: el.getAttribute("key") ?? "",
    number: toInt(el.getAttribute("number")),
    type: el.getAttribute("type") ?? "",
    title: el.getAttribute("title") ?? el.textContent?.trim() ?? "",
    state: el.getAttribute("state") ?? "",
  }));

  const overlays: VmixOverlay[] = Array.from(root.querySelectorAll(":scope > overlays > overlay")).map((el) => {
    const fromText = toInt(el.textContent);
    const fromAttribute = toInt(el.getAttribute("input"));
    return {
      number: toInt(el.getAttribute("number")),
      inputNumber: fromText || fromAttribute || null,
    };
  });

  return {
    version: elementText(root, ":scope > version"),
    edition: elementText(root, ":scope > edition"),
    inputs,
    overlays,
    active: toInt(elementText(root, ":scope > active")),
    preview: toInt(elementText(root, ":scope > preview")),
    recording: elementText(root, ":scope > recording").toLowerCase() === "true",
    streaming: elementText(root, ":scope > streaming").toLowerCase() === "true",
  };
}

// ── Setup state ─────────────────────────────────────────────────────────────

export interface VmixSetupState {
  /** The Web Browser input the MCE page lives in, if the user has added it. */
  mceInput: VmixInput | null;
  /** An input has the right name but is not a Web Browser input. */
  wrongType: boolean;
  /** The MCE input is on the chosen overlay channel right now. */
  onOutput: boolean;
  /** Another input currently holds the chosen overlay channel. */
  overlayBusyWith: VmixInput | null;
}

export function findMceInput(status: VmixStatus, inputName: string): VmixInput | null {
  const wanted = inputName.trim().toLowerCase();
  return (
    status.inputs.find((input) => input.type === "Browser" && input.title.trim().toLowerCase() === wanted) ?? null
  );
}

export function describeVmixSetup(status: VmixStatus, settings: VmixSettings): VmixSetupState {
  const mceInput = findMceInput(status, settings.inputName);
  const wanted = settings.inputName.trim().toLowerCase();
  const wrongType =
    !mceInput && status.inputs.some((input) => input.title.trim().toLowerCase() === wanted);
  const overlay = status.overlays.find((entry) => entry.number === settings.overlayChannel);
  const heldBy = overlay?.inputNumber ?? null;
  return {
    mceInput,
    wrongType,
    onOutput: Boolean(mceInput && heldBy === mceInput.number),
    overlayBusyWith:
      heldBy !== null && (!mceInput || heldBy !== mceInput.number)
        ? status.inputs.find((input) => input.number === heldBy) ?? null
        : null,
  };
}

// ── Requests ────────────────────────────────────────────────────────────────

export function vmixBaseUrl(settings: Pick<VmixSettings, "host" | "port">): string {
  return `http://${settings.host}:${settings.port}/api`;
}

/** vMix reads %20 as a space in names, so every value is percent-encoded. */
export function buildVmixFunctionUrl(
  settings: Pick<VmixSettings, "host" | "port">,
  fn: string,
  params: Record<string, string | number | undefined> = {},
): string {
  const parts = [`Function=${encodeURIComponent(fn)}`];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return `${vmixBaseUrl(settings)}/?${parts.join("&")}`;
}

type FetchLike = (input: string, init?: { signal?: AbortSignal; cache?: RequestCache }) => Promise<Response>;

export class VmixClient {
  private readonly settings: VmixSettings;
  private readonly fetchImpl: FetchLike;

  constructor(settings: VmixSettings, fetchImpl?: FetchLike) {
    this.settings = normalizeVmixSettings(settings);
    this.fetchImpl = fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async request(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(url, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) {
        throw new VmixError("http", `vMix answered ${response.status}.`);
      }
      return response;
    } catch (error) {
      if (error instanceof VmixError) throw error;
      if (controller.signal.aborted) {
        throw new VmixError("timeout", `vMix did not answer at ${this.settings.host}:${this.settings.port}.`);
      }
      throw new VmixError("unreachable", `Could not reach vMix at ${this.settings.host}:${this.settings.port}.`);
    } finally {
      clearTimeout(timer);
    }
  }

  async getStatus(): Promise<VmixStatus> {
    const response = await this.request(vmixBaseUrl(this.settings));
    return parseVmixStatus(await response.text());
  }

  async call(fn: string, params: Record<string, string | number | undefined> = {}): Promise<void> {
    await this.request(buildVmixFunctionUrl(this.settings, fn, params));
  }

  /** Put an input on an overlay channel with vMix's configured transition. */
  overlayIn(channel: VmixOverlayChannel, input: string | number): Promise<void> {
    return this.call(`OverlayInput${channel}In`, { Input: input });
  }

  overlayOut(channel: VmixOverlayChannel): Promise<void> {
    return this.call(`OverlayInput${channel}Out`);
  }

  /** Change the page a Web Browser input shows. */
  navigateBrowser(input: string | number, url: string): Promise<void> {
    return this.call("BrowserNavigate", { Input: input, Value: url });
  }
}
