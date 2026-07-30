import { getOverlayBaseUrlSync } from "./overlayUrl";

export interface DockNotesAppendCommand {
  commandId: string;
  timestamp: number;
  text: string;
  title?: string;
  source?: "lm" | "dock";
}

const DOCK_NOTES_APPEND_DATA_NAME = "dock-notes-append-commands";
const MAX_STORED_APPEND_COMMANDS = 50;

function parseJson<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeAppendCommands(raw: unknown): DockNotesAppendCommand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return parseJson<DockNotesAppendCommand>(item);
      if (item && typeof item === "object") return item as DockNotesAppendCommand;
      return null;
    })
    .filter((item): item is DockNotesAppendCommand =>
      Boolean(item?.commandId && typeof item.text === "string" && item.text.trim()),
    );
}

function mergeAppendCommands(commands: DockNotesAppendCommand[]): DockNotesAppendCommand[] {
  const byId = new Map<string, DockNotesAppendCommand>();
  commands.forEach((command) => {
    if (!command.commandId?.trim()) return;
    byId.set(command.commandId, command);
  });
  return Array.from(byId.values())
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .slice(-MAX_STORED_APPEND_COMMANDS);
}

export function createDockNotesAppendCommand(
  text: string,
  title?: string,
  source: DockNotesAppendCommand["source"] = "lm",
): DockNotesAppendCommand {
  return {
    commandId: `dock-notes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    text,
    ...(title ? { title } : {}),
    source,
  };
}

export async function postDockNotesAppendCommand(
  command: DockNotesAppendCommand,
  baseUrl = getOverlayBaseUrlSync(),
): Promise<void> {
  let queuePosted = false;
  let filePosted = false;

  try {
    const response = await fetch(`${baseUrl}/api/dock-notes-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
      keepalive: true,
    });
    queuePosted = response.ok;
  } catch {
    queuePosted = false;
  }

  try {
    const existing = await loadStoredDockNotesAppendCommands(baseUrl);
    const next = mergeAppendCommands([...existing, command]);
    const response = await fetch(`${baseUrl}/api/save-dock-data`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: DOCK_NOTES_APPEND_DATA_NAME,
        data: JSON.stringify(next),
      }),
      keepalive: true,
    });
    filePosted = response.ok;
  } catch {
    filePosted = false;
  }

  if (!queuePosted && !filePosted) {
    throw new Error("Dock notes command failed");
  }
}

export async function loadDockNotesAppendCommands(
  baseUrl = getOverlayBaseUrlSync(),
): Promise<DockNotesAppendCommand[]> {
  const commands: DockNotesAppendCommand[] = [];

  try {
    const response = await fetch(`${baseUrl}/api/dock-notes-command?_=${Date.now()}`, {
      cache: "no-store",
    });
    if (response.ok) {
      commands.push(...normalizeAppendCommands(await response.json()));
    }
  } catch {
    // Fall back to the save-dock-data command file below.
  }

  commands.push(...await loadStoredDockNotesAppendCommands(baseUrl));
  return mergeAppendCommands(commands);
}

async function loadStoredDockNotesAppendCommands(
  baseUrl = getOverlayBaseUrlSync(),
): Promise<DockNotesAppendCommand[]> {
  try {
    const response = await fetch(
      `${baseUrl}/uploads/${DOCK_NOTES_APPEND_DATA_NAME}.json?_=${Date.now()}`,
      { cache: "no-store" },
    );
    if (!response.ok) return [];
    const rawText = await response.text();
    return normalizeAppendCommands(parseJson<unknown>(rawText));
  } catch {
    return [];
  }
}
