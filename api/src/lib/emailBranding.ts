import {
  DEFAULT_EMAIL_BRANDING,
  type EmailBrandingSettings,
} from "./emailBrandingDefaults";

type TemplateContext = {
  brand: EmailBrandingSettings;
  social: EmailBrandingSettings["social"];
  year: string;
};

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((current, key) => {
      if (!current || typeof current !== "object") return undefined;
      return (current as Record<string, unknown>)[key];
    }, source);
}

function isPresent(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function normalizeColor(value: unknown, fallback: string): string {
  const color = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
}

function normalizeUrl(value: unknown, fallback = ""): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return fallback;

  try {
    const url = new URL(raw);
    if (url.protocol === "https:" || url.protocol === "http:") {
      return url.toString();
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function normalizeEmail(value: unknown, fallback: string): string {
  const email = typeof value === "string" ? value.trim() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : fallback;
}

function normalizeText(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeBranding(settings: Partial<EmailBrandingSettings> = {}): EmailBrandingSettings {
  const fallback = DEFAULT_EMAIL_BRANDING;
  const social =
    settings.social ?? ({} as Partial<EmailBrandingSettings["social"]>);

  return {
    appName: normalizeText(settings.appName, fallback.appName),
    logoUrl: normalizeUrl(settings.logoUrl, fallback.logoUrl),
    logoAlt: normalizeText(settings.logoAlt, fallback.logoAlt),
    primaryColor: normalizeColor(settings.primaryColor, fallback.primaryColor),
    accentColor: normalizeColor(settings.accentColor, fallback.accentColor),
    supportEmail: normalizeEmail(settings.supportEmail, fallback.supportEmail),
    websiteUrl: normalizeUrl(settings.websiteUrl, fallback.websiteUrl),
    preferencesUrl: normalizeUrl(settings.preferencesUrl, fallback.preferencesUrl),
    footerText: normalizeText(settings.footerText, fallback.footerText),
    social: {
      twitterUrl: normalizeUrl(social.twitterUrl, fallback.social.twitterUrl),
      facebookUrl: normalizeUrl(social.facebookUrl, fallback.social.facebookUrl),
      instagramUrl: normalizeUrl(social.instagramUrl, fallback.social.instagramUrl),
      linkedinUrl: normalizeUrl(social.linkedinUrl, fallback.social.linkedinUrl),
      youtubeUrl: normalizeUrl(social.youtubeUrl, fallback.social.youtubeUrl),
      whatsappUrl: normalizeUrl(social.whatsappUrl, fallback.social.whatsappUrl),
      tiktokUrl: normalizeUrl(social.tiktokUrl, fallback.social.tiktokUrl),
    },
  };
}

export async function getEmailBrandingSettings(): Promise<EmailBrandingSettings> {
  try {
    const { getPlatformSettings } = await import("./platformSettings");
    const settings = await getPlatformSettings();
    return normalizeBranding(settings.emailBranding);
  } catch (error) {
    console.warn("[email] Failed to load email branding settings; using defaults", error);
    return normalizeBranding(DEFAULT_EMAIL_BRANDING);
  }
}

export function renderHandlebarsTemplate(
  template: string,
  context: TemplateContext,
): string {
  const contextRecord = context as unknown as Record<string, unknown>;
  let output = template;

  output = output.replace(
    /{{#if\s+([\w.]+)}}([\s\S]*?){{\/if}}/g,
    (_match, path: string, body: string) =>
      isPresent(readPath(contextRecord, path))
        ? renderHandlebarsTemplate(body, context)
        : "",
  );

  output = output.replace(/{{{\s*([\w.]+)\s*}}}/g, (_match, path: string) =>
    String(readPath(contextRecord, path) ?? ""),
  );

  output = output.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path: string) =>
    escapeHtml(readPath(contextRecord, path)),
  );

  return output;
}

export async function renderEmailHtml(html: string): Promise<string> {
  const brand = await getEmailBrandingSettings();

  return renderHandlebarsTemplate(html, {
    brand,
    social: brand.social,
    year: String(new Date().getFullYear()),
  });
}
