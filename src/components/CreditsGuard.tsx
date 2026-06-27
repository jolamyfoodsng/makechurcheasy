/**
 * CreditsGuard — Blocks page access when the user has 0 credits.
 *
 * Wraps page content and shows a full-screen blocked state with
 * an upgrade CTA when credits are exhausted. Pro users bypass this guard.
 *
 * Fail-open: if the backend is unreachable or the user is offline,
 * the guard lets users through rather than blocking them.
 */

import { useEffect, useState } from "react";
import { Zap, ExternalLink } from "lucide-react";
import { fetchCreditsFromBackend, isProUnlocked } from "../services/credits";

const PRICING_URL =
  "https://makechurcheasy.creatorstudioslabs.stream/pricing";

interface CreditsGuardProps {
  children: React.ReactNode;
}

type GuardState =
  | { phase: "loading" }
  | { phase: "offline" }
  | { phase: "blocked" }
  | { phase: "pass" };

export default function CreditsGuard({ children }: CreditsGuardProps) {
  const [state, setState] = useState<GuardState>({ phase: "loading" });
  const pro = isProUnlocked();

  useEffect(() => {
    if (pro) return;
    let cancelled = false;

    // Check online status first
    if (!navigator.onLine) {
      setState({ phase: "offline" });
      return () => { cancelled = true; };
    }

    fetchCreditsFromBackend().then((credits) => {
      if (cancelled) return;
      // -1 = admin unlimited OR backend unreachable → both pass through
      if (credits < 0) {
        setState({ phase: "pass" });
      } else if (credits === 0) {
        setState({ phase: "blocked" });
      } else {
        setState({ phase: "pass" });
      }
    });

    // Also listen for online/offline events
    const handleOffline = () => {
      if (!cancelled) setState({ phase: "offline" });
    };
    window.addEventListener("offline", handleOffline);
    return () => {
      cancelled = true;
      window.removeEventListener("offline", handleOffline);
    };
  }, [pro]);

  // Pro users always pass
  if (pro) return <>{children}</>;

  // Loading state
  if (state.phase === "loading") {
    return (
      <div style={styles.root}>
        <div style={styles.spinner} />
      </div>
    );
  }

  // Offline / backend unreachable — fail open, let user through
  if (state.phase === "offline") return <>{children}</>;

  // Credits available — pass through
  if (state.phase === "pass") return <>{children}</>;

  // Zero credits — show blocked state
  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <Zap size={28} />
        </div>
        <h2 style={styles.title}>No Credits Remaining</h2>
        <p style={styles.desc}>
          You've used all your transcription credits. Purchase more to continue
          using speech-to-scripture, transcript library, and translation features.
        </p>
        <a
          href={PRICING_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.cta}
        >
          <Zap size={14} />
          Buy Credits
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100%",
    minHeight: 400,
    padding: 32,
  },
  card: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    maxWidth: 360,
    textAlign: "center",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    background: "rgba(var(--error-rgb, 239,68,68), 0.12)",
    color: "var(--error, #ef4444)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
    color: "var(--text, #e2e8f0)",
    margin: 0,
    fontFamily: "var(--font-heading, inherit)",
  },
  desc: {
    fontSize: 13,
    lineHeight: 1.6,
    color: "var(--text-muted, #94a3b8)",
    margin: 0,
  },
  cta: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    padding: "8px 20px",
    borderRadius: "var(--radius, 3px)",
    background: "var(--primary, #4f46e5)",
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    cursor: "pointer",
    transition: "background 0.15s",
  },
  spinner: {
    width: 24,
    height: 24,
    border: "2.5px solid var(--border, #2c3140)",
    borderTopColor: "var(--primary, #4f46e5)",
    borderRadius: "50%",
    animation: "spin 0.6s linear infinite",
  },
};
