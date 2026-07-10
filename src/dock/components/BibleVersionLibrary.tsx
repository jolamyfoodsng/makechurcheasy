/**
 * BibleVersionLibrary.tsx — App-store style Bible version selector
 *
 * Combines version selection and downloads into a single workflow.
 * Supports search, installed versions, and available online versions.
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
  availableTranslations: Array<{ value: string; label: string }>;
  /** Called when user selects a different installed translation */
  onVersionChange: (version: string) => void;
  /** Called when translations change so parent can refresh */
  onTranslationsChanged?: () => void;
  /** Disable the selector when compare mode is active */
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BibleVersionLibrary({
  activeTranslation,
  availableTranslations,
  onVersionChange,
  onTranslationsChanged: _onTranslationsChanged,
  disabled = false,
}: BibleVersionLibraryProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Plan-based bible version limit ──
  const plan = getDockPlan();
  const { limit: bibleVersionLimit } = checkEntitlementSync("bibleVersions", plan);
  const isUnlimited = bibleVersionLimit === -1;
  const installedCount = availableTranslations.length;
  const hasExceededLimit = !isUnlimited && installedCount > bibleVersionLimit;

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
    }
  }, [isOpen]);

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
          tr.label.toLowerCase().includes(query)
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
    <div className="bible-version-library" ref={panelRef}>
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

                    return (
                      <button
                        key={translation.value}
                        className={[
                          "bible-version-library__row",
                          isActive && "bible-version-library__row--active",
                          locked && "bible-version-library__row--locked",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        onClick={() =>
                          handleSelectVersion(translation.value, locked)
                        }
                        title={locked ? "Upgrade to unlock" : "Confirm"}>
                        <div className="bible-version-library__row-info">
                          <span className="bible-version-library__row-abbr">
                            {translation.value}
                          </span>
                          {/* <span className="bible-version-library__row-name">
                            {translation.label}
                          </span> */}
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
