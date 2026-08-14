import { useTranslation } from "react-i18next";
import type { ComparePassageDraft, ComparePassageNavigation, ComparePassagePreview } from "../bibleMultiPassage";
import Icon from "../DockIcon";

interface TranslationOption {
  value: string;
  label: string;
}

interface Props {
  compareEnabled: boolean;
  drafts: ComparePassageDraft[];
  previews: ComparePassagePreview[];
  activeIndex: number;
  navigationMode: ComparePassageNavigation;
  availableTranslations: TranslationOption[];
  onToggleCompare: (enabled: boolean) => void;
  onDraftReferenceChange: (id: string, value: string) => void;
  onDraftTranslationChange: (id: string, value: string) => void;
  onActiveIndexChange: (index: number) => void;
  onNavigationModeChange: (mode: ComparePassageNavigation) => void;
  onAddPassage: () => void;
  onRemovePassage: (id: string) => void;
  onApply: () => void;
}

export default function DockBibleComparePassageControls({
  compareEnabled,
  drafts,
  previews,
  activeIndex,
  navigationMode,
  availableTranslations,
  onToggleCompare,
  onDraftReferenceChange,
  onDraftTranslationChange,
  onActiveIndexChange,
  onNavigationModeChange,
  onAddPassage,
  onRemovePassage,
  onApply,
}: Props) {
  const { t } = useTranslation();
  const canApply = compareEnabled
    && drafts.length >= 2
    && previews.length === drafts.length
    && previews.every((preview) => Boolean(preview.parsed && preview.text && !preview.loading && !preview.error));

  return (
    <>
      <div className="dock-bible-compare-popover__section">
        <div className="dock-bible-compare-popover__toggle-row">
          <div className="dock-bible-compare-popover__toggle-copy">
            <div className="dock-bible-compare-popover__label">
              {t("dock.compare.enablePassages", "Enable Compare Passages")}
            </div>
            <div className="dock-bible-compare-popover__hint">
              {t("dock.compare.passagesHint", "Show different Bible references together.")}
            </div>
          </div>
          <button
            type="button"
            className={`dtb-toggle${compareEnabled ? " dtb-toggle--on" : ""}`}
            onClick={() => onToggleCompare(!compareEnabled)}
            role="switch"
            aria-checked={compareEnabled}
            aria-label={t("dock.compare.enablePassages", "Enable Compare Passages")}
          >
            <span className="dtb-toggle__knob" />
          </button>
        </div>
      </div>

      <div className="dock-bible-compare-popover__row">
        <label className="dock-bible-compare-popover__label" htmlFor="dock-bible-active-passage">
          {t("dock.compare.activePassage", "Active passage")}
        </label>
        <select
          id="dock-bible-active-passage"
          className="dock-select dock-bible-compare-popover__select"
          value={activeIndex}
          onChange={(event) => onActiveIndexChange(Number(event.target.value))}
          disabled={!compareEnabled}
        >
          {drafts.map((draft, index) => (
            <option key={draft.id} value={index}>
              {t("dock.compare.passageNumber", "Passage {{number}}", { number: index + 1 })}
              {draft.reference.trim() ? ` — ${draft.reference.trim()}` : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="dock-bible-compare-popover__row">
        <label className="dock-bible-compare-popover__label" htmlFor="dock-bible-passage-navigation">
          {t("dock.compare.navigation", "Navigation")}
        </label>
        <select
          id="dock-bible-passage-navigation"
          className="dock-select dock-bible-compare-popover__select"
          value={navigationMode}
          onChange={(event) => onNavigationModeChange(event.target.value as ComparePassageNavigation)}
          disabled={!compareEnabled}
        >
          <option value="linked">{t("dock.compare.linkedNavigation", "Linked — move all passages")}</option>
          <option value="independent">{t("dock.compare.independentNavigation", "Independent — move active passage")}</option>
        </select>
      </div>

      <div className="dock-bible-compare-popover__passages" aria-label={t("dock.compare.passages", "Passages")}>
        {drafts.map((draft, index) => {
          const preview = previews[index];
          const hasInvalidReference = Boolean(draft.reference.trim()) && preview && !preview.parsed && !preview.loading;
          return (
            <div
              key={draft.id}
              className={`dock-bible-compare-popover__passage${activeIndex === index ? " dock-bible-compare-popover__passage--active" : ""}`}
            >
              <div className="dock-bible-compare-popover__passage-header">
                <span className="dock-bible-compare-popover__label">
                  {t("dock.compare.passageNumber", "Passage {{number}}", { number: index + 1 })}
                </span>
                {drafts.length > 2 && (
                  <button
                    type="button"
                    className="dock-bible-compare-popover__remove"
                    onClick={() => onRemovePassage(draft.id)}
                    disabled={!compareEnabled}
                    aria-label={t("dock.compare.removePassage", "Remove passage")}
                    title={t("dock.compare.removePassage", "Remove passage")}
                  >
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
              <input
                className="dock-input dock-bible-compare-popover__input"
                value={draft.reference}
                onChange={(event) => onDraftReferenceChange(draft.id, event.target.value)}
                onFocus={() => onActiveIndexChange(index)}
                placeholder={index === 0 ? "John 3:16" : "Hebrews 4:15"}
                aria-label={t("dock.compare.referenceInput", "Passage {{number}} reference", { number: index + 1 })}
                disabled={!compareEnabled}
              />
              <select
                className="dock-select dock-bible-compare-popover__select"
                value={draft.translation}
                onChange={(event) => onDraftTranslationChange(draft.id, event.target.value)}
                disabled={!compareEnabled}
                aria-label={t("dock.compare.passageTranslation", "Passage {{number}} translation", { number: index + 1 })}
              >
                {availableTranslations.map((translation) => (
                  <option key={translation.value} value={translation.value}>{translation.label}</option>
                ))}
              </select>
              {hasInvalidReference && (
                <div className="dock-bible-compare-popover__field-error">
                  {t("dock.compare.invalidReference", "Enter a reference like John 3:16.")}
                </div>
              )}
              {preview?.loading && (
                <div className="dock-bible-compare-popover__hint">{t("common.loading")}</div>
              )}
              {preview?.error && (
                <div className="dock-bible-compare-popover__field-error">{preview.error}</div>
              )}
            </div>
          );
        })}
      </div>

      <button
        type="button"
        className="dock-bible-compare-popover__add"
        onClick={onAddPassage}
        disabled={!compareEnabled || drafts.length >= 3}
      >
        <Icon name="add" size={13} />
        {t("dock.compare.addPassage", "Add passage")}
      </button>

      <div className="dock-bible-compare-popover__hint dock-bible-compare-popover__hint--block">
        {t("dock.compare.passageApplyHint", "Use the active passage selector in the Bible reader, then Apply to preview and present all passages.")}
      </div>

      <button
        type="button"
        className="dock-bible-compare-popover__send"
        onClick={onApply}
        disabled={!canApply}
        title={t("dock.compare.applyPassages", "Apply and present passages")}
      >
        <Icon name="cast" size={13} />
        {t("dock.compare.applyPassages", "Apply & Present")}
      </button>
    </>
  );
}
