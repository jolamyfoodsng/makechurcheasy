import { cloneEditableTemplate, type EditableTemplate, type TemplateLayer } from "./editableTemplateCatalog";

/**
 * The `.mce` format is intentionally not an image format. It is an
 * MCE-native package containing structured, editable layers that only the
 * MakeChurchEasy template interpreter knows how to open.
 */
export const MCE_TEMPLATE_PACKAGE_MAGIC = "MCE-TEMPLATE-PACKAGE";
export const MCE_TEMPLATE_PACKAGE_VERSION = 1;
export const MCE_TEMPLATE_MIME = "application/x-makechurcheasy-template";

interface MceTemplatePackagePayload {
  magic: typeof MCE_TEMPLATE_PACKAGE_MAGIC;
  version: typeof MCE_TEMPLATE_PACKAGE_VERSION;
  app: "MakeChurchEasy";
  kind: "editable-template";
  savedAt: string;
  template: EditableTemplate;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodePackage(payload: MceTemplatePackagePayload): string {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  return `${MCE_TEMPLATE_PACKAGE_MAGIC}\n${MCE_TEMPLATE_PACKAGE_VERSION}\n${bytesToBase64(body)}\n`;
}

function isTemplateLayer(value: unknown): value is TemplateLayer {
  if (!value || typeof value !== "object") return false;
  const layer = value as Record<string, unknown>;
  return (layer.kind === "text" || layer.kind === "rect" || layer.kind === "circle")
    && typeof layer.id === "string"
    && typeof layer.x === "number"
    && typeof layer.y === "number"
    && typeof layer.width === "number"
    && typeof layer.height === "number";
}

function isEditableTemplate(value: unknown): value is EditableTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Record<string, unknown>;
  const canvas = template.canvas as Record<string, unknown> | undefined;
  const background = template.background as Record<string, unknown> | undefined;
  return typeof template.id === "string"
    && typeof template.name === "string"
    && typeof template.description === "string"
    && Array.isArray(template.tags)
    && template.tags.every((tag) => typeof tag === "string")
    && typeof template.accentColor === "string"
    && Boolean(canvas && typeof canvas.width === "number" && typeof canvas.height === "number")
    && Boolean(background
      && typeof background.base === "string"
      && typeof background.gradientStart === "string"
      && typeof background.gradientEnd === "string"
      && typeof background.accent === "string")
    && Array.isArray(template.layers)
    && template.layers.every(isTemplateLayer);
}

/** Serialize an editable template into the MCE-native `.mce` package. */
export function createMceTemplateBlob(template: EditableTemplate): Blob {
  const payload: MceTemplatePackagePayload = {
    magic: MCE_TEMPLATE_PACKAGE_MAGIC,
    version: MCE_TEMPLATE_PACKAGE_VERSION,
    app: "MakeChurchEasy",
    kind: "editable-template",
    savedAt: new Date().toISOString(),
    template: cloneEditableTemplate(template),
  };
  return new Blob([encodePackage(payload)], { type: MCE_TEMPLATE_MIME });
}

/** Decode a `.mce` package using the in-app template interpreter. */
export async function parseMceTemplatePackage(source: Blob | string): Promise<EditableTemplate> {
  const raw = typeof source === "string" ? source : await source.text();
  const lines = raw.split("\n");
  if (lines[0] !== MCE_TEMPLATE_PACKAGE_MAGIC || lines[1] !== String(MCE_TEMPLATE_PACKAGE_VERSION)) {
    throw new Error("This is not a valid MakeChurchEasy template package.");
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64ToBytes(lines[2] || ""))) as Partial<MceTemplatePackagePayload>;
    if (payload.magic !== MCE_TEMPLATE_PACKAGE_MAGIC
      || payload.version !== MCE_TEMPLATE_PACKAGE_VERSION
      || payload.app !== "MakeChurchEasy"
      || payload.kind !== "editable-template"
      || !isEditableTemplate(payload.template)) {
      throw new Error("The template package is invalid or unsupported.");
    }
    return cloneEditableTemplate(payload.template);
  } catch (error) {
    if (error instanceof Error && error.message.includes("template package")) throw error;
    throw new Error("The template package is invalid or unreadable.");
  }
}

function safeTemplateFileName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9 _-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 72);
  return normalized || "mce-template";
}

export function downloadMceTemplate(template: EditableTemplate): void {
  const url = URL.createObjectURL(createMceTemplateBlob(template));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeTemplateFileName(template.name)}.mce`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function svgTextLines(text: string, width: number, fontSize: number): string[] {
  const maxCharacters = Math.max(12, Math.floor(width / Math.max(1, fontSize * 0.56)));
  return text.split("\n").flatMap((line) => {
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (current && next.length > maxCharacters) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
    return lines;
  });
}

/** Render an MCE template for the presentation-link viewer without creating a PNG file. */
export function templateToSvgDataUrl(template: EditableTemplate): string {
  const { width, height } = template.canvas;
  const layers = template.layers.map((layer) => {
    if (layer.kind === "rect") {
      return `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" fill="${escapeSvgText(layer.fill)}" opacity="${layer.opacity ?? 1}" rx="${layer.cornerRadius ?? 0}" />`;
    }
    if (layer.kind === "circle") {
      return `<ellipse cx="${layer.x + layer.width / 2}" cy="${layer.y + layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="${escapeSvgText(layer.fill)}" opacity="${layer.opacity ?? 1}" />`;
    }

    if (layer.kind !== "text") return "";

    const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
    const textX = layer.align === "center" ? layer.x + layer.width / 2 : layer.align === "right" ? layer.x + layer.width : layer.x;
    const lineHeight = (layer.lineHeight ?? 1.2) * layer.fontSize;
    const lines = svgTextLines(layer.text, layer.width, layer.fontSize);
    const text = lines.map((line, index) => (
      `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${escapeSvgText(line)}</tspan>`
    )).join("");
    return `<text x="${textX}" y="${layer.y + layer.fontSize}" fill="${escapeSvgText(layer.fill)}" font-family="${escapeSvgText(layer.fontFamily)}" font-size="${layer.fontSize}" font-style="${layer.fontStyle ?? "normal"}" font-weight="${layer.fontWeight ?? 400}" text-anchor="${anchor}" letter-spacing="${layer.letterSpacing ?? 0}">${text}</text>`;
  }).join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="mce-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${escapeSvgText(template.background.gradientStart)}" /><stop offset="58%" stop-color="${escapeSvgText(template.background.base)}" /><stop offset="100%" stop-color="${escapeSvgText(template.background.gradientEnd)}" /></linearGradient></defs><rect width="100%" height="100%" fill="url(#mce-bg)" />${layers}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
