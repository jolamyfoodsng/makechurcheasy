type TauriInternals = {
  invoke?: unknown;
};

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: TauriInternals;
};

export type TauriUnlisten = () => void;

export function hasTauriInvoke(): boolean {
  if (typeof window === "undefined") return false;
  const internals = (window as TauriWindow).__TAURI_INTERNALS__;
  return typeof internals?.invoke === "function";
}

export async function safeTauriInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!hasTauriInvoke()) {
    throw new Error("Desktop audio engine is not available in this browser context.");
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function safeTauriListen<T>(
  event: string,
  handler: (event: { payload: T }) => void,
): Promise<TauriUnlisten> {
  if (!hasTauriInvoke()) {
    throw new Error("Desktop audio events are not available in this browser context.");
  }
  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(event, handler);
}
