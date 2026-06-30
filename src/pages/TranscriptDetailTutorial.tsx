// ────────────────────────────────────────────────────────────────────────────
// Interactive Tutorial System – Transcript Detail Page
//
// Guided onboarding for the Transcript Detail view. Highlights UI elements
// by elevating them above the dark backdrop (z-index manipulation) and waits
// for the user to interact before advancing.
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
import "./TranscriptDetailTutorial.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface TutorialStep {
  target: string;
  titleKey: string;
  descKey: string;
  actionKey: string;
  trigger: "click" | "focus" | "tab-switch" | "none";
  triggerSelector?: string;
  skipIf?: () => boolean;
  panelPosition: "right" | "left" | "top" | "bottom";
}

const TUTORIAL_STORAGE_KEY = "mce.transcript-detail.tutorial.completed";

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

interface TranscriptDetailTutorialProps {
  isActive: boolean;
  onClose: () => void;
  onFinish: () => void;
  hasScriptures: boolean;
  hasTranslations: boolean;
}

export default function TranscriptDetailTutorial({
  isActive,
  onClose,
  onFinish,
  hasScriptures,
  hasTranslations,
}: TranscriptDetailTutorialProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [stepCompleted, setStepCompleted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Step Definitions ───────────────────────────────────────────────────

  const allSteps: TutorialStep[] = useMemo(() => [
    {
      target: "[data-detail-tutorial='welcome']",
      titleKey: "detailTutorial.step1.title",
      descKey: "detailTutorial.step1.desc",
      actionKey: "detailTutorial.step1.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-detail-tutorial='metadata']",
      titleKey: "detailTutorial.step3.title",
      descKey: "detailTutorial.step3.desc",
      actionKey: "detailTutorial.step3.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-detail-tutorial='export']",
      titleKey: "detailTutorial.step4.title",
      descKey: "detailTutorial.step4.desc",
      actionKey: "detailTutorial.step4.action",
      trigger: "click",
      triggerSelector: "[data-detail-tutorial='export']",
      panelPosition: "right",
    },
    {
      target: "[data-detail-tutorial='translate']",
      titleKey: "detailTutorial.step5.title",
      descKey: "detailTutorial.step5.desc",
      actionKey: "detailTutorial.step5.action",
      trigger: "click",
      triggerSelector: "[data-detail-tutorial='translate']",
      panelPosition: "right",
    },
    {
      target: "[data-detail-tutorial='search']",
      titleKey: "detailTutorial.step6.title",
      descKey: "detailTutorial.step6.desc",
      actionKey: "detailTutorial.step6.action",
      trigger: "focus",
      triggerSelector: "[data-detail-tutorial='search'] input",
      panelPosition: "right",
    },
    {
      target: "[data-detail-tutorial='copy']",
      titleKey: "detailTutorial.step7.title",
      descKey: "detailTutorial.step7.desc",
      actionKey: "detailTutorial.step7.action",
      trigger: "click",
      triggerSelector: "[data-detail-tutorial='copy']",
      panelPosition: "right",
    },
    {
      target: "[data-detail-tutorial='transcript-content']",
      titleKey: "detailTutorial.step8.title",
      descKey: "detailTutorial.step8.desc",
      actionKey: "detailTutorial.step8.action",
      trigger: "click",
      triggerSelector: "[data-detail-tutorial='transcript-content'] .t-line-wrapper",
      panelPosition: "left",
    },
    {
      target: "[data-detail-tutorial='sidebar']",
      titleKey: "detailTutorial.step9.title",
      descKey: "detailTutorial.step9.desc",
      actionKey: "detailTutorial.step9.action",
      trigger: "tab-switch",
      triggerSelector: "[data-detail-tutorial='sidebar'] .sidebar-tab",
      panelPosition: "left",
      skipIf: () => !hasScriptures && !hasTranslations,
    },
    {
      target: "[data-detail-tutorial='translations-tab']",
      titleKey: "detailTutorial.step10.title",
      descKey: "detailTutorial.step10.desc",
      actionKey: "detailTutorial.step10.action",
      trigger: "click",
      triggerSelector: "[data-detail-tutorial='translations-tab']",
      panelPosition: "left",
      skipIf: () => !hasTranslations,
    },
    {
      target: "[data-detail-tutorial='back']",
      titleKey: "detailTutorial.step2.title",
      descKey: "detailTutorial.step2.desc",
      actionKey: "detailTutorial.step2.action",
      trigger: "click",
      triggerSelector: "[data-detail-tutorial='back']",
      panelPosition: "right",
    },
  ], [hasScriptures, hasTranslations]);

  const steps = useMemo(
    () => allSteps.filter((s) => !s.skipIf?.()),
    [allSteps],
  );

  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;
  const isFinalStep = stepIndex === totalSteps;

  const needsInteraction = currentStep?.trigger === "click" || currentStep?.trigger === "focus" || currentStep?.trigger === "tab-switch";

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

  // ── Trigger Listeners ─────────────────────────────────────────────────

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
      if (currentStep.trigger === "click" || currentStep.trigger === "tab-switch") {
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
          const blurHandler = () => {
            setStepCompleted(true);
          };
          el.addEventListener("blur", blurHandler);
          cleanups.push(() => el.removeEventListener("blur", blurHandler));

          setTimeout(() => {
            el.removeEventListener("blur", blurHandler);
            setStepCompleted(true);
          }, 10000);
        };
        el.addEventListener("focus", focusHandler);
        cleanups.push(() => el.removeEventListener("focus", focusHandler));
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

  // ── Keyboard ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Enter" && stepCompleted) goNext();
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, stepCompleted, goNext, onClose]);

  // ── Render ────────────────────────────────────────────────────────────

  if (!isActive || !currentStep) return null;

  // ── Final Step ────────────────────────────────────────────────────────

  if (isFinalStep) {
    return (
      <div className="tdt-overlay" style={{ pointerEvents: "auto" }} onClick={onClose}>
        <div className="tdt-panel tdt-panel--final" style={{ top: panelRect.top, left: panelRect.left }}>
          <button className="tdt-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>

          <div className="tdt-final-header">
            <div className="tdt-final-icon">
              <Sparkles size={24} />
            </div>
            <h2 className="tdt-final-title">{t("detailTutorial.final.title")}</h2>
            <p className="tdt-final-desc">{t("detailTutorial.final.desc")}</p>
          </div>

          <div className="tdt-final-checklist">
            {[
              "detailTutorial.final.check1",
              "detailTutorial.final.check2",
              "detailTutorial.final.check3",
              "detailTutorial.final.check4",
              "detailTutorial.final.check5",
            ].map((key) => (
              <div key={key} className="tdt-final-check-item">
                <CheckCircle2 size={16} className="tdt-check-icon" />
                <span>{t(key)}</span>
              </div>
            ))}
          </div>

          <div className="tdt-final-actions">
            <button className="tdt-btn tdt-btn-primary" onClick={onFinish} title="Finish tutorial">
              {t("detailTutorial.final.finish")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Regular Step ──────────────────────────────────────────────────────

  return (
    <div className="tdt-overlay">
      <div
        ref={panelRef}
        className="tdt-panel"
        style={{ top: panelRect.top, left: panelRect.left }}
      >
        <div className="tdt-progress-bar">
          <div
            className="tdt-progress-fill"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="tdt-panel-header">
          <div className="tdt-step-badge">
            {stepIndex + 1} / {totalSteps}
          </div>
          <button className="tdt-close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="tdt-panel-body">
          <div className="tdt-step-icon-wrap">
            <Lightbulb size={18} />
          </div>
          <h3 className="tdt-step-title">{t(currentStep.titleKey)}</h3>
          <p className="tdt-step-desc">{t(currentStep.descKey)}</p>

          <div className="tdt-action-hint">
            <ArrowRight size={14} />
            <span>{t(currentStep.actionKey)}</span>
          </div>

          {stepCompleted && (
            <div className="tdt-step-complete">
              <CheckCircle2 size={16} />
              <span>{t("detailTutorial.common.done")}</span>
            </div>
          )}
        </div>

        <div className="tdt-panel-footer">
          <button className="tdt-btn tdt-btn-ghost" onClick={handleSkip} title="Skip tutorial">
            <SkipForward size={14} /> {t("detailTutorial.common.skip")}
          </button>

          <div className="tdt-nav-buttons">
            <button
              className="tdt-btn"
              onClick={goPrev}
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              className={`tdt-btn tdt-btn-primary ${!stepCompleted && currentStep.trigger !== "none" ? "tdt-btn--waiting" : ""}`}
              disabled={!stepCompleted && currentStep.trigger !== "none"}
              onClick={goNext}
              title="Next step">
              {t("detailTutorial.common.next")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Public helpers ─────────────────────────────────────────────────────────

export function isDetailTutorialCompleted(): boolean {
  return localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
}

export function markDetailTutorialCompleted(): void {
  localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
}

export function resetDetailTutorial(): void {
  localStorage.removeItem(TUTORIAL_STORAGE_KEY);
}
