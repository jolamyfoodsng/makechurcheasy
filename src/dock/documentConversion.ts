import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import mammoth from "mammoth";

export interface DocumentPageFile {
  file: File;
  sourceName: string;
  pageNumber: number;
  pageCount: number;
}

let pdfWorkerInitialized = false;
let pdfWorkerUrlPromise: Promise<string> | null = null;

const DOCUMENT_CANVAS_WIDTH = 1920;
const DOCUMENT_CANVAS_HEIGHT = 1080;
const DOCUMENT_MARGIN = 72;
const MAX_DOCX_CHARS_PER_PAGE = 1500;

export function isSupportedDocumentFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return ext === "pdf" || ext === "docx";
}

export function getDocumentTypeLabel(file: File): "PDF" | "DOCX" | "Document" {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "PDF";
  if (ext === "docx") return "DOCX";
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

function createOutputCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas");
  canvas.width = DOCUMENT_CANVAS_WIDTH;
  canvas.height = DOCUMENT_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");

  ctx.fillStyle = "#0F172A";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function drawPageLabel(
  ctx: CanvasRenderingContext2D,
  sourceName: string,
  pageNumber: number,
  pageCount: number,
): void {
  ctx.save();
  ctx.fillStyle = "rgba(15, 23, 42, 0.74)";
  roundRect(ctx, 44, 36, 280, 52, 18);
  ctx.fill();
  ctx.fillStyle = "#F8FAFC";
  ctx.font = "600 24px Inter, Arial, sans-serif";
  ctx.fillText(`Page ${pageNumber} / ${pageCount}`, 66, 70);

  ctx.fillStyle = "rgba(248, 250, 252, 0.78)";
  ctx.font = "500 20px Inter, Arial, sans-serif";
  const title = sourceName.length > 74 ? `${sourceName.slice(0, 71)}…` : sourceName;
  ctx.fillText(title, 360, 70);
  ctx.restore();
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
  const pageCount = pdf.numPages;

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    onProgress?.(`Preparing ${baseName(sourceName)} page ${pageNumber} of ${pageCount}…`);
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const maxWidth = DOCUMENT_CANVAS_WIDTH - DOCUMENT_MARGIN * 2;
    const maxHeight = DOCUMENT_CANVAS_HEIGHT - DOCUMENT_MARGIN * 2;
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

    const { canvas, ctx } = createOutputCanvas();
    const x = Math.round((DOCUMENT_CANVAS_WIDTH - pageCanvas.width) / 2);
    const y = Math.round((DOCUMENT_CANVAS_HEIGHT - pageCanvas.height) / 2);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(x, y, pageCanvas.width, pageCanvas.height);
    ctx.restore();
    ctx.drawImage(pageCanvas, x, y);
    drawPageLabel(ctx, sourceName, pageNumber, pageCount);

    const pageFile = await canvasToPngFile(
      canvas,
      `${safeBaseName(sourceName)}_page_${String(pageNumber).padStart(3, "0")}_of_${String(pageCount).padStart(3, "0")}.png`,
    );
    pages.push({ file: pageFile, sourceName, pageNumber, pageCount });
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
  const textPages = paginateText(result.value);
  const pageCount = textPages.length;
  const pages: DocumentPageFile[] = [];

  for (let index = 0; index < textPages.length; index += 1) {
    const pageNumber = index + 1;
    onProgress?.(`Preparing ${baseName(sourceName)} slide ${pageNumber} of ${pageCount}…`);
    const { canvas, ctx } = createOutputCanvas();
    const pageX = 150;
    const pageY = 120;
    const pageW = DOCUMENT_CANVAS_WIDTH - 300;
    const pageH = DOCUMENT_CANVAS_HEIGHT - 220;

    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.38)";
    ctx.shadowBlur = 26;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, pageX, pageY, pageW, pageH, 18);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "#0F172A";
    ctx.font = "700 34px Inter, Arial, sans-serif";
    ctx.fillText(baseName(sourceName), pageX + 70, pageY + 86);

    ctx.strokeStyle = "#CBD5E1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pageX + 70, pageY + 116);
    ctx.lineTo(pageX + pageW - 70, pageY + 116);
    ctx.stroke();

    ctx.fillStyle = "#334155";
    ctx.font = "400 30px Inter, Arial, sans-serif";
    const lines = wrapText(ctx, textPages[index], pageW - 140);
    let y = pageY + 170;
    const lineHeight = 44;
    for (const line of lines) {
      if (y > pageY + pageH - 72) break;
      if (!line) {
        y += lineHeight * 0.7;
        continue;
      }
      ctx.fillText(line, pageX + 70, y);
      y += lineHeight;
    }

    drawPageLabel(ctx, sourceName, pageNumber, pageCount);
    const pageFile = await canvasToPngFile(
      canvas,
      `${safeBaseName(sourceName)}_slide_${String(pageNumber).padStart(3, "0")}_of_${String(pageCount).padStart(3, "0")}.png`,
    );
    pages.push({ file: pageFile, sourceName, pageNumber, pageCount });
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
  throw new Error("Unsupported document type.");
}
