import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import {
  buildGoogleTranslateUrl,
  getGoogleTranslateLanguage,
  GOOGLE_TRANSLATE_LANGUAGES,
  translateWithGoogleWeb,
  type GoogleTranslateLanguage,
} from "../../services/googleTranslateWeb";
import "./DockTranslationControls.css";

export interface DockTranslationSection {
  id: string;
  text: string;
}

export interface DockTranslationValue {
  targetLanguage: string;
  targetLanguageLabel: string;
  translatedSections: Record<string, string>;
  showBoth: boolean;
}

interface Props {
  sections: DockTranslationSection[];
  value?: DockTranslationValue | null;
  onChange: (value: DockTranslationValue | null) => void;
  compact?: boolean;
}

export default function DockTranslationControls({ sections, value, onChange, compact = false }: Props) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);
  const sourceSignature = useMemo(
    () => sections.map((section) => `${section.id}:${section.text}`).join("\u001f"),
    [sections],
  );
  const [open, setOpen] = useState(false);
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const [languageQuery, setLanguageQuery] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [showBoth, setShowBoth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLanguageMenuOpen(false);
    setLanguageQuery("");
    setLoading(false);
    setError("");
    onChange(null);
  }, [sourceSignature, onChange]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setLanguageMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  const selectedLanguage = getGoogleTranslateLanguage(targetLanguage);
  const filteredLanguages = useMemo(() => {
    const query = languageQuery.trim().toLocaleLowerCase();
    if (!query) return GOOGLE_TRANSLATE_LANGUAGES;
    return GOOGLE_TRANSLATE_LANGUAGES.filter((language) =>
      language.label.toLocaleLowerCase().includes(query)
      || language.code.toLocaleLowerCase().includes(query),
    );
  }, [languageQuery]);

  const translateSections = useCallback(async (language: GoogleTranslateLanguage) => {
    const requestId = ++requestIdRef.current;
    const nonEmptySections = sections.filter((section) => section.text.trim());
    if (nonEmptySections.length === 0) return;

    setTargetLanguage(language.code);
    setLoading(true);
    setError("");
    try {
      const translatedEntries = await Promise.all(
        nonEmptySections.map(async (section) => [section.id, await translateWithGoogleWeb(section.text, language.code)] as const),
      );
      if (requestId !== requestIdRef.current) return;

      onChange({
        targetLanguage: language.code,
        targetLanguageLabel: language.label,
        translatedSections: Object.fromEntries(translatedEntries),
        showBoth,
      });
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      setError(cause instanceof Error ? cause.message : t("dock.translation.failed", { defaultValue: "Translation failed" }));
      onChange(null);
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [onChange, sections, showBoth, t]);

  const handleLanguageSelect = (language: GoogleTranslateLanguage) => {
    setLanguageQuery(language.label);
    setLanguageMenuOpen(false);
    void translateSections(language);
  };

  const handleShowBothChange = (nextShowBoth: boolean) => {
    setShowBoth(nextShowBoth);
    if (value) onChange({ ...value, showBoth: nextShowBoth });
  };

  const openGoogleTranslate = async () => {
    const text = sections.map((section) => section.text.trim()).filter(Boolean).join("\n\n");
    if (!text) return;
    const url = buildGoogleTranslateUrl(text, targetLanguage);
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className={`dock-translation${compact ? " dock-translation--compact" : ""}`} ref={panelRef}>
      <div className="dock-translation__trigger-row">
        <button
          type="button"
          className={`dock-translation__trigger${open ? " dock-translation__trigger--active" : ""}`}
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-label={t("dock.translation.open", { defaultValue: "Translate this song" })}
          title={t("dock.translation.open", { defaultValue: "Translate this song" })}
        >
          <Icon name="translate" size={14} />
          <span className="dock-translation__trigger-label">{t("common.translate", { defaultValue: "Translate" })}</span>
          {value && <span className="dock-translation__status-dot" aria-label={value.targetLanguageLabel} />}
        </button>
        {value && (
          <span className="dock-translation__active-language">{value.targetLanguageLabel}</span>
        )}
      </div>

      {open && (
        <div className="dock-translation__panel" role="region" aria-label={t("common.translate", { defaultValue: "Translate" })}>
          <div className="dock-translation__panel-head">
            <div>
              <div className="dock-translation__panel-title">{t("dock.translation.title", { defaultValue: "Translate text" })}</div>
              <div className="dock-translation__panel-subtitle">{t("dock.translation.subtitle", { defaultValue: "Choose a language for the selected song or note." })}</div>
            </div>
            <button
              type="button"
              className="dock-translation__close"
              onClick={() => setOpen(false)}
              aria-label={t("common.close", { defaultValue: "Close" })}
              title={t("common.close", { defaultValue: "Close" })}
            >
              <Icon name="close" size={13} />
            </button>
          </div>

          <div className="dock-translation__field-label">{t("dock.translation.language", { defaultValue: "Translate to" })}</div>
          <div className="dock-translation__language-picker">
            <button
              type="button"
              className="dock-translation__language-trigger"
              onClick={() => setLanguageMenuOpen((current) => !current)}
              aria-expanded={languageMenuOpen}
            >
              <Icon name="language" size={14} />
              <span>{selectedLanguage.label}</span>
              <Icon name={languageMenuOpen ? "expand_less" : "expand_more"} size={14} />
            </button>
            {languageMenuOpen && (
              <div className="dock-translation__language-menu">
                <div className="dock-translation__language-search">
                  <Icon name="search" size={13} />
                  <input
                    value={languageQuery}
                    onChange={(event) => setLanguageQuery(event.target.value)}
                    placeholder={t("dock.translation.searchLanguages", { defaultValue: "Search languages" })}
                    autoFocus
                  />
                </div>
                <div className="dock-translation__language-list">
                  {filteredLanguages.length === 0 ? (
                    <div className="dock-translation__empty">{t("common.noResults", { defaultValue: "No results" })}</div>
                  ) : filteredLanguages.map((language) => (
                    <button
                      type="button"
                      key={language.code}
                      className={`dock-translation__language-option${language.code === targetLanguage ? " dock-translation__language-option--active" : ""}`}
                      onClick={() => handleLanguageSelect(language)}
                    >
                      <span>{language.label}</span>
                      <span className="dock-translation__language-code">{language.code}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <label className="dock-translation__toggle">
            <input
              type="checkbox"
              checked={showBoth}
              onChange={(event) => handleShowBothChange(event.target.checked)}
            />
            <span>{t("dock.translation.showBoth", { defaultValue: "Show original and translation" })}</span>
          </label>

          <div className="dock-translation__actions">
            <button
              type="button"
              className="dock-btn dock-btn--primary dock-translation__action"
              onClick={() => void translateSections(selectedLanguage)}
              disabled={loading || sections.length === 0}
            >
              <Icon name={loading ? "sync" : "translate"} size={13} />
              {loading ? t("common.loading", { defaultValue: "Translating..." }) : t("common.translate", { defaultValue: "Translate" })}
            </button>
            <button
              type="button"
              className="dock-btn dock-btn--ghost dock-translation__action"
              onClick={() => void openGoogleTranslate()}
              disabled={sections.length === 0}
              title={t("dock.translation.openGoogle", { defaultValue: "Open in Google Translate" })}
            >
              <Icon name="open_in_new" size={13} />
              Google Translate
            </button>
          </div>

          {error && <div className="dock-translation__error" role="alert">{error}</div>}
          {value && !loading && !error && (
            <div className="dock-translation__ready">
              <Icon name="check_circle" size={13} />
              {t("dock.translation.ready", { defaultValue: "Translation is shown below the original." })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
