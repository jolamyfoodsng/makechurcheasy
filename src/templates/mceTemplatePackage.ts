import { cloneEditableTemplate, type EditableTemplate, type TemplateLayer } from "./editableTemplateCatalog";
import { ensureGoogleFontsLoaded } from "./googleFonts";

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
  const isKnownKind = layer.kind === "text" || layer.kind === "rect" || layer.kind === "circle" || layer.kind === "image";
  return isKnownKind
    && typeof layer.id === "string"
    && typeof layer.x === "number"
    && typeof layer.y === "number"
    && typeof layer.width === "number"
    && typeof layer.height === "number"
    && (layer.kind !== "image" || typeof layer.src === "string");
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
      && typeof background.accent === "string"
      && (background.imageUrl === undefined || typeof background.imageUrl === "string")
      && (background.previewImageUrl === undefined || typeof background.previewImageUrl === "string")
      && (background.imageOpacity === undefined || typeof background.imageOpacity === "number"))
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

/** Render an MCE template as SVG for the in-app template viewer. */
export function templateToSvgDataUrl(template: EditableTemplate): string {
  const { width, height } = template.canvas;
  const layers = template.layers.map((layer) => {
    if (layer.kind === "rect") {
      return `<rect x="${layer.x}" y="${layer.y}" width="${layer.width}" height="${layer.height}" fill="${escapeSvgText(layer.fill)}" stroke="${escapeSvgText(layer.stroke ?? "none")}" stroke-width="${layer.strokeWidth ?? 0}" opacity="${layer.opacity ?? 1}" rx="${layer.cornerRadius ?? 0}" />`;
    }
    if (layer.kind === "circle") {
      return `<ellipse cx="${layer.x + layer.width / 2}" cy="${layer.y + layer.height / 2}" rx="${layer.width / 2}" ry="${layer.height / 2}" fill="${escapeSvgText(layer.fill)}" stroke="${escapeSvgText(layer.stroke ?? "none")}" stroke-width="${layer.strokeWidth ?? 0}" opacity="${layer.opacity ?? 1}" />`;
    }

    if (layer.kind === "image") {
      const scaleX = layer.scaleX && layer.scaleX > 0 ? layer.scaleX : 1;
      const scaleY = layer.scaleY && layer.scaleY > 0 ? layer.scaleY : 1;
      return `<image href="${escapeSvgText(layer.src)}" x="0" y="0" width="${layer.width}" height="${layer.height}" opacity="${layer.opacity ?? 1}" preserveAspectRatio="none" transform="translate(${layer.x} ${layer.y}) scale(${scaleX} ${scaleY})" />`;
    }

    if (layer.kind !== "text") return "";

    const anchor = layer.align === "center" ? "middle" : layer.align === "right" ? "end" : "start";
    const textX = layer.align === "center" ? layer.width / 2 : layer.align === "right" ? layer.width : 0;
    const lineHeight = (layer.lineHeight ?? 1.2) * layer.fontSize;
    const lines = layer.wrap === "none" ? layer.text.split("\n") : svgTextLines(layer.text, layer.width, layer.fontSize);
    const text = lines.map((line, index) => (
      `<tspan x="${textX}" dy="${index === 0 ? 0 : lineHeight}">${escapeSvgText(line)}</tspan>`
    )).join("");
    const scaleX = layer.preserveScaleX && layer.scaleX && layer.scaleX > 0 ? layer.scaleX : 1;
    const scaleY = layer.scaleY && layer.scaleY > 0 ? layer.scaleY : 1;
    return `<g transform="translate(${layer.x} ${layer.y + layer.fontSize}) scale(${scaleX} ${scaleY})"><text x="${textX}" y="0" fill="${escapeSvgText(layer.fill)}" font-family="${escapeSvgText(layer.fontFamily)}" font-size="${layer.fontSize}" font-style="${layer.fontStyle ?? "normal"}" font-weight="${layer.fontWeight ?? 400}" text-anchor="${anchor}" letter-spacing="${layer.letterSpacing ?? 0}">${text}</text></g>`;
  }).join("");

  const backgroundImage = template.background.imageUrl
    ? `<image href="${escapeSvgText(template.background.imageUrl)}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" opacity="${template.background.imageOpacity ?? 1}" />`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="mce-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${escapeSvgText(template.background.gradientStart)}" /><stop offset="58%" stop-color="${escapeSvgText(template.background.base)}" /><stop offset="100%" stop-color="${escapeSvgText(template.background.gradientEnd)}" /></linearGradient></defs><rect width="100%" height="100%" fill="url(#mce-bg)" />${backgroundImage}${layers}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

async function imageUrlToDataUrl(source: string): Promise<string> {
  if (source.startsWith("data:")) return source;

  const response = await fetch(source);
  if (!response.ok) throw new Error("Could not load the template image.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new Error("Could not prepare the template image."));
    reader.onerror = () => reject(new Error("Could not prepare the template image."));
    reader.readAsDataURL(blob);
  });
}

async function ensureTemplateFonts(template: EditableTemplate): Promise<void> {
  const textLayers = template.layers
    .filter((layer): layer is Extract<TemplateLayer, { kind: "text" }> => layer.kind === "text");
  const fonts = [...new Set(textLayers
    .map((layer) => `${layer.fontStyle ?? "normal"} ${layer.fontWeight ?? 400} ${layer.fontSize}px ${layer.fontFamily}`))];

  await ensureGoogleFontsLoaded(textLayers.map((layer) => layer.fontFamily));
  if (!("fonts" in document)) return;

  const fontSet = document.fonts;

  await Promise.all(fonts.map((font) => fontSet.load(font).catch(() => [])));
  await fontSet.ready;
}

/**
 * Produce the flattened image copy used by the Dock. The editor keeps the
 * original MCE layers locally, but the Dock deliberately receives pixels only
 * so it can preview and send a normal image to OBS without interpreting text
 * or editable layer data.
 */
export async function templateToPngDataUrl(template: EditableTemplate): Promise<string> {
  if (typeof document === "undefined" || typeof Image === "undefined") {
    throw new Error("Template image rendering requires a browser canvas.");
  }

  await ensureTemplateFonts(template);
  const sourceTemplate: EditableTemplate = {
    ...template,
    background: template.background.imageUrl
      ? {
        ...template.background,
        imageUrl: await imageUrlToDataUrl(template.background.imageUrl),
      }
      : template.background,
    layers: await Promise.all(template.layers.map(async (layer) => (
      layer.kind === "image"
        ? { ...layer, src: await imageUrlToDataUrl(layer.src) }
        : layer
    ))),
  };
  const source = templateToSvgDataUrl(sourceTemplate);
  const { width, height } = template.canvas;

  return new Promise<string>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create a template image canvas.");
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Could not render the template image."));
      }
    };
    image.onerror = () => reject(new Error("Could not load the template image for rendering."));
    image.src = source;
  });
}
