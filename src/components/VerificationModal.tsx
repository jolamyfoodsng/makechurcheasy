/**
 * VerificationModal.tsx — On-launch modal for critical tier
 *
 * Shown when offline for 21-27 days (critical tier).
 * Modal appears on launch — user can dismiss to continue,
 * but it re-appears on next launch if still not verified.
 */

import { useState, useCallback } from "react";
import { retryVerification } from "../services/internetVerificationService";
import type { VerificationPlanScope } from "../services/internetVerificationService";
import Icon from "./Icon";

interface Props {
  daysOffline: number;
  daysUntilNextTier: number | null;
  planScope: VerificationPlanScope;
  modalDismissible: boolean;
  requiredDays: number | null;
  onDismiss: () => void;
}

type VerifyStatus = "idle" | "verifying" | "success" | "error";

function getPlanLabel(planScope: VerificationPlanScope): string {
  switch (planScope) {
    case "trial":
      return "free trial";
    case "basic":
      return "Basic plan";
    case "free":
      return "Free plan";
    default:
      return "account";
  }
}

export default function VerificationModal({
  daysOffline,
  daysUntilNextTier,
  planScope,
  modalDismissible,
  requiredDays,
  onDismiss,
}: Props) {
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    setStatus("verifying");
    setErrorMsg(null);
    try {
      const success = await retryVerification();
      if (success) {
        setStatus("success");
        if (modalDismissible) {
          setTimeout(() => onDismiss(), 1200);
        }
      } else {
        setStatus("error");
        setErrorMsg("Verification failed. Please check your internet connection and try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Verification failed. Please try again later.");
    }
  }, [modalDismissible, onDismiss]);

  const handleRetry = useCallback(() => {
    setStatus("idle");
    setErrorMsg(null);
  }, []);

  const planLabel = getPlanLabel(planScope);
  const lockWarning = modalDismissible
    ? (
      daysUntilNextTier !== null
        ? `Internet connection will become required in ${daysUntilNextTier} day${daysUntilNextTier === 1 ? "" : "s"}.`
        : "Please connect soon to avoid losing offline access."
    )
    : (
      requiredDays !== null
        ? `${planLabel} devices must reconnect at least every ${requiredDays} day${requiredDays === 1 ? "" : "s"}.`
        : "An internet connection is required before you can continue."
    );
  const title = modalDismissible ? "Account Verification Needed" : "Internet Connection Required";
  const message = modalDismissible
    ? `Your ${planLabel} has been offline for ${daysOffline} day${daysOffline === 1 ? "" : "s"}. Connect now so the app can refresh your account and keep working offline.`
    : `Your ${planLabel} has reached its offline limit. Connect to the internet and refresh your account before you continue using the app.`;

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
          <Icon name={modalDismissible ? "verified_user" : "wifi_off"} size={24} />
          <div>
            <h2 className="verification-modal__title">{title}</h2>
            <p className="verification-modal__subtitle">
              Your device has been offline for {daysOffline} day{daysOffline === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="verification-modal__body">
          <p className="verification-modal__message">{message}</p>

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
          {status !== "success" && modalDismissible && (
            <button
              type="button"
              className="verification-modal__btn verification-modal__btn--secondary"
              onClick={onDismiss}
              title="Continue">
              Continue Offline
            </button>
          )}

          {status === "idle" || status === "error" ? (
            <button
              type="button"
              className="verification-modal__btn verification-modal__btn--primary"
              onClick={status === "error" ? handleRetry : handleVerify}
              title={modalDismissible ? "Verify Now" : "Reconnect"}>
              <Icon name={status === "error" ? "refresh" : "wifi"} size={14} />
              {status === "error" ? "Try Again" : modalDismissible ? "Verify Now" : "Reconnect"}
            </button>
          ) : status === "verifying" ? (
            <button
              type="button"
              className="verification-modal__btn verification-modal__btn--primary"
              disabled
              title="Sync">
              <Icon name="sync" size={14} className="verification-modal__icon--spin" />
              Verifying...
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
