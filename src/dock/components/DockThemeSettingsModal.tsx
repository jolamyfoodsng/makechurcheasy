import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { flushSync } from "react-dom";
import type { BibleTheme } from "../../bible/types";
import Icon from "../DockIcon";
import BackgroundPickerCard, { type BibleReferenceFormat } from "./BackgroundPickerCard";
import type { DockBackgroundPreset } from "../dockConsoleTheme";
import type { DockFullscreenQuickThemeSettings } from "./DockFullscreenThemeQuickSettings";

export interface DockThemeSettingsSaveContext {
  backgroundPreset?: DockBackgroundPreset | null;
  selectedTheme?: BibleTheme | null;
}

interface Props {
  selectedThemeId: string | null;
  onSelect: (theme: BibleTheme) => void;
  allowedCategories?: Array<NonNullable<BibleTheme["category"]>>;
  sampleText?: string;
  sampleReference?: string;
  quickSettings: DockFullscreenQuickThemeSettings;
  defaultQuickSettings?: DockFullscreenQuickThemeSettings;
  onQuickSettingsSave: (
    settings: DockFullscreenQuickThemeSettings,
    context?: DockThemeSettingsSaveContext,
  ) => void | Promise<void>;
  onSaveFeedback?: (message: string) => void;
  resolveThemeQuickSettings?: (theme: BibleTheme) => DockFullscreenQuickThemeSettings;
  title: string;
  subtitle: string;
  /** When provided, modal is externally controlled */
  isOpen?: boolean;
  onClose?: () => void;
  onBackgroundPresetChange?: (preset: DockBackgroundPreset) => void;
  /** Overlay mode — shows lower-third positioning controls in LT mode */
  overlayMode?: "fullscreen" | "lower-third";
  /** Show the Reference section in BackgroundPickerCard (only for Bible tab) */
  showReferences?: boolean;
  /** Bible-only reference display preferences surfaced in the Reference sub-tab */
  referenceFormat?: BibleReferenceFormat;
  referenceVersionVisible?: boolean;
  referenceTranslation?: string;
  onReferenceFormatChange?: (format: BibleReferenceFormat) => void;
  onReferenceVersionVisibleChange?: (visible: boolean) => void;
  /** Active display mode — controls whether Compare Layout section is visible */
  displayMode?: "single" | "compare";
  initialTab?: "text" | "layout" | "background" | "compare";
  /** Keeps BackgroundPickerCard local styles separate per dock section */
  storageScope?: "bible" | "worship" | "notes" | "global";
  /** When true and displayMode is "compare", BackgroundPickerCard shows only the Compare tab */
  hideBackgroundOnCompare?: boolean;
}

type StudioView = "closed" | "settings";

function getThemeSettingsForMode(
  theme: BibleTheme,
  overlayMode: NonNullable<Props["overlayMode"]>,
) {
  const variant = overlayMode === "lower-third"
    ? theme.variants?.lowerThird
    : theme.variants?.fullscreen;
  return variant?.settings ?? theme.settings;
}

function resolveFallbackThemeQuickSettings(
  theme: BibleTheme,
  overlayMode: NonNullable<Props["overlayMode"]>,
  current: DockFullscreenQuickThemeSettings,
): DockFullscreenQuickThemeSettings {
  const settings = getThemeSettingsForMode(theme, overlayMode);
  return {
    ...current,
    ...settings,
    backgroundType: "theme",
    backgroundImage: settings.backgroundImage ?? "",
    backgroundImageFilePath: settings.backgroundImageFilePath ?? "",
    backgroundPattern: settings.backgroundPattern ?? "",
    backgroundVideo: settings.backgroundVideo ?? "",
    backgroundVideoFilePath: settings.backgroundVideoFilePath ?? "",
    backgroundOpacity: settings.backgroundOpacity ?? current.backgroundOpacity,
    backgroundColor: settings.backgroundColor || current.backgroundColor,
    backgroundColorEnd: settings.backgroundColorEnd ?? current.backgroundColorEnd,
    bgGradientAngle: settings.bgGradientAngle ?? current.bgGradientAngle,
  };
}

/* ── Main Component ── */
export default function DockThemeSettingsModal({
  selectedThemeId,
  onSelect,
  allowedCategories,
  sampleText = "Faith",
  sampleReference = "John 3:16",
  quickSettings,
  defaultQuickSettings,
  onQuickSettingsSave,
  onSaveFeedback,
  resolveThemeQuickSettings,
  title,
  subtitle,
  isOpen: externalIsOpen,
  onClose: externalOnClose,
  onBackgroundPresetChange,
  overlayMode = "fullscreen",
  showReferences = true,
  referenceFormat,
  referenceVersionVisible = false,
  referenceTranslation = "KJV",
  onReferenceFormatChange,
  onReferenceVersionVisibleChange,
  displayMode = "single",
  initialTab = "text",
  storageScope = "global",
  hideBackgroundOnCompare = false,
}: Props) {
  const { t } = useTranslation();
  const [internalView, setInternalView] = useState<StudioView>("closed");
  const view = externalIsOpen !== undefined
    ? (externalIsOpen ? (internalView === "closed" ? "settings" : internalView) : "closed")
    : internalView;
  const setView = useCallback((v: StudioView) => {
    if (externalIsOpen !== undefined && v === "closed") {
      externalOnClose?.();
      return;
    }
    setInternalView(v);
  }, [externalIsOpen, externalOnClose]);
  const [draftSettings, setDraftSettings] = useState(quickSettings);
  const [draftSelectedThemeId, setDraftSelectedThemeId] = useState<string | null>(selectedThemeId);
  const [draftSelectedTheme, setDraftSelectedTheme] = useState<BibleTheme | null>(null);
  const draftSettingsRef = useRef(quickSettings);
  const draftSelectedThemeRef = useRef<BibleTheme | null>(null);
  const pendingBackgroundPresetRef = useRef<DockBackgroundPreset | null>(null);
  const [saving, setSaving] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(view !== "closed");
  const originalSettingsRef = useRef(quickSettings);

  useEffect(() => {
    const isOpen = view !== "closed";
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (isOpen && !wasOpen) {
      originalSettingsRef.current = quickSettings;
      draftSettingsRef.current = quickSettings;
      setDraftSettings(quickSettings);
      setDraftSelectedThemeId(selectedThemeId);
      draftSelectedThemeRef.current = null;
      setDraftSelectedTheme(null);
      pendingBackgroundPresetRef.current = null;
    }
  }, [view, quickSettings, selectedThemeId]);

  const updateDraft = useCallback(
    (updater: (prev: DockFullscreenQuickThemeSettings) => DockFullscreenQuickThemeSettings) => {
      const next = updater(draftSettingsRef.current);
      draftSettingsRef.current = next;
      setDraftSettings(next);
    },
    [],
  );

  useEffect(() => {
    if (view === "closed") return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setView("closed");
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [view]);

  const openSettings = useCallback(() => {
    draftSettingsRef.current = quickSettings;
    setDraftSettings(quickSettings);
    setDraftSelectedThemeId(selectedThemeId);
    draftSelectedThemeRef.current = null;
    setDraftSelectedTheme(null);
    pendingBackgroundPresetRef.current = null;
    setView("settings");
  }, [quickSettings, selectedThemeId]);

  const handleThemeSelect = useCallback((theme: BibleTheme) => {
    draftSelectedThemeRef.current = theme;
    setDraftSelectedTheme(theme);
    setDraftSelectedThemeId(theme.id);
    pendingBackgroundPresetRef.current = "theme";
    const nextSettings = resolveThemeQuickSettings?.(theme)
      ?? resolveFallbackThemeQuickSettings(theme, overlayMode, draftSettingsRef.current);
    draftSettingsRef.current = nextSettings;
    setDraftSettings(nextSettings);
  }, [overlayMode, resolveThemeQuickSettings]);

  const handleSave = useCallback(() => {
    const nextSettings = { ...draftSettingsRef.current };
    const nextTheme = draftSelectedThemeRef.current;
    const nextPreset = pendingBackgroundPresetRef.current;
    setSaving(true);
    flushSync(() => setView("closed"));
    const commit = () => {
      try {
        if (nextTheme) {
          onSelect(nextTheme);
        }
        if (nextPreset) {
          onBackgroundPresetChange?.(nextPreset);
        }
      } catch (error) {
        console.warn("[DockThemeSettingsModal] pre-save apply failed:", error);
      }

      void Promise.resolve(onQuickSettingsSave(nextSettings, {
        backgroundPreset: nextPreset,
        selectedTheme: nextTheme,
      }))
        .then(() => {
          onSaveFeedback?.(t("dock.feedback.bibleSettingsSaved", "Bible theme settings saved."));
        })
        .catch((error) => console.warn("[DockThemeSettingsModal] quick settings save failed:", error))
        .finally(() => setSaving(false));
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(commit);
      return;
    }
    window.setTimeout(commit, 0);
  }, [draftSelectedTheme, draftSettings, onBackgroundPresetChange, onQuickSettingsSave, onSaveFeedback, onSelect, t]);

  const handleReset = useCallback(() => {
    const nextSettings = defaultQuickSettings ?? originalSettingsRef.current;
    draftSelectedThemeRef.current = null;
    setDraftSelectedTheme(null);
    updateDraft(() => nextSettings);
  }, [updateDraft, defaultQuickSettings]);

  /* ── Render ── */
  return (
    <div className="dtb-studio">
      {externalIsOpen === undefined && (
        <button
          type="button"
          className="dtb-studio__trigger dtb-studio__trigger--labeled"
          onClick={openSettings}
          aria-haspopup="dialog"
          aria-label={t('worship.quickEdits')}
          title={t('worship.quickEdits')}
        >
          <Icon name="edit" size={13} />
          <span>{t('worship.quickEdits')}</span>
        </button>
      )}

      {view !== "closed" && (
        <div className="dtb-studio__backdrop" onClick={() => setView("closed")} role="presentation">
          <div
            className="dtb-studio__modal"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="dtb-studio__header">
              <span className="dtb-studio__header-label">{title || subtitle}</span>
              <button
                type="button"
                className="dtb-studio__close dtb-studio__close--strong"
                onClick={() => setView("closed")}
                aria-label={t('common.close')}
                title={t('common.close')}>
                <Icon name="close" size={18} />
              </button>
            </div>

            {/* ── Settings View ── */}
            {view === "settings" && (
              <div className="dtb-studio__settings-view dtb-studio__settings-view--picker">

                {/* ═══ Background Section ═══ */}
                <BackgroundPickerCard
                  quickSettings={draftSettings}
                  onQuickSettingsChange={(updater) => updateDraft(updater)}
                  onQuickSettingsSave={(settings) => onQuickSettingsSave(settings)}
                  onSaveFeedback={onSaveFeedback}
                  selectedThemeId={draftSelectedThemeId}
                  onThemeSelect={handleThemeSelect}
                  allowedCategories={allowedCategories}
                  sampleText={sampleText}
                  sampleReference={sampleReference}
                  onBackgroundPresetChange={(preset) => {
                    pendingBackgroundPresetRef.current = preset;
                  }}
                  showReferences={showReferences}
                  referenceFormat={referenceFormat}
                  referenceVersionVisible={referenceVersionVisible}
                  referenceTranslation={referenceTranslation}
                  onReferenceFormatChange={onReferenceFormatChange}
                  onReferenceVersionVisibleChange={onReferenceVersionVisibleChange}
                  overlayMode={overlayMode}
                  displayMode={displayMode}
                  initialTab={initialTab}
                  storageScope={storageScope}
                  hideBackgroundOnCompare={hideBackgroundOnCompare}
                />
                {/* Spacer for sticky footer */}
                <div className="dtb-studio__spacer" />
              </div>
            )}

            {/* ── Sticky Footer ── */}
            {view === "settings" && (
              <div className="dtb-studio__footer">
                <button
                  type="button"
                  className="dtb-studio__footer-btn dtb-studio__footer-btn--reset"
                  onClick={handleReset}
                  title={t('common.reset')}>
                  {t('common.reset')}
                </button>
                <button
                  type="button"
                  className="dtb-studio__footer-btn dtb-studio__footer-btn--save"
                  onClick={handleSave}
                  disabled={saving}
                  title={t('worship.saving')}>
                  {saving ? t('worship.saving') : t('worship.saveChanges')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
