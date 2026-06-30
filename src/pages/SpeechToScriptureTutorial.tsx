// ────────────────────────────────────────────────────────────────────────────
// Interactive Tutorial System – Speech to Scripture
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
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import "./SpeechToScriptureTutorial.css";

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

const STORAGE_KEY = "mce.speech-to-scripture.tutorial.completed";

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

interface SpeechToScriptureTutorialProps {
  isActive: boolean;
  onClose: () => void;
  onFinish: () => void;
}

export default function SpeechToScriptureTutorial({
  isActive,
  onClose,
  onFinish,
}: SpeechToScriptureTutorialProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [stepCompleted, setStepCompleted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Step Definitions ───────────────────────────────────────────────────

  const allSteps: TutorialStep[] = useMemo(() => [
    {
      target: "[data-stt-tutorial='welcome']",
      titleKey: "stt.step1.title",
      descKey: "stt.step1.desc",
      actionKey: "stt.step1.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-stt-tutorial='mic-select']",
      titleKey: "stt.step2.title",
      descKey: "stt.step2.desc",
      actionKey: "stt.step2.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-stt-tutorial='start-btn']",
      titleKey: "stt.step3.title",
      descKey: "stt.step3.desc",
      actionKey: "stt.step3.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-stt-tutorial='transcript']",
      titleKey: "stt.step4.title",
      descKey: "stt.step4.desc",
      actionKey: "stt.step4.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-stt-tutorial='top-match']",
      titleKey: "stt.step5.title",
      descKey: "stt.step5.desc",
      actionKey: "stt.step5.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-stt-tutorial='candidates']",
      titleKey: "stt.step6.title",
      descKey: "stt.step6.desc",
      actionKey: "stt.step6.action",
      trigger: "none",
      panelPosition: "right",
    },
  ], []);

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
    if (stepIndex < totalSteps - 1) {
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
    onClose();
  }, [onClose]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "Enter" && stepCompleted) {
        goNext();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, stepCompleted, goNext, onClose]);

  // ── Nothing to render ─────────────────────────────────────────────────

  if (!isActive || !currentStep) return null;

  // ── Final Step ────────────────────────────────────────────────────────

  if (isFinalStep) {
    return (
      <div className="stt-overlay" style={{ pointerEvents: "auto" }} onClick={onClose}>
        <div className="stt-panel stt-panel--final" style={{ top: panelRect.top, left: panelRect.left }}>
          <button className="stt-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>

          <div className="stt-final-header">
            <div className="stt-final-icon">
              <Sparkles size={24} />
            </div>
            <h2 className="stt-final-title">{t("stt.final.title")}</h2>
            <p className="stt-final-desc">{t("stt.final.desc")}</p>
          </div>

          <div className="stt-final-checklist">
            {[
              "stt.final.check1",
              "stt.final.check2",
              "stt.final.check3",
              "stt.final.check4",
              "stt.final.check5",
            ].map((key) => (
              <div key={key} className="stt-final-check-item">
                <CheckCircle2 size={16} className="stt-check-icon" />
                <span>{t(key)}</span>
              </div>
            ))}
          </div>

          <div className="stt-final-actions">
            <button className="stt-btn stt-btn-primary" onClick={onFinish} title="Finish tutorial">
              {t("stt.final.finish")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Regular Step ──────────────────────────────────────────────────────

  return (
    <div className="stt-overlay">
      {/* Assistant Panel */}
      <div
        ref={panelRef}
        className="stt-panel"
        style={{ top: panelRect.top, left: panelRect.left }}
      >
        {/* Progress bar */}
        <div className="stt-progress-bar">
          <div
            className="stt-progress-fill"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="stt-panel-header">
          <div className="stt-step-badge">
            {stepIndex + 1} / {totalSteps}
          </div>
          <button className="stt-close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="stt-panel-body">
          <div className="stt-step-icon-wrap">
            <Lightbulb size={18} />
          </div>
          <h3 className="stt-step-title">{t(currentStep.titleKey)}</h3>
          <p className="stt-step-desc">{t(currentStep.descKey)}</p>

          <div className="stt-action-hint">
            <ArrowRight size={14} />
            <span>{t(currentStep.actionKey)}</span>
          </div>

          {stepCompleted && (
            <div className="stt-step-complete">
              <CheckCircle2 size={16} />
              <span>{t("stt.common.done")}</span>
            </div>
          )}
        </div>

        <div className="stt-panel-footer">
          <button
            className="stt-btn stt-btn-ghost"
            onClick={handleSkip}
            title="Skip tutorial">
            <SkipForward size={14} /> {t("stt.common.skip")}
          </button>

          <div className="stt-nav-buttons">
            <button
              className="stt-btn"
              onClick={goPrev}
              title="Previous">
              <ChevronLeft size={14} />
            </button>
            <button
              className={`stt-btn stt-btn-primary ${!stepCompleted && currentStep.trigger !== "none" ? "stt-btn--waiting" : ""}`}
              disabled={!stepCompleted && currentStep.trigger !== "none"}
              onClick={goNext}
              title="Next step">
              {t("stt.common.next")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Public helpers ─────────────────────────────────────────────────────────

export function isSpeechToScriptureTutorialCompleted(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function markSpeechToScriptureTutorialCompleted(): void {
  localStorage.setItem(STORAGE_KEY, "true");
}

export function resetSpeechToScriptureTutorial(): void {
  localStorage.removeItem(STORAGE_KEY);
}
