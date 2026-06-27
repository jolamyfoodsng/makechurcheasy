/**
 * FeatureGuard — Soft-blocks a feature when the user's plan doesn't include it.
 *
 * Shows an inline upgrade CTA when a free-tier user tries to access
 * a premium feature. Consistent with CreditsGuard pattern.
 *
 * Fail-open: if offline or backend unreachable, let the user through.
 */

import { useState, useEffect } from "react";
import { Lock, ExternalLink } from "lucide-react";
import {
  getRestrictionInfo,
  type RestrictionInfo,
} from "../services/licenseService";
import { useAuth } from "../contexts/AuthContext";

const PRICING_URL =
  "https://makechurcheasy.creatorstudioslabs.stream/pricing";

interface FeatureGuardProps {
  /** Feature key matching licenseService names (e.g., "multiview", "tickers") */
  feature: string;
  children: React.ReactNode;
}

export default function FeatureGuard({ feature, children }: FeatureGuardProps) {
  const { user } = useAuth();
  const [info, setInfo] = useState<RestrictionInfo | null>(null);

  useEffect(() => {
    if (!user) return;

    const restriction = getRestrictionInfo(user, feature);
    setInfo(restriction);
  }, [user, feature]);

  // No user yet — let children render (AuthGate handles auth)
  if (!user) return <>{children}</>;

  // If info hasn't loaded yet, let through
  if (!info) return <>{children}</>;

  // Feature is not locked — pass through
  if (!info.locked) return <>{children}</>;

  // Feature is locked — show inline upgrade prompt
  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <div style={styles.iconWrap}>
          <Lock size={28} />
        </div>
        <h2 style={styles.title}>{info.feature}</h2>
        <p style={styles.desc}>
          {info.message}
        </p>
        <p style={styles.currentPlan}>
          Your plan: <strong>{info.currentPlan}</strong>
        </p>
        <a
          href={PRICING_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={styles.cta}
        >
          Upgrade to {info.requiredPlan.charAt(0).toUpperCase() + info.requiredPlan.slice(1)}
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
    background: "rgba(var(--warning-rgb, 245,158,11), 0.12)",
    color: "var(--warning, #f59e0b)",
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
  currentPlan: {
    fontSize: 12,
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
};
