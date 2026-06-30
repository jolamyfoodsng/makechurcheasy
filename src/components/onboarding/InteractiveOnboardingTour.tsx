/**
 * InteractiveOnboardingTour.tsx — Event-driven setup wizard.
 *
 * Unlike passive tooltip tours, this component:
 * - Waits for user actions before progressing
 * - Shows success/helper messages based on state
 * - Disables Next button when waiting for validation
 * - Auto-advances when conditions are met
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
  CheckCircle,
  Copy,
  CreditCard,
  HelpCircle,
  Link,
  List,
  Mic,
  Radio,
  Sparkles,
  X,
} from "lucide-react";
import "./InteractiveOnboardingTour.css";

// ── Types ──

export interface InteractiveStep {
  /** CSS selector for the target element to highlight */
  target?: string;
  /** Title of the step */
  title: string;
  /** Description text (supports line breaks with \n) */
  description: string;
  /** Optional icon name (from lucide-react) */
  icon?: "sparkles" | "mic" | "radio" | "book" | "list" | "copy" | "check" | "credit" | "link" | "help";
  /** Optional list of features/bullet points */
  features?: string[];
  /** Whether this is the final completion step */
  isComplete?: boolean;
  /** Custom button label for the final step */
  completeLabel?: string;

  /** Validation function that returns true when step is complete */
  validate?: () => boolean;
  /** Message shown when validation passes */
  successMessage?: string;
  /** Helper message shown when user is stuck (after timeout) */
  helperMessage?: string;
  /** Timeout in ms before showing helper message (default: 8000) */
  helperTimeout?: number;
  /** Whether to show Skip button */
  showSkip?: boolean;
  /** Whether to auto-advance when validation passes */
  autoAdvance?: boolean;
  /** Delay in ms before auto-advancing (default: 1500) */
  autoAdvanceDelay?: number;
}

export interface InteractiveOnboardingTourProps {
  /** Unique key for localStorage persistence */
  tourKey: string;
  /** Array of steps to show */
  steps: InteractiveStep[];
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
  credit: CreditCard,
  link: Link,
  help: HelpCircle,
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

export default function InteractiveOnboardingTour({
  tourKey,
  steps,
  isOpen,
  onClose,
  onComplete,
  spotlightPadding = 8,
  spotlightRadius = 12,
}: InteractiveOnboardingTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [cardPosition, setCardPosition] = useState<{ top: number; left: number } | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [validationPassed, setValidationPassed] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const animationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const helperTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoAdvanceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const step = steps[currentStep];
  const totalSteps = steps.length;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === totalSteps - 1;
  const isComplete = step?.isComplete === true;
  const hasValidation = !!step?.validate;
  const canProceed = !hasValidation || validationPassed;

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

    const calculatePosition = () => {
      const card = cardRef.current;
      if (!card) return;

      const cardRect = card.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const margin = 20;

      let top: number;
      let left: number;

      const spaceBelow = viewportHeight - targetRect.bottom - margin;
      const spaceAbove = targetRect.top - margin;

      if (spaceBelow >= cardRect.height + margin) {
        top = targetRect.bottom + spotlightPadding + 12;
      } else if (spaceAbove >= cardRect.height + margin) {
        top = targetRect.top - spotlightPadding - cardRect.height - 12;
      } else {
        top = Math.max(margin, (viewportHeight - cardRect.height) / 2);
      }

      const targetCenterX = targetRect.left + targetRect.width / 2;
      left = targetCenterX - cardRect.width / 2;

      left = Math.max(margin, Math.min(left, viewportWidth - cardRect.width - margin));
      top = Math.max(margin, Math.min(top, viewportHeight - cardRect.height - margin));

      setCardPosition({ top, left });
    };

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

  // ── Validation monitoring ──

  useEffect(() => {
    if (!isOpen || !step || !step.validate) {
      setValidationPassed(false);
      setShowHelper(false);
      setShowSuccess(false);
      return;
    }

    // Check validation immediately
    const isValid = step.validate();
    setValidationPassed(isValid);

    if (isValid) {
      setShowSuccess(true);
      setShowHelper(false);

      // Auto-advance if enabled
      if (step.autoAdvance && !isLastStep) {
        const delay = step.autoAdvanceDelay ?? 1500;
        autoAdvanceTimeoutRef.current = setTimeout(() => {
          handleNext();
        }, delay);
      }
    } else {
      setShowSuccess(false);

      // Show helper after timeout
      const helperTimeout = step.helperTimeout ?? 8000;
      if (step.helperMessage) {
        helperTimeoutRef.current = setTimeout(() => {
          setShowHelper(true);
        }, helperTimeout);
      }
    }

    // Poll validation every 500ms
    const interval = setInterval(() => {
      const isValid = step.validate?.();
      if (isValid !== validationPassed) {
        setValidationPassed(isValid ?? false);
        if (isValid) {
          setShowSuccess(true);
          setShowHelper(false);
          if (step.autoAdvance && !isLastStep) {
            const delay = step.autoAdvanceDelay ?? 1500;
            autoAdvanceTimeoutRef.current = setTimeout(() => {
              handleNext();
            }, delay);
          }
        }
      }
    }, 500);

    return () => {
      clearInterval(interval);
      if (helperTimeoutRef.current) {
        clearTimeout(helperTimeoutRef.current);
      }
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, [isOpen, step, validationPassed, isLastStep]);

  // ── Navigation handlers ──

  const handleNext = useCallback(() => {
    if (isLastStep) {
      handleComplete();
      return;
    }
    if (!canProceed) return; // Block if validation not passed

    animateTransition(() => {
      setCurrentStep((s) => Math.min(s + 1, totalSteps - 1));
      setValidationPassed(false);
      setShowHelper(false);
      setShowSuccess(false);
    });
  }, [isLastStep, totalSteps, animateTransition, canProceed]);

  const handleBack = useCallback(() => {
    if (isFirstStep) return;
    animateTransition(() => {
      setCurrentStep((s) => Math.max(s - 1, 0));
      setValidationPassed(false);
      setShowHelper(false);
      setShowSuccess(false);
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
  }, [tourKey, onClose, onComplete]);

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
          if (canProceed && (!isLastStep || isComplete)) {
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
  }, [isOpen, handleNext, handleBack, handleSkip, isFirstStep, isLastStep, isComplete, canProceed]);

  // ── Reset step when tour opens ──

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
      setValidationPassed(false);
      setShowHelper(false);
      setShowSuccess(false);
    }
  }, [isOpen]);

  // ── Cleanup timeouts on unmount ──

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
      if (helperTimeoutRef.current) {
        clearTimeout(helperTimeoutRef.current);
      }
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, []);

  if (!isOpen || !step) return null;

  // ── Get icon component ──

  const IconComponent = step.icon ? ICONS[step.icon] : Sparkles;

  // ── Render spotlight overlay ──

  const renderOverlay = () => {
    if (!targetRect) {
      return <div className="iob-tour-overlay iob-tour-overlay--full" />;
    }

    const spotTop = targetRect.top - spotlightPadding;
    const spotLeft = targetRect.left - spotlightPadding;
    const spotWidth = targetRect.width + spotlightPadding * 2;
    const spotHeight = targetRect.height + spotlightPadding * 2;

    return (
      <div className="iob-tour-overlay">
        <div
          className="iob-tour-overlay-darken"
          style={{
            clipPath: `path('M0,0 H${window.innerWidth} V${window.innerHeight} H0 V0 M${spotLeft},${spotTop} h${spotWidth} v${spotHeight} h-${spotWidth} v-${spotHeight}')`,
          }}
        />
        <div
          className="iob-tour-spotlight-border"
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
      <div className={`iob-tour-card-content ${isAnimating ? "iob-tour-card-content--animating" : ""}`}>
        {/* Icon */}
        <div className="iob-tour-card-icon">
          <IconComponent size={20} />
        </div>

        {/* Title */}
        <h3 className="iob-tour-card-title">{step.title}</h3>

        {/* Description */}
        <p className="iob-tour-card-description">
          {step.description.split("\n").map((line, i) => (
            <span key={i}>
              {line}
              {i < step.description.split("\n").length - 1 && <br />}
            </span>
          ))}
        </p>

        {/* Features list */}
        {step.features && step.features.length > 0 && (
          <ul className="iob-tour-card-features">
            {step.features.map((feature, i) => (
              <li key={i} className="iob-tour-card-feature">
                <span className="iob-tour-card-feature-dot" />
                {feature}
              </li>
            ))}
          </ul>
        )}

        {/* Success message */}
        {showSuccess && step.successMessage && (
          <div className="iob-tour-card-success">
            <CheckCircle size={16} />
            <span>{step.successMessage}</span>
          </div>
        )}

        {/* Helper message */}
        {showHelper && step.helperMessage && !validationPassed && (
          <div className="iob-tour-card-helper">
            <HelpCircle size={16} />
            <span>{step.helperMessage}</span>
          </div>
        )}
      </div>
    );
  };

  // ── Render card ──

  const renderCard = () => {
    return (
      <div
        ref={cardRef}
        className={`iob-tour-card ${isComplete ? "iob-tour-card--complete" : ""}`}
        style={cardPosition ? { top: cardPosition.top, left: cardPosition.left } : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
      >
        {/* Close button */}
        <button
          className="iob-tour-card-close"
          onClick={handleSkip}
          aria-label="Close tour"
          title="Close tour">
          <X size={14} />
        </button>

        {/* Progress indicator */}
        {!isComplete && (
          <div className="iob-tour-card-progress">
            <span className="iob-tour-card-progress-text">
              Step {currentStep + 1} of {totalSteps}
            </span>
            <div className="iob-tour-card-progress-bar">
              {steps.map((_, i) => (
                <div
                  key={i}
                  className={`iob-tour-card-progress-dot ${i === currentStep
                    ? "iob-tour-card-progress-dot--active"
                    : i < currentStep
                      ? "iob-tour-card-progress-dot--done"
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
        <div className="iob-tour-card-actions">
          {!isComplete ? (
            <>
              {!isFirstStep && (
                <button
                  className="iob-tour-btn iob-tour-btn--ghost"
                  onClick={handleBack}
                  title="Back">
                  <ArrowLeft size={14} />
                  Back
                </button>
              )}
              <div className="iob-tour-card-actions-right">
                {step.showSkip !== false && (
                  <button
                    className="iob-tour-btn iob-tour-btn--text"
                    onClick={handleSkip}
                    title="Skip tour">
                    Skip tour
                  </button>
                )}
                {hasValidation && !validationPassed ? (
                  <button
                    className="iob-tour-btn iob-tour-btn--primary iob-tour-btn--disabled"
                    disabled
                    title="Waiting...">
                    Waiting...
                  </button>
                ) : (
                  <button
                    className="iob-tour-btn iob-tour-btn--primary"
                    onClick={handleNext}
                    title="Continue">
                    {isLastStep ? "Finish" : "Continue"}
                    {!isLastStep && <ArrowRight size={14} />}
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="iob-tour-card-actions-complete">
              <button
                className="iob-tour-btn iob-tour-btn--text"
                onClick={handleDontShowAgain}
                title="Don&apos;t show again">
                Don&apos;t show again
              </button>
              <button
                className="iob-tour-btn iob-tour-btn--success"
                onClick={handleComplete}
                title="Complete setup">
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
    <div className="iob-tour-root">
      {renderOverlay()}
      {renderCard()}
    </div>,
    document.body
  );
}
