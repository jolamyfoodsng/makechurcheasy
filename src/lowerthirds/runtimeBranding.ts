import type { MVSettings } from "../multiview/mvStore";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { getMinistryData } from "../services/ministryStore";
import type { LowerThirdTheme, LTVariable } from "./types";
import QRCode from "qrcode";

const DEFAULT_BRAND_COLOR = "#00E676";
const RUNTIME_BRAND_CSS_SENTINEL = "Runtime brand color override";
const LOCAL_GOOGLE_FONTS_IMPORT = "/fonts/google/google-fonts.css";
const LOCAL_FONT_AWESOME_IMPORT = "/fonts/fontawesome/all.min.css";
const LOCAL_CMG_SANS_IMPORT = "/fonts/cmg-sans-fonts.css";
const BUNDLED_DEFAULT_LOGO_PATH = "/logos/make_church_easy_logo.png";
const KNOWN_REMOTE_DEFAULT_LOGO_PATTERNS = [
  /pub-[^/]+\.r2\.dev\/make_church_easy\.png(?:[?#].*)?$/i,
  /make_church_easy(?:_logo)?\.(png|jpg|jpeg|webp|svg)(?:[?#].*)?$/i,
];
const KNOWN_REMOTE_SAMPLE_IMAGE_PATTERNS = [
  /^https?:\/\/lh3\.googleusercontent\.com\/aida-public\//i,
];
const KNOWN_QR_HOST_PATTERNS = [
  /^https?:\/\/api\.qrserver\.com\//i,
];
const QR_TEXT_KEY_HINTS = [
  "url",
  "link",
  "website",
  "site",
  "href",
  "give",
  "donate",
  "payment",
  "app",
];

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function toRgba(hex: string, alpha: number, fallback: string): string {
  const rgb = parseHexColor(hex);
  if (!rgb) return fallback;
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamped})`;
}

export function normalizeBrandColor(color: string | null | undefined, fallback = DEFAULT_BRAND_COLOR): string {
  const trimmed = (color ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed;
  return fallback;
}

export function isLogoVariable(variable: Pick<Partial<LTVariable>, "key" | "label">): boolean {
  const key = String(variable.key || "").toLowerCase();
  const label = String(variable.label || "").toLowerCase();
  const hint = `${key} ${label}`;
  return hint.includes("logo") || hint.includes("brand mark") || hint.includes("brandmark");
}

function isQrVariable(variable: Pick<Partial<LTVariable>, "key" | "label">): boolean {
  const key = String(variable.key || "").toLowerCase();
  const label = String(variable.label || "").toLowerCase();
  const hint = `${key} ${label}`;
  return hint.includes("qr");
}

function isImageLikeVariable(variable: Pick<Partial<LTVariable>, "key" | "label"> & { type?: unknown }): boolean {
  if (String(variable.type || "").toLowerCase() === "image") return true;
  const key = String(variable.key || "").toLowerCase();
  const label = String(variable.label || "").toLowerCase();
  const hint = `${key} ${label}`;
  return hint.includes("image") || hint.includes("photo") || hint.includes("picture") || hint.includes("avatar");
}

function isRemoteHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

function getBundledDefaultLogoUrl(): string {
  return `${getOverlayBaseUrlSync()}${BUNDLED_DEFAULT_LOGO_PATH}`;
}

function isKnownRemoteDefaultLogo(url: string): boolean {
  const raw = url.trim();
  return KNOWN_REMOTE_DEFAULT_LOGO_PATTERNS.some((pattern) => pattern.test(raw));
}

function isKnownQrServiceUrl(url: string): boolean {
  const raw = url.trim();
  return KNOWN_QR_HOST_PATTERNS.some((pattern) => pattern.test(raw));
}

function isKnownRemoteSampleImage(url: string): boolean {
  const raw = url.trim();
  return KNOWN_REMOTE_SAMPLE_IMAGE_PATTERNS.some((pattern) => pattern.test(raw));
}

function extractQrTextFromUrl(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get("data")?.trim() ?? "";
  } catch {
    return "";
  }
}

function findLikelyQrText(theme: LowerThirdTheme, values: Record<string, string>, qrVariableKey: string): string {
  const directValue = String(values[qrVariableKey] || "").trim();
  const fromDirectValue = extractQrTextFromUrl(directValue);
  if (fromDirectValue) return fromDirectValue;

  const variable = theme.variables.find((entry) => entry.key === qrVariableKey);
  const fromDefaultValue = extractQrTextFromUrl(variable?.defaultValue || "");
  if (fromDefaultValue) return fromDefaultValue;

  for (const candidate of theme.variables) {
    if (candidate.key === qrVariableKey) continue;
    if (candidate.type === "image") continue;
    const keyHint = String(candidate.key || "").toLowerCase();
    const labelHint = String(candidate.label || "").toLowerCase();
    const hint = `${keyHint} ${labelHint}`;
    if (!QR_TEXT_KEY_HINTS.some((token) => hint.includes(token))) continue;
    const candidateValue = String(values[candidate.key] || candidate.defaultValue || "").trim();
    if (candidateValue) return candidateValue;
  }

  return "";
}

function findLikelyQrTextFromVariables(
  variables: ThemeAssetVariableLike[],
  qrVariableKey: string,
): string {
  const directVariable = variables.find((entry) => entry.key === qrVariableKey);
  const directDefault = extractQrTextFromUrl(String(directVariable?.defaultValue || ""));
  if (directDefault) return directDefault;

  for (const candidate of variables) {
    if (candidate.key === qrVariableKey) continue;
    if (String(candidate.type || "").toLowerCase() === "image") continue;
    const keyHint = String(candidate.key || "").toLowerCase();
    const labelHint = String(candidate.label || "").toLowerCase();
    const hint = `${keyHint} ${labelHint}`;
    if (!QR_TEXT_KEY_HINTS.some((token) => hint.includes(token))) continue;
    const candidateValue = String(candidate.defaultValue || "").trim();
    if (candidateValue) return candidateValue;
  }

  return "";
}

function svgMoveCommand(command: "M" | "m" | "h", x: number, y?: number): string {
  return typeof y === "number" ? `${command}${x} ${y}` : `${command}${x}`;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function qrToSvgPath(data: Uint8Array, size: number, margin: number): string {
  let path = "";
  let moveBy = 0;
  let newRow = false;
  let lineLength = 0;

  for (let i = 0; i < data.length; i += 1) {
    const col = Math.floor(i % size);
    const row = Math.floor(i / size);

    if (!col && !newRow) newRow = true;

    if (data[i]) {
      lineLength += 1;

      if (!(i > 0 && col > 0 && data[i - 1])) {
        path += newRow
          ? svgMoveCommand("M", col + margin, 0.5 + row + margin)
          : svgMoveCommand("m", moveBy, 0);

        moveBy = 0;
        newRow = false;
      }

      if (!(col + 1 < size && data[i + 1])) {
        path += svgMoveCommand("h", lineLength);
        lineLength = 0;
      }
    } else {
      moveBy += 1;
    }
  }

  return path;
}

function buildOfflineQrDataUrl(text: string, width = 220): string {
  const qrData = QRCode.create(text, {
    errorCorrectionLevel: "M",
  });
  const qrSize = qrData.modules.size;
  const margin = 1;
  const viewBoxSize = qrSize + margin * 2;
  const path = qrToSvgPath(qrData.modules.data, qrSize, margin);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${width}" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges"><path fill="#ffffff" d="M0 0h${viewBoxSize}v${viewBoxSize}H0z"/><path stroke="#000000" d="${path}"/></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildImagePlaceholderDataUrl(label: string): string {
  const safeLabel = escapeSvgText(label.trim() || "Image");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480"><rect width="480" height="480" rx="36" fill="#111827"/><rect x="40" y="40" width="400" height="400" rx="28" fill="#1f2937" stroke="#4b5563" stroke-width="4"/><circle cx="176" cy="182" r="36" fill="#9ca3af"/><path d="M108 336l76-86 58 56 44-40 86 70H108z" fill="#6b7280"/><text x="240" y="404" text-anchor="middle" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#f3f4f6">${safeLabel}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeThemeFontImport(url: string): string {
  const raw = url.trim();
  if (!raw) return "";
  if (/^https?:\/\/fonts\.googleapis\.com\//i.test(raw)) return LOCAL_GOOGLE_FONTS_IMPORT;
  if (/^https?:\/\/fonts\.gstatic\.com\//i.test(raw)) return LOCAL_GOOGLE_FONTS_IMPORT;
  if (/^https?:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/font-awesome\//i.test(raw)) return LOCAL_FONT_AWESOME_IMPORT;
  if (/\/fonts\/fontawesome\/all\.min\.css$/i.test(raw)) return LOCAL_FONT_AWESOME_IMPORT;
  if (/\/fonts\/google\/google-fonts\.css$/i.test(raw)) return LOCAL_GOOGLE_FONTS_IMPORT;
  if (/\/fonts\/cmg-sans-fonts\.css$/i.test(raw)) return LOCAL_CMG_SANS_IMPORT;
  return raw;
}

export function normalizeThemeFontImports(fontImports: string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of fontImports || []) {
    if (typeof item !== "string") continue;
    const mapped = normalizeThemeFontImport(item);
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    normalized.push(mapped);
  }
  return normalized;
}

type ThemeAssetVariableLike = {
  key?: string;
  label?: string;
  type?: unknown;
  defaultValue?: unknown;
  placeholder?: unknown;
};

function localizeThemeAssetVariable<T extends ThemeAssetVariableLike>(
  variable: T,
  variables: ThemeAssetVariableLike[],
): T {
  const defaultValue = typeof variable.defaultValue === "string" ? variable.defaultValue.trim() : "";
  const placeholder = typeof variable.placeholder === "string" ? variable.placeholder.trim() : "";

  let nextDefaultValue = variable.defaultValue;
  let nextPlaceholder = variable.placeholder;

  if (isLogoVariable(variable)) {
    if (defaultValue && isRemoteHttpUrl(defaultValue)) {
      nextDefaultValue = getBundledDefaultLogoUrl();
    }
    if (placeholder && isRemoteHttpUrl(placeholder)) {
      nextPlaceholder = getBundledDefaultLogoUrl();
    }
  } else if (isQrVariable(variable)) {
    const qrText = findLikelyQrTextFromVariables(variables, String(variable.key || ""));
    const qrDataUrl = qrText ? buildOfflineQrDataUrl(qrText) : buildImagePlaceholderDataUrl("QR");
    if (defaultValue && isRemoteHttpUrl(defaultValue)) {
      nextDefaultValue = qrDataUrl;
    }
    if (placeholder && isRemoteHttpUrl(placeholder)) {
      nextPlaceholder = "Use local QR image";
    }
  } else if (isImageLikeVariable(variable)) {
    if (defaultValue && isRemoteHttpUrl(defaultValue)) {
      nextDefaultValue = buildImagePlaceholderDataUrl(String(variable.label || variable.key || "Image"));
    }
    if (placeholder && isRemoteHttpUrl(placeholder)) {
      nextPlaceholder = "Use local image";
    }
  }

  if (nextDefaultValue === variable.defaultValue && nextPlaceholder === variable.placeholder) {
    return variable;
  }

  return {
    ...variable,
    defaultValue: nextDefaultValue,
    placeholder: nextPlaceholder,
  };
}

type ThemeAssetThemeLike = {
  fontImports?: string[];
  variables?: ThemeAssetVariableLike[];
};

export function localizeLowerThirdThemeAssets<T extends ThemeAssetThemeLike>(theme: T): T {
  const fontImports = normalizeThemeFontImports(theme.fontImports);
  const variables = Array.isArray(theme.variables)
    ? theme.variables.map((variable) => localizeThemeAssetVariable(variable, theme.variables || []))
    : theme.variables;

  return {
    ...theme,
    fontImports,
    variables,
  };
}

export function resolveOverlayAssetUrl(pathOrUrl: string): string {
  const raw = pathOrUrl.trim();
  if (!raw) return "";

  if (/^(data:|blob:|asset:)/i.test(raw)) return raw;
  if (/^https?:/i.test(raw)) {
    if (isKnownRemoteDefaultLogo(raw)) {
      return getBundledDefaultLogoUrl();
    }
    return raw;
  }
  if (/^\/?uploads\//i.test(raw)) {
    const clean = raw.replace(/^\/+/, "");
    return `${getOverlayBaseUrlSync()}/${clean}`;
  }

  let candidate = raw;
  if (/^file:\/\//i.test(candidate)) {
    try {
      candidate = decodeURIComponent(candidate.replace(/^file:\/\//i, ""));
    } catch {
      candidate = candidate.replace(/^file:\/\//i, "");
    }
  }

  const fileName = candidate.split(/[\\/]/).pop()?.trim() ?? "";
  if (!fileName) return "";
  return `${getOverlayBaseUrlSync()}/uploads/${encodeURIComponent(fileName)}`;
}

function buildRuntimeBrandCss(brandColor: string): string {
  const border = toRgba(brandColor, 0.32, "rgba(74, 222, 128, 0.32)");
  const glow = toRgba(brandColor, 0.14, "rgba(74, 222, 128, 0.14)");
  return `
/* ${RUNTIME_BRAND_CSS_SENTINEL} */
:root, #overlay-root {
  --lt-brand-primary: ${brandColor} !important;
  --lt-brand-border: ${border} !important;
  --lt-brand-glow: ${glow} !important;
  --lt-logo-scale: 1.2 !important;
  --lt-logo-box-width: 220px !important;
  --lt-logo-box-height: 126px !important;
  --lt-logo-round-size: 120px !important;
  --lt-logo-compact-box-width: 154px !important;
  --lt-logo-compact-box-height: 90px !important;
  --lt-logo-compact-round-size: 86px !important;
}

.logo-box,
.lt53-logo,
.y-logo {
  width: calc(var(--lt-logo-box-width, 220px) * var(--lt-logo-scale, 1.2)) !important;
  min-width: calc(var(--lt-logo-box-width, 220px) * var(--lt-logo-scale, 1.2)) !important;
  height: calc(var(--lt-logo-box-height, 126px) * var(--lt-logo-scale, 1.2)) !important;
}

.logo-box.logo-round {
  width: calc(var(--lt-logo-round-size, 120px) * var(--lt-logo-scale, 1.2)) !important;
  min-width: calc(var(--lt-logo-round-size, 120px) * var(--lt-logo-scale, 1.2)) !important;
  height: calc(var(--lt-logo-round-size, 120px) * var(--lt-logo-scale, 1.2)) !important;
}

.logo-box img,
.lt53-logo img,
.y-logo img {
  width: 100% !important;
  max-height: calc(var(--lt-logo-box-height, 126px) * var(--lt-logo-scale, 1.2)) !important;
  object-fit: contain !important;
}

@media (max-width: 1180px) {
  .logo-box,
  .lt53-logo,
  .y-logo {
    width: calc(var(--lt-logo-compact-box-width, 154px) * var(--lt-logo-scale, 1.2)) !important;
    min-width: calc(var(--lt-logo-compact-box-width, 154px) * var(--lt-logo-scale, 1.2)) !important;
    height: calc(var(--lt-logo-compact-box-height, 90px) * var(--lt-logo-scale, 1.2)) !important;
  }

  .logo-box.logo-round {
    width: calc(var(--lt-logo-compact-round-size, 86px) * var(--lt-logo-scale, 1.2)) !important;
    min-width: calc(var(--lt-logo-compact-round-size, 86px) * var(--lt-logo-scale, 1.2)) !important;
    height: calc(var(--lt-logo-compact-round-size, 86px) * var(--lt-logo-scale, 1.2)) !important;
  }

  .logo-box img,
  .lt53-logo img,
  .y-logo img {
    max-height: calc(var(--lt-logo-compact-box-height, 90px) * var(--lt-logo-scale, 1.2)) !important;
  }
}
`;
}

export function withRuntimeBrandColor(theme: LowerThirdTheme, brandColor: string): LowerThirdTheme {
  const localizedTheme = localizeLowerThirdThemeAssets(theme);
  const safeColor = normalizeBrandColor(brandColor, theme.accentColor || DEFAULT_BRAND_COLOR);
  const cssBase = typeof localizedTheme.css === "string" ? localizedTheme.css : "";
  const css = cssBase.includes(RUNTIME_BRAND_CSS_SENTINEL)
    ? cssBase
    : `${cssBase}\n${buildRuntimeBrandCss(safeColor)}`;

  return {
    ...localizedTheme,
    accentColor: safeColor,
    css,
  };
}

export function applyBrandLogoDefaults(
  theme: LowerThirdTheme,
  values: Record<string, string>,
  brandLogoPath: string,
): Record<string, string> {
  // Fall back to ministry store logo if no explicit path provided
  const logoPath = brandLogoPath || getMinistryData().logoPath;
  const resolvedLogo = resolveOverlayAssetUrl(logoPath);
  if (!resolvedLogo) return { ...values };

  const next = { ...values };
  for (const variable of theme.variables) {
    if (!isLogoVariable(variable)) continue;
    next[variable.key] = resolvedLogo;
  }
  return next;
}

export function normalizeOfflineThemeValues(
  theme: LowerThirdTheme,
  values: Record<string, string>,
): Record<string, string> {
  const next = { ...values };

  for (const variable of theme.variables) {
    const currentValue = String(next[variable.key] || "").trim();
    const defaultValue = String(variable.defaultValue || "").trim();
    const effectiveValue = currentValue || defaultValue;

    if (isLogoVariable(variable) && effectiveValue && isKnownRemoteDefaultLogo(effectiveValue)) {
      next[variable.key] = getBundledDefaultLogoUrl();
      continue;
    }

    if (isQrVariable(variable) && effectiveValue) {
      const shouldLocalizeQr =
        isKnownQrServiceUrl(effectiveValue) ||
        isKnownRemoteSampleImage(effectiveValue) ||
        (effectiveValue === defaultValue && isRemoteHttpUrl(effectiveValue));
      if (!shouldLocalizeQr) continue;

      const qrText = findLikelyQrText(theme, next, variable.key);
      next[variable.key] = qrText ? buildOfflineQrDataUrl(qrText) : buildImagePlaceholderDataUrl("QR");
      continue;
    }

    if (!isImageLikeVariable(variable) || !effectiveValue) continue;
    const shouldLocalizeImage =
      isKnownRemoteSampleImage(effectiveValue) ||
      (effectiveValue === defaultValue && isRemoteHttpUrl(effectiveValue));
    if (!shouldLocalizeImage) continue;
    next[variable.key] = buildImagePlaceholderDataUrl(String(variable.label || variable.key || "Image"));
  }

  return next;
}

export function applyRuntimeBranding(
  theme: LowerThirdTheme,
  values: Record<string, string>,
  settings: Pick<MVSettings, "brandColor" | "brandLogoPath">,
): { theme: LowerThirdTheme; values: Record<string, string>; brandColor: string; logoUrl: string } {
  const brandColor = normalizeBrandColor(settings.brandColor, theme.accentColor || DEFAULT_BRAND_COLOR);
  const brandedTheme = withRuntimeBrandColor(theme, brandColor);
  const brandedValues = normalizeOfflineThemeValues(
    brandedTheme,
    applyBrandLogoDefaults(brandedTheme, values, settings.brandLogoPath || ""),
  );
  // Logo URL: use explicit path, fall back to ministry store
  const logoPath = settings.brandLogoPath || getMinistryData().logoPath;
  const logoUrl = resolveOverlayAssetUrl(logoPath || "");
  return {
    theme: brandedTheme,
    values: brandedValues,
    brandColor,
    logoUrl,
  };
}
