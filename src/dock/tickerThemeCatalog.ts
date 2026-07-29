import {
  TICKER_THEMES as DOCK_TICKER_THEMES,
  generateTickerHTML,
  type TickerThemeColors,
  type TickerThemeConfig,
} from "../components/modules/tickerThemes";
import { defaultTickerThemes, type TickerTheme as PermanentTickerTheme } from "../data/tickerThemes";
import {
  remoteThemeToPermanentTickerTheme,
  remoteThemeToTickerConfig,
  type RemoteProductionTheme,
} from "../services/remoteProductionThemes";

export type DockTickerThemeOption =
  | {
      id: string;
      name: string;
      description: string;
      defaultHeading: string;
      accentColor: string;
      source: "dock";
      theme: TickerThemeConfig;
    }
  | {
      id: string;
      name: string;
      description: string;
      defaultHeading: string;
      accentColor: string;
      source: "remote";
      theme: TickerThemeConfig;
    }
  | {
      id: string;
      name: string;
      description: string;
      defaultHeading: string;
      accentColor: string;
      source: "remote-template";
      theme: PermanentTickerTheme;
    }
  | {
      id: string;
      name: string;
      description: string;
      defaultHeading: string;
      accentColor: string;
      source: "permanent";
      theme: PermanentTickerTheme;
    };

interface RenderDockTickerThemeOptions {
  option: DockTickerThemeOption;
  heading: string;
  messages: string[];
  speed: number;
  position: "top" | "bottom";
  loop: boolean;
  paused?: boolean;
  colors?: TickerThemeColors;
  brandLogoUrl?: string;
  brandName?: string;
}

const ALL_DOCK_TICKER_THEME_OPTIONS: DockTickerThemeOption[] = [
  ...DOCK_TICKER_THEMES.map((theme) => ({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    defaultHeading: theme.defaultHeading,
    accentColor: theme.defaultColors.accent,
    source: "dock" as const,
    theme,
  })),
  ...defaultTickerThemes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    description: theme.description,
    defaultHeading: theme.badge || theme.name,
    accentColor: theme.accentColor,
    source: "permanent" as const,
    theme,
  })),
];

export const DEFAULT_DOCK_TICKER_THEME_OPTION =
  ALL_DOCK_TICKER_THEME_OPTIONS[0];

export function getAllDockTickerThemeOptions(
  remoteThemes: RemoteProductionTheme[] = [],
): DockTickerThemeOption[] {
  const merged = new Map<string, DockTickerThemeOption>();
  for (const option of ALL_DOCK_TICKER_THEME_OPTIONS) {
    merged.set(option.id, option);
  }

  for (const remoteTheme of remoteThemes) {
    const permanentTheme = remoteThemeToPermanentTickerTheme(remoteTheme);
    if (permanentTheme) {
      merged.set(permanentTheme.id, {
        id: permanentTheme.id,
        name: permanentTheme.name,
        description: permanentTheme.description,
        defaultHeading: permanentTheme.badge || permanentTheme.name,
        accentColor: permanentTheme.accentColor,
        source: "remote-template",
        theme: permanentTheme,
      });
      continue;
    }

    const theme = remoteThemeToTickerConfig(remoteTheme);
    if (!theme) continue;
    merged.set(theme.id, {
      id: theme.id,
      name: theme.name,
      description: theme.description,
      defaultHeading: theme.defaultHeading,
      accentColor: theme.defaultColors.accent,
      source: "remote",
      theme,
    });
  }

  return [...merged.values()];
}

export function resolveDockTickerThemeOption(
  themeId: string | null | undefined,
  remoteThemes: RemoteProductionTheme[] = [],
): DockTickerThemeOption | undefined {
  if (!themeId) return undefined;
  return getAllDockTickerThemeOptions(remoteThemes).find((option) => option.id === themeId);
}

export function getDockTickerThemeOptionsForFavorites(
  favorites: ReadonlySet<string> | null | undefined,
  remoteThemes: RemoteProductionTheme[] = [],
): DockTickerThemeOption[] {
  const allOptions = getAllDockTickerThemeOptions(remoteThemes);
  if (!favorites || favorites.size === 0) {
    return allOptions;
  }

  const filtered = allOptions.filter((option) => favorites.has(option.id));
  return filtered.length > 0 ? filtered : allOptions;
}

export function renderDockTickerThemeHtml({
  option,
  heading,
  messages,
  speed,
  position,
  loop,
  paused = false,
  colors,
  brandLogoUrl = "",
  brandName = "",
}: RenderDockTickerThemeOptions): string {
  const safeMessages = messages.map((message) => message.trim()).filter(Boolean);
  const resolvedHeading = heading.trim() || option.defaultHeading;

  if (option.source === "dock" || option.source === "remote") {
    return generateTickerHTML(
      option.theme,
      colors ?? option.theme.defaultColors,
      resolvedHeading,
      safeMessages,
      speed,
      position,
      loop,
      paused,
      brandLogoUrl,
      brandName,
    );
  }

  return renderPermanentTickerThemeHtml(option.theme, {
    heading: resolvedHeading,
    messages: safeMessages,
    speed,
    position,
    loop,
    paused,
    colors,
  });
}

function renderPermanentTickerThemeHtml(
  theme: PermanentTickerTheme,
  options: Omit<RenderDockTickerThemeOptions, "option">,
): string {
  const messageSequence = options.messages.length > 0 ? options.messages : [theme.tickerText || " "];
  const joinedMessages = messageSequence.join("   •   ");
  const values = resolvePermanentTickerValues(theme, {
    heading: options.heading,
    messages: messageSequence,
    joinedMessages,
    speed: options.speed,
  });

  const html = theme.html.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, key: string) => {
    const resolved = values[key] ?? "";
    return escapeHtml(resolved);
  });

  const fontImports = theme.fontImports
    .filter((url): url is string => typeof url === "string" && url.length > 0)
    .map((url) => `<link rel="stylesheet" href="${url}">`)
    .join("\n");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${fontImports}
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
body { min-width: 200px; transform-origin: top left; text-align: left; }
${theme.css}
${buildPermanentTickerColorOverrides(options.colors)}
${buildPermanentTickerOverrides(options.position, options.loop, Boolean(options.paused))}
</style>
</head>
<body>
${html}
</body>
</html>`;
}

function resolvePermanentTickerValues(
  theme: PermanentTickerTheme,
  context: {
    heading: string;
    messages: string[];
    joinedMessages: string;
    speed: number;
  },
): Record<string, string> {
  const defaults: Record<string, string> = {};
  const contentSlots: string[] = [];

  for (const variable of theme.variables) {
    const key = String(variable.key || "");
    defaults[key] = String(variable.defaultValue || "");
    if (shouldUseMessageSlot(key, variable.type)) {
      contentSlots.push(key);
    }
  }

  const values: Record<string, string> = {
    ...defaults,
    state: "in",
    speed: speedToDuration(context.speed),
  };

  for (const key of Object.keys(defaults)) {
    const normalized = key.toLowerCase();

    if (isHeadingKey(normalized)) {
      values[key] = context.heading || defaults[key];
      continue;
    }

    if (isTickerBodyKey(normalized)) {
      values[key] = context.joinedMessages || defaults[key];
    }
  }

  contentSlots.forEach((key, index) => {
    const fallback = defaults[key];
    const message = context.messages[index] ?? context.messages[index % context.messages.length] ?? context.joinedMessages;
    values[key] = message || fallback;
  });

  return values;
}

function buildPermanentTickerColorOverrides(colors: TickerThemeColors | undefined): string {
  if (!colors) return "";
  const accent = safeCssColor(colors.accent);
  const accentText = safeCssColor(colors.accentText);
  const barBg = safeCssColor(colors.barBg);
  const barText = safeCssColor(colors.barText);
  const separator = safeCssColor(colors.separator);
  const rules: string[] = [];

  if (barBg) {
    rules.push([
      ".ticker-shell, .ticker-wrap, .ticker-container, .ticker-bar, .s5-banner, .s5-card, .s5-inner {",
      `  background: ${barBg} !important;`,
      "}",
    ].join("\n"));
  }

  if (barText) {
    rules.push([
      ".ticker-shell, .ticker-shell *, .ticker-wrap, .ticker-wrap *, .ticker-container, .ticker-container *, .ticker-bar, .ticker-bar *, .s5-banner, .s5-banner * {",
      `  color: ${barText} !important;`,
      "}",
    ].join("\n"));
  }

  if (accent || accentText) {
    rules.push([
      ".ticker-badge, .ticker-label, .ticker-heading, .ticker-title, .s5-badge, .s5-label {",
      accent ? `  background: ${accent} !important; border-color: ${accent} !important;` : "",
      accentText ? `  color: ${accentText} !important;` : "",
      "}",
    ].filter(Boolean).join("\n"));
  }

  if (separator) {
    rules.push([
      ".ticker-separator, .ticker-sep, .s5-separator, .s5-divider {",
      `  color: ${separator} !important; border-color: ${separator} !important;`,
      "}",
    ].join("\n"));
  }

  return rules.join("\n");
}

function safeCssColor(value: string | undefined): string | undefined {
  const trimmed = String(value || "").trim().slice(0, 80);
  if (!trimmed || /[;{}<>]/.test(trimmed)) return undefined;
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return trimmed;
  if (/^rgba?\(\s*(?:\d{1,3}\s*,\s*){2}\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) return trimmed;
  if (/^hsla?\(\s*\d{1,3}(?:deg)?\s*,\s*\d{1,3}%\s*,\s*\d{1,3}%(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\)$/i.test(trimmed)) return trimmed;
  return undefined;
}

function shouldUseMessageSlot(key: string, type: string): boolean {
  if (type !== "text") return false;
  const normalized = key.toLowerCase();
  return !isHeadingKey(normalized) && !isTickerBodyKey(normalized) && normalized !== "speed" && normalized !== "state";
}

function isHeadingKey(key: string): boolean {
  return key === "badge" || key === "label" || key === "heading" || key === "title";
}

function isTickerBodyKey(key: string): boolean {
  return (
    key === "tickertext" ||
    key === "text" ||
    key === "message" ||
    key === "messages" ||
    key === "headline" ||
    key === "details" ||
    key === "subtitle" ||
    key === "line2"
  );
}

function buildPermanentTickerOverrides(
  position: "top" | "bottom",
  loop: boolean,
  paused: boolean,
): string {
  const rules: string[] = [];

  if (position === "top") {
    rules.push(
      [
        ".pos-full-bottom, .s5-pos-full { top: 0 !important; bottom: auto !important; }",
        ".ticker-shell { margin: 10px auto 0 !important; }",
        ".s5-banner { margin: 8px auto 0 !important; }",
      ].join("\n"),
    );
  }

  if (!loop) {
    rules.push(
      ".ticker-move, .s5-move { animation-iteration-count: 1 !important; animation-fill-mode: forwards !important; }",
    );
  }

  if (paused) {
    rules.push(
      ".ticker-move, .s5-move { animation-play-state: paused !important; }",
    );
  }

  return rules.join("\n");
}

function speedToDuration(speed: number): string {
  const bounded = Number.isFinite(speed) ? Math.max(1, Math.min(100, speed)) : 50;
  const seconds = Math.round(40 - ((bounded - 1) / 99) * 26);
  return `${seconds}s`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
