import { useState, useEffect } from "react";

const TRIAL_WELCOME_KEY = "mce_trial_welcome_shown";

interface TrialModalProps {
  trialDays: number;
  trialEndsAt: string;
  isExistingUser: boolean;
  onDismiss: () => void;
}

const TRIAL_FEATURES = [
  "Translation",
  "Multiview",
  "Mass Song Import",
  "EasyWorship Import",
  "ProPresenter Import",
  "Premium Themes",
  "Speech-to-Scripture",
  "Unlimited Songs",
  "Unlimited Media",
];

export default function TrialModal({
  trialDays,
  trialEndsAt,
  isExistingUser,
  onDismiss,
}: TrialModalProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  function handleDismiss() {
    setVisible(false);
    localStorage.setItem(TRIAL_WELCOME_KEY, "true");
    setTimeout(onDismiss, 300);
  }

  const endDate = new Date(trialEndsAt).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        opacity: visible ? 1 : 0,
        transition: "opacity 0.3s ease",
      }}
      onClick={handleDismiss}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "400px",
          borderRadius: "6px",
          border: "1px solid rgba(255,255,255,0.08)",
          background: "#141420",
          padding: "24px",
          boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          transform: visible ? "scale(1)" : "scale(0.95)",
          transition: "transform 0.3s ease",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "16px" }}>
          <div style={{ fontSize: "32px", marginBottom: "8px" }}>🎉</div>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "#E8E8F0",
              margin: 0,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {isExistingUser
              ? "Welcome Back!"
              : "Welcome to MakeChurchEasy"}
          </h2>
        </div>

        {/* Description */}
        <p
          style={{
            fontSize: "13px",
            lineHeight: "1.6",
            color: "#A0A0B8",
            textAlign: "center",
            marginBottom: "16px",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {isExistingUser
            ? `As an early adopter of MakeChurchEasy, we've unlocked a complimentary ${trialDays}-day Premium Trial for your church.`
            : `Welcome to MakeChurchEasy. You now have full access to Starter features for the next ${trialDays} days.`}
        </p>

        {/* Features list */}
        <div
          style={{
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(255,255,255,0.02)",
            padding: "12px",
            marginBottom: "16px",
          }}
        >
          <p
            style={{
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#707090",
              marginBottom: "8px",
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {isExistingUser ? "Your trial includes:" : "Included in your trial:"}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {TRIAL_FEATURES.map((feature) => (
              <div
                key={feature}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "13px",
                  color: "#E8E8F0",
                  fontFamily: "Inter, system-ui, sans-serif",
                }}
              >
                <span style={{ color: "#10B981" }}>✓</span>
                {feature}
              </div>
            ))}
          </div>
        </div>

        {/* Trial end date */}
        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <p style={{ fontSize: "12px", color: "#707090", margin: 0, fontFamily: "Inter, system-ui, sans-serif" }}>
            Trial Ends
          </p>
          <p
            style={{
              fontSize: "14px",
              fontWeight: 600,
              color: "#E8E8F0",
              margin: 0,
              fontFamily: "Inter, system-ui, sans-serif",
            }}
          >
            {endDate}
          </p>
        </div>

        {/* CTA */}
        <button
          onClick={handleDismiss}
          style={{
            width: "100%",
            padding: "10px 0",
            borderRadius: "6px",
            border: "none",
            background: "#1D4ED8",
            color: "#ffffff",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "Inter, system-ui, sans-serif",
            transition: "background 0.2s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#4A4EB8")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#1D4ED8")}
         title="Start">
          {isExistingUser ? "Start Exploring" : "Get Started"}
        </button>
      </div>
    </div>
  );
}

/**
 * Check if the trial welcome modal has been shown before.
 * Uses localStorage to persist across page reloads.
 */
export function hasTrialWelcomeBeenShown(): boolean {
  return localStorage.getItem(TRIAL_WELCOME_KEY) === "true";
}

/**
 * Mark the trial welcome modal as shown.
 */
export function markTrialWelcomeAsShown(): void {
  localStorage.setItem(TRIAL_WELCOME_KEY, "true");
}
