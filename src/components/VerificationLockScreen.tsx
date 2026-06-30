/**
 * VerificationLockScreen.tsx — Full lock screen for locked tier
 *
 * Shown when offline for 28+ days (locked tier).
 * No dismiss — user MUST verify to continue.
 */

import { useState, useCallback } from "react";
import { retryVerification } from "../services/internetVerificationService";
import Icon from "./Icon";

interface Props {
  daysOffline: number;
}

type VerifyStatus = "idle" | "verifying" | "error";

export default function VerificationLockScreen({ daysOffline }: Props) {
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleVerify = useCallback(async () => {
    setStatus("verifying");
    setErrorMsg(null);
    try {
      const success = await retryVerification();
      if (success) {
        // The VerificationGate will detect the tier change and unmount this
        setStatus("idle");
      } else {
        setStatus("error");
        setErrorMsg("Verification failed. Please check your internet connection.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Verification failed. Please try again later.");
    }
  }, []);

  return (
    <div className="verification-overlay verification-overlay--locked">
      <div className="verification-lock">
        {/* Lock icon */}
        <div className="verification-lock__icon">
          <Icon name="lock" size={32} />
        </div>

        {/* Title */}
        <h1 className="verification-lock__title">Account Verification Required</h1>
        <p className="verification-lock__subtitle">
          Your device has been offline for {daysOffline} day{daysOffline === 1 ? "" : "s"}.
        </p>

        {/* Message */}
        <p className="verification-lock__message">
          MakeChurchEasy requires periodic internet verification to ensure your account
          is in good standing. Please connect to the internet and verify your account
          to continue using the app.
        </p>

        {/* Error */}
        {status === "error" && errorMsg && (
          <div className="verification-lock__error">
            <Icon name="error_outline" size={14} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Verify button */}
        <button
          type="button"
          className="verification-lock__btn"
          onClick={handleVerify}
          disabled={status === "verifying"}
         title="Sync">
          {status === "verifying" ? (
            <>
              <Icon name="sync" size={16} className="verification-lock__icon--spin" />
              Verifying...
            </>
          ) : (
            <>
              <Icon name="wifi" size={16} />
              Verify Account
            </>
          )}
        </button>

        <p className="verification-lock__help">
          Connect to the internet, then click "Verify Account" above.
        </p>
      </div>
    </div>
  );
}
