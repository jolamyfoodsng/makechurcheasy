import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FlaskConical, Layers, RotateCcw } from "lucide-react";

import { useAuth } from "../contexts/AuthContext";
import { getSession } from "../services/authService";
import { getEffectivePlan } from "../services/licenseService";
import {
  clearLocalDevPlanOverride,
  getLocalDevPlanOverride,
  isLocalDevAdmin,
  LOCAL_DEV_PLAN_OPTIONS,
  LOCAL_DEV_PLAN_OVERRIDE_EVENT,
  normalizeLocalDevPlan,
  setLocalDevPlanOverride,
  type LocalDevPlanId,
} from "../services/localDevPlanOverride";

import "./LocalDevPlanSwitcher.css";

function resolveDisplayedPlan(plan: string | null | undefined): LocalDevPlanId {
  return normalizeLocalDevPlan(plan) ?? "growth";
}
/** Local-only plan simulation for the designated development admin account. */
export function LocalDevPlanSwitcher() {
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const enabled = isLocalDevAdmin(user);
  const [override, setOverride] = useState<LocalDevPlanId | null>(() => getLocalDevPlanOverride(user));

  useEffect(() => {
    if (!enabled || !user) {
      setOverride(null);
      return;
    }

    const syncOverride = () => setOverride(getLocalDevPlanOverride(user));
    syncOverride();
    window.addEventListener(LOCAL_DEV_PLAN_OVERRIDE_EVENT, syncOverride);
    window.addEventListener("storage", syncOverride);

    return () => {
      window.removeEventListener(LOCAL_DEV_PLAN_OVERRIDE_EVENT, syncOverride);
      window.removeEventListener("storage", syncOverride);
    };
  }, [enabled, user]);

  if (!enabled || !user) return null;

  const displayedPlan = override ?? resolveDisplayedPlan(getEffectivePlan(user));

  const applyPlan = (plan: LocalDevPlanId) => {
    if (!setLocalDevPlanOverride(user, plan)) return;
    setOverride(plan);
    const nextUser = { ...user, plan, effectivePlan: plan };
    // Refresh the AuthContext object so every plan-aware screen re-renders
    // immediately, and hand the same local-only snapshot to the overlay
    // server so the browser Dock updates without a reload.
    setUser(nextUser);
  };

  const resetPlan = () => {
    if (!clearLocalDevPlanOverride(user)) return;
    setOverride(null);
    const session = getSession();
    // Restore the account snapshot from the persisted session, not the
    // temporarily simulated user object held by React state.
    setUser(session?.user ?? { ...user, effectivePlan: undefined });
  };

  return (
    <section className="local-dev-plan-switcher" aria-labelledby="local-dev-plan-switcher-title">
      <div className="local-dev-plan-switcher__copy">
        <div className="local-dev-plan-switcher__eyebrow">
          <FlaskConical size={14} aria-hidden="true" />
          Local development tool
        </div>
        <h2 id="local-dev-plan-switcher-title">Test as another plan</h2>
        <p>
          Switch the local app between Free, Pro, and Growth to test plan-gated features.
          This only affects local app, web preview, and Dock behavior. It never changes billing or the account online.
        </p>
        <span className="local-dev-plan-switcher__scope">Available only for admin@gmail.com in local development</span>
      </div>

      <div className="local-dev-plan-switcher__controls">
        <label htmlFor="local-dev-plan-select">Simulated plan</label>
        <select
          id="local-dev-plan-select"
          value={displayedPlan}
          onChange={(event) => applyPlan(event.target.value as LocalDevPlanId)}
        >
          {LOCAL_DEV_PLAN_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="local-dev-plan-switcher__selected" aria-live="polite">
          <Check size={14} aria-hidden="true" />
          {LOCAL_DEV_PLAN_OPTIONS.find((option) => option.id === displayedPlan)?.description}
        </span>
        {override && (
          <button type="button" className="local-dev-plan-switcher__reset" onClick={resetPlan}>
            <RotateCcw size={14} aria-hidden="true" />
            Reset
          </button>
        )}
        <button
          type="button"
          className="local-dev-plan-switcher__gallery-btn"
          onClick={() => navigate("/dev/modals")}
          title="Open Modals & Announcements Gallery (Local Dev Admin Only)"
        >
          <Layers size={14} aria-hidden="true" />
          Preview All Modals
        </button>
      </div>
    </section>
  );
}
