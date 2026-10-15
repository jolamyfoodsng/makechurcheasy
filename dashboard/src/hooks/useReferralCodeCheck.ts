"use client";

import { useEffect, useState } from "react";
import { validateReferralCode } from "@/lib/api";

export type ReferralCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid" }
  | { status: "invalid"; message: string }
  /** The check itself failed (offline, server hiccup). Not the person's fault, so it never blocks them. */
  | { status: "unavailable" };

/**
 * Checks a referral code a moment after the person stops typing. An empty code is "idle" because the
 * field is optional.
 */
export function useReferralCodeCheck(code: string, delayMs = 450): ReferralCheckState {
  const [state, setState] = useState<ReferralCheckState>({ status: "idle" });

  useEffect(() => {
    if (!code) {
      setState({ status: "idle" });
      return undefined;
    }
    let cancelled = false;
    setState({ status: "checking" });
    const timer = window.setTimeout(() => {
      validateReferralCode(code)
        .then((result) => {
          if (cancelled) return;
          setState(result.valid
            ? { status: "valid" }
            : { status: "invalid", message: result.error || "This referral code isn't valid. Check it and try again." });
        })
        .catch(() => {
          if (!cancelled) setState({ status: "unavailable" });
        });
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, delayMs]);

  return state;
}
