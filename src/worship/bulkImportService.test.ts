import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { extractTextFromFile, getFileTypeLabel } from "./bulkImportService";
import { processDocumentLocally } from "./bulkImportAiService";

async function createPowerPointFixture(): Promise<File> {
  const zip = new JSZip();
  zip.file(
    "ppt/presentation.xml",
    `<?xml version="1.0"?><p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId id="1" r:id="rId1"/><p:sldId id="2" r:id="rId2"/></p:sldIdLst></p:presentation>`,
  );
  zip.file(
    "ppt/_rels/presentation.xml.rels",
    `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`,
  );
  zip.file(
    "ppt/slides/slide1.xml",
    `<p:sld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Opening Praise</a:t></a:r></a:p><a:p><a:r><a:t>O Lord, our strength and song</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:sld>`,
  );
  zip.file(
    "ppt/slides/slide2.xml",
    `<p:sld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Chorus</a:t></a:r></a:p><a:p><a:r><a:t>We will lift Your name</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:sld>`,
  );

  const bytes = await zip.generateAsync({ type: "uint8array" });
  return new File([bytes], "opening-praise.pptx", {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

describe("Worship document imports", () => {
  it("extracts DOCX text through the same file entrypoint used by Worship", async () => {
    const { Document, Packer, Paragraph } = await import("docx");
    const document = new Document({
      sections: [{
        children: [
          new Paragraph({ text: "Amazing Grace" }),
          new Paragraph({ text: "Amazing grace how sweet the sound" }),
        ],
      }],
    });
    const bytes = await Packer.toBuffer(document);
    const file = new File([bytes], "amazing-grace.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });

    const text = await extractTextFromFile(file);
    expect(text).toContain("Amazing Grace");
    expect(text).toContain("Amazing grace how sweet the sound");
    expect(getFileTypeLabel(file.name)).toBe("DOCX");
  });

  it("extracts PowerPoint slide text in order and keeps slide breaks", async () => {
    const file = await createPowerPointFixture();
    const text = await extractTextFromFile(file);

    expect(text).toContain("Opening Praise");
    expect(text).toContain("We will lift Your name");
    expect(text.split("\f")).toHaveLength(2);
    expect(getFileTypeLabel(file.name)).toBe("PPTX");
  });

  it("turns a PowerPoint into one reviewable worship item with separate slides", async () => {
    const file = await createPowerPointFixture();
    const text = await extractTextFromFile(file);
    const result = await processDocumentLocally(text, file.name);

    expect(result.aiUsed).toBe(false);
    expect(result.stats.provider).toBe("pptx-local");
    expect(result.songs).toHaveLength(1);
    expect(result.songs[0]?.title).toBe("opening-praise");
    expect(result.songs[0]?.sections.map((section) => section.label)).toEqual(["Slide 1", "Slide 2"]);
    expect(result.songs[0]?.sections[1]?.content).toContain("We will lift Your name");
  });
});
