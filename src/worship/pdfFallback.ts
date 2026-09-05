import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

let pdfWorkerInitialized = false;
let pdfWorkerUrlPromise: Promise<string> | null = null;

async function ensurePdfWorker(): Promise<void> {
  if (pdfWorkerInitialized) return;
  if (typeof Worker === "undefined") return;
  if (!pdfWorkerUrlPromise) {
    // Vite resolves the worker asset at build time.
    pdfWorkerUrlPromise = import("pdfjs-dist/legacy/build/pdf.worker.mjs?url").then((mod) => mod.default);
  }
  const pdfWorkerUrl = await pdfWorkerUrlPromise;
  pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(pdfWorkerUrl, { type: "module" });
  pdfWorkerInitialized = true;
}

function decodeLatin1(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

/**
 * Strip a single stray leading byte if the PDF header starts at offset 1.
 * Some export tools prepend a byte (e.g. 0x54 'T') before the %PDF marker.
 */
function stripLeadingByte(bytes: Uint8Array): Uint8Array {
  if (
    bytes[0] !== 0x25 &&
    bytes.length > 5 &&
    bytes[1] === 0x25 && bytes[2] === 0x50 && bytes[3] === 0x44 && bytes[4] === 0x46
  ) {
    return bytes.slice(1);
  }
  return bytes;
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
  const bytes = stripLeadingByte(sourceBytes);
  const sourceText = decodeLatin1(bytes);
  const repaired = buildRepairUpdate(bytes, sourceText);
  return repaired;
}

async function loadPdfDocument(bytes: Uint8Array) {
  await ensurePdfWorker();
  const task = pdfjsLib.getDocument({ data: bytes, useWorkerFetch: false, stopAtErrors: false });
  try {
    return { doc: await task.promise, dispose: () => task.destroy() };
  } catch (error) {
    await task.destroy();
    throw error;
  }
}

interface PdfTextRun {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

/** Reconstruct rows and a stable gutter before the hymn parser reads columns. */
export function layoutPdfPage(items: PdfTextRun[], pageWidth: number, pageHeight: number, parallelColumns = false): string {
  const runs = items.filter((item) => item.str.trim() && !(
    /^\d+$/.test(item.str.trim()) && item.transform[5] < pageHeight * 0.055
  )).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
  const rows: PdfTextRun[][] = [];
  for (const run of runs) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].transform[5] - run.transform[5]) <= Math.max(2, run.height * 0.2)) row.push(run);
    else rows.push([run]);
  }
  const gutters: number[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.transform[4] - b.transform[4]);
    for (let i = 1; i < row.length; i++) {
      const leftEnd = row[i - 1].transform[4] + row[i - 1].width;
      const rightStart = row[i].transform[4];
      if (rightStart - leftEnd > pageWidth * 0.025 && leftEnd < pageWidth * 0.6 && rightStart > pageWidth * 0.43 && rightStart < pageWidth * 0.7) {
        gutters.push((leftEnd + rightStart) / 2);
      }
    }
  }
  gutters.sort((a, b) => a - b);
  let gutter = gutters.length >= 4 ? gutters[Math.floor(gutters.length / 2)] : null;
  if (gutter === null) {
    const rightStarts = runs.filter((run) => run.transform[4] > pageWidth * 0.48 && run.transform[4] < pageWidth * 0.6);
    const leftStarts = runs.filter((run) => run.transform[4] < pageWidth * 0.2);
    if (rightStarts.length >= 6 && leftStarts.length >= 6) gutter = pageWidth * 0.48;
  }
  const joinRuns = (group: PdfTextRun[]) => {
    let text = "";
    let end = 0;
    for (const run of group) {
      if (text && run.transform[4] - end > Math.max(1, run.height * 0.12) && !/\s$/.test(text)) text += " ";
      text += run.str;
      end = run.transform[4] + run.width;
    }
    return text.trim();
  };
  if (gutter !== null) {
    const rightRows = rows.map((row) => joinRuns(row.filter((run) => run.transform[4] >= gutter!))).filter(Boolean);
    // A contents/index page has a title and its number on the same row.
    if (rightRows.length && rightRows.filter((line) => /^\d{1,4}$/.test(line)).length / rightRows.length > 0.6) gutter = null;
  }
  if (gutter !== null && !parallelColumns) {
    const renderColumn = (right: boolean) => {
      const groups = rows.map((row) => row.filter((run) => (run.transform[4] >= gutter!) === right)).filter((row) => row.length);
      const lines: string[] = [];
      for (let i = 0; i < groups.length; i++) {
        const row = groups[i];
        if (i > 0 && groups[i - 1][0].transform[5] - row[0].transform[5] > Math.max(10, row[0].height) * 1.7) lines.push("");
        lines.push(joinRuns(row));
      }
      return lines.join("\n");
    };
    return renderColumn(false) + "\n\n" + renderColumn(true);
  }
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (i > 0 && rows[i - 1][0].transform[5] - row[0].transform[5] > Math.max(10, row[0].height) * 1.7) lines.push("");
    if (gutter === null) lines.push(joinRuns(row));
    else {
      const left = joinRuns(row.filter((run) => run.transform[4] < gutter));
      const right = joinRuns(row.filter((run) => run.transform[4] >= gutter));
      lines.push(right ? left.padEnd(160, " ") + right : left);
    }
  }
  return lines.join("\n");
}

export async function extractPdfTextWithPdfJs(file: File): Promise<string> {
  const originalBytes = new Uint8Array(await file.arrayBuffer());
  let loaded;
  try {
    loaded = await loadPdfDocument(stripLeadingByte(originalBytes).slice());
  } catch (error) {
    const repairedBytes = repairPdfBytes(originalBytes);
    if (!repairedBytes) throw error;
    loaded = await loadPdfDocument(repairedBytes);
  }
  const { doc } = loaded;
  const pages: string[] = [];
  let parallelColumns = false;
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const pageText = content.items.filter((item) => "str" in item).map((item) => item.str).join("\n");
      if (/Orin\s+\d+/i.test(pageText) && /Hymn\s+\d+/i.test(pageText)) parallelColumns = true;
      pages.push(layoutPdfPage(content.items.filter((item): item is PdfTextRun & typeof item => "str" in item), viewport.width, viewport.height, parallelColumns));
      page.cleanup();
    }
    return pages.join("\f");
  } finally {
    await loaded.dispose();
  }
}
