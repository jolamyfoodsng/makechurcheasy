/**
 * useThemeCreateGate — "can this church create one more custom theme?"
 *
 * Free = 2 custom themes (see `themes` in subscriptionSourceOfTruth.ts). Call
 * `guard()` before opening the theme creator or saving a new / duplicated theme.
 * When the plan is full it opens the visible limit modal (-> plans page) and
 * resolves false. Render `modal` once in the component that uses the hook.
 */
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import PlanLimitModal from "../components/PlanLimitModal";
import { useAuth } from "../contexts/AuthContext";
import { checkEntitlementSync } from "../services/entitlementClient";
import { getEffectivePlan } from "../services/licenseService";

interface Prompt {
  title?: string;
  message: string;
  requiredPlan?: string;
  reason?: string;
}

export function themeLimitMessage(limit: number, current: number): string {
  return limit === 0
    ? "Your plan doesn't include custom themes. Upgrade to create your own."
    : `Your plan includes up to ${limit} custom themes and you already have ${current}. Delete one, or upgrade to create more.`;
}

export function useThemeCreateGate(): {
  guard: () => Promise<boolean>;
  /** Plan's ready-made theme allowance: the first N are open (-1 = all). */
  themeLimit: number;
  /** Opens the upgrade modal for a ready-made theme the plan has locked. */
  promptLocked: (message: string) => void;
  modal: ReactNode;
} {
  const { user } = useAuth();
  const plan = getEffectivePlan(user);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const themeLimit = checkEntitlementSync("themes", plan, 0).limit;

  const guard = useCallback(async (): Promise<boolean> => {
    let count = 0;
    try {
      const { getCustomThemes } = await import("../bible/bibleDb");
      count = (await getCustomThemes()).length;
    } catch {
      // Can't count: don't block someone over a read error.
      return true;
    }
    const result = checkEntitlementSync("themes", plan, count);
    if (result.allowed) return true;
    setPrompt({ message: themeLimitMessage(result.limit, count), requiredPlan: result.requiredPlan });
    return false;
  }, [plan]);

  const promptLocked = useCallback(
    (message: string) => {
      const next = checkEntitlementSync("themes", plan, themeLimit < 0 ? 0 : themeLimit);
      setPrompt({
        title: "This theme is locked",
        message,
        requiredPlan: next.requiredPlan || "basic",
        reason: "theme_locked",
      });
    },
    [plan, themeLimit],
  );

  const modal = useMemo(
    () => (
      <PlanLimitModal
        open={prompt !== null}
        onClose={() => setPrompt(null)}
        title={prompt?.title ?? "Custom theme limit reached"}
        message={prompt?.message ?? ""}
        requiredPlan={prompt?.requiredPlan}
        reason={prompt?.reason ?? "theme_limit"}
      />
    ),
    [prompt],
  );

  return { guard, themeLimit, promptLocked, modal };
}
