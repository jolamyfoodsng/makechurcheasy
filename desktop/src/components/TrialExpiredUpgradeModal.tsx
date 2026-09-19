import { useMemo, useState, useEffect } from "react";
import Icon from "./Icon";
import { useAuth } from "../contexts/AuthContext";
import { getEffectivePlan, isTrialExpired } from "../services/licenseService";
import "./TrialExpiredUpgradeModal.css";

const TRIAL_EXPIRED_CHECKOUT_URL =
  "https://makechurcheazy.com/subscription/plans?checkout=growth&billingCycle=monthly&reason=trial_expired";
const DISMISS_SESSION_KEY = "trial_expired_dismissed";

async function openCheckout() {
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(TRIAL_EXPIRED_CHECKOUT_URL);
  } catch {
    window.open(TRIAL_EXPIRED_CHECKOUT_URL, "_blank", "noopener,noreferrer");
  }
}

export default function TrialExpiredUpgradeModal() {
  const { user, authenticated, loading, isAdmin } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const dismissKey = user?.id ? `${DISMISS_SESSION_KEY}:${user.id}` : DISMISS_SESSION_KEY;

  useEffect(() => {
    const stored = sessionStorage.getItem(dismissKey);
    setDismissed(stored === "true");
  }, [dismissKey]);

  useEffect(() => {
    if (dismissed) {
      sessionStorage.setItem(dismissKey, "true");
    }
  }, [dismissKey, dismissed]);

  const shouldShow = useMemo(() => {
    if (dismissed || loading || !authenticated || !user || isAdmin) return false;
    return getEffectivePlan(user) === "free" && isTrialExpired(user);
  }, [authenticated, dismissed, isAdmin, loading, user]);

  if (!shouldShow) return null;

  const handleDismiss = () => setDismissed(true);

  return (
    <div
      className="trial-expired-upgrade"
      role="status"
      aria-labelledby="trial-expired-upgrade-title"
      onClick={handleDismiss}
    >
      <div className="trial-expired-upgrade__card" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="trial-expired-upgrade__close"
          onClick={handleDismiss}
          aria-label="Close trial ended notice"
        >
          <Icon name="close" size={18} />
        </button>
        <div className="trial-expired-upgrade__header">
          <div className="trial-expired-upgrade__badge">
            <Icon name="lock" size={14} />
            Free trial ended
          </div>
          <h2
            id="trial-expired-upgrade-title"
            className="trial-expired-upgrade__title"
          >
            Your trial has ended. You are now on the Free plan.
          </h2>
          <p className="trial-expired-upgrade__copy">
            Your account remains available with Free plan limits. Upgrade when
            you need more presentation, broadcast, library, or team capacity.
          </p>
        </div>

        <div className="trial-expired-upgrade__body">
          <div className="trial-expired-upgrade__plan">
            <div className="trial-expired-upgrade__plan-icon">
              <Icon name="auto_awesome" size={22} />
            </div>
            <div>
              <p className="trial-expired-upgrade__plan-title">Growth plan</p>
              <p className="trial-expired-upgrade__plan-copy">
                The dashboard opens the secure Paystack checkout. Desktop access
                updates after payment is confirmed.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="trial-expired-upgrade__button"
            onClick={() => void openCheckout()}
          >
            View upgrade plans
            <Icon name="arrow_forward" size={18} />
          </button>
          <button
            type="button"
            className="trial-expired-upgrade__dismiss"
            onClick={handleDismiss}
          >
            Continue with Free plan
          </button>
        </div>
      </div>
    </div>
  );
}
