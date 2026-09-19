import { readUserScopedStorage, writeUserScopedStorage } from "../services/userScopedStorage";

const DESIGN_STUDIO_DOCUMENT_KEY = "mce-design-studio-document-v1";
const DESIGN_STUDIO_DOCUMENT_VERSION = 1;

export interface DesignStudioDocument {
  version: typeof DESIGN_STUDIO_DOCUMENT_VERSION;
  id: string;
  name: string;
  json: string;
  width: number;
  height: number;
  updatedAt: string;
}

function isDesignStudioDocument(value: unknown): value is DesignStudioDocument {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const document = value as Record<string, unknown>;
  return document.version === DESIGN_STUDIO_DOCUMENT_VERSION
    && typeof document.id === "string"
    && typeof document.name === "string"
    && typeof document.json === "string"
    && typeof document.width === "number"
    && typeof document.height === "number"
    && typeof document.updatedAt === "string";
}

export function loadDesignStudioDocument(): DesignStudioDocument | null {
  const raw = readUserScopedStorage(DESIGN_STUDIO_DOCUMENT_KEY);
  if (!raw) return null;

  try {
    const document = JSON.parse(raw) as unknown;
    return isDesignStudioDocument(document) ? document : null;
  } catch {
    return null;
  }
}

export function saveDesignStudioDocument(document: Omit<DesignStudioDocument, "version" | "updatedAt">): DesignStudioDocument {
  const saved: DesignStudioDocument = {
    ...document,
    version: DESIGN_STUDIO_DOCUMENT_VERSION,
    updatedAt: new Date().toISOString(),
  };
  writeUserScopedStorage(DESIGN_STUDIO_DOCUMENT_KEY, JSON.stringify(saved));
  return saved;
}
