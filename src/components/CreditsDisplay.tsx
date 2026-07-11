/**
 * CreditsDisplay — Reusable inline badge showing the user's credit balance.
 *
 * When a userId is provided, polls the backend every 5 seconds so admin
 * credit additions reflect live without a page refresh.
 */

import { Zap, CloudOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getCreditsBalance,
  onCreditChange,
  syncCreditsWithBackend,
  getPendingCount,
  getOfflineCreditBalance,
} from "../services/credits";

interface CreditsDisplayProps {
  /** Force a re-render when external state changes (e.g. after deduction). */
  refreshKey?: number;
  /** User ID for backend sync. When provided, polls every 5s. */
  userId?: string;
  /** Credits being consumed right now (e.g. during a live session). Subtracted from displayed balance. */
  sessionCreditsUsed?: number;
}

function PendingBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 3,
        fontSize: 10,
        color: "var(--text-muted, #94a3b8)",
        marginLeft: 4,
      }}
      title={`${count} transaction(s) pending sync`}
    >
      <CloudOff size={10} />
      {count} pending
    </span>
  );
}

export default function CreditsDisplay({ refreshKey, userId, sessionCreditsUsed = 0 }: CreditsDisplayProps) {
  const [balance, setBalance] = useState<number>(0);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [synced, setSynced] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Generation counter: incremented on every local deduction so stale poll
  // responses (initiated before the deduction) are discarded.
  const genRef = useRef(0);

  // Sync from backend on mount and every 5 seconds
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    async function sync() {
      const genBefore = genRef.current;
      const result = await syncCreditsWithBackend();
      // If a deduction happened while the fetch was in flight, discard
      // the stale response — the deduction already set the correct balance.
      if (!cancelled && genBefore === genRef.current) {
        if (result === -1) {
          setIsUnlimited(true);
          setSynced(true);
        } else if (result >= 0) {
          setIsUnlimited(false);
          setBalance(result);
          setSynced(true);
        }
      }
      // Refresh pending count — sync may have flushed offline queue
      setPendingCount(getPendingCount());
    }

    // Initial sync
    sync();

    // Poll every 5 seconds
    pollingRef.current = setInterval(sync, 5000);

    return () => {
      cancelled = true;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [userId]);

  // Also update when refreshKey changes (local deduction)
  useEffect(() => {
    setBalance(getCreditsBalance());
    setPendingCount(getPendingCount());
  }, [refreshKey]);

  // Live-update when credits change anywhere in the app
  useEffect(() => {
    const unsub = onCreditChange((newBalance) => {
      genRef.current += 1;
      if (newBalance === -1) {
        setIsUnlimited(true);
      } else {
        setIsUnlimited(false);
        setBalance(newBalance);
      }
      setPendingCount(getPendingCount());
    });
    return unsub;
  }, []);

  if (isUnlimited) {
    return (
      <div className="sts3-usage-pill" style={{ gap: 6 }}>
        <Zap size={12} style={{ color: "var(--gold)" }} />
        <span className="sts3-usage-label">CREDITS</span>
        <span className="sts3-usage-value" style={{ color: "var(--gold)" }}>
          Unlimited
        </span>
        <PendingBadge count={pendingCount} />
      </div>
    );
  }

  const effectiveBalance = Math.max(0, getOfflineCreditBalance(balance) - sessionCreditsUsed);
  const tier =
    effectiveBalance <= 0 ? "red" : effectiveBalance <= 10 ? "orange" : "gold";

  return (
    <div
      className={`sts3-usage-pill sts3-usage-pill--${tier}`}
      style={{ gap: 6 }}
      title={
        synced
          ? "Synced with server"
          : userId
            ? "Loading…"
            : "Using local credits"
      }
    >
      <Zap size={12} />
      <span className="sts3-usage-label">CREDITS</span>
      <span className="sts3-usage-value">
        {!synced && userId
          ? "…"
          : effectiveBalance <= 0
            ? "0 — Buy Credits"
            : `${effectiveBalance} remaining`}
      </span>
      <PendingBadge count={pendingCount} />
    </div>
  );
}
