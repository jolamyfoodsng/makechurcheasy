/**
 * VerificationWarningBanner.tsx — Non-blocking floating warning banner
 *
 * Shown when offline for 14-21 days (warning tier).
 * Dismissible — user can continue using the app.
 * Re-appears on next launch if still not verified.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { retryVerification, dismissWarningBanner, isWarningBannerDismissed } from "../services/internetVerificationService";
import type { VerificationPlanScope } from "../services/internetVerificationService";
import Icon from "./Icon";

interface Props {
  daysOffline: number;
  daysUntilNextTier: number | null;
  planScope?: VerificationPlanScope;
}

function getWarningLabel(planScope?: VerificationPlanScope): string {
  switch (planScope) {
    case "trial":
      return "Your free trial needs an internet check-in soon.";
    case "basic":
      return "Your Basic plan has been offline for a while.";
    case "free":
      return "Your Free plan needs an internet check-in soon.";
    default:
      return "Your device has been offline for a while.";
  }
}

export default function VerificationWarningBanner({ daysOffline, daysUntilNextTier, planScope }: Props) {
  const [visible, setVisible] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (isWarningBannerDismissed()) return;
    animFrameRef.current = requestAnimationFrame(() => setVisible(true));
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    dismissWarningBanner();
  }, []);

  const handleRetry = useCallback(async () => {
    setVerifying(true);
    setError(null);
    try {
      const success = await retryVerification();
      if (success) {
        setVisible(false);
      } else {
        setError("Verification failed. Please check your internet connection.");
      }
    } catch {
      setError("Verification failed. Please try again later.");
    } finally {
      setVerifying(false);
    }
  }, []);

  if (!visible) return null;

  const urgencyMessage = daysUntilNextTier !== null && daysUntilNextTier <= 7
    ? `Access restrictions begin in ${daysUntilNextTier} day${daysUntilNextTier === 1 ? "" : "s"}.`
    : "Connect to the internet to verify your account.";
  const introMessage = getWarningLabel(planScope);

  return (
    <div className="verification-banner verification-banner--visible">
      <div className="verification-banner__card">
        <button
          type="button"
          className="verification-banner__close"
          onClick={handleDismiss}
          aria-label="Dismiss verification warning"
          title="Dismiss"
        >
          <Icon name="close" size={14} />
        </button>

        <div className="verification-banner__header">
          <Icon name="wifi_off" size={16} className="verification-banner__icon" />
          <span className="verification-banner__title">Internet Verification Needed</span>
        </div>

        <div className="verification-banner__body">
          <p className="verification-banner__message">
            {introMessage} Your device has been offline for {daysOffline} day{daysOffline === 1 ? "" : "s"}.
            {" "}{urgencyMessage}
          </p>

          {error && (
            <div className="verification-banner__error">
              <Icon name="error_outline" size={12} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="verification-banner__actions">
          <button
            type="button"
            className="verification-banner__btn verification-banner__btn--dismiss"
            onClick={handleDismiss}
           title="Dismiss">
            Dismiss
          </button>
          <button
            type="button"
            className="verification-banner__btn verification-banner__btn--retry"
            onClick={handleRetry}
            disabled={verifying}
           title="Verifying...">
            {verifying ? "Verifying..." : "Verify Now"}
          </button>
        </div>
      </div>
    </div>
  );
}
