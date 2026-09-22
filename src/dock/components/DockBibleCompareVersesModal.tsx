/**
 * DockBibleCompareVersesModal.tsx
 *
 * Modal for comparing verses across multiple installed Bible translations.
 * Displays up to 3 translation cards with verse navigation, translation selectors,
 * and projection buttons for single and dual compare mode.
 * Fully responsive for desktop, sidebar docks, and ultra-short OBS docks (100px, 200px, 300px).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import { getVerse, getVerseCount } from "../../bible/bibleData";
import { bookAbbrev } from "../dockTypes";
import type { BibleTranslationOption } from "../bibleTranslationAvailability";

export interface DockBibleCompareVersesModalProps {
  isOpen: boolean;
  onClose: () => void;
  book: string;
  chapter: number;
  initialVerse: number;
  totalVerses?: number;
  availableTranslations: BibleTranslationOption[];
  activeTranslation: string;
  secondaryTranslation?: string;
  onProjectSingle: (book: string, chapter: number, verse: number, translation: string) => void;
  onProjectCompare: (book: string, chapter: number, verse: number, translationA: string, translationB: string) => void;
}

/**
 * Resolves the default 3 translation slots based on installed translations.
 * Prefers activeTranslation for slot 0, secondaryTranslation for slot 1,
 * and the next distinct installed translation for slot 2.
 */
export function resolveInitialCompareSlots(
  available: readonly BibleTranslationOption[],
  active: string,
  secondary?: string,
): [string, string, string] {
  const installedUpper = available.map((t) => t.value.trim().toUpperCase()).filter(Boolean);
  const activeUpper = active?.trim().toUpperCase() || "KJV";
  const secUpper = secondary?.trim().toUpperCase();

  // Slot 0: active translation if installed, else first installed
  const slot0 = installedUpper.includes(activeUpper) ? activeUpper : (installedUpper[0] ?? "KJV");

  // Slot 1: secondary if installed and distinct from slot0, else candidate distinct from slot0
  let slot1 = "";
  if (secUpper && installedUpper.includes(secUpper) && secUpper !== slot0) {
    slot1 = secUpper;
  } else {
    const candidate = installedUpper.find((t) => t !== slot0);
    slot1 = candidate ?? slot0;
  }

  // Slot 2: first candidate distinct from slot0 and slot1
  let slot2 = "";
  const candidate2 = installedUpper.find((t) => t !== slot0 && t !== slot1);
  if (candidate2) {
    slot2 = candidate2;
  } else {
    slot2 = installedUpper.find((t) => t !== slot0) ?? slot0;
  }

  return [slot0, slot1, slot2];
}

export function DockBibleCompareVersesModal({
  isOpen,
  onClose,
  book,
  chapter,
  initialVerse,
  totalVerses = 30,
  availableTranslations,
  activeTranslation,
  secondaryTranslation,
  onProjectSingle,
  onProjectCompare,
}: DockBibleCompareVersesModalProps) {
  const { t } = useTranslation();

  const [viewportHeight, setViewportHeight] = useState(() => (typeof window !== "undefined" ? window.innerHeight : 600));
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 800));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setViewportHeight(window.innerHeight);
      setViewportWidth(window.innerWidth);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [isOpen]);

  const isShort = viewportHeight <= 420;
  const isUltraShort = viewportHeight <= 260;
  const isNanoHeight = viewportHeight <= 145;
  const isNarrow = viewportWidth <= 420;
  const isUltraNarrow = viewportWidth <= 280;

  const [currentVerse, setCurrentVerse] = useState<number>(() => Math.max(1, initialVerse || 1));
  const [exactVerseCount, setExactVerseCount] = useState<number>(() => Math.max(totalVerses || 30, 1));
  const [slotTranslations, setSlotTranslations] = useState<[string, string, string]>(() =>
    resolveInitialCompareSlots(availableTranslations, activeTranslation, secondaryTranslation),
  );
  const [selectedCompareSlots, setSelectedCompareSlots] = useState<[number, number]>([0, 1]);
  const [verseTexts, setVerseTexts] = useState<Record<number, { text: string; loading: boolean }>>({
    0: { text: "", loading: true },
    1: { text: "", loading: true },
    2: { text: "", loading: true },
  });

  // Fetch exact verse count for book/chapter
  useEffect(() => {
    if (!isOpen || !book || !chapter) return;
    let cancelled = false;
    getVerseCount(book, chapter, (activeTranslation || "KJV") as any)
      .then((count) => {
        if (!cancelled && count > 0) {
          setExactVerseCount(count);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, book, chapter, activeTranslation, totalVerses]);

  // Re-sync on open
  useEffect(() => {
    if (isOpen) {
      setCurrentVerse(Math.max(1, initialVerse || 1));
      if (totalVerses && totalVerses > 0) {
        setExactVerseCount(totalVerses);
      }
      setSlotTranslations(resolveInitialCompareSlots(availableTranslations, activeTranslation, secondaryTranslation));
      setSelectedCompareSlots([0, 1]);
    }
  }, [isOpen, initialVerse, totalVerses, availableTranslations, activeTranslation, secondaryTranslation]);

  // Load verse text for all 3 slots
  useEffect(() => {
    if (!isOpen || !book || !chapter || !currentVerse) return;

    let cancelled = false;

    slotTranslations.forEach((translation, slotIdx) => {
      setVerseTexts((prev) => ({
        ...prev,
        [slotIdx]: { text: prev[slotIdx]?.text || "", loading: true },
      }));

      getVerse(book, chapter, currentVerse, translation as any)
        .then((verse) => {
          if (cancelled) return;
          setVerseTexts((prev) => ({
            ...prev,
            [slotIdx]: {
              text: verse?.text || t("bible.verseNotFound", "(Verse text unavailable)"),
              loading: false,
            },
          }));
        })
        .catch((err) => {
          if (cancelled) return;
          console.warn(`[DockBibleCompareVersesModal] Failed to load ${translation} ${book} ${chapter}:${currentVerse}`, err);
          setVerseTexts((prev) => ({
            ...prev,
            [slotIdx]: {
              text: t("bible.verseNotFound", "(Verse text unavailable)"),
              loading: false,
            },
          }));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, book, chapter, currentVerse, slotTranslations, t]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const handlePrevVerse = useCallback(() => {
    setCurrentVerse((v) => Math.max(1, v - 1));
  }, []);

  const handleNextVerse = useCallback(() => {
    setCurrentVerse((v) => Math.min(Math.max(exactVerseCount, 1), v + 1));
  }, [exactVerseCount]);

  const handleVerseSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = Number(e.target.value);
    if (v > 0) setCurrentVerse(v);
  }, []);

  const handleSlotTranslationChange = useCallback((slotIdx: number, newTranslation: string) => {
    setSlotTranslations((prev) => {
      const next = [...prev] as [string, string, string];
      next[slotIdx] = newTranslation.trim().toUpperCase();
      return next;
    });
  }, []);

  const toggleCompareSlot = useCallback((slotIdx: number) => {
    setSelectedCompareSlots((prev) => {
      if (prev.includes(slotIdx)) {
        const remaining = prev.filter((idx) => idx !== slotIdx);
        if (remaining.length === 1) {
          const other = [0, 1, 2].find((i) => i !== slotIdx && !remaining.includes(i));
          return other !== undefined ? [remaining[0], other] as [number, number] : prev;
        }
        return prev;
      } else {
        return [prev[1] ?? 0, slotIdx] as [number, number];
      }
    });
  }, []);

  const compareTransA = slotTranslations[selectedCompareSlots[0]] || slotTranslations[0];
  const compareTransB = slotTranslations[selectedCompareSlots[1]] || slotTranslations[1];

  const handleProjectCompare = useCallback(() => {
    const transA = slotTranslations[selectedCompareSlots[0]] || slotTranslations[0];
    const transB = slotTranslations[selectedCompareSlots[1]] || slotTranslations[1];
    onProjectCompare(book, chapter, currentVerse, transA, transB);
  }, [book, chapter, currentVerse, onProjectCompare, selectedCompareSlots, slotTranslations]);

  const verseOptions = useMemo(() => {
    const count = Math.max(exactVerseCount, 1);
    const options: number[] = [];
    for (let i = 1; i <= count; i++) {
      options.push(i);
    }
    return options;
  }, [exactVerseCount]);

  if (!isOpen || typeof document === "undefined") return null;

  const modalClassNames = [
    "dock-bible-compare-modal",
    isShort ? "dock-bible-compare-modal--short" : "",
    isUltraShort ? "dock-bible-compare-modal--ultra-short" : "",
    isNanoHeight ? "dock-bible-compare-modal--nano" : "",
    isNarrow ? "dock-bible-compare-modal--narrow" : "",
    isUltraNarrow ? "dock-bible-compare-modal--ultra-narrow" : "",
  ].filter(Boolean).join(" ");

  const backdropClassNames = [
    "dock-bible-compare-modal-backdrop",
    isShort ? "dock-bible-compare-modal-backdrop--short" : "",
    isUltraShort ? "dock-bible-compare-modal-backdrop--ultra-short" : "",
    isNanoHeight ? "dock-bible-compare-modal-backdrop--nano" : "",
    isNarrow ? "dock-bible-compare-modal-backdrop--narrow" : "",
  ].filter(Boolean).join(" ");

  const shortBookName = bookAbbrev(book) || book;

  return createPortal(
    <div
      className={backdropClassNames}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="dock-bible-compare-modal-title"
    >
      <div
        className={modalClassNames}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Strictly single row with flex-wrap: nowrap */}
        <div className="dock-bible-compare-modal__header">
          <div className="dock-bible-compare-modal__title-group">
            <Icon name="compare_arrows" size={isNanoHeight ? 12 : isShort ? 14 : 18} className="dock-bible-compare-modal__icon" />
            <h2 id="dock-bible-compare-modal-title" className="dock-bible-compare-modal__title" title={`${book} ${chapter}:${currentVerse}`}>
              {isNarrow ? shortBookName : book} {chapter}:{currentVerse}
            </h2>
          </div>

          {/* Verse Selector & Navigation */}
          <div className="dock-bible-compare-modal__verse-nav">
            <button
              type="button"
              className="dock-bible-compare-modal__verse-nav-btn"
              onClick={handlePrevVerse}
              disabled={currentVerse <= 1}
              aria-label={t("common.previous", "Previous Verse")}
              title={t("common.previous", "Previous Verse")}
            >
              <Icon name="chevron_left" size={isNanoHeight ? 12 : isShort ? 14 : 16} />
            </button>
            <select
              className="dock-bible-compare-modal__verse-select"
              value={currentVerse}
              onChange={handleVerseSelect}
              aria-label={t("bible.selectVerse", "Select Verse")}
            >
              {verseOptions.map((v) => (
                <option key={v} value={v}>
                  {isNarrow ? `v.${v}` : `${shortBookName} ${chapter}:${v}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="dock-bible-compare-modal__verse-nav-btn"
              onClick={handleNextVerse}
              disabled={currentVerse >= exactVerseCount}
              aria-label={t("common.next", "Next Verse")}
              title={t("common.next", "Next Verse")}
            >
              <Icon name="chevron_right" size={isNanoHeight ? 12 : isShort ? 14 : 16} />
            </button>
          </div>

          {/* Close button */}
          <button
            type="button"
            className="dock-bible-compare-modal__close-btn"
            onClick={onClose}
            aria-label={t("common.close", "Close")}
            title={t("common.close", "Close")}
          >
            <Icon name="close" size={isNanoHeight ? 14 : isShort ? 16 : 18} />
          </button>
        </div>

        {/* 3 Translation Cards */}
        <div className="dock-bible-compare-modal__body">
          {([0, 1, 2] as const).map((slotIdx) => {
            const translation = slotTranslations[slotIdx];
            const isCompared = selectedCompareSlots.includes(slotIdx);
            const verseData = verseTexts[slotIdx];

            return (
              <div
                key={slotIdx}
                className={`dock-compare-card${isCompared ? " dock-compare-card--selected-compare" : ""}`}
              >
                {/* Card Top: Translation Select + Compare Toggle */}
                <div className="dock-compare-card__header">
                  <select
                    className="dock-compare-card__trans-select"
                    value={translation}
                    onChange={(e) => handleSlotTranslationChange(slotIdx, e.target.value)}
                    aria-label={t("bible.selectTranslation", "Select translation")}
                    title={translation}
                  >
                    {availableTranslations.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {isNarrow || isShort ? opt.value : `${opt.value} — ${opt.label}`}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    className={`dock-compare-card__compare-toggle${isCompared ? " dock-compare-card__compare-toggle--active" : ""}`}
                    onClick={() => toggleCompareSlot(slotIdx)}
                    title={isCompared ? t("bible.selectedForCompare", "Selected for Compare Mode") : t("bible.clickToCompare", "Select for Compare Mode")}
                  >
                    <Icon name={isCompared ? "check_circle" : "radio_button_unchecked"} size={isNanoHeight ? 11 : isShort ? 13 : 15} />
                    <span>{isCompared ? t("bible.compared", "Compared") : t("bible.compare", "Compare")}</span>
                  </button>
                </div>

                {/* Card Body: Verse Text */}
                <div className="dock-compare-card__body">
                  {!isNanoHeight && (
                    <div className="dock-compare-card__reference-tag">
                      {shortBookName} {chapter}:{currentVerse} ({translation})
                    </div>
                  )}
                  {verseData?.loading ? (
                    <div className="dock-compare-card__loading">
                      <Icon name="refresh" size={isNanoHeight ? 12 : 14} className="dock-spin" />
                      <span>{t("common.loading", "Loading...")}</span>
                    </div>
                  ) : (
                    <p className="dock-compare-card__text">{verseData?.text || ""}</p>
                  )}
                </div>

                {/* Card Footer: Project Single Button */}
                <div className="dock-compare-card__footer">
                  <button
                    type="button"
                    className="dock-compare-card__project-btn"
                    onClick={() => onProjectSingle(book, chapter, currentVerse, translation)}
                    title={t("bible.projectThisVerse", { defaultValue: "Project {{translation}} only", translation })}
                  >
                    <Icon name="slideshow" size={isNanoHeight ? 11 : isShort ? 13 : 15} />
                    <span>{t("bible.projectTranslation", { defaultValue: "Project {{translation}}", translation })}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Dual Compare CTA */}
        <div className="dock-bible-compare-modal__footer">
          <div className="dock-bible-compare-modal__footer-status">
            <Icon name="splitscreen" size={isNanoHeight ? 12 : isShort ? 14 : 16} />
            <span>
              {isNarrow ? "" : (t("bible.compareSelectedTranslations", "Dual:") + " ")}
              <strong>{compareTransA}</strong> + <strong>{compareTransB}</strong>
            </span>
          </div>

          <div className="dock-bible-compare-modal__footer-actions">
            <button
              type="button"
              className="dock-bible-compare-modal__cancel-btn"
              onClick={onClose}
            >
              {t("common.close", "Close")}
            </button>

            <button
              type="button"
              className="dock-bible-compare-modal__project-both-btn"
              onClick={handleProjectCompare}
              title={t("bible.projectBothHint", {
                defaultValue: "Project both {{transA}} and {{transB}} in compare mode",
                transA: compareTransA,
                transB: compareTransB,
              })}
            >
              <Icon name="compare_arrows" size={isNanoHeight ? 12 : isShort ? 14 : 16} />
              <span>
                {isShort || isNarrow
                  ? t("bible.projectBothShort", { defaultValue: "Project {{transA}}+{{transB}}", transA: compareTransA, transB: compareTransB })
                  : t("bible.projectBothVerses", {
                      defaultValue: "Project Both in Compare Mode ({{transA}} + {{transB}})",
                      transA: compareTransA,
                      transB: compareTransB,
                    })}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default React.memo(DockBibleCompareVersesModal);
