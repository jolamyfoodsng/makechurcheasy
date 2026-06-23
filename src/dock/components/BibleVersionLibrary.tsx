/**
 * BibleVersionLibrary.tsx — App-store style Bible version selector
 *
 * Combines version selection and downloads into a single workflow.
 * Supports search, installed versions, and available online versions.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../DockIcon";

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
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function BibleVersionLibrary({
  activeTranslation,
  availableTranslations,
  onVersionChange,
  onTranslationsChanged: _onTranslationsChanged,
}: BibleVersionLibraryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

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

  // ── Filter translations by search ──
  const filteredTranslations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return availableTranslations;
    return availableTranslations.filter(
      (t) =>
        t.value.toLowerCase().includes(query) ||
        t.label.toLowerCase().includes(query)
    );
  }, [availableTranslations, searchQuery]);

  // ── Find full name for active translation ──
  const activeTranslationInfo = useMemo(() => {
    const inst = availableTranslations.find((t) => t.value === activeTranslation);
    if (inst) return { abbr: inst.value, name: inst.label };
    return { abbr: activeTranslation, name: activeTranslation };
  }, [availableTranslations, activeTranslation]);

  // ── Handle version select ──
  const handleSelectVersion = useCallback(
    (abbr: string) => {
      onVersionChange(abbr);
      setIsOpen(false);
    },
    [onVersionChange]
  );

  return (
    <div className="bible-version-library" ref={panelRef}>
      {/* Trigger Button */}
      <button
        className="bible-version-library__trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Select Bible version"
        aria-expanded={isOpen}
      >
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
              placeholder="Search versions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search Bible versions"
            />
            {searchQuery && (
              <button
                className="bible-version-library__search-clear"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
              >
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
                  INSTALLED
                </div>
                <div className="bible-version-library__list">
                  {filteredTranslations.map((translation) => (
                    <button
                      key={translation.value}
                      className={`bible-version-library__row${translation.value === activeTranslation ? " bible-version-library__row--active" : ""
                        }`}
                      onClick={() => handleSelectVersion(translation.value)}
                    >
                      <div className="bible-version-library__row-info">
                        <span className="bible-version-library__row-abbr">
                          {translation.value}
                        </span>
                        {/* <span className="bible-version-library__row-name">
                          {translation.label}
                        </span> */}
                      </div>
                      {translation.value === activeTranslation && (
                        <Icon name="check" size={16} className="bible-version-library__row-check" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {filteredTranslations.length === 0 && (
              <div className="bible-version-library__empty">
                <Icon name="search_off" size={20} />
                <span>No versions found</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
