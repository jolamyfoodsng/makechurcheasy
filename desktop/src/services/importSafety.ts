/**
 * importSafety.ts — checks a file before it is imported (Studio, Media page, Dock).
 *
 * The file name alone is not trusted: a program renamed to "song.jpg" or "notes.pdf" is caught by
 * looking at the first bytes of the file. Programs and scripts (Windows .exe/.msi/.dll/.bat,
 * macOS .app/.dmg/.pkg, Linux ELF, shell and script files, installers) are never imported.
 * Documents must really be the kind of file their name says (a PDF starts with "%PDF", Word and
 * PowerPoint files are zip packages with the right parts inside).
 */

/** Programs, scripts, installers and system files. Never imported, whatever the file really contains. */
export const BLOCKED_IMPORT_EXTENSIONS = new Set([
  "exe", "msi", "msp", "dll", "sys", "drv", "scr", "com", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "wsf", "wsh", "hta", "cpl", "lnk", "reg", "inf", "pif", "gadget", "jar", "apk", "ipa",
  "js", "mjs", "cjs", "jse", "sh", "bash", "zsh", "command", "py", "pl", "rb", "php", "app", "dmg", "pkg", "deb", "rpm", "appimage", "bin", "run", "iso", "img", "so", "dylib",
]);

/** Old binary Office / Apple formats the Studio cannot read. The message tells people what to do instead. */
const LEGACY_FORMATS: Record<string, string> = {
  doc: "Old Word (.doc) files cannot be read. Open it in Word and save it as .docx or PDF.",
  ppt: "Old PowerPoint (.ppt) files cannot be read. Open it in PowerPoint and save it as .pptx or PDF.",
  pps: "Old PowerPoint (.pps) files cannot be read. Save it as .pptx or PDF.",
  ppsx: "Slide-show files (.ppsx) cannot be read. Save it as .pptx or PDF.",
  key: "Keynote files cannot be read. In Keynote choose File → Export To → PowerPoint or PDF.",
  pages: "Pages files cannot be read. In Pages choose File → Export To → Word or PDF.",
  xls: "Spreadsheets are not documents the Studio can show. Save the sheet as PDF.",
  xlsx: "Spreadsheets are not documents the Studio can show. Save the sheet as PDF.",
  gdoc: "A Google Docs shortcut has no content. In Google Docs choose File → Download → PDF.",
  gslides: "A Google Slides shortcut has no content. In Google Slides choose File → Download → PDF.",
};

export interface ImportCheck {
  ok: boolean;
  /** Plain words for the person, when not ok. */
  reason?: string;
}

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

async function readHead(file: File, bytes: number): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.slice(0, bytes).arrayBuffer());
  } catch {
    return new Uint8Array();
  }
}

const startsWith = (head: Uint8Array, bytes: number[]) => bytes.length <= head.length && bytes.every((b, i) => head[i] === b);
const ascii = (head: Uint8Array, from: number, to: number) => String.fromCharCode(...Array.from(head.slice(from, to)));

/** The first bytes of a program: Windows (MZ), Linux (ELF), macOS (Mach-O) or a script (#!). */
function programKind(head: Uint8Array): string {
  if (startsWith(head, [0x4d, 0x5a])) return "a Windows program";
  if (startsWith(head, [0x7f, 0x45, 0x4c, 0x46])) return "a Linux program";
  if (startsWith(head, [0xcf, 0xfa, 0xed, 0xfe]) || startsWith(head, [0xce, 0xfa, 0xed, 0xfe]) || startsWith(head, [0xca, 0xfe, 0xba, 0xbe]) || startsWith(head, [0xfe, 0xed, 0xfa, 0xce]) || startsWith(head, [0xfe, 0xed, 0xfa, 0xcf])) return "a macOS program";
  if (startsWith(head, [0x23, 0x21])) return "a script";
  return "";
}

const hasBinary = (head: Uint8Array) => head.slice(0, 4096).some((b) => b === 0);

export const MAX_DOCUMENT_BYTES = 200 * 1024 * 1024;
export const MAX_MEDIA_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * kind "media" = a picture, video or sound; "document" = PDF, Word, PowerPoint, OpenDocument, RTF,
 * text, Markdown or web page.
 */
export async function checkImportFile(file: File, kind: "media" | "document"): Promise<ImportCheck> {
  const ext = extOf(file.name);
  if (BLOCKED_IMPORT_EXTENSIONS.has(ext)) {
    return { ok: false, reason: `“${file.name}” is a program or script, not a picture, video, sound or document.` };
  }
  if (LEGACY_FORMATS[ext]) return { ok: false, reason: LEGACY_FORMATS[ext] };
  if (file.size === 0) return { ok: false, reason: `“${file.name}” is empty.` };
  if (kind === "document" && ["txt", "md", "markdown", "html", "htm", "rtf"].includes(ext) && file.size > 20 * 1024 * 1024) {
    return { ok: false, reason: `“${file.name}” is a text file bigger than 20 MB.` };
  }
  if (kind === "document" && file.size > MAX_DOCUMENT_BYTES) return { ok: false, reason: `“${file.name}” is bigger than 200 MB.` };
  if (kind === "media" && file.size > MAX_MEDIA_BYTES) return { ok: false, reason: `“${file.name}” is bigger than 2 GB.` };

  const head = await readHead(file, 4100);
  const program = programKind(head);
  if (program) return { ok: false, reason: `“${file.name}” is ${program} with a different name on it. It was not imported.` };

  if (kind === "media") return { ok: true };

  const wrong = (what: string) => ({ ok: false, reason: `“${file.name}” is not a real ${what} file (its content does not match its name).` });
  if (ext === "pdf") return startsWith(head, [0x25, 0x50, 0x44, 0x46]) || ascii(head, 0, 1024).includes("%PDF-") ? { ok: true } : wrong("PDF");
  if (ext === "docx" || ext === "pptx" || ext === "odt" || ext === "odp") {
    if (!startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return wrong(ext === "docx" ? "Word" : ext === "pptx" ? "PowerPoint" : "OpenDocument");
    return { ok: true };
  }
  if (ext === "rtf") return ascii(head, 0, 5) === "{\\rtf" ? { ok: true } : wrong("RTF");
  if (["txt", "md", "markdown", "html", "htm"].includes(ext)) {
    return hasBinary(head) ? { ok: false, reason: `“${file.name}” contains binary data, so it is not a text file.` } : { ok: true };
  }
  return { ok: false, reason: `“${file.name}” is not a document type the Studio can show.` };
}

/** Document types the Studio turns into pages. */
export const DOCUMENT_EXTENSIONS = ["pdf", "docx", "pptx", "odt", "odp", "rtf", "txt", "md", "markdown", "html", "htm"] as const;
export const DOCUMENT_ACCEPT = [".pdf", ".docx", ".pptx", ".odt", ".odp", ".rtf", ".txt", ".md", ".html", ".htm", "application/pdf"].join(",");
