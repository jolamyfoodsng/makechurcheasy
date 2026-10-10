// Writes api/src/lib/builtinBroadcastGraphics.ts — the list of Broadcast Graphics bundled with
// the desktop app, so Admin → Broadcast Graphics can pause / hide / plan-limit each of them.
// Run from desktop/ after scripts/generate-kinetic-themes.cjs:
//   node scripts/export-broadcast-graphics-builtins.cjs
const fs = require("fs");
const path = require("path");

const src = fs.readFileSync(path.resolve(__dirname, "../src/lowerthirds/kineticThemes.ts"), "utf8");
const cssMarker = "export const KINETIC_THEME_CSS = ";
const cssStart = src.indexOf(cssMarker);
const cssValueStart = cssStart + cssMarker.length;
const cssEnd = src.indexOf(";\n\nconst KINETIC_THEME_DATA", cssValueStart);
const start = src.indexOf("const KINETIC_THEME_DATA");
const open = src.indexOf("= ", start) + 2;
const end = src.indexOf(";\n\nexport const KINETIC_LOWER_THIRD_THEMES", open);
if (cssStart < 0 || cssEnd < 0 || start < 0 || end < 0) {
  throw new Error("Couldn't find the generated theme CSS or data in kineticThemes.ts");
}
const commonCss = JSON.parse(src.slice(cssValueStart, cssEnd));
const themes = JSON.parse(src.slice(open, end));

// Graphics the Broadcast Graphics page deliberately leaves out.
const SKIP = new Set(["lt-sub-05-sub-7", "lt-sub-02-sub-2", "lt-ch-text-give"]);

// Same rules as getTemplateCategory() in src/pages/BroadcastGraphicsPage.tsx.
function category(t) {
  if (t.graphicCategory) return t.graphicCategory;
  const tags = (t.tags || []).map((x) => x.toLowerCase());
  const id = t.id.toLowerCase();
  const name = t.name.toLowerCase();
  if (tags.includes("speaker") || t.category === "speaker") return "speaker";
  if (tags.includes("welcome") || name.includes("welcome") || id.includes("join") || id.includes("guest") || id.includes("connect")) return "welcome";
  if (tags.includes("giving") || name.includes("giving") || id.includes("give") || id.includes("tithe") || id.includes("offering")) return "giving";
  if (tags.includes("subscribe") || id.includes("sub-") || id.includes("subscribe")) return "subscribe";
  if (tags.includes("announcement") || name.includes("announcement")) return "announcements";
  if (tags.includes("countdown")) return "countdown";
  if (tags.includes("social")) return "social";
  return "others";
}

const list = themes
  .filter((t) => !SKIP.has(t.id))
  .map((t, i) => ({
    graphicId: t.id,
    name: t.name,
    category: category(t),
    accentColor: t.accentColor || "#2563eb",
    description: t.description || "",
    sortOrder: i,
  }));

const out = `/**
 * builtinBroadcastGraphics.ts — the Broadcast Graphics bundled with the desktop app.
 *
 * GENERATED from desktop/src/lowerthirds/kineticThemes.ts (desktop/scripts/export-broadcast-graphics-builtins.cjs).
 * The admin portal lists these next to uploaded graphic packages so each one can be paused,
 * hidden or limited to a plan. Re-run the script when bundled graphics are added or renamed.
 */
export interface BuiltinBroadcastGraphic {
  graphicId: string;
  name: string;
  category: string;
  accentColor: string;
  description: string;
  sortOrder: number;
}

export const BUILTIN_BROADCAST_GRAPHICS: BuiltinBroadcastGraphic[] = ${JSON.stringify(list, null, 2)};
`;
const target = path.resolve(__dirname, "../../api/src/lib/builtinBroadcastGraphics.ts");
fs.writeFileSync(target, out);
console.log(`${list.length} built-in graphics → ${target}`);

// The admin preview uses the exact desktop HTML, variables and animation engine.
const previewThemes = themes
  .filter((t) => !SKIP.has(t.id))
  .map((t) => ({
    graphicId: t.id,
    name: t.name,
    category: category(t),
    accentColor: t.accentColor || "#2563eb",
    description: t.description || "",
    html: t.html || "",
    variables: t.variables || [],
    fontImports: t.fontImports || [],
  }));
const previewTarget = path.resolve(__dirname, "../../dashboard/public/broadcast-graphics/builtin-previews.json");
fs.mkdirSync(path.dirname(previewTarget), { recursive: true });
fs.writeFileSync(previewTarget, JSON.stringify({ format: "mce-builtin-preview@1", css: commonCss, themes: previewThemes }));
console.log(`${previewThemes.length} built-in previews → ${previewTarget}`);

// Keep the admin preview's local runtime and the fonts referenced by the desktop CSS in sync.
const copyFiles = (sourceDir, targetDir, names) => {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const name of names) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(targetDir, name));
  }
};
copyFiles(
  path.resolve(__dirname, "../public/kinetic"),
  path.resolve(__dirname, "../../dashboard/public/kinetic"),
  ["gsap.min.js", "kinetic-lower-thirds.js", "subscribe-lower-thirds.js", "church-lower-thirds.js", "sunday-lower-thirds.js", "mce-graphic-packages.js"],
);
for (const fontFamily of ["archivo", "church", "sunday", "google"]) {
  const sourceDir = path.resolve(__dirname, `../public/fonts/${fontFamily}`);
  const targetDir = path.resolve(__dirname, `../../dashboard/public/fonts/${fontFamily}`);
  fs.mkdirSync(targetDir, { recursive: true });
  for (const name of fs.readdirSync(sourceDir)) {
    if (name.endsWith(".woff2") || name.endsWith(".css") || name === "OFL.txt") {
      fs.copyFileSync(path.join(sourceDir, name), path.join(targetDir, name));
    }
  }
}
console.log("Synced the admin preview runtime and bundled font assets");
