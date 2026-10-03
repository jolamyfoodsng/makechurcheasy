import React from "react";
import { AbsoluteFill } from "remotion";
import { SpeakerLowerThird } from "./SpeakerLowerThird";

export const SpeakerLowerThirdPreview: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "transparent",
      }}
    >
      {/* Background camera simulator preview (subtle dark stage gradient) */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 70% 30%, rgba(30, 58, 138, 0.45), rgba(15, 23, 42, 0.95))",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 50,
            padding: "8px 16px",
            borderRadius: 8,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            color: "#94A3B8",
            fontSize: 14,
            fontWeight: 600,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            fontFamily: "sans-serif",
          }}
        >
          ● Live Broadcast Preview · 1080p
        </div>
      </AbsoluteFill>

      {/* The Animated Lower Third */}
      <SpeakerLowerThird
        name="Speaker Lower Third"
        from={15}
        durationInFrames={180}
        speakerName="Pastor Henry Odewale"
        roleOrTitle="Lead Pastor"
        organization="MakeChurchEazy Church"
        topic="Forceful Advancement"
        accentColor="#2563EB"
        secondaryAccent="#38BDF8"
      />
    </AbsoluteFill>
  );
};
