/**
 * extract-dock-strings.mjs — Extract translatable strings from dock TSX files.
 *
 * Scans all .tsx files in src/dock/ for:
 *   - Strings in JSX: >Text here<
 *   - placeholder="..."
 *   - title="..."
 *   - aria-label="..."
 *   - label: "..."
 *   - Strings in template literals that are user-facing
 *   - Error messages and toast strings
 *
 * Outputs a structured en.json for dock i18n.
 */

import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "fs";
import { join, extname } from "path";

const DOCK_DIR = join(process.cwd(), "src/dock");
const OUT_FILE = join(process.cwd(), "src/locales/dock-en.json");

function walk(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      results.push(...walk(full));
    } else if (/\.(tsx|ts)$/.test(entry) && !entry.endsWith(".d.ts") && !entry.endsWith(".css")) {
      results.push(full);
    }
  }
  return results;
}

const files = walk(DOCK_DIR);
console.log(`Scanning ${files.length} files in ${DOCK_DIR}`);

// We'll collect strings manually by reading each file and extracting patterns
const allStrings = new Map(); // key -> { file, context }

for (const file of files) {
  const rel = file.replace(DOCK_DIR + "/", "");
  const content = readFileSync(file, "utf-8");

  // 1. Extract JSX text content: >Some text here<
  const jsxTextRegex = />\s*([A-Z][^<{}]*?)\s*</g;
  let match;
  while ((match = jsxTextRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (isTranslatable(text, content, match.index)) {
      addString(text, rel);
    }
  }

  // 2. Extract placeholder="..." values
  const placeholderRegex = /placeholder="([^"]+)"/g;
  while ((match = placeholderRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && !text.startsWith("{") && /[a-zA-Z]/.test(text)) {
      addString(text, rel);
    }
  }

  // 3. Extract title="..." values (excluding icon names)
  const titleRegex = /title="([^"]+)"/g;
  while ((match = titleRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && !text.startsWith("{") && /[a-zA-Z]{2,}/.test(text) && !isIconName(text)) {
      addString(text, rel);
    }
  }

  // 4. Extract aria-label="..." values
  const ariaRegex = /aria-label="([^"]+)"/g;
  while ((match = ariaRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && !text.startsWith("{") && /[a-zA-Z]/.test(text)) {
      addString(text, rel);
    }
  }

  // 5. Extract label: "..." in objects (like shortcuts, tab definitions)
  const labelRegex = /label:\s*"([^"]+)"/g;
  while ((match = labelRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && /[a-zA-Z]{2,}/.test(text)) {
      addString(text, rel);
    }
  }

  // 6. Extract category: "..." in objects
  const categoryRegex = /category:\s*"([^"]+)"/g;
  while ((match = categoryRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && /[a-zA-Z]{2,}/.test(text)) {
      addString(text, rel);
    }
  }

  // 7. Extract description/desc: "..." in objects
  const descRegex = /(?:description|desc):\s*"([^"]+)"/g;
  while ((match = descRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && /[a-zA-Z]{2,}/.test(text)) {
      addString(text, rel);
    }
  }

  // 8. Extract setError/setSuccess/toast messages and throw new Error messages
  const errorMsgRegex = /(?:setError|setSuccess|throw new Error|message:)\s*\(\s*"([^"]+)"\s*\)/g;
  while ((match = errorMsgRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && /[a-zA-Z]{2,}/.test(text)) {
      addString(text, rel);
    }
  }

  // 9. Extract inline strings that look like button text in JSX
  // Pattern: {`...${variable}...`} template literals with user-facing text
  const templateRegex = /\{`([^`]*?\$\{[^`]+?\}[^`]*?)`\}/g;
  while ((match = templateRegex.exec(content)) !== null) {
    const template = match[1];
    // Extract static parts around interpolation
    const staticParts = template.split(/\$\{[^}]+\}/);
    for (const part of staticParts) {
      const trimmed = part.replace(/[.,!?;:]+$/g, "").trim();
      if (trimmed && /[A-Z]/.test(trimmed) && trimmed.length > 2 && !/^[#.\d]/.test(trimmed)) {
        addString(trimmed, rel);
      }
    }
  }

  // 10. Extract "Uploading X/Y..." pattern  
  const uploadRegex = /Uploading\s/g;
  while ((match = uploadRegex.exec(content)) !== null) {
    addString("Uploading", rel);
  }

  // 11. Extract status text in JSX spans
  const statusRegex = /<span>\s*(?:{[^}]*}\s*)?([A-Z][a-z]+(?:\s+[a-z]+)*(?:\s*[✓✓✗✘⚠])?)\s*(?:{[^}]*})?\s*<\/span>/g;
  while ((match = statusRegex.exec(content)) !== null) {
    const text = match[1].trim();
    if (text && text.length > 2 && !isIconName(text) && !/^\d/.test(text)) {
      addString(text, rel);
    }
  }
}

function isTranslatable(text, content, idx) {
  // Skip empty, very short, or numeric-only
  if (!text || text.length < 2) return false;
  if (/^\d+$/.test(text)) return false;
  // Skip CSS values
  if (/^(var|rgba?|rgb|calc|flex|grid|none|auto|inherit|initial|transparent)/.test(text)) return false;
  // Skip icon component names  
  if (isIconName(text)) return false;
  // Skip single words that are likely code identifiers
  if (/^[a-z][a-zA-Z]+$/.test(text) && text.length < 8 && !/ /.test(text)) return false;
  // Skip things that look like CSS class names
  if (/^[a-z]-[a-z]/.test(text)) return false;
  // Skip JSX expressions
  if (text.startsWith("{")) return false;
  // Skip paths
  if (text.startsWith("/") || text.startsWith("http")) return false;
  // Must contain at least one word character and a space or be Title Case
  if (!/[a-zA-Z]/.test(text)) return false;
  return true;
}

function isIconName(text) {
  const iconNames = new Set([
    "close", "refresh", "settings", "search", "menu", "check", "info",
    "warning", "error", "upload", "download", "delete", "edit", "add",
    "remove", "expand_less", "expand_more", "chevron_left", "chevron_right",
    "chevron_up", "chevron_down", "arrow_back", "arrow_forward", "link",
    "visibility", "visibility_off", "play", "pause", "stop", "skip_next",
    "skip_previous", "volume_up", "volume_off", "mic", "mic_off", "videocam",
    "videocam_off", "cast", "fullscreen", "minimize", "send", "save",
    "cloud_upload", "insert_drive_file", "folder_open", "image", "movie",
    "subtitles", "campaign", "schedule", "event_note", "history", "more_vert",
    "more_horiz", "check_circle", "error_outline", "help_outline", "info_outline",
    "light_mode", "dark_mode", "moon", "sun", "star", "star_border",
    "palette", "brush", "format_bold", "format_quote", "format_align_left",
    "format_align_center", "format_align_right", "grid_view", "grid_4x4",
    "view_carousel", "view_column", "dashboard", "widgets", "layers",
    "menu_book", "book_open", "church", "translate", "swap_horiz",
    "swap_calls", "restart_alt", "refresh_cw", "timer", "hourglass_top",
    "rocket", "rocket_launch", "wand2", "sparkles", "bolt", "zap",
    "shield", "shield_alert", "lock", "lock_open", "person", "person_add",
    "person_off", "group", "groups", "contacts", "account_circle",
    "power_settings_new", "power_off", "sync", "loop", "repeat",
    "content_copy", "content_paste", "content_cut", "undo", "redo",
    "select_all", "filter_list", "sort", "drag_indicator",
  ]);
  return iconNames.has(text.toLowerCase().replace(/ /g, "_"));
}

function addString(text, file) {
  // Normalize
  const normalized = text
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return;
  if (allStrings.has(normalized)) {
    allStrings.get(normalized).files.add(file);
  } else {
    allStrings.set(normalized, { files: new Set([file]) });
  }
}

// Now build the key map
function toKey(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, ".")
    .replace(/-+/g, ".")
    .replace(/^\.+|\.+$/g, "");
}

// Group strings by their probable namespace based on the files they appear in
function guessNamespace(str, files) {
  const fileStr = [...files].join(" ");
  if (fileStr.includes("Bible") || fileStr.includes("bible")) return "bible";
  if (fileStr.includes("Worship") || fileStr.includes("worship")) return "worship";
  if (fileStr.includes("Media") || fileStr.includes("media")) return "media";
  if (fileStr.includes("Planner") || fileStr.includes("planner")) return "planner";
  if (fileStr.includes("Multiview") || fileStr.includes("multiview")) return "multiview";
  if (fileStr.includes("Ministry") || fileStr.includes("ministry")) return "ministry";
  if (fileStr.includes("Auth") || fileStr.includes("auth")) return "auth";
  return "common";
}

// Build output JSON
const output = {};
const keyCount = {};
const duplicates = new Map();

for (const [str, info] of allStrings) {
  const ns = guessNamespace(str, info.files);
  let key = toKey(str);
  
  // Add namespace prefix for non-common
  if (ns !== "common") {
    key = ns + "." + key;
  }

  // Deduplicate
  if (output[key] !== undefined) {
    if (!duplicates.has(key)) duplicates.set(key, []);
    duplicates.get(key).push({ str, key, ns, files: [...info.files] });
    // Try appending a number
    let i = 2;
    while (output[`${key}_${i}`] !== undefined) i++;
    key = `${key}_${i}`;
  }
  
  output[key] = str;
  keyCount[ns] = (keyCount[ns] || 0) + 1;
}

// Sort keys
const sorted = Object.keys(output).sort().reduce((acc, k) => {
  acc[k] = output[k];
  return acc;
}, {});

writeFileSync(OUT_FILE, JSON.stringify(sorted, null, 2) + "\n");

console.log(`\nExtracted ${Object.keys(sorted).length} strings:`);
for (const [ns, count] of Object.entries(keyCount).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ns}: ${count}`);
}

if (duplicates.size > 0) {
  console.log(`\n${duplicates.size} duplicate keys resolved by appending suffix.`);
}

console.log(`\nWrote ${OUT_FILE}`);
