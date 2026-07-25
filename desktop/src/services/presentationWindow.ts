import { availableMonitors, currentMonitor, PhysicalPosition, PhysicalSize, type Monitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { openUrl } from "@tauri-apps/plugin-opener";

import { getPresentationRemoteAccessInfo } from "./presentationRemote";

const PRESENTATION_WINDOW_LABEL = "presentation-screen";

export interface PresentationScreenLaunchResult {
  mode: "external-display" | "same-display" | "browser-fallback";
  monitorName: string;
  openedUrl: string;
}

function getMonitorName(monitor: Monitor | null | undefined, fallbackIndex = 1): string {
  return monitor?.name?.trim() || `Display ${fallbackIndex}`;
}

function isSameMonitor(left: Monitor | null | undefined, right: Monitor | null | undefined): boolean {
  if (!left || !right) return false;
  return (
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.size.width === right.size.width &&
    left.size.height === right.size.height
  );
}

function resolveTargetMonitor(monitors: Monitor[], current: Monitor | null): { monitor: Monitor | null; external: boolean } {
  if (monitors.length === 0) {
    return { monitor: current, external: false };
  }

  if (!current) {
    return { monitor: monitors[0] ?? null, external: false };
  }

  const external = monitors.find((monitor) => !isSameMonitor(monitor, current)) ?? null;
  if (external) {
    return { monitor: external, external: true };
  }

  return { monitor: current, external: false };
}

async function waitForWindowCreation(windowRef: WebviewWindow): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    void windowRef.once("tauri://created", () => finish(resolve));
    void windowRef.once("tauri://error", (event) => {
      const payload = typeof event.payload === "string"
        ? event.payload
        : "Presentation window could not be created.";
      finish(() => reject(new Error(payload)));
    });
  });
}

async function openInBrowser(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

async function destroyExistingPresentationWindow(): Promise<void> {
  const existing = await WebviewWindow.getByLabel(PRESENTATION_WINDOW_LABEL);
  if (!existing) return;

  try {
    await existing.destroy();
  } catch {
    await existing.close().catch(() => {});
  }
}

export async function launchPresentationScreen(
  sessionId: string,
  browserLink: string,
): Promise<PresentationScreenLaunchResult> {
  const remoteInfo = await getPresentationRemoteAccessInfo(sessionId).catch(() => null);
  const localLink = remoteInfo?.localLink?.trim() || browserLink;
  const fallbackLink = browserLink || localLink;

  try {
    const [monitors, current] = await Promise.all([
      availableMonitors(),
      currentMonitor(),
    ]);
    const { monitor, external } = resolveTargetMonitor(monitors, current);

    if (!monitor) {
      await openInBrowser(fallbackLink);
      return {
        mode: "browser-fallback",
        monitorName: "Browser",
        openedUrl: fallbackLink,
      };
    }

    await destroyExistingPresentationWindow();

    const win = new WebviewWindow(PRESENTATION_WINDOW_LABEL, {
      title: "Presentation Screen",
      url: localLink,
      visible: false,
      decorations: false,
      resizable: true,
      focus: true,
      alwaysOnTop: true,
      skipTaskbar: false,
      x: 0,
      y: 0,
      width: Math.max(1280, Math.round(monitor.size.width / Math.max(monitor.scaleFactor, 1))),
      height: Math.max(720, Math.round(monitor.size.height / Math.max(monitor.scaleFactor, 1))),
    });

    await waitForWindowCreation(win);
    await win.setPosition(new PhysicalPosition(monitor.position.x, monitor.position.y));
    await win.setSize(new PhysicalSize(monitor.size.width, monitor.size.height));
    await win.show();
    await win.setFullscreen(true);
    await win.setFocus();

    return {
      mode: external ? "external-display" : "same-display",
      monitorName: getMonitorName(monitor, monitors.findIndex((item) => isSameMonitor(item, monitor)) + 1),
      openedUrl: localLink,
    };
  } catch (error) {
    console.warn("[PresentationWindow] Falling back to browser launch:", error);
    await openInBrowser(fallbackLink);
    return {
      mode: "browser-fallback",
      monitorName: "Browser",
      openedUrl: fallbackLink,
    };
  }
}
