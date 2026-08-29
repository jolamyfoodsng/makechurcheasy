import {
  cloneEditableTemplate,
  EDITABLE_TEMPLATE_LIBRARY,
  type EditableTemplate,
  type TemplateLayer,
} from "./editableTemplateCatalog";
import { readUserScopedStorage, writeUserScopedStorage } from "../services/userScopedStorage";
import { getCurrentUserId } from "../services/db";
import { hasTauriInvoke } from "../services/tauriSafe";

export const EDITABLE_TEMPLATE_OVERRIDES_KEY = "mce-editable-template-overrides-v1";
export const EDITABLE_TEMPLATE_STORAGE_EVENT = "mce-editable-templates-changed";
export const EDITABLE_TEMPLATE_BROADCAST_CHANNEL = "mce-editable-templates";
export const EDITABLE_TEMPLATE_DOCK_DATA_NAME = "dock-editable-templates";
const EDITABLE_TEMPLATE_DOCK_DATA_VERSION = 1;

interface StoredTemplateOverride {
  layers: TemplateLayer[];
  updatedAt: string;
}

type StoredTemplateOverrides = Record<string, StoredTemplateOverride>;

interface EditableTemplateDockSnapshot {
  version: typeof EDITABLE_TEMPLATE_DOCK_DATA_VERSION;
  userId: string;
  updatedAt: number;
  overrides: StoredTemplateOverrides;
}

export interface LoadedEditableTemplateDockData {
  templates: EditableTemplate[];
  updatedAt: number;
}

function parseOverrides(raw: string | null): StoredTemplateOverrides {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const valid: StoredTemplateOverrides = {};
    for (const [templateId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const candidate = value as { layers?: unknown; updatedAt?: unknown };
      if (!Array.isArray(candidate.layers)) continue;
      valid[templateId] = {
        layers: candidate.layers as TemplateLayer[],
        updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
      };
    }
    return valid;
  } catch {
    return {};
  }
}

function readOverrides(): StoredTemplateOverrides {
  return parseOverrides(readUserScopedStorage(EDITABLE_TEMPLATE_OVERRIDES_KEY));
}

function getTemplateUserId(): string {
  try {
    return getCurrentUserId() ?? "";
  } catch {
    return "";
  }
}

function getOverrideUpdatedAt(value: StoredTemplateOverride | undefined): number {
  if (!value?.updatedAt) return 0;
  const timestamp = Date.parse(value.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getOverridesUpdatedAt(overrides: StoredTemplateOverrides): number {
  return Object.values(overrides).reduce(
    (latest, override) => Math.max(latest, getOverrideUpdatedAt(override)),
    0,
  );
}

function templatesFromOverrides(overrides: StoredTemplateOverrides): EditableTemplate[] {
  return EDITABLE_TEMPLATE_LIBRARY
    .filter((template) => Boolean(overrides[template.id]))
    .map((template) => applyOverride(template, overrides[template.id]));
}

function notifyTemplateStorageChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EDITABLE_TEMPLATE_STORAGE_EVENT));
  try {
    const channel = new BroadcastChannel(EDITABLE_TEMPLATE_BROADCAST_CHANNEL);
    channel.postMessage({ type: EDITABLE_TEMPLATE_STORAGE_EVENT });
    channel.close();
  } catch {
    // localStorage and the focus refresh remain the fallback for embedded windows.
  }
}

/**
 * Mirror the saved templates to the overlay server's shared Dock data file.
 * The main app and OBS Dock do not always share a browser storage origin, so
 * localStorage alone cannot reliably move a saved template between them.
 */
async function syncEditableTemplatesToDockData(overrides: StoredTemplateOverrides): Promise<void> {
  const snapshot: EditableTemplateDockSnapshot = {
    version: EDITABLE_TEMPLATE_DOCK_DATA_VERSION,
    userId: getTemplateUserId(),
    updatedAt: Date.now(),
    overrides,
  };
  const data = JSON.stringify(snapshot);

  if (hasTauriInvoke()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_dock_data", {
        name: EDITABLE_TEMPLATE_DOCK_DATA_NAME,
        data,
      });
      return;
    } catch {
      // Fall through to the overlay HTTP API during early Tauri startup.
    }
  }

  try {
    await fetch("/api/save-dock-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: EDITABLE_TEMPLATE_DOCK_DATA_NAME, data }),
    });
  } catch {
    // The local user-scoped storage remains authoritative if the server is unavailable.
  }
}

function writeOverrides(overrides: StoredTemplateOverrides): void {
  writeUserScopedStorage(EDITABLE_TEMPLATE_OVERRIDES_KEY, JSON.stringify(overrides));
  if (typeof window === "undefined") return;

  // Notify after the shared file write so a Dock refresh cannot read the
  // previous snapshot during the save race.
  void syncEditableTemplatesToDockData(overrides)
    .catch(() => undefined)
    .finally(notifyTemplateStorageChanged);
}

function applyOverride(template: EditableTemplate, override?: StoredTemplateOverride): EditableTemplate {
  if (!override) return cloneEditableTemplate(template);
  return {
    ...cloneEditableTemplate(template),
    layers: override.layers,
  };
}

export function loadEditableTemplates(): EditableTemplate[] {
  const overrides = readOverrides();
  return EDITABLE_TEMPLATE_LIBRARY.map((template) => applyOverride(template, overrides[template.id]));
}

/** Templates that the operator has explicitly saved on this device. */
export function loadSavedEditableTemplates(): EditableTemplate[] {
  return templatesFromOverrides(readOverrides());
}

/** Timestamp used to prevent an older Dock snapshot from replacing a newer save. */
export function getSavedEditableTemplatesUpdatedAt(): number {
  return getOverridesUpdatedAt(readOverrides());
}

/** Load the copy shared through the local overlay server or Tauri Dock data. */
export async function loadSavedEditableTemplatesFromDockData(): Promise<LoadedEditableTemplateDockData | null> {
  let raw = "";
  try {
    if (hasTauriInvoke()) {
      const { invoke } = await import("@tauri-apps/api/core");
      raw = await invoke<string>("load_dock_data", { name: EDITABLE_TEMPLATE_DOCK_DATA_NAME });
    } else {
      const response = await fetch(`/uploads/${EDITABLE_TEMPLATE_DOCK_DATA_NAME}.json?_=${Date.now()}`, {
        cache: "no-store",
      });
      if (!response.ok) return null;
      raw = await response.text();
    }

    const parsed = JSON.parse(raw) as Partial<EditableTemplateDockSnapshot>;
    if (parsed.version !== EDITABLE_TEMPLATE_DOCK_DATA_VERSION
      || !parsed.overrides
      || typeof parsed.overrides !== "object"
      || Array.isArray(parsed.overrides)) return null;

    const currentUserId = getTemplateUserId();
    const snapshotUserId = typeof parsed.userId === "string" ? parsed.userId.trim() : "";
    if (currentUserId && snapshotUserId && currentUserId !== snapshotUserId) return null;

    const overrides = parseOverrides(JSON.stringify(parsed.overrides));
    const updatedAt = typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
      ? parsed.updatedAt
      : getOverridesUpdatedAt(overrides);
    return {
      templates: templatesFromOverrides(overrides),
      updatedAt: Math.max(updatedAt, getOverridesUpdatedAt(overrides)),
    };
  } catch {
    return null;
  }
}

export function saveEditableTemplate(template: EditableTemplate): void {
  const overrides = readOverrides();
  overrides[template.id] = {
    layers: template.layers,
    updatedAt: new Date().toISOString(),
  };
  writeOverrides(overrides);
}

export function resetEditableTemplate(templateId: string): void {
  const overrides = readOverrides();
  if (!Object.prototype.hasOwnProperty.call(overrides, templateId)) return;
  delete overrides[templateId];
  writeOverrides(overrides);
}
