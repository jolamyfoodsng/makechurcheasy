// ────────────────────────────────────────────────────────────────────────────
// Interactive Tutorial System – Theme Settings Page
//
// Guided onboarding for the Theme Settings view. Explains Custom Themes,
// OBS Themes, and Tickers. Automatically switches tabs when advancing
// between sections.
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
import "./ThemeSettingsTour.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface TutorialStep {
  target: string;
  titleKey: string;
  descKey: string;
  actionKey: string;
  trigger: "none";
  panelPosition: "right" | "left" | "top" | "bottom";
  /** Auto-switch to this tab when the step becomes active */
  switchTab?: "custom" | "obs" | "tickers";
}

const TOUR_STORAGE_KEY = "mce.theme-settings-tour.completed";

// ── Target Elevation ───────────────────────────────────────────────────────

/** Track active cleanups/resize handlers per step target so we can tear down
 *  across step transitions (the 150ms tab-switch delay means the inner
 *  setTimeout fires after the outer cleanup runs). */
const activeTourCleanups = new Map<string, () => void>();
const activeTourResizeHandlers = new Map<string, () => void>();

function elevateTarget(el: HTMLElement): () => void {
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

  const glow = `0 0 0 16px rgba(${primaryRgb},0.2), 0 0 30px 8px rgba(${primaryRgb},0.35), 0 0 60px 4px rgba(${primaryRgb},0.15)`;
  const glowDim = `0 0 0 20px rgba(${primaryRgb},0.1), 0 0 40px 12px rgba(${primaryRgb},0.25), 0 0 70px 4px rgba(${primaryRgb},0.1)`;

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

interface ThemeSettingsTourProps {
  isActive: boolean;
  onClose: () => void;
  onFinish: () => void;
  onTabSwitch: (tab: "custom" | "obs" | "tickers") => void;
}

export default function ThemeSettingsTour({
  isActive,
  onClose,
  onFinish,
  onTabSwitch,
}: ThemeSettingsTourProps) {
  const { t } = useTranslation();
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [panelRect, setPanelRect] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // ── Step Definitions ───────────────────────────────────────────────────

  const allSteps: TutorialStep[] = useMemo(() => [
    {
      target: "[data-theme-tutorial='header']",
      titleKey: "themeSettings.tour.step1.title",
      descKey: "themeSettings.tour.step1.desc",
      actionKey: "themeSettings.tour.step1.action",
      trigger: "none",
      panelPosition: "bottom",
      switchTab: "custom",
    },
    {
      target: "[data-theme-tutorial='custom-tab']",
      titleKey: "themeSettings.tour.step2.title",
      descKey: "themeSettings.tour.step2.desc",
      actionKey: "themeSettings.tour.step2.action",
      trigger: "none",
      panelPosition: "bottom",
    },
    {
      target: "[data-theme-tutorial='create-theme']",
      titleKey: "themeSettings.tour.step3.title",
      descKey: "themeSettings.tour.step3.desc",
      actionKey: "themeSettings.tour.step3.action",
      trigger: "none",
      panelPosition: "bottom",
    },
    {
      target: "[data-theme-tutorial='custom-list']",
      titleKey: "themeSettings.tour.step4.title",
      descKey: "themeSettings.tour.step4.desc",
      actionKey: "themeSettings.tour.step4.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-theme-tutorial='obs-tab']",
      titleKey: "themeSettings.tour.step5.title",
      descKey: "themeSettings.tour.step5.desc",
      actionKey: "themeSettings.tour.step5.action",
      trigger: "none",
      panelPosition: "bottom",
      switchTab: "obs",
    },
    {
      target: "[data-theme-tutorial='obs-theme-card']",
      titleKey: "themeSettings.tour.step6.title",
      descKey: "themeSettings.tour.step6.desc",
      actionKey: "themeSettings.tour.step6.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-theme-tutorial='obs-favorite']",
      titleKey: "themeSettings.tour.step7.title",
      descKey: "themeSettings.tour.step7.desc",
      actionKey: "themeSettings.tour.step7.action",
      trigger: "none",
      panelPosition: "top",
    },
    {
      target: "[data-theme-tutorial='tickers-tab']",
      titleKey: "themeSettings.tour.step8.title",
      descKey: "themeSettings.tour.step8.desc",
      actionKey: "themeSettings.tour.step8.action",
      trigger: "none",
      panelPosition: "bottom",
      switchTab: "tickers",
    },
    {
      target: "[data-theme-tutorial='ticker-card']",
      titleKey: "themeSettings.tour.step9.title",
      descKey: "themeSettings.tour.step9.desc",
      actionKey: "themeSettings.tour.step9.action",
      trigger: "none",
      panelPosition: "right",
    },
    {
      target: "[data-theme-tutorial='ticker-favorite']",
      titleKey: "themeSettings.tour.step10.title",
      descKey: "themeSettings.tour.step10.desc",
      actionKey: "themeSettings.tour.step10.action",
      trigger: "none",
      panelPosition: "top",
    },
  ], []);

  const steps = allSteps;
  const currentStep = steps[stepIndex];
  const totalSteps = steps.length;
  const isFinalStep = stepIndex === totalSteps;

  // ── Tab Switching ────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentStep || isFinalStep) return;
    if (currentStep.switchTab) {
      onTabSwitch(currentStep.switchTab);
    }
  }, [currentStep, isFinalStep, onTabSwitch]);

  // ── Target Elevation & Rect Tracking ─────────────────────────────────

  useEffect(() => {
    if (!isActive || !currentStep || isFinalStep) {
      setTargetRect(null);
      return;
    }

    // Small delay to allow tab switch DOM to settle
    const timer = setTimeout(() => {
      const el = document.querySelector(currentStep.target) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        return;
      }

      el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });

      const cleanup = elevateTarget(el);

      const updateRect = () => {
        setTargetRect(el.getBoundingClientRect());
      };

      updateRect();
      window.addEventListener("resize", updateRect);

      // Store cleanup in module-level map for the outer cleanup to use
      activeTourCleanups.set(currentStep.target, cleanup);
      activeTourResizeHandlers.set(currentStep.target, updateRect);

      return () => {
        window.removeEventListener("resize", updateRect);
      };
    }, 150);

    return () => {
      clearTimeout(timer);
      // Clean up any previous target
      const cleanupFn = activeTourCleanups.get(currentStep.target);
      if (cleanupFn) {
        cleanupFn();
        activeTourCleanups.delete(currentStep.target);
      }
      const resizeFn = activeTourResizeHandlers.get(currentStep.target);
      if (resizeFn) {
        window.removeEventListener("resize", resizeFn);
        activeTourResizeHandlers.delete(currentStep.target);
      }
    };
  }, [isActive, currentStep?.target, isFinalStep]);

  // ── Panel Positioning ─────────────────────────────────────────────────

  useEffect(() => {
    if (isFinalStep || !targetRect) {
      setPanelRect({ top: window.innerHeight / 2 - 180, left: window.innerWidth / 2 - 180 });
      return;
    }

    const panelW = 340;
    const panelH = 300;
    const gap = 20;

    let top: number;
    let left: number;

    // Position based on panelPosition preference
    switch (currentStep?.panelPosition) {
      case "left":
        top = targetRect.top + targetRect.height / 2 - panelH / 2;
        left = targetRect.left - gap - panelW;
        break;
      case "top":
        top = targetRect.top - gap - panelH;
        left = targetRect.left + targetRect.width / 2 - panelW / 2;
        break;
      case "bottom":
        top = targetRect.bottom + gap;
        left = targetRect.left + targetRect.width / 2 - panelW / 2;
        break;
      case "right":
      default:
        top = targetRect.top + targetRect.height / 2 - panelH / 2;
        left = targetRect.right + gap;
        break;
    }

    // Fallback if off-screen
    if (left + panelW > window.innerWidth - 20) {
      left = targetRect.left - gap - panelW;
    }
    if (left < 20) {
      left = Math.max(20, (window.innerWidth - panelW) / 2);
      top = targetRect.bottom + gap;
    }
    if (top < 20) {
      top = 20;
    }
    if (top + panelH > window.innerHeight - 20) {
      top = window.innerHeight - panelH - 20;
    }

    setPanelRect({ top, left });
  }, [targetRect, isFinalStep, currentStep?.panelPosition]);

  // ── Navigation ────────────────────────────────────────────────────────

  const goNext = useCallback(() => {
    if (isFinalStep) {
      onFinish();
      return;
    }
    if (stepIndex < totalSteps - 1) {
      setStepIndex((i) => i + 1);
    }
  }, [stepIndex, totalSteps, isFinalStep, onFinish]);

  const goPrev = useCallback(() => {
    if (stepIndex > 0) {
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
      } else if (e.key === "Enter") {
        goNext();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isActive, goNext, onClose]);

  // ── Nothing to render ─────────────────────────────────────────────────

  if (!isActive || !currentStep) return null;

  // ── Final Step ────────────────────────────────────────────────────────

  if (isFinalStep) {
    return (
      <div className="tst-overlay" style={{ pointerEvents: "auto" }} onClick={onClose}>
        <div className="tst-panel tst-panel--final" style={{ top: panelRect.top, left: panelRect.left }}>
          <button className="tst-close" onClick={onClose} title="Close">
            <X size={16} />
          </button>

          <div className="tst-final-header">
            <div className="tst-final-icon">
              <Sparkles size={24} />
            </div>
            <h2 className="tst-final-title">{t("themeSettings.tour.final.title")}</h2>
            <p className="tst-final-desc">{t("themeSettings.tour.final.desc")}</p>
          </div>

          <div className="tst-final-checklist">
            {[
              "themeSettings.tour.final.check1",
              "themeSettings.tour.final.check2",
              "themeSettings.tour.final.check3",
              "themeSettings.tour.final.check4",
              "themeSettings.tour.final.check5",
            ].map((key) => (
              <div key={key} className="tst-final-check-item">
                <CheckCircle2 size={16} className="tst-check-icon" />
                <span>{t(key)}</span>
              </div>
            ))}
          </div>

          <div className="tst-final-actions">
            <button className="tst-btn tst-btn-primary" onClick={onFinish} title="Finish tour">
              {t("themeSettings.tour.final.finish")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Regular Step ──────────────────────────────────────────────────────

  return (
    <div className="tst-overlay">
      <div
        ref={panelRef}
        className="tst-panel"
        style={{ top: panelRect.top, left: panelRect.left }}
      >
        <div className="tst-progress-bar">
          <div
            className="tst-progress-fill"
            style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
          />
        </div>

        <div className="tst-panel-header">
          <div className="tst-step-badge">
            {stepIndex + 1} / {totalSteps}
          </div>
          <button className="tst-close" onClick={onClose} title="Close">
            <X size={14} />
          </button>
        </div>

        <div className="tst-panel-body">
          <div className="tst-step-icon-wrap">
            <Lightbulb size={18} />
          </div>
          <h3 className="tst-step-title">{t(currentStep.titleKey)}</h3>
          <p className="tst-step-desc">{t(currentStep.descKey)}</p>

          <div className="tst-action-hint">
            <ArrowRight size={14} />
            <span>{t(currentStep.actionKey)}</span>
          </div>
        </div>

        <div className="tst-panel-footer">
          <button className="tst-btn tst-btn-ghost" onClick={handleSkip} title="Skip tour">
            <SkipForward size={14} /> {t("themeSettings.tour.common.skip")}
          </button>

          <div className="tst-nav-buttons">
            <button
              className="tst-btn"
              onClick={goPrev}
              title="Previous"
            >
              <ChevronLeft size={14} />
            </button>
            <button className="tst-btn tst-btn-primary" onClick={goNext} title="Next">
              {t("themeSettings.tour.common.next")} <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Public helpers ─────────────────────────────────────────────────────────

export function isThemeTourCompleted(): boolean {
  return localStorage.getItem(TOUR_STORAGE_KEY) === "true";
}

export function markThemeTourCompleted(): void {
  localStorage.setItem(TOUR_STORAGE_KEY, "true");
}

export function resetThemeTour(): void {
  localStorage.removeItem(TOUR_STORAGE_KEY);
}
