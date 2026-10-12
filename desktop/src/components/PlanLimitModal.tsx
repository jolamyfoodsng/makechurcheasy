/**
 * PlanLimitModal.tsx — "you reached your plan's limit" dialog.
 *
 * Used when a Free church tries to go past a plan limit (a 4th broadcast graphic,
 * a 3rd custom theme). It says what the limit is and sends the person to the
 * subscription plans page (makechurcheazy.com/subscription/plans) only when they
 * press the button. Built on the shared ModalDialog so it matches every other dialog.
 * (`UpgradeModal` opens the plans page straight away and shows nothing.)
 */
import { Lock } from "lucide-react";
import ModalDialog from "./ModalDialog";
import { openDashboardSubscriptionPlans } from "../services/subscriptionNavigation";

export interface PlanLimitModalProps {
  open: boolean;
  onClose: () => void;
  /** Short heading, e.g. "Broadcast graphics limit reached". */
  title: string;
  /** One or two sentences: what the plan includes and what the person can do. */
  message: string;
  /** Plan name for the button, e.g. "Basic". Defaults to a plain "See plans". */
  requiredPlan?: string;
  /** Why the plans page was opened (kept in the link for analytics). */
  reason?: string;
}

export default function PlanLimitModal({ open, onClose, title, message, requiredPlan, reason }: PlanLimitModalProps) {
  const planLabel = requiredPlan ? requiredPlan.charAt(0).toUpperCase() + requiredPlan.slice(1) : "";

  return (
    <ModalDialog
      open={open}
      tone="warning"
      icon={<Lock size={24} />}
      title={title}
      onClose={onClose}
      zIndex={20000}
      actions={[
        { label: "Not now", variant: "ghost", onClick: onClose },
        {
          label: planLabel ? `Upgrade to ${planLabel}` : "See plans",
          variant: "primary",
          autoFocus: true,
          onClick: () => {
            void openDashboardSubscriptionPlans(reason ? { reason } : undefined);
            onClose();
          },
        },
      ]}
    >
      {message}
    </ModalDialog>
  );
}
