/**
 * VerificationGate.tsx — Manages verification grace period UI
 *
 * Wraps the app and conditionally renders:
 *   - Nothing (normal tier) — app works as usual
 *   - VerificationWarningBanner (warning tier) — floating banner, dismissible
 *   - VerificationModal (critical tier) — on-launch modal, dismissible
 *   - VerificationLockScreen (locked tier) — full lock, no dismiss
 *
 * Subscribes to internetVerificationService for state changes.
 * The critical-tier modal is shown once per launch and tracked via
 * a session flag so it doesn't re-appear after dismissal within the
 * same session.
 */

import { useState, useEffect, useCallback } from "react";
import {
  initVerification,
  onGracePeriodChange,
  type GracePeriodState,
} from "../services/internetVerificationService";
import VerificationWarningBanner from "./VerificationWarningBanner";
import VerificationModal from "./VerificationModal";
import VerificationLockScreen from "./VerificationLockScreen";

interface Props {
  children: React.ReactNode;
}

export default function VerificationGate({ children }: Props) {
  const [state, setState] = useState<GracePeriodState | null>(null);
  const [modalDismissedThisSession, setModalDismissedThisSession] = useState(false);

  // Initialize verification system and subscribe to state changes
  useEffect(() => {
    let cancelled = false;

    initVerification().then((initial) => {
      if (!cancelled) setState(initial);
    });

    const unsub = onGracePeriodChange((s) => {
      if (!cancelled) setState(s);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Reset modal dismissal when tier changes away from critical
  useEffect(() => {
    if (state && state.tier !== "critical") {
      setModalDismissedThisSession(false);
    }
  }, [state?.tier]);

  const handleModalDismiss = useCallback(() => {
    setModalDismissedThisSession(true);
  }, []);

  // Still loading
  if (!state) {
    return <>{children}</>;
  }

  // System disabled or normal tier — render children normally
  if (!state.enabled || state.tier === "normal") {
    return <>{children}</>;
  }

  // Warning tier — render children with floating banner
  if (state.tier === "warning") {
    return (
      <>
        {children}
        <VerificationWarningBanner
          daysOffline={state.daysOffline}
          daysUntilNextTier={state.daysUntilNextTier}
        />
      </>
    );
  }

  // Critical tier — render children with modal (once per launch)
  if (state.tier === "critical") {
    return (
      <>
        {children}
        {!modalDismissedThisSession && (
          <VerificationModal
            daysOffline={state.daysOffline}
            daysUntilNextTier={state.daysUntilNextTier}
            onDismiss={handleModalDismiss}
          />
        )}
      </>
    );
  }

  // Locked tier — render lock screen ONLY (no children accessible)
  if (state.tier === "locked") {
    return <VerificationLockScreen daysOffline={state.daysOffline} />;
  }

  // Fallback — render children
  return <>{children}</>;
}
