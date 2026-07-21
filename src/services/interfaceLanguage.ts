import i18n from "../i18n";
import { dockBridge } from "./dockBridge";
import {
  getInterfaceLocaleByCode,
  resolveInterfaceLocale,
} from "../i18n/localeCatalog";

const STORAGE_KEY = "mce_interface_language";

export function getStoredInterfaceLanguage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getResolvedInterfaceLanguage(country?: string | null, browserLocale?: string | null): string {
  return resolveInterfaceLocale(getStoredInterfaceLanguage(), country, browserLocale);
}

export function getInterfaceLanguageLabel(code: string): string {
  return getInterfaceLocaleByCode(code)?.nativeName || getInterfaceLocaleByCode(code)?.name || code;
}

export async function applyInterfaceLanguagePreference(
  localeInput: string,
  options: { country?: string | null; broadcast?: boolean } = {},
): Promise<string> {
  const resolved = resolveInterfaceLocale(localeInput, options.country, typeof navigator !== "undefined" ? navigator.language : "");

  try {
    localStorage.setItem(STORAGE_KEY, resolved);
  } catch {
    // ignore storage failures
  }

  await i18n.changeLanguage(resolved);

  if (options.broadcast !== false) {
    dockBridge.sendLanguageChanged(resolved);
  }

  return resolved;
}
