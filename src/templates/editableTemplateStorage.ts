import {
  cloneEditableTemplate,
  EDITABLE_TEMPLATE_LIBRARY,
  type EditableTemplate,
  type TemplateLayer,
} from "./editableTemplateCatalog";
import { readUserScopedStorage, writeUserScopedStorage } from "../services/userScopedStorage";

export const EDITABLE_TEMPLATE_OVERRIDES_KEY = "mce-editable-template-overrides-v1";
export const EDITABLE_TEMPLATE_STORAGE_EVENT = "mce-editable-templates-changed";

interface StoredTemplateOverride {
  layers: TemplateLayer[];
  updatedAt: string;
}

type StoredTemplateOverrides = Record<string, StoredTemplateOverride>;

function readOverrides(): StoredTemplateOverrides {
  const raw = readUserScopedStorage(EDITABLE_TEMPLATE_OVERRIDES_KEY);
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

function writeOverrides(overrides: StoredTemplateOverrides): void {
  writeUserScopedStorage(EDITABLE_TEMPLATE_OVERRIDES_KEY, JSON.stringify(overrides));
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(EDITABLE_TEMPLATE_STORAGE_EVENT));
  }
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
  const overrides = readOverrides();
  return EDITABLE_TEMPLATE_LIBRARY
    .filter((template) => Boolean(overrides[template.id]))
    .map((template) => applyOverride(template, overrides[template.id]));
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
