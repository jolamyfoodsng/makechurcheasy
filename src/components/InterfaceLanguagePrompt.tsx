import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Globe2 } from "lucide-react";
import { INTERFACE_LOCALES } from "../i18n/localeCatalog";
import {
  applyInterfaceLanguagePreference,
  getResolvedInterfaceLanguage,
  getStoredInterfaceLanguage,
} from "../services/interfaceLanguage";
import "./InterfaceLanguagePrompt.css";

const PROMPT_SEEN_KEY = "mce_interface_language_prompt_seen";

function hasSeenPrompt(): boolean {
  try {
    return localStorage.getItem(PROMPT_SEEN_KEY) === "true";
  } catch {
    return false;
  }
}

function markPromptSeen(): void {
  try {
    localStorage.setItem(PROMPT_SEEN_KEY, "true");
  } catch {
    // ignore storage failures
  }
}

export function InterfaceLanguagePrompt() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(() => !getStoredInterfaceLanguage() && !hasSeenPrompt());
  const [selectedLanguage, setSelectedLanguage] = useState(() => getResolvedInterfaceLanguage());
  const selectedLocale = useMemo(
    () => INTERFACE_LOCALES.find((locale) => locale.code === selectedLanguage) ?? INTERFACE_LOCALES[0],
    [selectedLanguage],
  );

  if (!visible) return null;

  return (
    <div className="interface-language-prompt" role="dialog" aria-modal="true" aria-labelledby="interface-language-title">
      <div className="interface-language-prompt__panel">
        <div className="interface-language-prompt__icon" aria-hidden="true">
          <Globe2 size={18} />
        </div>
        <div className="interface-language-prompt__content">
          <h2 id="interface-language-title">{t("interfaceLanguagePrompt.title")}</h2>
          <p>{t("interfaceLanguagePrompt.description")}</p>
          <label className="interface-language-prompt__field">
            <span>{t("interfaceLanguagePrompt.label")}</span>
            <span className="interface-language-prompt__select-wrap">
              <select
                value={selectedLanguage}
                onChange={(event) => setSelectedLanguage(event.target.value)}
                autoFocus
              >
                {INTERFACE_LOCALES.map((locale) => (
                  <option key={locale.code} value={locale.code}>
                    {locale.nativeName}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </span>
          </label>
          <div className="interface-language-prompt__footer">
            <span>{t("interfaceLanguagePrompt.helper")}</span>
            <button
              type="button"
              onClick={() => {
                void applyInterfaceLanguagePreference(selectedLocale.code, { broadcast: true }).finally(() => {
                  markPromptSeen();
                  setVisible(false);
                });
              }}
            >
              {t("interfaceLanguagePrompt.continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
