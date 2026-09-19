import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import JSZip from "jszip";
import mammoth from "mammoth";

export interface DocumentPageFile {
  file: File;
  sourceName: string;
  documentId: string;
  pageNumber: number;
  pageCount: number;
}

let pdfWorkerInitialized = false;
let pdfWorkerUrlPromise: Promise<string> | null = null;

const MAX_DOCX_CHARS_PER_PAGE = 1500;

export function isSupportedDocumentFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "pdf" || ext === "docx" || ext === "pptx";
}

export function getDocumentTypeLabel(file: File): "PDF" | "DOCX" | "PPTX" | "Document" {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "DOCX";
  if (ext === "pptx") return "PPTX";
  return "Document";
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, "").trim() || "Document";
}

function safeBaseName(name: string): string {
  return baseName(name)
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80) || "document";
}

function createDocumentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `document-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function ensurePdfWorker(): Promise<void> {
  if (pdfWorkerInitialized) return;
  if (typeof Worker === "undefined") return;
  if (!pdfWorkerUrlPromise) {
    pdfWorkerUrlPromise = import("pdfjs-dist/legacy/build/pdf.worker.mjs?url").then((mod) => mod.default);
  }
  const pdfWorkerUrl = await pdfWorkerUrlPromise;
  pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: "module" });
  pdfWorkerInitialized = true;
}

function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Could not render document page."));
        return;
      }
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

async function renderPdfToPageFiles(
  file: File,
  onProgress?: (status: string) => void,
): Promise<DocumentPageFile[]> {
  await ensurePdfWorker();
  const sourceName = file.name;
  const bytes = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const pages: DocumentPageFile[] = [];
  const documentId = createDocumentId();
  const pageCount = pdf.numPages;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    onProgress?.(`Preparing ${baseName(sourceName)} page ${pageNumber} of ${pageCount}…`);
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = 1800;
    const maxHeight = 1000;
    const renderScale = Math.min(maxWidth / baseViewport.width, maxHeight / baseViewport.height, 2.2);
    const viewport = page.getViewport({ scale: renderScale });

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = Math.ceil(viewport.width);
    pageCanvas.height = Math.ceil(viewport.height);
    const pageCtx = pageCanvas.getContext("2d");
    if (!pageCtx) throw new Error("Canvas is not available.");
    pageCtx.fillStyle = "#FFFFFF";
    pageCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    await page.render({ canvas: pageCanvas, canvasContext: pageCtx, viewport } as any).promise;

    const pageFile = await canvasToPngFile(
      pageCanvas,
      `${safeBaseName(sourceName)}_page_${String(pageNumber).padStart(3, "0")}_of_${String(pageCount).padStart(3, "0")}.png`,
    );
    pages.push({ file: pageFile, sourceName, documentId, pageNumber, pageCount });
  }

  return pages;
}

function paginateText(text: string): string[] {
  const cleaned = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!cleaned) return ["No readable text found in this document."];

  const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;
    if (next.length > MAX_DOCX_CHARS_PER_PAGE && current) {
      pages.push(current);
      current = paragraph;
    } else {
      current = next;
    }
  }
  if (current) pages.push(current);
  return pages;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const output: string[] = [];
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) {
      output.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        output.push(line);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) output.push(line);
  }
  return output;
}

async function renderDocxToPageFiles(
  file: File,
  onProgress?: (status: string) => void,
): Promise<DocumentPageFile[]> {
  onProgress?.(`Reading ${baseName(file.name)}…`);
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  const sourceName = file.name;
  const documentId = createDocumentId();
  const textPages = paginateText(result.value);
  const pageCount = textPages.length;
  const pages: DocumentPageFile[] = [];

  for (let index = 0; index < textPages.length; index += 1) {
    const pageNumber = index + 1;
    onProgress?.(`Preparing ${baseName(sourceName)} slide ${pageNumber} of ${pageCount}…`);
    const pageW = 1620;
    const pageH = 860;
    const canvas = document.createElement("canvas");
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");

    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, 0, 0, pageW, pageH, 18);
    ctx.fill();

    ctx.fillStyle = "#0F172A";
    ctx.font = "700 34px Inter, Arial, sans-serif";
    ctx.fillText(baseName(sourceName), 70, 86);

    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(70, 116);
    ctx.lineTo(pageW - 70, 116);
    ctx.stroke();

    ctx.fillStyle = "#334155";
    ctx.font = "400 30px Inter, Arial, sans-serif";
    const lines = wrapText(ctx, textPages[index], pageW - 140);
    let y = 170;
    const lineHeight = 44;
    for (const line of lines) {
      if (y > pageH - 72) break;
      if (!line) {
        y += lineHeight * 0.7;
        continue;
      }
      ctx.fillText(line, 70, y);
      y += lineHeight;
    }

    const pageFile = await canvasToPngFile(
      canvas,
      `${safeBaseName(sourceName)}_slide_${String(pageNumber).padStart(3, "0")}_of_${String(pageCount).padStart(3, "0")}.png`,
    );
    pages.push({ file: pageFile, sourceName, documentId, pageNumber, pageCount });
  }

  return pages;
}

type XmlRoot = Document | Element;

function xmlElements(root: XmlRoot | null | undefined, localName: string): Element[] {
  if (!root) return [];
  const namespaced = root.getElementsByTagNameNS("*", localName);
  if (namespaced.length > 0) return Array.from(namespaced);
  return [
    ...Array.from(root.getElementsByTagName(localName)),
    ...Array.from(root.getElementsByTagName(`a:${localName}`)),
    ...Array.from(root.getElementsByTagName(`p:${localName}`)),
    ...Array.from(root.getElementsByTagName(`r:${localName}`)),
  ];
}

function firstXmlElement(root: XmlRoot | null | undefined, localName: string): Element | null {
  return xmlElements(root, localName)[0] ?? null;
}

function xmlAttribute(element: Element | null | undefined, name: string): string {
  if (!element) return "";
  return element.getAttribute(name)
    || element.getAttribute(`r:${name}`)
    || Array.from(element.attributes).find((attribute) => attribute.localName === name)?.value
    || "";
}

function parsePptxXml(value: string): Document {
  const parsed = new DOMParser().parseFromString(value, "application/xml");
  if (firstXmlElement(parsed, "parsererror")) {
    throw new Error("The PowerPoint file contains invalid slide XML.");
  }
  return parsed;
}

async function readZipText(zip: JSZip, path: string): Promise<string> {
  const entry = zip.file(path);
  if (!entry) throw new Error(`PowerPoint file is missing ${path}.`);
  return entry.async("string");
}

function resolveZipPath(basePath: string, target: string): string {
  const cleanTarget = decodeURIComponent(target).replace(/\\/g, "/");
  const parts = (cleanTarget.startsWith("/")
    ? cleanTarget.slice(1).split("/")
    : [...basePath.split("/").slice(0, -1), ...cleanTarget.split("/")]);
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }
  return normalized.join("/");
}

function relationshipPathFor(zipPath: string): string {
  const segments = zipPath.split("/");
  const fileName = segments.pop() ?? "";
  return `${segments.join("/")}/_rels/${fileName}.rels`;
}

function parsePptxRelationships(xml: string): Map<string, string> {
  const relationships = new Map<string, string>();
  const document = parsePptxXml(xml);
  for (const relationship of xmlElements(document, "Relationship")) {
    const id = xmlAttribute(relationship, "Id");
    const target = xmlAttribute(relationship, "Target");
    if (id && target) relationships.set(id, target);
  }
  return relationships;
}

function readPptxColor(root: XmlRoot | null | undefined, fallback: string): string {
  const srgb = firstXmlElement(root, "srgbClr");
  const srgbValue = xmlAttribute(srgb, "val").trim();
  if (/^[0-9a-f]{6}$/i.test(srgbValue)) return `#${srgbValue}`;

  const system = firstXmlElement(root, "sysClr");
  const systemValue = xmlAttribute(system, "lastClr").trim();
  if (/^[0-9a-f]{6}$/i.test(systemValue)) return `#${systemValue}`;

  const scheme = xmlAttribute(firstXmlElement(root, "schemeClr"), "val").toLowerCase();
  const schemeColors: Record<string, string> = {
    dk1: "#000000",
    lt1: "#FFFFFF",
    dk2: "#1F2937",
    lt2: "#F8FAFC",
    tx1: "#000000",
    bg1: "#FFFFFF",
  };
  return schemeColors[scheme] ?? fallback;
}

function readPptxSolidFill(root: XmlRoot | null | undefined, fallback: string | null): string | null {
  if (!root || firstXmlElement(root, "noFill")) return null;
  const solidFill = firstXmlElement(root, "solidFill");
  return solidFill ? readPptxColor(solidFill, fallback ?? "#FFFFFF") : fallback;
}

interface PptxTransform {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

function readPptxTransform(root: XmlRoot | null | undefined): PptxTransform | null {
  const xfrm = firstXmlElement(root, "xfrm");
  const off = firstXmlElement(xfrm, "off");
  const ext = firstXmlElement(xfrm, "ext");
  if (!off || !ext) return null;
  const width = Number(xmlAttribute(ext, "cx"));
  const height = Number(xmlAttribute(ext, "cy"));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return {
    x: Number(xmlAttribute(off, "x")) || 0,
    y: Number(xmlAttribute(off, "y")) || 0,
    width,
    height,
    rotation: (Number(xmlAttribute(xfrm, "rot")) || 0) / 60000,
  };
}

function readPptxText(root: XmlRoot | null | undefined): string {
  const txBody = firstXmlElement(root, "txBody");
  const paragraphs = txBody ? xmlElements(txBody, "p") : [];
  if (paragraphs.length > 0) {
    return paragraphs
      .map((paragraph) => xmlElements(paragraph, "t").map((text) => text.textContent ?? "").join(""))
      .join("\n")
      .trim();
  }
  return xmlElements(root, "t").map((text) => text.textContent ?? "").join(" ").trim();
}

interface PptxTextStyle {
  fontSizePt: number;
  color: string;
  bold: boolean;
  italic: boolean;
  fontFamily: string;
  align: CanvasTextAlign;
  vertical: "top" | "middle" | "bottom";
}

function readPptxTextStyle(root: XmlRoot | null | undefined): PptxTextStyle {
  const txBody = firstXmlElement(root, "txBody");
  const paragraph = txBody ? firstXmlElement(txBody, "p") : null;
  const paragraphProperties = firstXmlElement(paragraph, "pPr");
  const runProperties = firstXmlElement(paragraph, "rPr")
    || firstXmlElement(paragraph, "defRPr")
    || firstXmlElement(txBody, "defRPr");
  const bodyProperties = firstXmlElement(txBody, "bodyPr");
  const fontSize = Number(xmlAttribute(runProperties, "sz"));
  const alignValue = xmlAttribute(paragraphProperties, "algn").toLowerCase();
  const anchorValue = xmlAttribute(bodyProperties, "anchor").toLowerCase();
  const latin = firstXmlElement(runProperties, "latin");
  const color = readPptxSolidFill(runProperties, "#0F172A") ?? "#0F172A";

  return {
    fontSizePt: Number.isFinite(fontSize) && fontSize > 0 ? fontSize / 100 : 18,
    color,
    bold: xmlAttribute(runProperties, "b") === "1" || xmlAttribute(runProperties, "b").toLowerCase() === "true",
    italic: xmlAttribute(runProperties, "i") === "1" || xmlAttribute(runProperties, "i").toLowerCase() === "true",
    fontFamily: xmlAttribute(latin, "typeface") || "Arial",
    align: alignValue === "ctr" ? "center" : alignValue === "r" ? "right" : "left",
    vertical: anchorValue === "ctr" ? "middle" : anchorValue === "b" ? "bottom" : "top",
  };
}

function drawPptxText(
  context: CanvasRenderingContext2D,
  text: string,
  transform: PptxTransform,
  style: PptxTextStyle,
  toPixels: (value: number) => number,
  scale: number,
): void {
  if (!text) return;
  const x = toPixels(transform.x);
  const y = toPixels(transform.y);
  const width = toPixels(transform.width);
  const height = toPixels(transform.height);
  const padding = Math.max(4, Math.min(width, height) * 0.04);
  const fontSize = Math.max(8, (style.fontSizePt / 72) * 96 * scale);
  const fontWeight = style.bold ? "700" : "400";
  const fontStyle = style.italic ? "italic" : "normal";
  const font = `${fontStyle} ${fontWeight} ${fontSize}px ${style.fontFamily}, Arial, sans-serif`;

  context.save();
  context.translate(x + width / 2, y + height / 2);
  if (transform.rotation) context.rotate((transform.rotation * Math.PI) / 180);
  context.beginPath();
  context.rect(-width / 2, -height / 2, width, height);
  context.clip();
  context.font = font;
  context.fillStyle = style.color;
  context.textBaseline = "top";

  const maxWidth = Math.max(1, width - padding * 2);
  const lines = text.split("\n").flatMap((paragraph) => {
    if (!paragraph.trim()) return [""];
    return wrapText(context, paragraph, maxWidth);
  });
  const lineHeight = fontSize * 1.2;
  const visibleLines = lines.slice(0, Math.max(1, Math.floor((height - padding * 2) / lineHeight)));
  const contentHeight = visibleLines.length * lineHeight;
  let top = -height / 2 + padding;
  if (style.vertical === "middle") top = -contentHeight / 2;
  if (style.vertical === "bottom") top = height / 2 - contentHeight - padding;

  for (const line of visibleLines) {
    const lineWidth = context.measureText(line).width;
    const left = style.align === "center"
      ? -lineWidth / 2
      : style.align === "right"
        ? width / 2 - padding - lineWidth
        : -width / 2 + padding;
    context.fillText(line, left, top);
    top += lineHeight;
  }
  context.restore();
}

function zipImageMimeType(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase();
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "svg" || extension === "svg+xml") return "image/svg+xml";
  if (extension === "bmp") return "image/bmp";
  return "image/png";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read embedded PowerPoint image."));
    reader.readAsDataURL(blob);
  });
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render an embedded PowerPoint image."));
    image.src = dataUrl;
  });
}

async function renderPptxToPageFiles(
  file: File,
  onProgress?: (status: string) => void,
): Promise<DocumentPageFile[]> {
  onProgress?.(`Reading ${baseName(file.name)}…`);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const presentationPath = "ppt/presentation.xml";
  const presentation = parsePptxXml(await readZipText(zip, presentationPath));
  const presentationRelationships = parsePptxRelationships(
    await readZipText(zip, "ppt/_rels/presentation.xml.rels"),
  );
  const slideSize = firstXmlElement(presentation, "sldSz");
  const slideWidth = Number(xmlAttribute(slideSize, "cx")) || 12192000;
  const slideHeight = Number(xmlAttribute(slideSize, "cy")) || 6858000;
  const slideIdList = firstXmlElement(presentation, "sldIdLst");
  const slidePaths = xmlElements(slideIdList, "sldId")
    .map((slideId) => presentationRelationships.get(xmlAttribute(slideId, "id")) ?? "")
    .filter(Boolean)
    .map((target) => resolveZipPath(presentationPath, target));

  if (slidePaths.length === 0) {
    throw new Error("The PowerPoint file does not contain any slides.");
  }

  const sourceName = file.name;
  const documentId = createDocumentId();
  const pages: DocumentPageFile[] = [];
  const imageCache = new Map<string, Promise<HTMLImageElement>>();
  const baseWidth = (slideWidth / 914400) * 96;
  const baseHeight = (slideHeight / 914400) * 96;
  const renderScale = Math.min(1800 / baseWidth, 1000 / baseHeight, 2.2);
  const canvasWidth = Math.max(1, Math.round(baseWidth * renderScale));
  const canvasHeight = Math.max(1, Math.round(baseHeight * renderScale));
  const toPixels = (value: number) => (value / 914400) * 96 * renderScale;

  const loadEmbeddedImage = (slidePath: string, relationships: Map<string, string>, relationshipId: string) => {
    const target = relationships.get(relationshipId);
    if (!target) return Promise.reject(new Error("PowerPoint image relationship is missing."));
    const imagePath = resolveZipPath(slidePath, target);
    const cached = imageCache.get(imagePath);
    if (cached) return cached;
    const promise = (async () => {
      const entry = zip.file(imagePath);
      if (!entry) throw new Error(`PowerPoint image ${imagePath} is missing.`);
      const blob = await entry.async("blob");
      const dataUrl = await blobToDataUrl(new Blob([blob], { type: zipImageMimeType(imagePath) }));
      return loadImage(dataUrl);
    })();
    imageCache.set(imagePath, promise);
    return promise;
  };

  for (let index = 0; index < slidePaths.length; index += 1) {
    const pageNumber = index + 1;
    onProgress?.(`Preparing ${baseName(sourceName)} slide ${pageNumber} of ${slidePaths.length}…`);
    const slidePath = slidePaths[index];
    const slide = parsePptxXml(await readZipText(zip, slidePath));
    const relationshipsPath = relationshipPathFor(slidePath);
    const relationships = zip.file(relationshipsPath)
      ? parsePptxRelationships(await readZipText(zip, relationshipsPath))
      : new Map<string, string>();
    const canvas = document.createElement("canvas");
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas is not available.");

    const background = readPptxSolidFill(firstXmlElement(firstXmlElement(slide, "bg"), "bgPr"), "#FFFFFF") ?? "#FFFFFF";
    context.fillStyle = background;
    context.fillRect(0, 0, canvasWidth, canvasHeight);

    const shapeTree = firstXmlElement(slide, "spTree");
    for (const child of shapeTree ? Array.from(shapeTree.children) : []) {
      const localName = child.localName || child.nodeName.split(":").pop();
      if (localName === "sp") {
        const transform = readPptxTransform(child);
        if (!transform) continue;
        const shapeProperties = firstXmlElement(child, "spPr");
        const fill = readPptxSolidFill(shapeProperties, null);
        const x = toPixels(transform.x);
        const y = toPixels(transform.y);
        const width = toPixels(transform.width);
        const height = toPixels(transform.height);
        context.save();
        context.translate(x + width / 2, y + height / 2);
        if (transform.rotation) context.rotate((transform.rotation * Math.PI) / 180);
        if (fill) {
          context.fillStyle = fill;
          const geometry = firstXmlElement(shapeProperties, "prstGeom");
          if (xmlAttribute(geometry, "prst") === "roundRect") {
            roundRect(context, -width / 2, -height / 2, width, height, Math.min(width, height) * 0.08);
            context.fill();
          } else {
            context.fillRect(-width / 2, -height / 2, width, height);
          }
        }
        const line = firstXmlElement(shapeProperties, "ln");
        const lineColor = readPptxSolidFill(line, null);
        if (lineColor) {
          context.strokeStyle = lineColor;
          context.lineWidth = Math.max(1, toPixels(Number(xmlAttribute(line, "w")) || 12700));
          context.strokeRect(-width / 2, -height / 2, width, height);
        }
        context.restore();
        drawPptxText(context, readPptxText(child), transform, readPptxTextStyle(child), toPixels, renderScale);
      } else if (localName === "pic") {
        const transform = readPptxTransform(child);
        const blip = firstXmlElement(child, "blip");
        const relationshipId = xmlAttribute(blip, "embed");
        if (!transform || !relationshipId) continue;
        try {
          const image = await loadEmbeddedImage(slidePath, relationships, relationshipId);
          const x = toPixels(transform.x);
          const y = toPixels(transform.y);
          const width = toPixels(transform.width);
          const height = toPixels(transform.height);
          const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
          const drawWidth = image.naturalWidth * scale;
          const drawHeight = image.naturalHeight * scale;
          context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
        } catch {
          // Keep the slide usable when an optional embedded image is malformed.
        }
      } else if (localName === "graphicFrame") {
        const transform = readPptxTransform(child);
        if (transform) drawPptxText(context, readPptxText(child), transform, readPptxTextStyle(child), toPixels, renderScale);
      }
    }

    const pageFile = await canvasToPngFile(
      canvas,
      `${safeBaseName(sourceName)}_slide_${String(pageNumber).padStart(3, "0")}_of_${String(slidePaths.length).padStart(3, "0")}.png`,
    );
    pages.push({ file: pageFile, sourceName, documentId, pageNumber, pageCount: slidePaths.length });
  }

  return pages;
}

export async function convertDocumentToPageFiles(
  file: File,
  onProgress?: (status: string) => void,
): Promise<DocumentPageFile[]> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return renderPdfToPageFiles(file, onProgress);
  if (ext === "docx") return renderDocxToPageFiles(file, onProgress);
  if (ext === "pptx") return renderPptxToPageFiles(file, onProgress);
  throw new Error("Unsupported document type.");
}
