import {
  cloneEditableTemplate,
  EDITABLE_TEMPLATE_LIBRARY,
  type EditableTemplate,
  type TemplateBackground,
  type TemplateCategory,
  type TemplateLayer,
} from "./editableTemplateCatalog";
import { templateToPngDataUrl } from "./mceTemplatePackage";
import { readUserScopedStorage, writeUserScopedStorage } from "../services/userScopedStorage";
import { getCurrentUserId } from "../services/db";
import { hasTauriInvoke } from "../services/tauriSafe";

export const EDITABLE_TEMPLATE_OVERRIDES_KEY = "mce-editable-template-overrides-v1";
export const EDITABLE_TEMPLATE_STORAGE_EVENT = "mce-editable-templates-changed";
export const EDITABLE_TEMPLATE_BROADCAST_CHANNEL = "mce-editable-templates";
export const EDITABLE_TEMPLATE_DOCK_DATA_NAME = "dock-template-images";
/** Flattened Fabric design-studio exports that should survive template saves. */
export const DESIGN_STUDIO_DOCK_IMAGES_KEY = "mce-design-studio-dock-images-v1";
const LEGACY_EDITABLE_TEMPLATE_DOCK_DATA_NAME = "dock-editable-templates";
const EDITABLE_TEMPLATE_DOCK_DATA_VERSION = 1;

interface StoredTemplateOverride {
  layers: TemplateLayer[];
  background?: TemplateBackground;
  templateVersion?: number;
  updatedAt: string;
}

type StoredTemplateOverrides = Record<string, StoredTemplateOverride>;

export interface DockTemplateImage {
  id: string;
  name: string;
  category: TemplateCategory;
  accentColor: string;
  imageUrl: string;
  width: number;
  height: number;
  updatedAt: string;
}

type CapturedDockImages = Readonly<Record<string, string>>;

interface EditableTemplateDockImageSnapshot {
  version: typeof EDITABLE_TEMPLATE_DOCK_DATA_VERSION;
  userId: string;
  updatedAt: number;
  templates: DockTemplateImage[];
}

export interface LoadedDockTemplateImages {
  templates: DockTemplateImage[];
  updatedAt: number;
}

export interface EditableTemplateSaveResult {
  dockSynced: boolean;
}

function parseOverrides(raw: string | null): StoredTemplateOverrides {
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const valid: StoredTemplateOverrides = {};
    for (const [templateId, value] of Object.entries(parsed)) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const candidate = value as { layers?: unknown; background?: unknown; templateVersion?: unknown; updatedAt?: unknown };
      if (!Array.isArray(candidate.layers)) continue;
      valid[templateId] = {
        layers: candidate.layers as TemplateLayer[],
        ...(isTemplateBackground(candidate.background) ? { background: candidate.background } : {}),
        ...(typeof candidate.templateVersion === "number" ? { templateVersion: candidate.templateVersion } : {}),
        updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
      };
    }
    return valid;
  } catch {
    return {};
  }
}

function isTemplateBackground(value: unknown): value is TemplateBackground {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const background = value as Record<string, unknown>;
  return typeof background.base === "string"
    && typeof background.gradientStart === "string"
    && typeof background.gradientEnd === "string"
    && typeof background.accent === "string"
    && (background.imageUrl === undefined || typeof background.imageUrl === "string")
    && (background.previewImageUrl === undefined || typeof background.previewImageUrl === "string")
    && (background.imageOpacity === undefined || typeof background.imageOpacity === "number");
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

function isTemplateCategory(value: unknown): value is TemplateCategory {
  return value === "Bible" || value === "Worship" || value === "Announcements" || value === "Service";
}

function parseDockTemplateImages(value: unknown): DockTemplateImage[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  const images: DockTemplateImage[] = [];
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const item = candidate as Record<string, unknown>;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const imageUrl = typeof item.imageUrl === "string" ? item.imageUrl.trim() : "";
    const width = typeof item.width === "number" ? item.width : 0;
    const height = typeof item.height === "number" ? item.height : 0;
    if (!id || seen.has(id) || !name || !isTemplateCategory(item.category)
      || !imageUrl.startsWith("data:image/png;base64,") || width <= 0 || height <= 0) continue;

    seen.add(id);
    images.push({
      id,
      name,
      category: item.category,
      accentColor: typeof item.accentColor === "string" ? item.accentColor : "#64748B",
      imageUrl,
      width,
      height,
      updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : "",
    });
  }
  return images;
}

function isPngDataUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("data:image/png;base64,");
}

function readDesignStudioDockImages(): DockTemplateImage[] {
  return parseDockTemplateImages(
    (() => {
      try {
        return JSON.parse(readUserScopedStorage(DESIGN_STUDIO_DOCK_IMAGES_KEY) ?? "[]") as unknown;
      } catch {
        return [];
      }
    })(),
  );
}

function mergeDockTemplateImages(
  editableTemplateImages: DockTemplateImage[],
  designStudioImages: DockTemplateImage[],
): DockTemplateImage[] {
  const byId = new Map(editableTemplateImages.map((image) => [image.id, image]));
  designStudioImages.forEach((image) => byId.set(image.id, image));
  return [...byId.values()];
}

export function createDockTemplateImageSnapshot(
  templates: DockTemplateImage[],
  userId: string,
  updatedAt = Date.now(),
): EditableTemplateDockImageSnapshot {
  return {
    version: EDITABLE_TEMPLATE_DOCK_DATA_VERSION,
    userId,
    updatedAt,
    templates,
  };
}

async function createDockTemplateImages(
  overrides: StoredTemplateOverrides,
  capturedImages: CapturedDockImages = {},
  existingImages = new Map<string, DockTemplateImage>(),
): Promise<DockTemplateImage[]> {
  return Promise.all(templatesFromOverrides(overrides).map(async (template) => {
    const updatedAt = overrides[template.id]?.updatedAt || new Date().toISOString();
    const capturedImage = isPngDataUrl(capturedImages[template.id]) ? capturedImages[template.id] : undefined;
    const existingImage = existingImages.get(template.id);
    // Keep prior canvas captures for untouched templates. A user save always
    // supplies a fresh captured PNG for the template being edited.
    const preservedImage = existingImage?.updatedAt === updatedAt ? existingImage.imageUrl : undefined;

    return {
      id: template.id,
      name: template.name,
      category: template.category,
      accentColor: template.accentColor,
      imageUrl: capturedImage ?? preservedImage ?? await templateToPngDataUrl(template),
      width: template.canvas.width,
      height: template.canvas.height,
      updatedAt,
    };
  }));
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
 * Mirror only flattened template images to the Dock's shared data file. The
 * main app keeps the editable layers in user-scoped storage; the Dock never
 * receives them.
 */
async function saveDockData(name: string, data: string): Promise<boolean> {
  if (hasTauriInvoke()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_dock_data", { name, data });
      return true;
    } catch {
      // Fall through to the overlay HTTP API during early Tauri startup.
    }
  }

  try {
    const response = await fetch("/api/save-dock-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, data }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function syncEditableTemplatesToDockData(
  overrides: StoredTemplateOverrides,
  capturedImages: CapturedDockImages = {},
): Promise<boolean> {
  const previousSnapshot = await loadSavedTemplateImagesFromDockData();
  const existingImages = new Map(previousSnapshot?.templates.map((template) => [template.id, template]) ?? []);
  const editableTemplateImages = await createDockTemplateImages(overrides, capturedImages, existingImages);
  const templates = mergeDockTemplateImages(editableTemplateImages, readDesignStudioDockImages());
  const snapshot = createDockTemplateImageSnapshot(templates, getTemplateUserId());
  const saved = await saveDockData(EDITABLE_TEMPLATE_DOCK_DATA_NAME, JSON.stringify(snapshot));
  if (!saved) return false;

  // Replace the former raw-layer handoff on the next save, so a previous
  // version cannot be picked up by another Dock window later.
  await saveDockData(LEGACY_EDITABLE_TEMPLATE_DOCK_DATA_NAME, JSON.stringify({
    version: 2,
    retired: true,
    updatedAt: snapshot.updatedAt,
  }));
  return true;
}

async function writeOverrides(
  overrides: StoredTemplateOverrides,
  capturedImages: CapturedDockImages = {},
): Promise<EditableTemplateSaveResult> {
  writeUserScopedStorage(EDITABLE_TEMPLATE_OVERRIDES_KEY, JSON.stringify(overrides));
  if (typeof window === "undefined") return { dockSynced: false };

  try {
    return { dockSynced: await syncEditableTemplatesToDockData(overrides, capturedImages) };
  } catch {
    // The editable local copy remains authoritative if image export or the
    // shared Dock file is unavailable.
    return { dockSynced: false };
  } finally {
    notifyTemplateStorageChanged();
  }
}

function applyOverride(template: EditableTemplate, override?: StoredTemplateOverride): EditableTemplate {
  if (!override) return cloneEditableTemplate(template);

  // A template can intentionally move from a full-image editor background to
  // composed layers. Do not resurrect an image URL from an older local save.
  const background = override.background
    ? template.background.imageUrl
      ? override.background
      : { ...override.background, imageUrl: undefined }
    : template.background;

  return {
    ...cloneEditableTemplate(template),
    layers: override.layers,
    background,
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

/** Load flattened template images shared through the local overlay server or Tauri Dock data. */
export async function loadSavedTemplateImagesFromDockData(): Promise<LoadedDockTemplateImages | null> {
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

    const parsed = JSON.parse(raw) as Partial<EditableTemplateDockImageSnapshot>;
    if (parsed.version !== EDITABLE_TEMPLATE_DOCK_DATA_VERSION
      || !Array.isArray(parsed.templates)) return null;

    const currentUserId = getTemplateUserId();
    const snapshotUserId = typeof parsed.userId === "string" ? parsed.userId.trim() : "";
    if (currentUserId && snapshotUserId && currentUserId !== snapshotUserId) return null;

    const templates = parseDockTemplateImages(parsed.templates);
    const updatedAt = typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt)
      ? parsed.updatedAt
      : 0;
    return {
      templates,
      updatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Save editable data locally and mirror the exact on-screen canvas PNG to the
 * Dock. The fallback renderer remains only for legacy templates that have
 * never been opened in the editor.
 */
export async function saveEditableTemplate(
  template: EditableTemplate,
  dockPngDataUrl?: string,
): Promise<EditableTemplateSaveResult> {
  const overrides = readOverrides();
  overrides[template.id] = {
    layers: template.layers,
    background: template.background,
    updatedAt: new Date().toISOString(),
  };
  return writeOverrides(overrides, isPngDataUrl(dockPngDataUrl) ? { [template.id]: dockPngDataUrl } : {});
}

/**
 * Save a standalone Fabric design as a flattened PNG in the Dock's Templates
 * tab. Its editable canvas JSON remains in Design Studio; the Dock receives
 * only the exact image the operator exported.
 */
export async function saveDesignStudioDockImage(
  image: Omit<DockTemplateImage, "updatedAt"> & { updatedAt?: string },
): Promise<EditableTemplateSaveResult> {
  if (!isPngDataUrl(image.imageUrl)) return { dockSynced: false };

  const savedImage: DockTemplateImage = {
    ...image,
    updatedAt: image.updatedAt ?? new Date().toISOString(),
  };
  const images = readDesignStudioDockImages();
  writeUserScopedStorage(
    DESIGN_STUDIO_DOCK_IMAGES_KEY,
    JSON.stringify([savedImage, ...images.filter((existing) => existing.id !== savedImage.id)]),
  );

  try {
    return { dockSynced: await syncEditableTemplatesToDockData(readOverrides()) };
  } catch {
    return { dockSynced: false };
  } finally {
    notifyTemplateStorageChanged();
  }
}

export async function resetEditableTemplate(templateId: string): Promise<EditableTemplateSaveResult> {
  const overrides = readOverrides();
  if (!Object.prototype.hasOwnProperty.call(overrides, templateId)) return { dockSynced: false };
  delete overrides[templateId];
  return writeOverrides(overrides);
}
