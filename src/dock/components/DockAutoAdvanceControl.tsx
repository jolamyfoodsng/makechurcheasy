import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Icon from "../DockIcon";
import {
  readUserScopedStorage,
  writeUserScopedStorage,
} from "../../services/userScopedStorage";

export interface DockAutoAdvanceItem {
  id: string;
  label: string;
}

type AutoAdvanceStatus = "idle" | "running" | "paused" | "completed";
type AutoAdvanceStartFrom = "current" | "first";
type AutoAdvanceEndBehavior = "stop" | "loop";
type AutoAdvanceItemKind = "song" | "note";
type AutoAdvanceStorageScope = "worship" | "notes";

interface DockAutoAdvanceSettings {
  durationMinutes: number;
  intervalSeconds: number;
  startFrom: AutoAdvanceStartFrom;
  endBehavior: AutoAdvanceEndBehavior;
}

interface DockAutoAdvanceControlProps {
  items: readonly DockAutoAdvanceItem[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  itemKind: AutoAdvanceItemKind;
  storageScope: AutoAdvanceStorageScope;
}

const DEFAULT_SETTINGS: DockAutoAdvanceSettings = {
  durationMinutes: 5,
  intervalSeconds: 30,
  startFrom: "current",
  endBehavior: "stop",
};

const MIN_DURATION_MINUTES = 1;
const MAX_DURATION_MINUTES = 180;
const MIN_INTERVAL_SECONDS = 5;
const MAX_INTERVAL_SECONDS = 3600;
const AUTO_ADVANCE_TICK_MS = 250;

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function loadSettings(storageScope: AutoAdvanceStorageScope): DockAutoAdvanceSettings {
  try {
    const raw = readUserScopedStorage(`ocs-dock-auto-advance-${storageScope}`);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DockAutoAdvanceSettings>;
    return {
      durationMinutes: clampNumber(
        Number(parsed.durationMinutes),
        MIN_DURATION_MINUTES,
        MAX_DURATION_MINUTES,
      ),
      intervalSeconds: clampNumber(
        Number(parsed.intervalSeconds),
        MIN_INTERVAL_SECONDS,
        MAX_INTERVAL_SECONDS,
      ),
      startFrom: parsed.startFrom === "first" ? "first" : "current",
      endBehavior: parsed.endBehavior === "loop" ? "loop" : "stop",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function formatRemaining(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}`
    : `${seconds}s`;
}

/** Returns the next item, or null when a stop-at-end queue is complete. */
export function getAutoAdvanceIndex(
  currentIndex: number,
  itemCount: number,
  endBehavior: AutoAdvanceEndBehavior,
  steps = 1,
): number | null {
  if (itemCount <= 0 || currentIndex < 0 || currentIndex >= itemCount) return null;
  const safeSteps = Math.max(1, Math.trunc(steps));
  if (endBehavior === "loop") return (currentIndex + safeSteps) % itemCount;
  const nextIndex = currentIndex + safeSteps;
  return nextIndex < itemCount ? nextIndex : null;
}

export default function DockAutoAdvanceControl({
  items,
  selectedIndex,
  onSelectIndex,
  itemKind,
  storageScope,
}: DockAutoAdvanceControlProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const previousSelectedIndexRef = useRef(selectedIndex);
  const expectedIndexRef = useRef<number | null>(null);
  const currentIndexRef = useRef(selectedIndex);
  const statusRef = useRef<AutoAdvanceStatus>("idle");
  const deadlinesRef = useRef({ runAt: 0, itemAt: 0 });
  const [settings, setSettings] = useState<DockAutoAdvanceSettings>(() => loadSettings(storageScope));
  const [status, setStatus] = useState<AutoAdvanceStatus>("idle");
  const [isOpen, setIsOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState<"manual" | "user" | null>(null);
  const [remainingRunMs, setRemainingRunMs] = useState(0);
  const [remainingItemMs, setRemainingItemMs] = useState(0);
  const [activeRunDurationMs, setActiveRunDurationMs] = useState(0);

  currentIndexRef.current = selectedIndex;
  statusRef.current = status;

  const storageKey = `ocs-dock-auto-advance-${storageScope}`;
  const itemCollectionLabel = itemKind === "song" ? t("worship.title") : t("notes.title");
  const currentItem = items[selectedIndex];
  const canStart = items.length > 0 && selectedIndex >= 0 && selectedIndex < items.length;
  const isActive = status === "running" || status === "paused";

  useEffect(() => {
    writeUserScopedStorage(storageKey, JSON.stringify(settings));
  }, [settings, storageKey]);

  const pauseAutomation = useCallback((reason: "manual" | "user" = "user") => {
    if (statusRef.current !== "running") return;
    const now = Date.now();
    setRemainingRunMs(Math.max(0, deadlinesRef.current.runAt - now));
    setRemainingItemMs(Math.max(0, deadlinesRef.current.itemAt - now));
    setPauseReason(reason === "manual" ? "manual" : null);
    setStatus("paused");
  }, []);

  const stopAutomation = useCallback(() => {
    expectedIndexRef.current = null;
    deadlinesRef.current = { runAt: 0, itemAt: 0 };
    setPauseReason(null);
    setRemainingRunMs(0);
    setRemainingItemMs(0);
    setActiveRunDurationMs(0);
    setStatus("idle");
  }, []);

  const finishAutomation = useCallback(() => {
    expectedIndexRef.current = null;
    setPauseReason(null);
    setRemainingRunMs(0);
    setRemainingItemMs(0);
    setStatus("completed");
  }, []);

  const handleStart = useCallback(() => {
    if (!canStart) return;
    const durationMs = settings.durationMinutes * 60_000;
    const intervalMs = settings.intervalSeconds * 1_000;
    const startIndex = settings.startFrom === "first" ? 0 : selectedIndex;
    if (startIndex < 0 || startIndex >= items.length) return;

    const now = Date.now();
    expectedIndexRef.current = startIndex === selectedIndex ? null : startIndex;
    onSelectIndex(startIndex);
    deadlinesRef.current = {
      runAt: now + durationMs,
      itemAt: now + intervalMs,
    };
    setPauseReason(null);
    setRemainingRunMs(durationMs);
    setRemainingItemMs(intervalMs);
    setActiveRunDurationMs(durationMs);
    setStatus("running");
  }, [canStart, items.length, onSelectIndex, selectedIndex, settings]);

  const handleResume = useCallback(() => {
    if (statusRef.current !== "paused" || remainingRunMs <= 0) return;
    const now = Date.now();
    deadlinesRef.current = {
      runAt: now + remainingRunMs,
      itemAt: now + Math.max(0, remainingItemMs),
    };
    setPauseReason(null);
    setStatus("running");
  }, [remainingItemMs, remainingRunMs]);

  // Any selection change that did not come from the timer is an intentional
  // manual navigation, so pause before the next item can be selected.
  useEffect(() => {
    if (previousSelectedIndexRef.current === selectedIndex) return;
    const expectedIndex = expectedIndexRef.current;
    if (statusRef.current === "running" && expectedIndex !== selectedIndex) {
      pauseAutomation("manual");
    }
    expectedIndexRef.current = null;
    previousSelectedIndexRef.current = selectedIndex;
  }, [pauseAutomation, selectedIndex]);

  useEffect(() => {
    if (statusRef.current !== "running") return;
    if (items.length === 0 || currentIndexRef.current < 0 || currentIndexRef.current >= items.length) {
      stopAutomation();
    }
  }, [items.length, selectedIndex, stopAutomation]);

  useEffect(() => {
    if (status !== "running") return;

    const timer = window.setInterval(() => {
      const now = Date.now();
      const runRemaining = deadlinesRef.current.runAt - now;
      if (runRemaining <= 0) {
        finishAutomation();
        return;
      }

      const intervalMs = settings.intervalSeconds * 1_000;
      let nextItemAt = deadlinesRef.current.itemAt;
      let nextIndex = currentIndexRef.current;
      let guard = 0;

      while (now >= nextItemAt && guard < 1000) {
        const candidate = getAutoAdvanceIndex(
          nextIndex,
          items.length,
          settings.endBehavior,
        );
        if (candidate === null) {
          finishAutomation();
          return;
        }
        nextIndex = candidate;
        nextItemAt += intervalMs;
        guard += 1;
      }

      if (nextIndex !== currentIndexRef.current) {
        expectedIndexRef.current = nextIndex;
        onSelectIndex(nextIndex);
      }

      deadlinesRef.current.itemAt = nextItemAt > now ? nextItemAt : now + intervalMs;
      setRemainingRunMs(Math.max(0, runRemaining));
      setRemainingItemMs(Math.max(0, deadlinesRef.current.itemAt - now));
    }, AUTO_ADVANCE_TICK_MS);

    return () => window.clearInterval(timer);
  }, [finishAutomation, items.length, onSelectIndex, settings.endBehavior, settings.intervalSeconds, status]);

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const statusLabel = status === "running"
    ? t("autoAdvance.running")
    : status === "paused"
      ? t("autoAdvance.paused")
      : t("autoAdvance.finished");
  const elapsedPercent = activeRunDurationMs > 0
    ? Math.min(100, Math.max(0, ((activeRunDurationMs - remainingRunMs) / activeRunDurationMs) * 100))
    : 0;

  return (
    <div ref={rootRef} className="dock-auto-advance">
      <button
        type="button"
        className={`dock-shell-icon-btn dock-auto-advance__trigger${isActive ? " dock-shell-icon-btn--active dock-auto-advance__trigger--active" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
        disabled={items.length === 0}
        title={t("autoAdvance.open")}
        aria-label={t("autoAdvance.open")}
        aria-expanded={isOpen}
      >
        <Icon name={isActive ? "timer" : "playlist_play"} size={16} />
        {isActive && <span className="dock-auto-advance__dot" aria-hidden="true" />}
      </button>

      {isOpen && (
        <div className="dock-auto-advance__popover" role="dialog" aria-label={t("autoAdvance.title")}>
          <div className="dock-auto-advance__header">
            <div>
              <div className="dock-auto-advance__eyebrow">{t("autoAdvance.title")}</div>
              <div className="dock-auto-advance__title">{itemCollectionLabel}</div>
            </div>
            <button
              type="button"
              className="dock-auto-advance__close"
              onClick={() => setIsOpen(false)}
              aria-label={t("common.close")}
              title={t("common.close")}
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="dock-auto-advance__badge">
            <Icon name="check_circle" size={13} />
            {t("autoAdvance.selectionOnly")}
          </div>
          <p className="dock-auto-advance__description">{t("autoAdvance.description")}</p>

          {status !== "idle" && (
            <div className={`dock-auto-advance__status dock-auto-advance__status--${status}`} aria-live="polite">
              <div className="dock-auto-advance__status-head">
                <span className="dock-auto-advance__status-label">{statusLabel}</span>
                <span className="dock-auto-advance__position">
                  {t("autoAdvance.itemPosition", { current: Math.max(0, selectedIndex + 1), total: items.length })}
                </span>
              </div>
              {currentItem && <div className="dock-auto-advance__current">{currentItem.label}</div>}
              {status !== "completed" && (
                <>
                  <div className="dock-auto-advance__progress" aria-hidden="true">
                    <span style={{ width: `${elapsedPercent}%` }} />
                  </div>
                  <div className="dock-auto-advance__timers">
                    <span>{t("autoAdvance.nextIn", { time: formatRemaining(remainingItemMs) })}</span>
                    <span>{t("autoAdvance.runRemaining", { time: formatRemaining(remainingRunMs) })}</span>
                  </div>
                </>
              )}
              {pauseReason === "manual" && (
                <div className="dock-auto-advance__pause-note">{t("autoAdvance.manualPause")}</div>
              )}
            </div>
          )}

          <div className="dock-auto-advance__fields">
            <label className="dock-auto-advance__field">
              <span>{t("autoAdvance.runFor")}</span>
              <span className="dock-auto-advance__number-input">
                <input
                  type="number"
                  min={MIN_DURATION_MINUTES}
                  max={MAX_DURATION_MINUTES}
                  step={1}
                  value={settings.durationMinutes}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    durationMinutes: clampNumber(Number(event.target.value), MIN_DURATION_MINUTES, MAX_DURATION_MINUTES),
                  }))}
                  disabled={isActive}
                  aria-label={t("autoAdvance.runFor")}
                />
                <span>{t("autoAdvance.minutes")}</span>
              </span>
            </label>
            <label className="dock-auto-advance__field">
              <span>{t("autoAdvance.advanceEvery")}</span>
              <span className="dock-auto-advance__number-input">
                <input
                  type="number"
                  min={MIN_INTERVAL_SECONDS}
                  max={MAX_INTERVAL_SECONDS}
                  step={5}
                  value={settings.intervalSeconds}
                  onChange={(event) => setSettings((current) => ({
                    ...current,
                    intervalSeconds: clampNumber(Number(event.target.value), MIN_INTERVAL_SECONDS, MAX_INTERVAL_SECONDS),
                  }))}
                  disabled={isActive}
                  aria-label={t("autoAdvance.advanceEvery")}
                />
                <span>{t("autoAdvance.seconds")}</span>
              </span>
            </label>
          </div>

          <div className="dock-auto-advance__option-section">
            <div className="dock-auto-advance__option-label">{t("autoAdvance.startFrom")}</div>
            <div className="dock-auto-advance__options" role="radiogroup" aria-label={t("autoAdvance.startFrom")}>
              <label className="dock-auto-advance__option">
                <input
                  type="radio"
                  name={`auto-advance-start-${storageScope}`}
                  checked={settings.startFrom === "current"}
                  onChange={() => setSettings((current) => ({ ...current, startFrom: "current" }))}
                  disabled={isActive}
                />
                <span>{t("autoAdvance.currentItem")}</span>
              </label>
              <label className="dock-auto-advance__option">
                <input
                  type="radio"
                  name={`auto-advance-start-${storageScope}`}
                  checked={settings.startFrom === "first"}
                  onChange={() => setSettings((current) => ({ ...current, startFrom: "first" }))}
                  disabled={isActive}
                />
                <span>{t("autoAdvance.firstItem")}</span>
              </label>
            </div>
          </div>

          <div className="dock-auto-advance__option-section">
            <div className="dock-auto-advance__option-label">{t("autoAdvance.whenListEnds")}</div>
            <div className="dock-auto-advance__options" role="radiogroup" aria-label={t("autoAdvance.whenListEnds")}>
              <label className="dock-auto-advance__option">
                <input
                  type="radio"
                  name={`auto-advance-end-${storageScope}`}
                  checked={settings.endBehavior === "stop"}
                  onChange={() => setSettings((current) => ({ ...current, endBehavior: "stop" }))}
                  disabled={isActive}
                />
                <span>{t("autoAdvance.stopAtEnd")}</span>
              </label>
              <label className="dock-auto-advance__option">
                <input
                  type="radio"
                  name={`auto-advance-end-${storageScope}`}
                  checked={settings.endBehavior === "loop"}
                  onChange={() => setSettings((current) => ({ ...current, endBehavior: "loop" }))}
                  disabled={isActive}
                />
                <span>{t("autoAdvance.loop")}</span>
              </label>
            </div>
          </div>

          <div className="dock-auto-advance__footer">
            {isActive ? (
              <>
                <button
                  type="button"
                  className="dock-auto-advance__button dock-auto-advance__button--primary"
                  onClick={() => (status === "running" ? pauseAutomation() : handleResume())}
                >
                  <Icon name={status === "running" ? "pause" : "play_arrow"} size={14} />
                  {status === "running" ? t("autoAdvance.pause") : t("autoAdvance.resume")}
                </button>
                <button
                  type="button"
                  className="dock-auto-advance__button dock-auto-advance__button--danger"
                  onClick={stopAutomation}
                >
                  <Icon name="stop" size={14} />
                  {t("autoAdvance.stop")}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dock-auto-advance__button dock-auto-advance__button--primary dock-auto-advance__button--start"
                onClick={handleStart}
                disabled={!canStart}
              >
                <Icon name="play_arrow" size={14} />
                {t("autoAdvance.start")}
              </button>
            )}
          </div>

          {!canStart && <div className="dock-auto-advance__empty">{t("autoAdvance.selectItem")}</div>}
        </div>
      )}
    </div>
  );
}
