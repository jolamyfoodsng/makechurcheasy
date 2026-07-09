/**
 * useFeatureGate.ts — Hook to gate features behind subscription plans.
 *
 * Replaces the old always-true useServiceGate with real entitlement
 * checks against the user's current plan.  Returns both an imperative
 * check function and a declarative <FeatureGate> wrapper component.
 *
 * Usage (imperative):
 *   const { checkFeature } = useFeatureGate();
 *   const result = checkFeature("multiview");
 *   if (!result.allowed) return; // upgrade modal already shown
 *
 * Usage (declarative):
 *   <FeatureGate feature="aiFeatures">
 *     <AIPanel />
 *   </FeatureGate>
 */

import { useCallback, useEffect, useState } from "react";
import {
  checkEntitlementSync,
  fetchPlanFromOverlayServer,
  type EntitlementResult,
  type FeatureKey,
  type PlanTier,
} from "../services/entitlementClient";
import { getEffectivePlan } from "../services/licenseService";
import { getUserScopedKey } from "../services/userScopedStorage";

export type { FeatureKey, PlanTier };

export interface FeatureGateState {
  /** The user's current effective plan tier. */
  currentPlan: PlanTier;
  /** Whether the plan has been resolved from the server. */
  loading: boolean;
  /**
   * Check if a feature is allowed under the current plan.
   * Shows the upgrade modal automatically when denied.
   */
  checkFeature: (feature: FeatureKey, currentCount?: number) => EntitlementResult;
  /**
   * Check if a feature is allowed WITHOUT showing the upgrade modal.
   * Useful for conditional rendering where you want to hide vs. block.
   */
  isFeatureAllowed: (feature: FeatureKey, currentCount?: number) => boolean;
}

// ── Global singleton state for the upgrade modal ────────────────────────────

let _modalState: {
  open: boolean;
  feature?: FeatureKey;
  requiredPlan?: string;
  currentPlan?: string;
  message?: string;
  onClose: () => void;
} | null = null;

let _modalListeners: Array<() => void> = [];

function getModalState() {
  return _modalState;
}

function setModalState(update: Partial<NonNullable<typeof _modalState>>) {
  if (_modalState) {
    _modalState = { ..._modalState, ...update };
  } else if (update.open) {
    _modalState = {
      open: true,
      feature: update.feature,
      requiredPlan: update.requiredPlan,
      currentPlan: update.currentPlan,
      message: update.message,
      onClose: update.onClose ?? (() => setModalState({ open: false })),
    };
  }
  _modalListeners.forEach((l) => l());
}

/**
 * React hook that subscribes to the global modal state.
 * Returns the current modal props for rendering <NewUpgradeModal>.
 */
export function useUpgradeModalState() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1);
    _modalListeners.push(listener);
    return () => {
      _modalListeners = _modalListeners.filter((l) => l !== listener);
    };
  }, []);

  return getModalState();
}

// ── Main hook ──────────────────────────────────────────────────────────────

export function useFeatureGate(): FeatureGateState {
  const [currentPlan, setCurrentPlan] = useState<PlanTier>(() => {
    // Initialise from localStorage cache for instant first render.
    try {
      const cached = localStorage.getItem(getUserScopedKey("ocs-dock-plan"));
      if (cached) return cached as PlanTier;
    } catch { /* ignore */ }
    return "free";
  });
  const [loading, setLoading] = useState(true);

  // Resolve the effective plan from the overlay server on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // fetchPlanFromOverlayServer already returns "trial" → "pro" mapping
        // but we also want the raw base plan for the modal display.
        const plan = await fetchPlanFromOverlayServer();
        if (!cancelled) {
          setCurrentPlan((plan || "free") as PlanTier);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const checkFeature = useCallback(
    (feature: FeatureKey, currentCount: number = 0): EntitlementResult => {
      const result = checkEntitlementSync(feature, currentPlan, currentCount);

      if (!result.allowed) {
        setModalState({
          open: true,
          feature,
          requiredPlan: result.requiredPlan,
          currentPlan,
          message: result.reason,
          onClose: () => setModalState({ open: false }),
        });
      }

      return result;
    },
    [currentPlan],
  );

  const isFeatureAllowed = useCallback(
    (feature: FeatureKey, currentCount: number = 0): boolean => {
      return checkEntitlementSync(feature, currentPlan, currentCount).allowed;
    },
    [currentPlan],
  );

  return {
    currentPlan,
    loading,
    checkFeature,
    isFeatureAllowed,
  };
}

// ── FeatureGate component (declarative gating) ─────────────────────────────

import type { ReactNode } from "react";

interface FeatureGateProps {
  /** The feature key to gate behind. */
  feature: FeatureKey;
  /** Current usage count for resource features. */
  currentCount?: number;
  /** Content to render when the feature is allowed. */
  children: ReactNode;
  /**
   * Optional content to render when the feature is blocked.
   * If omitted, a default "Upgrade required" message is shown
   * that also opens the upgrade modal on click.
   */
  fallback?: ReactNode;
}

/**
 * Declaratively gate content behind a feature entitlement.
 *
 * Renders `children` when the feature is allowed under the current plan,
 * otherwise renders `fallback` (or a default upgrade prompt).
 */
export function FeatureGate({
  feature,
  currentCount = 0,
  children,
  fallback,
}: FeatureGateProps) {
  const { checkFeature, loading } = useFeatureGate();

  if (loading) return null;

  const result = checkFeature(feature, currentCount);
  if (result.allowed) return <>{children}</>;

  if (fallback) return <>{fallback}</>;

  return (
    <div
      style={{
        padding: "1.5rem",
        textAlign: "center",
        background: "rgba(255,255,255,0.04)",
        borderRadius: 8,
        border: "1px dashed rgba(255,255,255,0.12)",
        color: "rgba(255,255,255,0.6)",
        cursor: "pointer",
      }}
      onClick={() =>
        setModalState({
          open: true,
          feature,
          requiredPlan: result.requiredPlan,
          currentPlan,
          message: result.reason,
          onClose: () => setModalState({ open: false }),
        })
      }
    >
      <div style={{ fontSize: "0.85rem", opacity: 0.7 }}>{result.reason}</div>
      <div
        style={{
          marginTop: 8,
          fontSize: "0.8rem",
          color: "#7b68ee",
          fontWeight: 600,
        }}
      >
        Click to upgrade →
      </div>
    </div>
  );
}

// ── Upgrade modal bridge component ─────────────────────────────────────────

/**
 * Render this once at the app root to wire up the global upgrade modal.
 * It reads from the singleton modal state managed by useFeatureGate().
 */
export function UpgradeModalBridge() {
  const modalState = useUpgradeModalState();

  // Lazy import to avoid circular deps
  const [NewUpgradeModal, setNewUpgradeModal] = useState<any>(null);

  useEffect(() => {
    import("../../others/NewUpgradeModal").then((mod) =>
      setNewUpgradeModal(() => mod.default)
    );
  }, []);

  if (!NewUpgradeModal || !modalState?.open) return null;

  return (
    <NewUpgradeModal
      open={modalState.open}
      onClose={modalState.onClose}
      feature={modalState.feature}
      requiredPlan={modalState.requiredPlan}
      currentPlan={modalState.currentPlan}
      message={modalState.message}
    />
  );
}
