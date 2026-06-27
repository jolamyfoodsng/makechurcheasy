/**
 * VerificationModal.tsx — On-launch modal for critical tier
 *
 * Shown when offline for 21-27 days (critical tier).
 * Modal appears on launch — user can dismiss to continue,
 * but it re-appears on next launch if still not verified.
 */

import { useState, useCallback } from "react";
import { retryVerification } from "../services/internetVerificationService";
import Icon from "./Icon";

interface Props {
  daysOffline: number;
  daysUntilNextTier: number | null;
  onDismiss: () => void;
}

type VerifyStatus = "idle" | "verifying" | "success" | "error";

export default function VerificationModal({ daysOffline, daysUntilNextTier, onDismiss }: Props) {
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    setStatus("verifying");
    setErrorMsg(null);
    try {
      const success = await retryVerification();
      if (success) {
        setStatus("success");
        setTimeout(() => onDismiss(), 1200);
      } else {
        setStatus("error");
        setErrorMsg("Verification failed. Please check your internet connection and try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Verification failed. Please try again later.");
    }
  }, [onDismiss]);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setErrorMsg(null);
  }, []);

  const lockWarning = daysUntilNextTier !== null
    ? `Access will be restricted in ${daysUntilNextTier} day${daysUntilNextTier === 1 ? "" : "s"} if not verified.`
    : "Please verify your account to continue using the app.";

  return (
    <div className="verification-overlay">
      <div className="verification-modal">
        {/* Banner */}
        <div className="verification-modal__banner">
          <Icon name="wifi_off" size={14} />
          <span>Verification Required</span>
        </div>

        {/* Header */}
        <div className="verification-modal__header">
          <Icon name="verified_user" size={24} />
          <div>
            <h2 className="verification-modal__title">Account Verification Needed</h2>
            <p className="verification-modal__subtitle">
              Your device has been offline for {daysOffline} day{daysOffline === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="verification-modal__body">
          <p className="verification-modal__message">
            MakeChurchEasy needs to verify your account periodically to ensure continued access.
            Please connect to the internet and verify your account.
          </p>

          <div className="verification-modal__warning">
            <Icon name="schedule" size={14} />
            <span>{lockWarning}</span>
          </div>

          {status === "success" && (
            <div className="verification-modal__success">
              <Icon name="check_circle" size={14} />
              <span>Account verified successfully!</span>
            </div>
          )}

          {status === "error" && errorMsg && (
            <div className="verification-modal__error">
              <Icon name="error_outline" size={14} />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="verification-modal__actions">
          {status !== "success" && (
            <button
              type="button"
              className="verification-modal__btn verification-modal__btn--secondary"
              onClick={onDismiss}
            >
              Continue Offline
            </button>
          )}

          {status === "idle" || status === "error" ? (
            <button
              type="button"
              className="verification-modal__btn verification-modal__btn--primary"
              onClick={status === "error" ? handleRetry : handleVerify}
            >
              <Icon name={status === "error" ? "refresh" : "wifi"} size={14} />
              {status === "error" ? "Try Again" : "Verify Now"}
            </button>
          ) : status === "verifying" ? (
            <button
              type="button"
              className="verification-modal__btn verification-modal__btn--primary"
              disabled
            >
              <Icon name="sync" size={14} className="verification-modal__icon--spin" />
              Verifying...
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
