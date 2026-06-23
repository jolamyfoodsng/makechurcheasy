/**
 * CreditsDisplay — Reusable inline badge showing the user's credit balance.
 *
 * When a userId is provided, polls the backend every 5 seconds so admin
 * credit additions reflect live without a page refresh.
 */

import { Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getCreditsBalance, isProUnlocked, onCreditChange, syncCreditsWithBackend } from "../services/credits";

interface CreditsDisplayProps {
  /** Force a re-render when external state changes (e.g. after deduction). */
  refreshKey?: number;
  /** User ID for backend sync. When provided, polls every 5s. */
  userId?: string;
}

export default function CreditsDisplay({ refreshKey, userId }: CreditsDisplayProps) {
  const [balance, setBalance] = useState<number>(0);
  const [synced, setSynced] = useState(false);
  const pro = isProUnlocked();
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync from backend on mount and every 5 seconds
  useEffect(() => {
    if (!userId || pro) return;

    let cancelled = false;

    async function sync() {
      const result = await syncCreditsWithBackend(userId!);
      if (!cancelled && result >= 0) {
        setBalance(result);
        setSynced(true);
      }
    }

    // Initial sync
    sync();

    // Poll every 5 seconds
    pollingRef.current = setInterval(sync, 5000);

    return () => {
      cancelled = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [userId, pro]);

  // Also update when refreshKey changes (local deduction)
  useEffect(() => {
    setBalance(getCreditsBalance());
  }, [refreshKey]);

  // Live-update when credits change anywhere in the app
  useEffect(() => {
    const unsub = onCreditChange((newBalance) => {
      setBalance(newBalance);
    });
    return unsub;
  }, []);

  if (pro) {
    return (
      <div className="sts3-usage-pill" style={{ gap: 6 }}>
        <Zap size={12} style={{ color: "var(--gold)" }} />
        <span className="sts3-usage-label">CREDITS</span>
        <span className="sts3-usage-value" style={{ color: "var(--gold)" }}>
          Pro — Unlimited
        </span>
      </div>
    );
  }

  const tier =
    balance <= 0 ? "red" : balance <= 10 ? "orange" : "gold";

  return (
    <div
      className={`sts3-usage-pill sts3-usage-pill--${tier}`}
      style={{ gap: 6 }}
      title={synced ? "Synced with server" : "Using local credits"}
    >
      <Zap size={12} />
      <span className="sts3-usage-label">CREDITS</span>
      <span className="sts3-usage-value">
        {balance <= 0 ? "0 — Buy Credits" : `${balance} remaining`}
      </span>
    </div>
  );
}
