/**
 * BibleVersionLibrary.tsx — App-store style Bible version selector
 *
 * Combines installed version selection and search into a single workflow.
 * Supports search and installed versions.
 * Enforces plan-based bible version limits for free/basic users.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { getDockPlan, showUpgradeModal } from "../dockEntitlement";
import { checkEntitlementSync } from "../../services/entitlementClient";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BibleVersionLibraryProps {
  /** Currently selected translation abbreviation */
  activeTranslation: string;
  /** Available installed translations from parent */
  availableTranslations: Array<{ value: string; label: string; language?: string }>;
  /** Called when user selects a different installed translation */
  onVersionChange: (version: string) => void;
  /** Disable the selector when compare mode is active */
  disabled?: boolean;
}

const LANGUAGE_TAGS: Record<string, string> = {
  akan: "AKA",
  arabic: "ARA",
  english: "",
  french: "FRA",
  francais: "FRA",
  hausa: "HAU",
  igbo: "IBO",
  portuguese: "POR",
  portugues: "POR",
  spanish: "SPA",
  twi: "TWI",
  yoruba: "YOR",
};

const VERSION_PANEL_WIDTH = 140;

function normalizeLanguageText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function getLanguageTag(translation: { value: string; label: string; language?: string }): string {
  const language = normalizeLanguageText(translation.language || "");
  if (language && Object.prototype.hasOwnProperty.call(LANGUAGE_TAGS, language)) {
    return LANGUAGE_TAGS[language];
  }

  const label = normalizeLanguageText(`${translation.value} ${translation.label}`);
  if (label.includes("yoruba") || translation.value === "1B" || translation.value === "2B") return "YOR";
  if (label.includes("french") || label.includes("francais")) return "FRA";
  if (label.includes("portuguese") || label.includes("portugues")) return "POR";
  if (label.includes("spanish") || label.includes("espanol")) return "SPA";
  if (label.includes("igbo")) return "IBO";
  if (label.includes("hausa")) return "HAU";
  if (label.includes("akan")) return "AKA";
  if (label.includes("twi")) return "TWI";
  return "";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BibleVersionLibrary({
  activeTranslation,
  availableTranslations,
  onVersionChange,
  disabled = false,
}: BibleVersionLibraryProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [panelAlign, setPanelAlign] = useState<"left" | "right">("left");
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Plan-based bible version limit ──
  const plan = getDockPlan();
  const { limit: bibleVersionLimit } = checkEntitlementSync("bibleVersions", plan);
  const isUnlimited = bibleVersionLimit === -1;
  const installedCount = availableTranslations.length;
  const hasExceededLimit = !isUnlimited && installedCount > bibleVersionLimit;

  const updatePanelAlignment = useCallback(() => {
    const root = panelRef.current;
    if (!root || typeof window === "undefined") return;
    const rect = root.getBoundingClientRect();
    const viewportPadding = 8;
    const wouldOverflowRight = rect.left + VERSION_PANEL_WIDTH > window.innerWidth - viewportPadding;
    const canOpenLeft = rect.right - VERSION_PANEL_WIDTH >= viewportPadding;
    setPanelAlign(wouldOverflowRight && canOpenLeft ? "right" : "left");
  }, []);

  // ── Close on click outside ──
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // ── Focus search on open ──
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
      updatePanelAlignment();
    }
  }, [isOpen, updatePanelAlignment]);

  useEffect(() => {
    if (!isOpen) return;
    window.addEventListener("resize", updatePanelAlignment);
    return () => window.removeEventListener("resize", updatePanelAlignment);
  }, [isOpen, updatePanelAlignment]);

  useEffect(() => {
    if (disabled) {
      setIsOpen(false);
      setSearchQuery("");
    }
  }, [disabled]);

  // ── Filter translations by search and sort (allowed first, locked after) ──
  const filteredTranslations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = availableTranslations;
    if (query) {
      list = list.filter(
        (tr) =>
          tr.value.toLowerCase().includes(query) ||
          tr.label.toLowerCase().includes(query) ||
          (tr.language ?? "").toLowerCase().includes(query) ||
          getLanguageTag(tr).toLowerCase().includes(query)
      );
    }
    if (!hasExceededLimit || isUnlimited) return list;
    // Sort: allowed versions first, then locked versions
    return [...list].sort((a, b) => {
      const ai = availableTranslations.findIndex((tr) => tr.value === a.value);
      const bi = availableTranslations.findIndex((tr) => tr.value === b.value);
      const aLocked = ai >= bibleVersionLimit;
      const bLocked = bi >= bibleVersionLimit;
      if (aLocked === bLocked) return ai - bi;
      return aLocked ? 1 : -1;
    });
  }, [availableTranslations, searchQuery, hasExceededLimit, isUnlimited, bibleVersionLimit]);

  // ── Find full name for active translation ──
  const activeTranslationInfo = useMemo(() => {
    const inst = availableTranslations.find((t) => t.value === activeTranslation);
    if (inst) return { abbr: inst.value, name: inst.label };
    return { abbr: activeTranslation, name: activeTranslation };
  }, [availableTranslations, activeTranslation]);

  // ── Handle version select ──
  const handleSelectVersion = useCallback(
    (abbr: string, locked: boolean) => {
      if (locked) {
        showUpgradeModal(
          `You've reached your Bible version limit (${bibleVersionLimit}). Upgrade your plan to unlock more versions.`
        );
        return;
      }
      onVersionChange(abbr);
      setIsOpen(false);
    },
    [onVersionChange, bibleVersionLimit]
  );

  return (
    <div
      className={`bible-version-library bible-version-library--align-${panelAlign}${isOpen ? " bible-version-library--open" : ""}`}
      ref={panelRef}
    >
      {/* Trigger Button */}
      <button
        className="bible-version-library__trigger"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        aria-label={t("bible.selectBibleVersion")}
        aria-expanded={isOpen}
        title={disabled ? t("bible.compareModeActive", "Disabled while compare mode is active") : t("bible.selectBibleVersion")}>
        <span className="bible-version-library__trigger-abbr">
          {activeTranslationInfo.abbr}
        </span>
        <Icon name={isOpen ? "arrow_drop_up" : "arrow_drop_down"} size={16} />
      </button>

      {/* Panel */}
      {isOpen && (
        <div className="bible-version-library__panel">
          {/* Search */}
          <div className="bible-version-library__search">
            <Icon name="search" size={14} className="bible-version-library__search-icon" />
            <input
              ref={searchInputRef}
              type="text"
              className="bible-version-library__search-input"
              placeholder={t("bible.searchVersions")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label={t("bible.searchVersions")}
            />
            {searchQuery && (
              <button
                className="bible-version-library__search-clear"
                onClick={() => setSearchQuery("")}
                aria-label={t("common.clear")}
                title="Close">
                <Icon name="close" size={12} />
              </button>
            )}
          </div>

          {/* Content */}
          <div className="bible-version-library__content">
            {/* Installed Section */}
            {filteredTranslations.length > 0 && (
              <div className="bible-version-library__section">
                <div className="bible-version-library__section-header">
                  <span>{t("bible.installed")}</span>
                  {!isUnlimited && (
                    <span className="bible-version-library__usage">
                      <span className="bible-version-library__usage-count">
                        {Math.min(installedCount, bibleVersionLimit)}
                      </span>
                      <span className="bible-version-library__usage-sep">/</span>
                      <span className="bible-version-library__usage-limit">
                        {bibleVersionLimit}
                      </span>
                    </span>
                  )}
                </div>
                <div className="bible-version-library__list">
                  {filteredTranslations.map((translation) => {
                    const origIndex = availableTranslations.findIndex(
                      (tr) => tr.value === translation.value
                    );
                    const locked =
                      hasExceededLimit && !isUnlimited && origIndex >= bibleVersionLimit;
                    const isActive = translation.value === activeTranslation;
                    const displayName =
                      translation.label.trim() && translation.label !== translation.value
                        ? translation.label
                        : t("bible.installedVersion", "Installed version");
                    const languageTag = getLanguageTag(translation);

                    return (
                      <button
                        key={translation.value}
                        className={[
                          "bible-version-library__row",
                          "bible-version-library__row--installed",
                          isActive && "bible-version-library__row--active",
                          locked && "bible-version-library__row--locked",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          handleSelectVersion(translation.value, locked)
                        }
                        aria-label={`${translation.value}${languageTag ? ` ${languageTag}` : ""}${displayName ? `, ${displayName}` : ""}`}
                        title={locked ? "Upgrade to unlock" : undefined}>
                        <div className="bible-version-library__row-info">
                          <span className="bible-version-library__row-code">
                            {translation.value}
                          </span>
                          {languageTag && (
                            <span className="bible-version-library__row-lang">
                              {languageTag}
                            </span>
                          )}
                        </div>
                        {locked ? (
                          <span className="bible-version-library__row-premium">
                            <Icon name="lock" size={14} />
                          </span>
                        ) : isActive ? (
                          <Icon
                            name="check"
                            size={16}
                            className="bible-version-library__row-check"
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredTranslations.length === 0 && (
              <div className="bible-version-library__empty">
                <Icon name="search_off" size={20} />
                <span>{t("bible.noVersionsFound")}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
