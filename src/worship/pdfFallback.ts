import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextElement } from "./layoutParser";

let pdfWorkerInitialized = false;
let pdfWorkerUrlPromise: Promise<string> | null = null;

async function ensurePdfWorker(): Promise<void> {
  if (pdfWorkerInitialized) return;
  if (typeof Worker === "undefined") return;
  if (!pdfWorkerUrlPromise) {
    // Vite resolves the worker asset at build time.
    // @ts-expect-error The `?url` suffix is a bundler-only import.
    pdfWorkerUrlPromise = import("pdfjs-dist/legacy/build/pdf.worker.mjs?url").then((mod) => mod.default);
  }
  const pdfWorkerUrl = await pdfWorkerUrlPromise;
  pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: "module" });
  pdfWorkerInitialized = true;
}

function decodeLatin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

function findOriginalStartXref(text: string): number | null {
  const match = text.match(/startxref\s+(\d+)\s*%%EOF\s*$/s);
  return match ? Number(match[1]) : null;
}

function getPlainObjectOffsets(text: string): Array<{ objectNumber: number; offset: number }> {
  const result: Array<{ objectNumber: number; offset: number }> = [];
  const objectRe = /(\d+)\s+0\s+obj/g;
  let match: RegExpExecArray | null;
  while ((match = objectRe.exec(text))) {
    result.push({ objectNumber: Number(match[1]), offset: match.index });
  }
  return result;
}

function isPageObject(body: string): boolean {
  return body.includes("/Type/Page") && body.includes("/Parent 25233 0 R");
}

function buildRepairUpdate(
  sourceBytes: Uint8Array,
  sourceText: string,
): Uint8Array | null {
  const plainObjects = getPlainObjectOffsets(sourceText);
  if (plainObjects.length === 0) return null;

  const pageIds: number[] = [];
  for (const { objectNumber, offset } of plainObjects) {
    const end = sourceText.indexOf("endobj", offset);
    if (end === -1) continue;
    const body = sourceText.slice(offset, end);
    if (isPageObject(body)) {
      pageIds.push(objectNumber);
    }
  }

  if (pageIds.length < 2) return null;

  const startxref = findOriginalStartXref(sourceText);
  if (startxref == null) return null;

  const maxPlainObject = Math.max(...plainObjects.map((entry) => entry.objectNumber));
  const size = Math.max(maxPlainObject, 25236) + 1;
  const pagesObjectNumber = 25233;
  const catalogObjectNumber = 25236;

  const appends: string[] = [];
  appends.push(
    `${pagesObjectNumber} 0 obj\n` +
      `<< /Type /Pages /Count ${pageIds.length} /Kids [ ${pageIds.map((id) => `${id} 0 R`).join(" ")} ] >>\n` +
      `endobj\n`,
  );
  appends.push(
    `${catalogObjectNumber} 0 obj\n` +
      `<< /Type /Catalog /Pages ${pagesObjectNumber} 0 R >>\n` +
      `endobj\n`,
  );

  const appendedObjects = appends.join("");
  const appendedBytes = new TextEncoder().encode(appendedObjects);
  const xrefOffset = sourceBytes.length + appendedBytes.length;
  const pagesOffset = sourceBytes.length;
  const catalogOffset = sourceBytes.length + new TextEncoder().encode(appends[0]).length;

  const xref =
    `xref\n` +
    `${pagesObjectNumber} 1\n` +
    `${pagesOffset.toString().padStart(10, "0")} 00000 n \n` +
    `${catalogObjectNumber} 1\n` +
    `${catalogOffset.toString().padStart(10, "0")} 00000 n \n`;

  const trailer =
    `trailer\n` +
    `<< /Size ${size} /Root ${catalogObjectNumber} 0 R /Prev ${startxref} >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  const repaired = new Uint8Array(
    sourceBytes.length + appendedBytes.length + new TextEncoder().encode(xref + trailer).length,
  );
  repaired.set(sourceBytes, 0);
  repaired.set(appendedBytes, sourceBytes.length);
  repaired.set(new TextEncoder().encode(xref + trailer), sourceBytes.length + appendedBytes.length);
  return repaired;
}

export function repairPdfBytes(sourceBytes: Uint8Array): Uint8Array | null {
  const sourceText = decodeLatin1(sourceBytes);
  return buildRepairUpdate(sourceBytes, sourceText);
}

async function loadPdfDocument(bytes: Uint8Array) {
  await ensurePdfWorker();
  return pdfjsLib
    .getDocument({
      data: bytes,
      useWorkerFetch: false,
      stopAtErrors: false,
    })
    .promise;
}

export async function extractPdfTextWithPdfJs(file: File): Promise<string> {
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const repairedBytes = repairPdfBytes(originalBytes) ?? originalBytes;
  const doc = await loadPdfDocument(repairedBytes);

  const parts: string[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str?.trim();
      if (str) parts.push(str);
    }
  }
  return parts.join("\n");
}

export async function extractPdfTextElementsWithPdfJs(file: File): Promise<TextElement[]> {
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  const repairedBytes = repairPdfBytes(originalBytes) ?? originalBytes;
  const doc = await loadPdfDocument(repairedBytes);

  const elements: TextElement[] = [];

  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();

    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;

      const [a, b, , d, e, f] = item.transform;
      const fontSize = Math.max(Math.abs(d), Math.abs(b), item.height || 0) || 12;
      const width = item.width || Math.abs(a) || 0;
      const height = item.height || fontSize;
      const fontName = "fontName" in item ? String(item.fontName ?? "") : "";

      elements.push({
        text: item.str,
        x: e,
        y: f,
        width,
        height,
        fontSize,
        isBold: /bold|black|heavy/i.test(fontName),
        page: pageNumber,
      });
    }
  }

  return elements;
}
