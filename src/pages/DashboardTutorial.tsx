// ────────────────────────────────────────────────────────────────────────────
// Interactive Tutorial System – Dashboard (Production Home)
//
// A guided onboarding assistant that walks new users through the dashboard:
// OBS connection, module cards, Voice Bible, connection URLs, and activity log.
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
import "./DashboardTutorial.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface TutorialStep {
  target: string;
  titleKey: string;
  descKey: string;
  actionKey: string;
  trigger: "click" | "focus" | "view-change" | "none";
  triggerSelector?: string;
  skipIf?: () => boolean;
  panelPosition: "right" | "left" | "top" | "bottom";
}

const STORAGE_KEY = "mce.dashboard.tutorial.completed";

// ── Target Elevation ───────────────────────────────────────────────────────

function elevateTarget(el: HTMLElement, interactive: boolean): () => void {
  const primaryRgb = getComputedStyle(document.documentElement)
    .getPropertyValue("--primary-rgb")
    .trim() || "99,102,241";

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

  el.style.setProperty("--mce-glow", glow);
  el.style.setProperty("--mce-glow-dim", glowDim);
  if (interactive) {
    el.classList.add("mce-tutorial-glow-pulse");
  }

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

interface DashboardTutorialProps {
  isActive: boolean;
  onClose: () => void;
  onFinish: () => void;
}

export default function DashboardTutorial({
  isActive,
  onClose,
  onFinish,
}: DashboardTutorialProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [stepCompleted, setStepCompleted] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Step Definitions ───────────────────────────────────────────────────

  const allSteps: TutorialStep[] = useMemo(() => [
    {
      target: "[data-dt-tutorial='header']",
      titleKey: "dt.step1.title",
      descKey: "dt.step1.desc",
      actionKey: "dt.step1.action",
      trigger: "none",
      panelPosition: "bottom",
    },
    {
      target: "[data-dt-tutorial='status-panel']",
      titleKey: "dt.step2.title",
      descKey: "dt.step2.desc",
      actionKey: "dt.step2.action",
      trigger: "none",
      panelPosition: "bottom",
    },
    {
      target: "[data-dt-tutorial='feature-grid']",
      titleKey: "dt.step3.title",
      descKey: "dt.step3.desc",
      actionKey: "dt.step3.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-dt-tutorial='voice-bible']",
      titleKey: "dt.step4.title",
      descKey: "dt.step4.desc",
      actionKey: "dt.step4.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-dt-tutorial='connection-urls']",
      titleKey: "dt.step5.title",
      descKey: "dt.step5.desc",
      actionKey: "dt.step5.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-dt-tutorial='activity-log']",
      titleKey: "dt.step6.title",
      descKey: "dt.step6.desc",
      actionKey: "dt.step6.action",
      trigger: "none",
      panelPosition: "left",
    },
  ], []);

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
            setStepCompleted(true);
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
      <div className="dt-overlay" style={{ pointerEvents: "auto" }} onClick={onClose}>
        <div className="dt-panel dt-panel--final" style={{ top: panelRect.top, left: panelRect.left }}>
          <button className="dt-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>

          <div className="dt-final-header">
            <div className="dt-final-icon">
              <Sparkles size={24} />
            </div>
            <h2 className="dt-final-title">{t("dt.final.title")}</h2>
            <p className="dt-final-desc">{t("dt.final.desc")}</p>
          </div>

          <div className="dt-final-checklist">
            {[
              "dt.final.check1",
              "dt.final.check2",
              "dt.final.check3",
              "dt.final.check4",
              "dt.final.check5",
            ].map((key) => (
              <div key={key} className="dt-final-check-item">
                <CheckCircle2 size={16} className="dt-check-icon" />
                <span>{t(key)}</span>
              </div>
            ))}
          </div>

          <div className="dt-final-actions">
            <button className="dt-btn dt-btn-primary" onClick={onFinish} title="Finish tutorial">
              {t("dt.final.finish")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Regular Step ──────────────────────────────────────────────────────

  return (
    <div className="dt-overlay">
      <div
        ref={panelRef}
        className="dt-panel"
        style={{ top: panelRect.top, left: panelRect.left }}
      >
        <div className="dt-progress-bar">
          <div
            className="dt-progress-fill"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="dt-panel-header">
          <div className="dt-step-badge">
            {stepIndex + 1} / {totalSteps}
          </div>
          <button className="dt-close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="dt-panel-body">
          <div className="dt-step-icon-wrap">
            <Lightbulb size={18} />
          </div>
          <h3 className="dt-step-title">{t(currentStep.titleKey)}</h3>
          <p className="dt-step-desc">{t(currentStep.descKey)}</p>

          <div className="dt-action-hint">
            <ArrowRight size={14} />
            <span>{t(currentStep.actionKey)}</span>
          </div>

          {stepCompleted && (
            <div className="dt-step-complete">
              <CheckCircle2 size={16} />
              <span>{t("dt.common.done")}</span>
            </div>
          )}
        </div>

        <div className="dt-panel-footer">
          <button
            className="dt-btn dt-btn-ghost"
            onClick={handleSkip}
            title="Skip tutorial">
            <SkipForward size={14} /> {t("dt.common.skip")}
          </button>

          <div className="dt-nav-buttons">
            <button
              className="dt-btn"
              onClick={goPrev}
              title="Previous">
              <ChevronLeft size={14} />
            </button>
            <button
              className={`dt-btn dt-btn-primary ${!stepCompleted && currentStep.trigger !== "none" ? "dt-btn--waiting" : ""}`}
              disabled={!stepCompleted && currentStep.trigger !== "none"}
              onClick={goNext}
              title="Next step">
              {t("dt.common.next")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Public helpers ─────────────────────────────────────────────────────────

export function isDashboardTutorialCompleted(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

export function markDashboardTutorialCompleted(): void {
  localStorage.setItem(STORAGE_KEY, "true");
}

export function resetDashboardTutorial(): void {
  localStorage.removeItem(STORAGE_KEY);
}
