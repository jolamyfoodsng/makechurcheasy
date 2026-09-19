"use client";

import { useEffect } from "react";
import { applyReferralCode, getReferrals } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const PENDING_REFERRAL_CODE_KEY = "mce_pending_referral_code";

function normalizeReferralCode(value: string | null): string {
  return (value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function ReferralCodePrompt() {
  const { mongoUser, refreshMongoUser } = useAuth();

  useEffect(() => {
    if (!mongoUser?._id || mongoUser.role === "admin") return;

    const pendingCode = normalizeReferralCode(
      localStorage.getItem(PENDING_REFERRAL_CODE_KEY),
    );
    if (!pendingCode) return;

    let cancelled = false;

    async function applyPendingReferral() {
      try {
        const data = await getReferrals();
        if (cancelled) return;

        if (data.referredBy) {
          localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
          return;
        }

        await applyReferralCode(pendingCode);
        localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
        await refreshMongoUser();
      } catch {
        // Referral attribution is optional. Never interrupt signup or show a
        // blocking prompt when a pending link is invalid or unavailable.
        localStorage.removeItem(PENDING_REFERRAL_CODE_KEY);
      }
    }

    void applyPendingReferral();
    return () => {
      cancelled = true;
    };
  }, [mongoUser?._id, mongoUser?.role]);

  // Referral links are applied silently when present. There is intentionally
  // no signup or dashboard modal for users who were not referred.
  return null;
}
