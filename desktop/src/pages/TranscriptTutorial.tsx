// ────────────────────────────────────────────────────────────────────────────
// Interactive Tutorial System – Transcript Library
//
// A guided onboarding assistant that highlights UI elements by elevating
// them above the dark backdrop (z-index manipulation) and waits for the
// user to complete each action before advancing to the next step.
// ────────────────────────────────────────────────────────────────────────────

import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lightbulb,
  Mic,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./TranscriptTutorial.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface TutorialStep {
  /** Selector for the element to highlight (CSS selector) */
  target: string;
  /** Title shown in the assistant panel */
  titleKey: string;
  /** Description shown in the assistant panel */
  descKey: string;
  /** What the user must do */
  actionKey: string;
  /** Completion event type */
  trigger: "click" | "focus" | "view-change" | "none";
  /** Selector to watch for the trigger event — if different from target */
  triggerSelector?: string;
  /** Optional: skip this step if a condition is true */
  skipIf?: () => boolean;
  /** Position of the assistant panel relative to target */
  panelPosition: "right" | "left" | "top" | "bottom";
}

const TUTORIAL_STORAGE_KEY = "mce.transcript.tutorial.completed";

// ── Target Elevation ───────────────────────────────────────────────────────

/**
 * Elevates a target element above the tutorial overlay by boosting z-index
 * of all positioned ancestors and applying visual glow/padding effects
 * directly to the target. Returns a cleanup function that restores originals.
 */
function elevateTarget(el: HTMLElement, interactive: boolean): () => void {
  const primaryRgb = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary-rgb")
    .trim() || "99,102,241";

  // ── z-index elevation ────────────────────────────────────────────────
  const ancestors: Array<[HTMLElement, string]> = [];
  let parent = el.parentElement;
  while (parent && parent !== document.documentElement) {
    if (getComputedStyle(parent).position !== "static") {
      ancestors.push([parent, parent.style.zIndex]);
      parent.style.zIndex = "10005";
    }
    parent = parent.parentElement;
  }

  const origPos = el.style.position;
  if (getComputedStyle(el).position === "static") {
    el.style.position = "relative";
  }
  const origZ = el.style.zIndex;
  el.style.zIndex = "10006";

  // ── visual effects ───────────────────────────────────────────────────
  const glow = interactive
    ? `0 0 0 16px rgba(${primaryRgb},0.25), 0 0 40px 12px rgba(${primaryRgb},0.45), 0 0 80px 8px rgba(${primaryRgb},0.2)`
    : `0 0 0 16px rgba(${primaryRgb},0.2), 0 0 30px 8px rgba(${primaryRgb},0.35), 0 0 60px 4px rgba(${primaryRgb},0.15)`;

  const glowDim = interactive
    ? `0 0 0 20px rgba(${primaryRgb},0.15), 0 0 60px 20px rgba(${primaryRgb},0.3), 0 0 100px 12px rgba(${primaryRgb},0.12)`
    : `0 0 0 20px rgba(${primaryRgb},0.1), 0 0 40px 12px rgba(${primaryRgb},0.25), 0 0 70px 4px rgba(${primaryRgb},0.1)`;

  const origShadow = el.style.boxShadow;
  const origOutline = el.style.outline;
  const origOutlineOff = el.style.outlineOffset;
  const origTransition = el.style.transition;

  el.style.boxShadow = glow;
  el.style.outline = `2px solid rgba(${primaryRgb},0.7)`;
  el.style.outlineOffset = "6px";
  el.style.transition = "box-shadow 300ms ease, outline 300ms ease";

  // Pulse animation custom properties
  el.style.setProperty("--mce-glow", glow);
  el.style.setProperty("--mce-glow-dim", glowDim);
  if (interactive) {
    el.classList.add("mce-tutorial-glow-pulse");
  }

  // ── cleanup ──────────────────────────────────────────────────────────
  return () => {
    el.classList.remove("mce-tutorial-glow-pulse");
    el.style.removeProperty("--mce-glow");
    el.style.removeProperty("--mce-glow-dim");
    el.style.boxShadow = origShadow;
    el.style.outline = origOutline;
    el.style.outlineOffset = origOutlineOff;
    el.style.transition = origTransition;
    el.style.zIndex = origZ;
    el.style.position = origPos;
    for (const [node, z] of ancestors) {
      node.style.zIndex = z;
    }
  };
}

// ── Component ──────────────────────────────────────────────────────────────

interface TranscriptTutorialProps {
  isActive: boolean;
  onClose: () => void;
  onFinish: () => void;
  hasTranscripts: boolean;
  onStartRecording?: () => void;
}

export default function TranscriptTutorial({
  isActive,
  onClose,
  onFinish,
  hasTranscripts,
  onStartRecording,
}: TranscriptTutorialProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [stepCompleted, setStepCompleted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Step Definitions ───────────────────────────────────────────────────

  const allSteps: TutorialStep[] = useMemo(() => [
    {
      target: "[data-transcript-tutorial='welcome']",
      titleKey: "transcript.tour.step1.title",
      descKey: "transcript.tour.step1.desc",
      actionKey: "transcript.tour.step1.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-transcript-tutorial='search']",
      titleKey: "transcript.tour.step2.title",
      descKey: "transcript.tour.step2.desc",
      actionKey: "transcript.tour.step2.action",
      trigger: "focus",
      triggerSelector: "[data-transcript-tutorial='search'] input",
      panelPosition: "right",
    },
    {
      target: "[data-transcript-tutorial='stats']",
      titleKey: "transcript.tour.step3.title",
      descKey: "transcript.tour.step3.desc",
      actionKey: "transcript.tour.step3.action",
      trigger: "click",
      triggerSelector: "[data-transcript-tutorial='stats'] .tl-stat-card",
      panelPosition: "right",
    },
    {
      target: "[data-transcript-tutorial='filters']",
      titleKey: "transcript.tour.step4.title",
      descKey: "transcript.tour.step4.desc",
      actionKey: "transcript.tour.step4.action",
      trigger: "click",
      triggerSelector: "[data-transcript-tutorial='filters'] .tl-filter-btn",
      panelPosition: "right",
    },
    {
      target: "[data-transcript-tutorial='table']",
      titleKey: "transcript.tour.step5.title",
      descKey: "transcript.tour.step5.desc",
      actionKey: "transcript.tour.step5.action",
      trigger: "click",
      triggerSelector: "[data-transcript-tutorial='table'] .tl-table-row",
      panelPosition: "right",
      skipIf: () => !hasTranscripts,
    },
    {
      target: "[data-transcript-tutorial='download']",
      titleKey: "transcript.tour.step6.title",
      descKey: "transcript.tour.step6.desc",
      actionKey: "transcript.tour.step6.action",
      trigger: "click",
      triggerSelector: "[data-transcript-tutorial='download']",
      panelPosition: "right",
      skipIf: () => !hasTranscripts,
    },
    {
      target: "[data-transcript-tutorial='more-actions']",
      titleKey: "transcript.tour.step7.title",
      descKey: "transcript.tour.step7.desc",
      actionKey: "transcript.tour.step7.action",
      trigger: "click",
      triggerSelector: "[data-transcript-tutorial='more-actions']",
      panelPosition: "right",
      skipIf: () => !hasTranscripts,
    },
    {
      target: "[data-transcript-tutorial='view-toggle']",
      titleKey: "transcript.tour.step8.title",
      descKey: "transcript.tour.step8.desc",
      actionKey: "transcript.tour.step8.action",
      trigger: "view-change",
      triggerSelector: "[data-transcript-tutorial='view-toggle'] .tl-view-btn",
      panelPosition: "right",
    },
    {
      target: "[data-transcript-tutorial='new-session']",
      titleKey: "transcript.tour.step9.title",
      descKey: "transcript.tour.step9.desc",
      actionKey: "transcript.tour.step9.action",
      trigger: "click",
      triggerSelector: "[data-transcript-tutorial='new-session']",
      panelPosition: "right",
    },
  ], [hasTranscripts]);

  // Filter out skipped steps
  const steps = useMemo(
    () => allSteps.filter((s) => !s.skipIf?.()),
    [allSteps],
  );

  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;
  const isFinalStep = stepIndex === totalSteps;

  const needsInteraction = currentStep?.trigger !== "none";

  // ── Target Elevation & Rect Tracking ─────────────────────────────────

  useEffect(() => {
    if (!isActive || !currentStep || isFinalStep) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(currentStep.target) as HTMLElement | null;
    if (!el) {
      setTargetRect(null);
      return;
    }

    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });

    const cleanup = elevateTarget(el, needsInteraction);

    const updateRect = () => {
      setTargetRect(el.getBoundingClientRect());
    };

    updateRect();
    window.addEventListener("resize", updateRect);

    return () => {
      cleanup();
      window.removeEventListener("resize", updateRect);
    };
  }, [isActive, currentStep?.target, isFinalStep, needsInteraction]);

  // ── Panel Positioning ─────────────────────────────────────────────────

  useEffect(() => {
    if (isFinalStep || !targetRect) {
      setPanelRect({ top: window.innerHeight / 2 - 180, left: window.innerWidth / 2 - 180 });
      return;
    }

    const panelW = 340;
    const panelH = 300;
    const gap = 20;

    let top = targetRect.top + targetRect.height / 2 - panelH / 2;
    let left = targetRect.right + gap;

    if (left + panelW > window.innerWidth - 20) {
      left = targetRect.left - gap - panelW;
    }

    if (left < 20) {
      left = Math.max(20, (window.innerWidth - panelW) / 2);
      top = targetRect.bottom + gap;
    }

    top = Math.max(20, Math.min(top, window.innerHeight - panelH - 20));

    setPanelRect({ top, left });
  }, [targetRect, isFinalStep]);

  // ── Trigger Event Listeners ───────────────────────────────────────────

  useEffect(() => {
    if (!isActive || !currentStep || isFinalStep || stepCompleted) return;

    const selectors = currentStep.triggerSelector || currentStep.target;
    const elements = document.querySelectorAll(selectors);
    if (elements.length === 0) {
      // Target elements don't exist — auto-complete so user isn't stuck
      const timer = setTimeout(() => setStepCompleted(true), 400);
      return () => clearTimeout(timer);
    }

    const cleanups: (() => void)[] = [];

    elements.forEach((el) => {
      if (currentStep.trigger === "click") {
        const handler = () => {
          setTimeout(() => {
            const modalSelectors = [
              ".export-menu", ".export-dropdown", ".export-popover",
              "[role='dialog']", ".modal-overlay", ".modal",
              ".dropdown-menu", ".popover",
            ];
            let foundModal = false;
            for (const sel of modalSelectors) {
              const modal = document.querySelector(sel);
              if (modal) {
                foundModal = true;
                const observer = new MutationObserver(() => {
                  if (!document.querySelector(sel)) {
                    observer.disconnect();
                    setStepCompleted(true);
                  }
                });
                observer.observe(document.body, { childList: true, subtree: true });
                setTimeout(() => {
                  observer.disconnect();
                  setStepCompleted(true);
                }, 8000);
                break;
              }
            }
            if (!foundModal) {
              setStepCompleted(true);
            }
          }, 300);
        };
        el.addEventListener("click", handler);
        cleanups.push(() => el.removeEventListener("click", handler));
      } else if (currentStep.trigger === "focus") {
        const focusHandler = () => {
          const blurHandler = () => setStepCompleted(true);
          el.addEventListener("blur", blurHandler);
          cleanups.push(() => el.removeEventListener("blur", blurHandler));
          setTimeout(() => {
            el.removeEventListener("blur", blurHandler);
            setStepCompleted(true);
          }, 10000);
        };
        el.addEventListener("focus", focusHandler);
        cleanups.push(() => el.removeEventListener("focus", focusHandler));
      } else if (currentStep.trigger === "view-change") {
        const handler = () => {
          setTimeout(() => setStepCompleted(true), 200);
        };
        el.addEventListener("click", handler);
        cleanups.push(() => el.removeEventListener("click", handler));
      }
    });

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [isActive, currentStep, isFinalStep, stepCompleted]);

  // ── Navigation ────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (isFinalStep) {
      onFinish();
      return;
    }
    if (stepIndex < totalSteps) {
      setStepCompleted(false);
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex, totalSteps, isFinalStep, onFinish]);

  const goPrev = useCallback(() => {
    if (stepIndex > 0) {
      setStepCompleted(false);
      setStepIndex((i) => i - 1);
    }
  }, [stepIndex]);

  const handleSkip = useCallback(() => {
    onFinish();
  }, [onFinish]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onFinish();
      } else if (e.key === "Enter" && stepCompleted) {
        goNext();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, stepCompleted, goNext, onFinish]);

  // ── Nothing to render ─────────────────────────────────────────────────

  if (!isActive || (!currentStep && !isFinalStep)) return null;

  // ── Final Step ────────────────────────────────────────────────────────

  if (isFinalStep) {
    return (
      <div className="tt-overlay" style={{ pointerEvents: "auto" }} onClick={onClose}>
        <div className="tt-panel tt-panel--final" style={{ top: panelRect.top, left: panelRect.left }}>
          <button className="tt-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>

          <div className="tt-final-header">
            <div className="tt-final-icon">
              <Sparkles size={24} />
            </div>
            <h2 className="tt-final-title">{t("transcript.tour.final.title")}</h2>
            <p className="tt-final-desc">{t("transcript.tour.final.desc")}</p>
          </div>

          <div className="tt-final-checklist">
            {[
              "transcript.tour.final.check1",
              "transcript.tour.final.check2",
              "transcript.tour.final.check3",
              "transcript.tour.final.check4",
              "transcript.tour.final.check5",
            ].map((key) => (
              <div key={key} className="tt-final-check-item">
                <CheckCircle2 size={16} className="tt-check-icon" />
                <span>{t(key)}</span>
              </div>
            ))}
          </div>

          <div className="tt-final-actions">
            <button className="tt-btn tt-btn-primary" onClick={onFinish} title="Finish tutorial">
              {t("transcript.tour.final.finish")}
            </button>
            {onStartRecording && (
              <button className="tt-btn tt-btn-accent" onClick={onStartRecording} title="Start">
                <Mic size={14} /> {t("transcript.tour.final.startRecording")}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Regular Step ──────────────────────────────────────────────────────

  return (
    <div className="tt-overlay">
      {/* Assistant Panel */}
      <div
        ref={panelRef}
        className="tt-panel"
        style={{ top: panelRect.top, left: panelRect.left }}
      >
        {/* Progress bar */}
        <div className="tt-progress-bar">
          <div
            className="tt-progress-fill"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="tt-panel-header">
          <div className="tt-step-badge">
            {stepIndex + 1} / {totalSteps}
          </div>
          <button className="tt-close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="tt-panel-body">
          <div className="tt-step-icon-wrap">
            <Lightbulb size={18} />
          </div>
          <h3 className="tt-step-title">{t(currentStep.titleKey)}</h3>
          <p className="tt-step-desc">{t(currentStep.descKey)}</p>

          <div className="tt-action-hint">
            <ArrowRight size={14} />
            <span>{t(currentStep.actionKey)}</span>
          </div>

          {stepCompleted && (
            <div className="tt-step-complete">
              <CheckCircle2 size={16} />
              <span>{t("transcript.tour.common.done")}</span>
            </div>
          )}
        </div>

        <div className="tt-panel-footer">
          <button
            className="tt-btn tt-btn-ghost"
            onClick={handleSkip}
            title="Skip tutorial">
            <SkipForward size={14} /> {t("transcript.tour.common.skip")}
          </button>

          <div className="tt-nav-buttons">
            <button
              className="tt-btn"
              onClick={goPrev}
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className={`tt-btn tt-btn-primary ${!stepCompleted && currentStep.trigger !== "none" ? "tt-btn--waiting" : ""}`}
              disabled={!stepCompleted && currentStep.trigger !== "none"}
              onClick={goNext}
              title="Next step">
              {t("transcript.tour.common.next")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Public helpers ─────────────────────────────────────────────────────────

export function isTutorialCompleted(): boolean {
  return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
}

export function markTutorialCompleted(): void {
  localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
}

export function resetTutorial(): void {
  localStorage.removeItem(TUTORIAL_STORAGE_KEY);
}
