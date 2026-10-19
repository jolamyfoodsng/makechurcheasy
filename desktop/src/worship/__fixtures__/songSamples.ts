// Made-up worship songs (written for these tests only, not real lyrics) in every format the importer accepts.
import JSZip from "jszip";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

export const SONGS = [
  {
    title: "Morning Light",
    sections: [
      ["Verse 1", ["Morning light is rising on the hills", "Every heart is waking, every soul is still", "You have kept us through the night", "Now we stand within Your light"]],
      ["Chorus", ["We will sing, we will sing", "To the One who made the morning", "We will sing, we will sing", "Lift your voice and bring an offering"]],
      ["Verse 2", ["When the day is heavy on our backs", "You are walking with us on the narrow track", "You have carried us before", "You will carry us once more"]],
    ],
  },
  {
    title: "River Of Grace",
    sections: [
      ["Verse 1", ["There's a river flowing from the throne", "Washing over every stone", "Deeper than the ocean floor", "Calling us to come for more"]],
      ["Chorus", ["Let it flow, let it flow", "River of grace, make us whole", "Let it flow, let it flow"]],
      ["Bridge", ["Down to the water we go", "Down to the water we go"]],
    ],
  },
  {
    title: "Faithful Every Day",
    sections: [
      ["Verse 1", ["You are faithful every day", "You are near when I pray", "In the valley, on the height", "You remain my guiding light"]],
      ["Chorus", ["Faithful, faithful", "Forever You are faithful"]],
    ],
  },
] as const;

type Style = "brackets" | "colon" | "plain";
function label(name: string, style: Style): string {
  return style === "brackets" ? `[${name}]` : style === "colon" ? `${name}:` : "";
}

/** Plain text: title line, blank line, labelled blocks. */
export function songsAsText(style: Style, opts: { chords?: boolean; credits?: boolean } = {}): string {
  return SONGS.map((song) => {
    const parts: string[] = [song.title];
    if (opts.credits) parts.push("Words and Music by Test Writer");
    for (const [name, lines] of song.sections) {
      const block: string[] = [];
      const l = label(name, style);
      if (l) block.push(l);
      for (const line of lines) {
        if (opts.chords) block.push("G        D        Em      C");
        block.push(line);
      }
      parts.push(block.join("\n"));
    }
    if (opts.credits) parts.push("CCLI Song # 0000000\n© 2026 Test Music Publishing\nCCLI License # 00000");
    return parts.join("\n\n");
  }).join("\n\n\n");
}

/** Word: title as Heading 1, every lyric line its own paragraph (how most people type songs). */
export async function songsAsDocx(style: Style): Promise<Uint8Array> {
  const children: Paragraph[] = [];
  for (const song of SONGS) {
    children.push(new Paragraph({ text: song.title, heading: HeadingLevel.HEADING_1 }));
    for (const [name, lines] of song.sections) {
      const l = label(name, style);
      if (l) children.push(new Paragraph({ children: [new TextRun({ text: l, bold: true })] }));
      for (const line of lines) children.push(new Paragraph(line));
      children.push(new Paragraph(""));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return new Uint8Array(await Packer.toBuffer(doc));
}

/** Word: one paragraph per verse with soft line breaks (Shift+Enter). */
export async function songsAsDocxSoftBreaks(): Promise<Uint8Array> {
  const children: Paragraph[] = [];
  for (const song of SONGS) {
    children.push(new Paragraph({ text: song.title, heading: HeadingLevel.HEADING_1 }));
    for (const [, lines] of song.sections) {
      children.push(new Paragraph({ children: lines.map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })) }));
    }
  }
  return new Uint8Array(await Packer.toBuffer(new Document({ sections: [{ children }] })));
}

function slideXml(paragraphs: string[]): string {
  const ps = paragraphs.map((p) => `<a:p><a:r><a:t>${p.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a:t></a:r></a:p>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${ps}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;
}

/** PowerPoint: a title slide per song, then one slide per section (two lines per slide for long ones). */
export async function songsAsPptx(which: number[]): Promise<Uint8Array> {
  const slides: string[][] = [];
  for (const index of which) {
    const song = SONGS[index];
    slides.push([song.title]);
    for (const [, lines] of song.sections) {
      for (let i = 0; i < lines.length; i += 2) slides.push(lines.slice(i, i + 2) as unknown as string[]);
    }
  }
  const zip = new JSZip();
  zip.file("ppt/presentation.xml", `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, i) => `<Relationship Id="rId${i + 1}" Target="slides/slide${i + 1}.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide"/>`).join("")}</Relationships>`);
  slides.forEach((s, i) => zip.file(`ppt/slides/slide${i + 1}.xml`, slideXml(s)));
  return zip.generateAsync({ type: "uint8array" });
}

/** OpenDocument text: same shape as the Word file (heading + one paragraph per line). */
export async function songsAsOdt(): Promise<Uint8Array> {
  const body: string[] = [];
  for (const song of SONGS) {
    body.push(`<text:h text:outline-level="1">${song.title}</text:h>`);
    for (const [name, lines] of song.sections) {
      body.push(`<text:p>${name}:</text:p>`);
      for (const line of lines) body.push(`<text:p>${line.replace(/'/g, "&apos;")}</text:p>`);
      body.push(`<text:p/>`);
    }
  }
  const zip = new JSZip();
  zip.file("content.xml", `<?xml version="1.0"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text>${body.join("")}</office:text></office:body></office:document-content>`);
  return zip.generateAsync({ type: "uint8array" });
}

/** HTML from a lyrics web page saved to disk: h2 titles, verses as <p> with <br>. */
export function songsAsHtml(): string {
  return `<html><body>${SONGS.map((song) => `<h2>${song.title}</h2>${song.sections.map(([name, lines]) => `<p><b>${name}</b><br>${lines.join("<br>\n")}</p>`).join("")}`).join("\n")}</body></html>`;
}

/** PDF: narrow column so long lines wrap, one song per page. */
export async function songsAsPdf(): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a5" });
  SONGS.forEach((song, songIndex) => {
    if (songIndex > 0) doc.addPage();
    let y = 15;
    doc.setFontSize(14);
    doc.text(song.title, 10, y);
    y += 10;
    doc.setFontSize(11);
    for (const [name, lines] of song.sections) {
      doc.text(`${name}:`, 10, y); y += 6;
      for (const line of lines) {
        for (const part of doc.splitTextToSize(line, 55) as string[]) { doc.text(part, 10, y); y += 5.5; }
      }
      y += 5;
    }
  });
  return new Uint8Array(doc.output("arraybuffer"));
}

/** A numbered hymn book in plain text: "12. Title", stanzas numbered "1." "2.". */
export function hymnBookAsText(): string {
  return SONGS.map((song, i) => [`${i + 1}. ${song.title}`, "", ...song.sections.map(([name, lines], j) =>
    (name === "Chorus" ? ["Refrain:", ...lines] : [`${j + 1}. ${lines[0]}`, ...lines.slice(1)]).join("\n"))].join("\n\n")).join("\n\n\n");
}
