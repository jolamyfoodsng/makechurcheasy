import { X } from "lucide-react";
import type { MultistreamPlanAllocation } from "../services/broadcastSettingsService";

import { getMultistreamPlanAllocation } from "../services/broadcastSettingsService";

function getPlanContinuationText(allocation: MultistreamPlanAllocation): string {
  if (allocation.plan === "growth") {
    return "You have access to 20 hours based on your Growth Plan.";
  }
  if (allocation.plan === "basic") {
    return "You have access to 10 hours based on your Basic Plan.";
  }
  if (allocation.plan === "pro") {
    return "You have access to 40 hours based on your Pro Plan.";
  }
  if (allocation.plan === "unlimited" || allocation.plan === "ambassador") {
    return "You have unlimited streaming hours on your plan.";
  }
  return "You have access to 1 channel on the Free Plan. Upgrade for multi-platform streaming.";
}

export interface BroadcastHowItWorksModalProps {
  open: boolean;
  onClose: () => void;
  allocation?: MultistreamPlanAllocation;
  onOpenUpgrade?: () => void;
}

export function BroadcastHowItWorksModal({
  open,
  onClose,
  allocation: passedAllocation,
  onOpenUpgrade: _onOpenUpgrade,
}: BroadcastHowItWorksModalProps) {
  if (!open) return null;
  const allocation = passedAllocation || getMultistreamPlanAllocation("free");

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(4px)",
        zIndex: 10000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#18181b",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: "14px",
          padding: "26px 28px",
          maxWidth: "580px",
          width: "100%",
          maxHeight: "92vh",
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.65)",
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          color: "#f4f4f5",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "12px",
            borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
            paddingBottom: "14px",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: "20px",
                fontWeight: 700,
                color: "#ffffff",
                letterSpacing: "-0.01em",
              }}
            >
              How it works
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "13.5px",
                color: "#a1a1aa",
                lineHeight: 1.4,
              }}
            >
              Set up once, then switch and stream with one click.
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "13px",
                color: "#d4d4d8",
                lineHeight: 1.4,
              }}
            >
              {getPlanContinuationText(allocation)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              borderRadius: "8px",
              color: "#a1a1aa",
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Key Takeaway Highlight */}
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(99, 102, 241, 0.12)",
            border: "1px solid rgba(99, 102, 241, 0.28)",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            color: "#c7d2fe",
            textAlign: "center",
          }}
        >
          Set it up once, then switch and stream without copying stream keys every time.
        </div>

        {/* 5 Steps List */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {/* Step 1: Create Profiles */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#4f46e5",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              1
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#ffffff" }}>
                Create Profiles
              </div>
              <div style={{ fontSize: "12.5px", color: "#a1a1aa", marginTop: "3px", lineHeight: 1.4 }}>
                Create profiles for different church accounts, for example: Church Account, First Lady’s Account, or Youth Ministry Account.
              </div>
            </div>
            {/* Visual illustration: mini profiles list */}
            <div
              style={{
                width: "120px",
                background: "#121215",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "6px",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "8px", fontWeight: 700, color: "#a1a1aa" }}>PROFILES</span>
                <span
                  style={{
                    fontSize: "8px",
                    background: "#4f46e5",
                    color: "#fff",
                    padding: "1px 4px",
                    borderRadius: "3px",
                    fontWeight: 600,
                  }}
                >
                  + Add
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  background: "rgba(99, 102, 241, 0.15)",
                  borderRadius: "3px",
                  padding: "2px 4px",
                  border: "1px solid rgba(99, 102, 241, 0.4)",
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#ef4444",
                    color: "#fff",
                    fontSize: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                  }}
                >
                  CH
                </div>
                <span style={{ fontSize: "7.5px", color: "#fff", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Church Main
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "2px 4px",
                }}
              >
                <div
                  style={{
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: "#10b981",
                    color: "#fff",
                    fontSize: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontWeight: 700,
                  }}
                >
                  SP
                </div>
                <span style={{ fontSize: "7.5px", color: "#a1a1aa", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  Senior Pastor
                </span>
              </div>
            </div>
          </div>

          {/* Step 2: Add Channels */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#4f46e5",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              2
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#ffffff" }}>
                Add Channels
              </div>
              <div style={{ fontSize: "12.5px", color: "#a1a1aa", marginTop: "3px", lineHeight: 1.4 }}>
                Save YouTube and Facebook streaming details to each profile once.
              </div>
            </div>
            {/* Visual illustration: Add buttons */}
            <div
              style={{
                width: "120px",
                background: "#121215",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "6px",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                alignItems: "stretch",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  background: "#ef4444",
                  borderRadius: "4px",
                  padding: "3px 4px",
                  color: "#fff",
                  fontSize: "8px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                }}
              >
                <span>▶ YouTube</span>
              </div>
              <div
                style={{
                  background: "#1877f2",
                  borderRadius: "4px",
                  padding: "3px 4px",
                  color: "#fff",
                  fontSize: "8px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "3px",
                }}
              >
                <span>f Facebook</span>
              </div>
            </div>
          </div>

          {/* Step 3: Select a Profile */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#4f46e5",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              3
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#ffffff" }}>
                Select a Profile
              </div>
              <div style={{ fontSize: "12.5px", color: "#a1a1aa", marginTop: "3px", lineHeight: 1.4 }}>
                Choose which setup you want to use for the current service.
              </div>
            </div>
            {/* Visual illustration: Active profile badge */}
            <div
              style={{
                width: "120px",
                background: "#121215",
                border: "1px solid rgba(99, 102, 241, 0.4)",
                borderRadius: "6px",
                padding: "8px 6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "8.5px", fontWeight: 700, color: "#818cf8" }}>
                ✓ Church Main Active
              </span>
            </div>
          </div>

          {/* Step 4: Sync with OBS */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#4f46e5",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              4
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#ffffff" }}>
                Sync with OBS
              </div>
              <div style={{ fontSize: "12.5px", color: "#a1a1aa", marginTop: "3px", lineHeight: 1.4 }}>
                Make Church Easy loads that profile&apos;s saved streaming setup into OBS automatically in one click.
              </div>
            </div>
            {/* Visual illustration: Sync button with cursor */}
            <div
              style={{
                width: "120px",
                background: "#121215",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "6px",
                padding: "8px 6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  background: "#4f46e5",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  color: "#fff",
                  fontSize: "8.5px",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                <span>↻ Sync with OBS</span>
              </div>
              {/* Pointer cursor */}
              <div
                style={{
                  position: "absolute",
                  bottom: "2px",
                  right: "12px",
                  width: "10px",
                  height: "10px",
                  pointerEvents: "none",
                }}
              >
                <svg viewBox="0 0 16 16" fill="white">
                  <path d="M1 1l4.5 12 2.5-4.5L13 7 1 1z" stroke="#000" strokeWidth="0.8" />
                </svg>
              </div>
            </div>
          </div>

          {/* Step 5: Go Live */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "10px",
              padding: "14px 16px",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "#10b981",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              5
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "14.5px", fontWeight: 700, color: "#ffffff" }}>
                Go Live
              </div>
              <div style={{ fontSize: "12.5px", color: "#a1a1aa", marginTop: "3px", lineHeight: 1.4 }}>
                Start streaming normally from OBS. Your broadcast goes live using the selected profile&apos;s configured destinations.
              </div>
            </div>
            {/* Visual illustration: OBS controls */}
            <div
              style={{
                width: "120px",
                background: "#121215",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                borderRadius: "6px",
                padding: "6px",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: "7px", color: "#71717a", fontWeight: 700 }}>OBS CONTROLS</div>
              <div
                style={{
                  background: "#4f46e5",
                  borderRadius: "3px",
                  padding: "2px 4px",
                  color: "#fff",
                  fontSize: "7.5px",
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                Start Streaming
              </div>
              <div
                style={{
                  background: "#27272a",
                  borderRadius: "3px",
                  padding: "2px 4px",
                  color: "#a1a1aa",
                  fontSize: "7px",
                  textAlign: "center",
                }}
              >
                Start Recording
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            paddingTop: "10px",
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "9px 36px",
              borderRadius: "8px",
              background: "#4f46e5",
              color: "#ffffff",
              border: "none",
              fontSize: "14px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

export default BroadcastHowItWorksModal;
