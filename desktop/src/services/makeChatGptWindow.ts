import { PhysicalPosition, PhysicalSize, Window as TauriWindow, currentMonitor } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { hasTauriInvoke } from "./tauriSafe";

export const MAKE_CHATGPT_WINDOW_LABEL = "makechurcheasy-pet";
const MAIN_WINDOW_LABEL = "main";

const BUBBLE_SIZE = 60;
const CONTEXT_MENU_WIDTH = 220;
const CONTEXT_MENU_HEIGHT = 126;
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 600;
const WINDOW_MARGIN = 20;

let openingPromise: Promise<WebviewWindow | null> | null = null;
type WindowPlacementTarget = Pick<TauriWindow, "setSize" | "setPosition">;

function getWindowUrl(): string {
  return new URL("/makechatgpt.html", window.location.href).toString();
}

async function placeWindow(windowRef: WindowPlacementTarget, width: number, height: number): Promise<void> {
  const monitor = await currentMonitor();
  if (!monitor) return;

  const scale = monitor.scaleFactor || 1;
  const workArea = monitor.workArea;
  const widthPx = Math.round(width * scale);
  const heightPx = Math.round(height * scale);
  const marginPx = Math.round(WINDOW_MARGIN * scale);

  await windowRef.setSize(new PhysicalSize(widthPx, heightPx));
  await windowRef.setPosition(
    new PhysicalPosition(
      workArea.position.x + workArea.size.width - widthPx - marginPx,
      workArea.position.y + workArea.size.height - heightPx - marginPx,
    ),
  );
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
      const message = typeof event.payload === "string"
        ? event.payload
        : "MakeChurchEasy could not be opened.";
      finish(() => reject(new Error(message)));
    });
  });
}

async function createWindow(): Promise<WebviewWindow | null> {
  if (!hasTauriInvoke()) return null;

  const existing = await WebviewWindow.getByLabel(MAKE_CHATGPT_WINDOW_LABEL);
  if (existing) {
    await existing.show();
    return existing;
  }

  const windowRef = new WebviewWindow(MAKE_CHATGPT_WINDOW_LABEL, {
    title: "MakeChurchEasy",
    url: getWindowUrl(),
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    minWidth: BUBBLE_SIZE,
    minHeight: BUBBLE_SIZE,
    resizable: false,
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    visibleOnAllWorkspaces: true,
    skipTaskbar: true,
    focus: false,
    visible: true,
  });

  await waitForWindowCreation(windowRef);
  await placeWindow(windowRef, BUBBLE_SIZE, BUBBLE_SIZE);
  return windowRef;
}

export async function showMakeChatGptWindow(): Promise<void> {
  if (!hasTauriInvoke()) return;

  openingPromise ??= createWindow().finally(() => {
    openingPromise = null;
  });

  const windowRef = await openingPromise;
  if (!windowRef) return;
  await windowRef.show();
}

export async function openMainMakeChurchEasyWindow(): Promise<void> {
  if (!hasTauriInvoke()) {
    window.focus();
    return;
  }

  const mainWindow = await WebviewWindow.getByLabel(MAIN_WINDOW_LABEL);
  if (!mainWindow) return;
  await mainWindow.show();
  await mainWindow.unminimize().catch(() => {});
  await mainWindow.setFocus().catch(() => {});
}

export async function hideMakeChatGptWindow(): Promise<void> {
  if (!hasTauriInvoke()) return;
  const windowRef = await WebviewWindow.getByLabel(MAKE_CHATGPT_WINDOW_LABEL);
  await windowRef?.hide();
}

/** Resize the native pet window so its HTML context menu is not clipped. */
export async function resizeMakeChatGptContextMenuWindow(expanded: boolean): Promise<void> {
  if (!hasTauriInvoke()) return;
  const windowRef = await WebviewWindow.getByLabel(MAKE_CHATGPT_WINDOW_LABEL);
  if (!windowRef) return;
  await placeWindow(
    windowRef,
    expanded ? CONTEXT_MENU_WIDTH : BUBBLE_SIZE,
    expanded ? CONTEXT_MENU_HEIGHT : BUBBLE_SIZE,
  );
}

export async function toggleMakeChatGptWindow(): Promise<void> {
  if (!hasTauriInvoke()) return;
  const windowRef = await WebviewWindow.getByLabel(MAKE_CHATGPT_WINDOW_LABEL);
  if (!windowRef) {
    await showMakeChatGptWindow();
    return;
  }

  const visible = await windowRef.isVisible();
  if (visible) await windowRef.hide();
  else await showMakeChatGptWindow();
}

export async function resizeMakeChatGptWindow(
  windowRef: TauriWindow,
  expanded: boolean,
): Promise<void> {
  await placeWindow(
    windowRef,
    expanded ? PANEL_WIDTH : BUBBLE_SIZE,
    expanded ? PANEL_HEIGHT : BUBBLE_SIZE,
  );
}
