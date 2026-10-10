import { useEffect, useRef } from "react";
import type { FeatureKey, PlanTier } from "../src/services/planConfigTypes";
import { openDashboardSubscriptionPlans } from "../src/services/subscriptionNavigation";

export interface NewUpgradeModalProps {
  open: boolean;
  onClose: () => void;
  feature?: FeatureKey | string;
  requiredPlan?: PlanTier | string;
  currentPlan?: PlanTier | string;
  message?: string;
}

/** Plan changes are managed in the Dashboard, so desktop upgrade prompts open
 * that page directly instead of rendering a second subscription interface. */
export default function NewUpgradeModal({ open, onClose }: NewUpgradeModalProps) {
  const openedForCurrentRequest = useRef(false);

  useEffect(() => {
    if (!open) {
      openedForCurrentRequest.current = false;
      return;
    }
    if (openedForCurrentRequest.current) return;
    openedForCurrentRequest.current = true;
    void openDashboardSubscriptionPlans();
    onClose();
  }, [open, onClose]);

  return null;
}
