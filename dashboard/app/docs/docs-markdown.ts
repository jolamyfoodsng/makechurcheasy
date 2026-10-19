/**
 * docs-markdown.ts — reads one docs page written in Markdown into blocks the docs layout draws.
 *
 * A small, safe subset (no HTML is ever passed through):
 *   ---                         front matter: title, description, nav, group, order, updated
 *   ## Heading {#optional-id}   a section (listed under "On this page")
 *   ### Heading                 a sub-heading inside a section
 *   paragraphs, - bullets, 1. numbered lists
 *   1. **Step title.** Rest     every item starting with bold text → step cards
 *   > [!TIP] Optional title     callout (TIP, NOTE, WARNING), then "> " lines
 *   | a | b | tables, ``` code fences, ![alt](/path.webp) pictures
 * Inline: **bold**, *italic*, `code`, [link](/docs/page).
 */

export type DocInline =
  | { t: "text"; v: string }
  | { t: "strong"; c: DocInline[] }
  | { t: "em"; c: DocInline[] }
  | { t: "code"; v: string }
  | { t: "link"; href: string; c: DocInline[] };

export type DocBlock =
  | { type: "p"; c: DocInline[] }
  | { type: "h3"; id: string; c: DocInline[] }
  | { type: "ul"; items: DocInline[][] }
  | { type: "ol"; items: DocInline[][] }
  | { type: "steps"; items: { title: DocInline[]; body: DocInline[] }[] }
  | { type: "callout"; kind: "tip" | "note" | "warn"; title: string; c: DocInline[][] }
  | { type: "table"; head: DocInline[][]; rows: DocInline[][][] }
  | { type: "code"; lang: string; code: string }
  | { type: "img"; alt: string; src: string };

export interface DocSection {
  id: string;
  title: string;
  blocks: DocBlock[];
}

export interface DocFrontMatter {
  title: string;
  description: string;
  /** Shorter title for the sidebar. */
  nav: string;
  group: string;
  order: number;
  updated: string;
}

export interface ParsedDoc {
  meta: DocFrontMatter;
  /** Blocks before the first "##" (the page's introduction). */
  intro: DocBlock[];
  sections: DocSection[];
  /** Plain text per section, for search. */
  text: { id: string; title: string; text: string }[];
  /** Words, for the reading time. */
  words: number;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "section";
}

/** **bold**, *italic*, `code` and [text](href). Anything else stays plain text. */
export function parseInline(src: string): DocInline[] {
  const out: DocInline[] = [];
  let text = "";
  const flush = () => { if (text) { out.push({ t: "text", v: text }); text = ""; } };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^`([^`]+)`/))) { flush(); out.push({ t: "code", v: m[1] }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*\*(.+?)\*\*/))) { flush(); out.push({ t: "strong", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\*(?!\s)(.+?)\*/))) { flush(); out.push({ t: "em", c: parseInline(m[1]) }); i += m[0].length; continue; }
    if ((m = rest.match(/^\[([^\]]+)\]\(([^)\s]+)\)/))) {
      const href = m[2];
      // Only site paths, anchors, https and mailto links.
      if (/^(\/|#|https:\/\/|mailto:)/.test(href)) { flush(); out.push({ t: "link", href, c: parseInline(m[1]) }); i += m[0].length; continue; }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

export function inlineText(nodes: DocInline[]): string {
  return nodes.map((n) => (n.t === "text" || n.t === "code" ? n.v : inlineText(n.c))).join("");
}

function parseFrontMatter(src: string): { meta: Record<string, string>; body: string } {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: {}, body: src };
  const meta: Record<string, string> = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z]+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, "$1");
  }
  return { meta, body: src.slice(m[0].length) };
}

const CALLOUT_KIND: Record<string, "tip" | "note" | "warn"> = { TIP: "tip", NOTE: "note", WARNING: "warn", IMPORTANT: "warn", CAUTION: "warn" };

function splitRow(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
}

export function parseDocMarkdown(source: string, fallbackTitle = "Documentation"): ParsedDoc {
  const { meta, body } = parseFrontMatter(source.replace(/\r\n?/g, "\n"));
  const lines = body.split("\n");
  const intro: DocBlock[] = [];
  const sections: DocSection[] = [];
  const usedIds = new Set<string>();
  const uniqueId = (base: string) => {
    let id = base;
    for (let n = 2; usedIds.has(id); n += 1) id = `${base}-${n}`;
    usedIds.add(id);
    return id;
  };
  const target = () => (sections.length ? sections[sections.length - 1].blocks : intro);
  let pageTitle = meta.title || "";

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) { i += 1; continue; }

    // # Title (only used when the front matter has none)
    if (/^#\s+/.test(trimmed)) { if (!pageTitle) pageTitle = trimmed.replace(/^#\s+/, ""); i += 1; continue; }

    const h2 = trimmed.match(/^##\s+(.+?)(?:\s+\{#([a-z0-9-]+)\})?$/);
    if (h2) {
      sections.push({ id: uniqueId(h2[2] || slugify(h2[1])), title: h2[1], blocks: [] });
      i += 1;
      continue;
    }
    const h3 = trimmed.match(/^###\s+(.+)$/);
    if (h3) { target().push({ type: "h3", id: uniqueId(slugify(h3[1])), c: parseInline(h3[1]) }); i += 1; continue; }

    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith("```")) { code.push(lines[i]); i += 1; }
      i += 1;
      target().push({ type: "code", lang, code: code.join("\n") });
      continue;
    }

    const img = trimmed.match(/^!\[([^\]]*)\]\((\/[^)\s]+)\)$/);
    if (img) { target().push({ type: "img", alt: img[1], src: img[2] }); i += 1; continue; }

    if (trimmed.startsWith(">")) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) { quote.push(lines[i].trim().replace(/^>\s?/, "")); i += 1; }
      const head = quote[0].match(/^\[!([A-Z]+)\]\s*(.*)$/);
      const kind = head ? CALLOUT_KIND[head[1]] ?? "note" : "note";
      const title = head ? head[2] : "";
      const paras = (head ? quote.slice(1) : quote).join("\n").split(/\n\s*\n/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
      target().push({ type: "callout", kind, title, c: paras.map(parseInline) });
      continue;
    }

    if (trimmed.startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{2,}/)) {
      const head = splitRow(trimmed).map(parseInline);
      i += 2;
      const rows: DocInline[][][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) { rows.push(splitRow(lines[i]).map(parseInline)); i += 1; }
      target().push({ type: "table", head, rows });
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (i < lines.length) {
        const l = lines[i].trim();
        if (ordered ? /^\d+\.\s+/.test(l) : /^[-*]\s+/.test(l)) { items.push(l.replace(ordered ? /^\d+\.\s+/ : /^[-*]\s+/, "")); i += 1; continue; }
        // A wrapped continuation line belongs to the item above.
        if (l && !/^(#|>|\||```|[-*]\s|\d+\.\s)/.test(l) && lines[i].startsWith("  ")) { items[items.length - 1] += ` ${l}`; i += 1; continue; }
        break;
      }
      if (ordered && items.every((it) => /^\*\*.+?\*\*/.test(it))) {
        target().push({
          type: "steps",
          items: items.map((it) => {
            const m = it.match(/^\*\*(.+?)\*\*\s*(.*)$/)!;
            return { title: parseInline(m[1].replace(/[.:]$/, "")), body: parseInline(m[2]) };
          }),
        });
      } else {
        target().push({ type: ordered ? "ol" : "ul", items: items.map(parseInline) });
      }
      continue;
    }

    // Paragraph: lines until a blank line or another block.
    const para: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l || /^(#{1,3}\s|>|```|!\[|[-*]\s|\d+\.\s)/.test(l) || (l.startsWith("|") && lines[i + 1]?.trim().match(/^\|?\s*:?-{2,}/))) break;
      para.push(l);
      i += 1;
    }
    target().push({ type: "p", c: parseInline(para.join(" ")) });
  }

  const blockText = (b: DocBlock): string => {
    switch (b.type) {
      case "p": case "h3": return inlineText(b.c);
      case "ul": case "ol": return b.items.map(inlineText).join(" ");
      case "steps": return b.items.map((s) => `${inlineText(s.title).replace(/([^.!?])$/, "$1.")} ${inlineText(s.body)}`).join(" ");
      case "callout": return `${b.title} ${b.c.map(inlineText).join(" ")}`;
      case "table": return [...b.head, ...b.rows.flat()].map(inlineText).join(" ");
      case "code": return b.code;
      default: return "";
    }
  };
  const text = sections.map((s) => ({ id: s.id, title: s.title, text: s.blocks.map(blockText).join(" ") }));
  const words = [intro.map(blockText).join(" "), ...text.map((t) => `${t.title} ${t.text}`)].join(" ").split(/\s+/).filter(Boolean).length;

  const title = pageTitle || fallbackTitle;
  return {
    meta: {
      title,
      description: meta.description || "",
      nav: meta.nav || title,
      group: meta.group || "Guides",
      order: Number(meta.order) || 100,
      updated: meta.updated || "",
    },
    intro,
    sections,
    text,
    words,
  };
}
