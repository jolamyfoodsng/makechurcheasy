/**
 * OnboardingTour.tsx — Reusable spotlight onboarding tour component.
 *
 * Features:
 * - Spotlight effect highlighting target elements
 * - Smooth CSS animations (fade, slide, scale)
 * - Keyboard support (ESC to close, arrow keys for navigation)
 * - Progress indicator (Step X of Y)
 * - Responsive positioning
 * - localStorage persistence
 *
 * Design follows MakeChurchEasy design system:
 * - Inter font
 * - CSS variables for theming
 * - 150-300ms animations
 * - No bounce/shake/flash
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  ArrowRight,
  Book,
  Check,
  Copy,
  List,
  Mic,
  Radio,
  Sparkles,
  X,
} from "lucide-react";
import "./OnboardingTour.css";

// ── Types ──

export interface OnboardingStep {
  /** CSS selector for the target element to highlight */
  target?: string;
  /** Title of the step */
  title: string;
  /** Description text (supports line breaks with \n) */
  description: string;
  /** Optional icon name (from lucide-react) */
  icon?: "sparkles" | "mic" | "radio" | "book" | "list" | "copy" | "check";
  /** Optional list of features/bullet points */
  features?: string[];
  /** Whether this is the final completion step */
  isComplete?: boolean;
  /** Custom button label for the final step */
  completeLabel?: string;
}

export interface OnboardingTourProps {
  /** Unique key for localStorage persistence */
  tourKey: string;
  /** Array of steps to show */
  steps: OnboardingStep[];
  /** Whether the tour is currently active */
  isOpen: boolean;
  /** Callback when tour is closed (completed, skipped, or dismissed) */
  onClose: () => void;
  /** Optional callback when tour is completed */
  onComplete?: () => void;
  /** Padding around the spotlight highlight (px) */
  spotlightPadding?: number;
  /** Border radius of the spotlight highlight (px) */
  spotlightRadius?: number;
}

// ── Icons map ──

const ICONS = {
  sparkles: Sparkles,
  mic: Mic,
  radio: Radio,
  book: Book,
  list: List,
  copy: Copy,
  check: Check,
};

// ── Helper: Get element rect ──

function getElementRect(selector: string | undefined): DOMRect | null {
  if (!selector) return null;
  try {
    const el = document.querySelector(selector);
    if (!el) return null;
    return el.getBoundingClientRect();
  } catch {
    return null;
  }
}

// ── Helper: Check if tour was completed ──

export function isTourCompleted(tourKey: string): boolean {
  try {
    return localStorage.getItem(tourKey) === "true";
  } catch {
    return false;
  }
}

// ── Helper: Mark tour as completed ──

export function markTourCompleted(tourKey: string): void {
  try {
    localStorage.setItem(tourKey, "true");
  } catch {
    // Ignore storage errors
  }
}

// ── Helper: Reset tour completion ──

export function resetTour(tourKey: string): void {
  try {
    localStorage.removeItem(tourKey);
  } catch {
    // Ignore storage errors
  }
}

// ── Main Component ──

export default function OnboardingTour({
  tourKey,
  steps,
  isOpen,
  onClose,
  onComplete,
  spotlightPadding = 8,
  spotlightRadius = 12,
}: OnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardPosition, setCardPosition] = useState<{ top: number; left: number } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = steps[currentStep];
  const totalSteps = steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const isComplete = step?.isComplete === true;

  // ── Update target rect on step change or window resize ──

  const updateTargetRect = useCallback(() => {
    if (!isOpen) return;
    const rect = getElementRect(step?.target);
    setTargetRect(rect);
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
    if (!isOpen || !targetRect) {
      setCardPosition(null);
      return;
    }

    // Wait for card to render to get its dimensions
    const calculatePosition = () => {
      const card = cardRef.current;
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 20;

      let top: number;
      let left: number;

      // Try to position below the target
      const spaceBelow = viewportHeight - targetRect.bottom - margin;
      const spaceAbove = targetRect.top - margin;

      if (spaceBelow >= cardRect.height + margin) {
        // Position below
        top = targetRect.bottom + spotlightPadding + 12;
      } else if (spaceAbove >= cardRect.height + margin) {
        // Position above
        top = targetRect.top - spotlightPadding - cardRect.height - 12;
      } else {
        // Not enough space above or below, position in the middle of viewport
        top = Math.max(margin, (viewportHeight - cardRect.height) / 2);
      }

      // Horizontal positioning
      const targetCenterX = targetRect.left + targetRect.width / 2;
      left = targetCenterX - cardRect.width / 2;

      // Clamp to viewport
      left = Math.max(margin, Math.min(left, viewportWidth - cardRect.width - margin));
      top = Math.max(margin, Math.min(top, viewportHeight - cardRect.height - margin));

      setCardPosition({ top, left });
    };

    // Small delay to ensure card is rendered
    const timeout = setTimeout(calculatePosition, 50);
    return () => clearTimeout(timeout);
  }, [isOpen, targetRect, currentStep, spotlightPadding]);

  // ── Animation handler ──

  const animateTransition = useCallback((callback: () => void) => {
    setIsAnimating(true);
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }
    animationTimeoutRef.current = setTimeout(() => {
      callback();
      setIsAnimating(false);
    }, 150);
  }, []);

  // ── Navigation handlers ──

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleComplete();
      return;
    }
    animateTransition(() => {
      setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
    });
  }, [isLastStep, totalSteps, animateTransition]);

  const handleBack = useCallback(() => {
    if (isFirstStep) return;
    animateTransition(() => {
      setCurrentStep((s) => Math.max(s - 1, 0));
    });
  }, [isFirstStep, animateTransition]);

  const handleSkip = useCallback(() => {
    markTourCompleted(tourKey);
    onClose();
  }, [tourKey, onClose]);

  const handleComplete = useCallback(() => {
    markTourCompleted(tourKey);
    onComplete?.();
    onClose();
  }, [tourKey, onClose, onClose]);

  const handleDontShowAgain = useCallback(() => {
    markTourCompleted(tourKey);
    onClose();
  }, [tourKey, onClose]);

  // ── Keyboard support ──

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          handleSkip();
          break;
        case "ArrowRight":
        case "Enter":
          if (!isLastStep || isComplete) {
            e.preventDefault();
            handleNext();
          }
          break;
        case "ArrowLeft":
          if (!isFirstStep) {
            e.preventDefault();
            handleBack();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleNext, handleBack, handleSkip, isFirstStep, isLastStep, isComplete]);

  // ── Reset step when tour opens ──

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // ── Cleanup timeout on unmount ──

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  if (!isOpen || !step) return null;

  // ── Get icon component ──

  const IconComponent = step.icon ? ICONS[step.icon] : Sparkles;

  // ── Render spotlight overlay ──

  const renderOverlay = () => {
    // If no target (full page highlight), show simple overlay
    if (!targetRect) {
      return (
        <div className="ob-tour-overlay ob-tour-overlay--full" />
      );
    }

    // Calculate spotlight rect with padding
    const spotTop = targetRect.top - spotlightPadding;
    const spotLeft = targetRect.left - spotlightPadding;
    const spotWidth = targetRect.width + spotlightPadding * 2;
    const spotHeight = targetRect.height + spotlightPadding * 2;

    return (
      <div className="ob-tour-overlay">
        {/* Dark overlay with cutout */}
        <div
          className="ob-tour-overlay-darken"
          style={{
            clipPath: `path('M0,0 H100% V100% H0 V0 M${spotLeft},${spotTop} h${spotWidth} v${spotHeight} h-${spotWidth} v-${spotHeight}')`,
          }}
        />
        {/* Spotlight border */}
        <div
          className="ob-tour-spotlight-border"
          style={{
            top: spotTop,
            left: spotLeft,
            width: spotWidth,
            height: spotHeight,
            borderRadius: spotlightRadius,
          }}
        />
      </div>
    );
  };

  // ── Render card content ──

  const renderCardContent = () => {
    return (
      <div className={`ob-tour-card-content ${isAnimating ? "ob-tour-card-content--animating" : ""}`}>
        {/* Icon */}
        <div className="ob-tour-card-icon">
          <IconComponent size={20} />
        </div>

        {/* Title */}
        <h3 className="ob-tour-card-title">{step.title}</h3>

        {/* Description */}
        <p className="ob-tour-card-description">
          {step.description.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i < step.description.split("\n").length - 1 && <br />}
            </span>
          ))}
        </p>

        {/* Features list */}
        {step.features && step.features.length > 0 && (
          <ul className="ob-tour-card-features">
            {step.features.map((feature, i) => (
              <li key={i} className="ob-tour-card-feature">
                <span className="ob-tour-card-feature-dot" />
                {feature}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  // ── Render card ──

  const renderCard = () => {
    return (
      <div
        ref={cardRef}
        className={`ob-tour-card ${isComplete ? "ob-tour-card--complete" : ""}`}
        style={cardPosition ? { top: cardPosition.top, left: cardPosition.left } : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {/* Close button */}
        <button
          className="ob-tour-card-close"
          onClick={handleSkip}
          aria-label="Close tour"
          title="Close tour">
          <X size={14} />
        </button>

        {/* Progress indicator */}
        {!isComplete && (
          <div className="ob-tour-card-progress">
            <span className="ob-tour-card-progress-text">
              Step {currentStep + 1} of {totalSteps}
            </span>
            <div className="ob-tour-card-progress-bar">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`ob-tour-card-progress-dot ${i === currentStep
                    ? "ob-tour-card-progress-dot--active"
                    : i < currentStep
                      ? "ob-tour-card-progress-dot--done"
                      : ""
                    }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* Content */}
        {renderCardContent()}

        {/* Actions */}
        <div className="ob-tour-card-actions">
          {!isComplete ? (
            <>
              {!isFirstStep && (
                <button
                  className="ob-tour-btn ob-tour-btn--ghost"
                  onClick={handleBack}
                  title="Back">
                  <ArrowLeft size={14} />
                  Back
                </button>
              )}
              <div className="ob-tour-card-actions-right">
                <button
                  className="ob-tour-btn ob-tour-btn--text"
                  onClick={handleSkip}
                  title="Skip tour">
                  Skip tour
                </button>
                <button
                  className="ob-tour-btn ob-tour-btn--primary"
                  onClick={handleNext}
                  title="Next step">
                  {isLastStep ? "Finish" : "Next"}
                  {!isLastStep && <ArrowRight size={14} />}
                </button>
              </div>
            </>
          ) : (
            <div className="ob-tour-card-actions-complete">
              <button
                className="ob-tour-btn ob-tour-btn--text"
                onClick={handleDontShowAgain}
                title="Don&apos;t show again">
                Don&apos;t show again
              </button>
              <button
                className="ob-tour-btn ob-tour-btn--success"
                onClick={handleComplete}
                title="Complete onboarding">
                <Check size={14} />
                {step.completeLabel || "Get Started"}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Portal render ──

  return createPortal(
    <div className="ob-tour-root">
      {renderOverlay()}
      {renderCard()}
    </div>,
    document.body
  );
}
