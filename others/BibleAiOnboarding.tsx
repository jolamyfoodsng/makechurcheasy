import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Mic, Radio, BookOpen, Monitor, Settings,
  ArrowDown, List, Pin, Check, X,
  ArrowLeft, ArrowRight, Sparkles, Brain, MessageSquare,
} from "lucide-react";
import "./BibleAiOnboarding.css";

const STORAGE_KEY = "bible_ai_onboarding_completed";

export function isBibleAiOnboardingCompleted(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "true"; } catch { return false; }
}

export function markBibleAiOnboardingCompleted(): void {
  try { localStorage.setItem(STORAGE_KEY, "true"); } catch { }
}

export function resetBibleAiOnboarding(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { }
}

interface Step {
  title: string;
  description: string;
  icon?: typeof Mic;
  features?: string[];
  isWelcome?: boolean;
  isComplete?: boolean;
  completeLabel?: string;
  target?: string;
  highlightPadding?: number;
  onEnter?: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

function buildSteps(
  _openSettings: () => void,
): Step[] {
  return [
    {
      title: "Welcome to Bible AI",
      description:
        "Bible AI listens to spoken Bible references and helps you quickly display verses during your service.",
      isWelcome: true,
    },
    {
      title: "Live Detection",
      description:
        "When someone says a Bible reference during service, the detected verse appears here instantly.",
      icon: Radio,
      target: "[data-onboarding='live-card']",
    },
    {
      title: "Push to OBS",
      description:
        "Press Push To OBS to send this verse to your broadcast. You can also enable automatic pushing in settings.",
      icon: Monitor,
      target: "[data-onboarding='push-btn']",
    },
    {
      title: "Auto Push",
      description:
        "Save time by letting Bible AI automatically send detected verses to your broadcast. You can turn this on or off anytime.",
      icon: Settings,
      target: "[data-onboarding='auto-push-setting']",
      onEnter: openSettings,
    },
    {
      title: "Translation",
      description:
        "Choose your preferred Bible version. Available translations include KJV, NIV, ESV, NKJV, and NLT.",
      icon: BookOpen,
      target: "[data-onboarding='translation-setting']",
    },
    {
      title: "Queue",
      description:
        "Previous detected verses stay here so you can review them. The latest verse appears first.",
      icon: List,
      target: "[data-onboarding='queue-section']",
    },
    {
      title: "Pin Verses",
      description:
        "Save important verses for quick access. Your pinned verses stay available even when new verses are detected.",
      icon: Pin,
      target: "[data-onboarding='pin-btn']",
      features: ["📌 John 3:16 — stays pinned until you remove it"],
    },
    {
      title: "You're ready!",
      description:
        "You can now detect verses automatically, review suggestions, push to OBS, and customize automation settings.",
      isComplete: true,
      completeLabel: "Start Using Bible AI",
      features: [
        "Detect verses automatically",
        "Review suggestions",
        "Push to OBS",
        "Customize automation settings",
      ],
    },
  ];
}

function getStepIcon(step: Step) {
  if (step.isWelcome) return Sparkles;
  if (step.isComplete) return Check;
  return step.icon || Sparkles;
}

export default function BibleAiOnboarding({ isOpen, onClose, onOpenSettings }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardPosition, setCardPosition] = useState<{ top: number; left: number } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [settingsOpened, setSettingsOpened] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openSettings = useCallback(() => {
    if (typeof onOpenSettings === "function") {
      onOpenSettings();
    } else {
      (document.querySelector("[data-onboarding='settings-btn']") as HTMLButtonElement)?.click();
    }
  }, [onOpenSettings]);

  const STEPS = useMemo(() => buildSteps(openSettings), [openSettings]);
  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;
  const isWelcome = step?.isWelcome === true;
  const isComplete = step?.isComplete === true;

  // ── Update target rect ──

  const updateTargetRect = useCallback(() => {
    if (!isOpen || !step?.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [isOpen, step?.target]);

  useEffect(() => {
    updateTargetRect();
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);
    return () => {
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [updateTargetRect]);

  // ── Calculate card position ──

  useEffect(() => {
    if (!isOpen || isWelcome || isComplete || !targetRect) {
      setCardPosition(null);
      return;
    }

    const calc = () => {
      const card = cardRef.current;
      if (!card) return;
      const cardRect = card.getBoundingClientRect();
      const vpW = window.innerWidth;
      const vpH = window.innerHeight;
      const margin = 20;
      const padding = step.highlightPadding ?? 12;

      let top: number;
      let left: number;

      const spaceBelow = vpH - targetRect.bottom - margin;
      const spaceAbove = targetRect.top - margin;

      if (spaceBelow >= cardRect.height + margin) {
        top = targetRect.bottom + padding + 12;
      } else if (spaceAbove >= cardRect.height + margin) {
        top = targetRect.top - padding - cardRect.height - 12;
      } else {
        top = Math.max(margin, (vpH - cardRect.height) / 2);
      }

      const centerX = targetRect.left + targetRect.width / 2;
      left = centerX - cardRect.width / 2;
      left = Math.max(margin, Math.min(left, vpW - cardRect.width - margin));
      top = Math.max(margin, Math.min(top, vpH - cardRect.height - margin));

      setCardPosition({ top, left });
    };

    const timeout = setTimeout(calc, 50);
    return () => clearTimeout(timeout);
  }, [isOpen, isWelcome, isComplete, targetRect, currentStep, step?.highlightPadding]);

  // ── Run onEnter callback ──

  useEffect(() => {
    if (step?.onEnter) {
      if (currentStep === 3 && !settingsOpened) {
        step.onEnter();
        setSettingsOpened(true);
      } else if (currentStep !== 3) {
        setSettingsOpened(false);
      }
    }
  }, [currentStep, step?.onEnter, settingsOpened]);

  // ── Navigation ──

  const animate = useCallback((fn: () => void) => {
    setIsAnimating(true);
    if (animRef.current) clearTimeout(animRef.current);
    animRef.current = setTimeout(() => {
      fn();
      setIsAnimating(false);
    }, 120);
  }, []);

  const handleNext = useCallback(() => {
    if (isLast) {
      markBibleAiOnboardingCompleted();
      onClose();
      return;
    }
    animate(() => setCurrentStep((s) => s + 1));
  }, [isLast, animate, onClose]);

  const handleBack = useCallback(() => {
    if (isFirst) return;
    animate(() => setCurrentStep((s) => s - 1));
  }, [isFirst, animate]);

  const handleSkip = useCallback(() => {
    markBibleAiOnboardingCompleted();
    onClose();
  }, [onClose]);

  const handleComplete = useCallback(() => {
    markBibleAiOnboardingCompleted();
    onClose();
  }, [onClose]);

  // ── Keyboard ──

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape": handleSkip(); break;
        case "ArrowRight":
        case "Enter":
          if (!isComplete) { e.preventDefault(); handleNext(); }
          break;
        case "ArrowLeft":
          if (!isFirst) { e.preventDefault(); handleBack(); }
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, handleNext, handleBack, handleSkip, isFirst, isComplete]);

  // ── Reset step on open ──

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setSettingsOpened(false);
    }
  }, [isOpen]);

  useEffect(() => {
    return () => { if (animRef.current) clearTimeout(animRef.current); };
  }, []);

  if (!isOpen || !step) return null;

  const IconComponent = getStepIcon(step);

  // ── Overlay ──

  const renderOverlay = () => {
    if (isWelcome || isComplete || !targetRect || !step.target) {
      return <div className="bai-overlay bai-overlay--full" />;
    }

    const pad = step.highlightPadding ?? 8;
    const spotTop = targetRect.top - pad;
    const spotLeft = targetRect.left - pad;
    const spotW = targetRect.width + pad * 2;
    const spotH = targetRect.height + pad * 2;

    return (
      <div className="bai-overlay">
        <div
          className="bai-overlay-darken"
          style={{
            clipPath: `path('M0,0 H100% V100% H0 V0 M${spotLeft},${spotTop} h${spotW} v${spotH} h-${spotW} v-${spotH}')`,
          }}
        />
        <div
          className="bai-spotlight"
          style={{
            top: spotTop, left: spotLeft,
            width: spotW, height: spotH,
            borderRadius: 10,
          }}
        />
      </div>
    );
  };

  // ── Content ──

  const renderContent = () => {
    if (isWelcome) {
      return (
        <div className={`bai-card-content${isAnimating ? " bai-card-content--anim" : ""}`}>
          <div className="bai-welcome-icon">
            <Sparkles size={24} />
          </div>
          <h2 className="bai-card-title">{step.title}</h2>
          <p className="bai-card-desc">{step.description}</p>

          <div className="bai-flow">
            <div className="bai-flow-item">
              <Mic size={18} />
              <span>Speaker mentions verse</span>
            </div>
            <ArrowDown size={14} className="bai-flow-arrow" />
            <div className="bai-flow-item">
              <Brain size={18} />
              <span>AI detects verse</span>
            </div>
            <ArrowDown size={14} className="bai-flow-arrow" />
            <div className="bai-flow-item">
              <MessageSquare size={18} />
              <span>Verse appears here</span>
            </div>
            <ArrowDown size={14} className="bai-flow-arrow" />
            <div className="bai-flow-item">
              <Monitor size={18} />
              <span>Push to OBS</span>
            </div>
          </div>
        </div>
      );
    }

    if (isComplete) {
      return (
        <div className={`bai-card-content bai-card-content--complete${isAnimating ? " bai-card-content--anim" : ""}`}>
          <div className="bai-complete-icon">
            <Check size={28} />
          </div>
          <h2 className="bai-card-title">{step.title}</h2>
          <p className="bai-card-desc">{step.description}</p>
          {step.features && step.features.length > 0 && (
            <ul className="bai-features">
              {(step.features as string[]).map((f: string, i: number) => (
                <li key={i} className="bai-feature-item">
                  <Check size={12} className="bai-feature-check" />
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    return (
      <div className={`bai-card-content${isAnimating ? " bai-card-content--anim" : ""}`}>
        <div className="bai-step-icon">
          <IconComponent size={20} />
        </div>
        <h3 className="bai-card-title">{step.title}</h3>
        <p className="bai-card-desc">{step.description}</p>
        {step.features && step.features.length > 0 && (
          <ul className="bai-features">
            {(step.features as string[]).map((f: string, i: number) => (
              <li key={i} className="bai-feature-item">
                <span className="bai-feature-dot" />
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // ── Navigation ──

  const renderNav = () => {
    if (isComplete) {
      return (
        <div className="bai-nav bai-nav--complete">
          <button className="bai-btn bai-btn--text" onClick={handleSkip}>
            Don't show again
          </button>
          <button className="bai-btn bai-btn--primary bai-btn--large" onClick={handleComplete}>
            <Check size={16} />
            {step.completeLabel || "Get Started"}
          </button>
        </div>
      );
    }

    return (
      <div className="bai-nav">
        {!isFirst && (
          <button className="bai-btn bai-btn--ghost" onClick={handleBack}>
            <ArrowLeft size={14} />
            Back
          </button>
        )}
        <div className="bai-nav-right">
          <button className="bai-btn bai-btn--text" onClick={handleSkip}>
            Skip
          </button>
          <button className="bai-btn bai-btn--primary" onClick={handleNext}>
            {isLast ? "Finish" : "Next"}
            {!isLast && <ArrowRight size={14} />}
          </button>
        </div>
      </div>
    );
  };

  return createPortal(
    <div className="bai-root">
      {renderOverlay()}

      <div
        ref={cardRef}
        className={`bai-card ${isWelcome ? "bai-card--welcome" : ""} ${isComplete ? "bai-card--complete" : ""}`}
        style={
          cardPosition && !isWelcome && !isComplete
            ? { top: cardPosition.top, left: cardPosition.left }
            : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }
        }
      >
        <button className="bai-close" onClick={handleSkip} aria-label="Close tour">
          <X size={14} />
        </button>

        {!isComplete && (
          <div className="bai-progress">
            <span className="bai-progress-label">
              Step {currentStep + 1} of {totalSteps}
            </span>
            <div className="bai-progress-bar">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`bai-progress-dot ${
                    i === currentStep
                      ? "bai-progress-dot--active"
                      : i < currentStep
                        ? "bai-progress-dot--done"
                        : ""
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {renderContent()}
        {renderNav()}
      </div>
    </div>,
    document.body,
  );
}
