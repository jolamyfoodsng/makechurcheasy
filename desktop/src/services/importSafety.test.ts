import { describe, expect, it } from "vitest";
import { checkImportFile } from "./importSafety";

const mk = (name: string, bytes: number[] | string) => new File([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], name);

describe("checkImportFile", () => {
  it("refuses programs by extension", async () => {
    expect((await checkImportFile(mk("setup.exe", "x"), "media")).ok).toBe(false);
    expect((await checkImportFile(mk("run.sh", "x"), "document")).ok).toBe(false);
  });
  it("refuses a Windows program renamed to a picture, video or PDF", async () => {
    const exe = [0x4d, 0x5a, 0x90, 0x00, 1, 2, 3];
    for (const [name, kind] of [["photo.jpg", "media"], ["clip.mp4", "media"], ["notes.pdf", "document"], ["notes.docx", "document"]] as const) {
      const r = await checkImportFile(mk(name, exe), kind);
      expect(r.ok).toBe(false);
      expect(r.reason).toContain("Windows program");
    }
  });
  it("accepts real files", async () => {
    expect((await checkImportFile(mk("a.pdf", "%PDF-1.7\n..."), "document")).ok).toBe(true);
    expect((await checkImportFile(mk("a.docx", [0x50, 0x4b, 3, 4, 0]), "document")).ok).toBe(true);
    expect((await checkImportFile(mk("a.rtf", "{\\rtf1\\ansi hi}"), "document")).ok).toBe(true);
    expect((await checkImportFile(mk("a.txt", "Hello"), "document")).ok).toBe(true);
    expect((await checkImportFile(mk("a.png", [0x89, 0x50, 0x4e, 0x47]), "media")).ok).toBe(true);
  });
  it("catches a PDF that is not a PDF, binary 'text' and old Office files", async () => {
    expect((await checkImportFile(mk("a.pdf", "hello"), "document")).ok).toBe(false);
    expect((await checkImportFile(mk("a.txt", [65, 0, 66, 0]), "document")).ok).toBe(false);
    const old = await checkImportFile(mk("a.doc", "x"), "document");
    expect(old.ok).toBe(false);
    expect(old.reason).toContain(".docx");
    expect((await checkImportFile(mk("empty.pdf", ""), "document")).ok).toBe(false);
  });
});
