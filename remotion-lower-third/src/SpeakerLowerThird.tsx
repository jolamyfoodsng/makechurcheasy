import type React from "react";
import {
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Interactive,
  type InteractivitySchema,
} from "remotion";

export type SpeakerLowerThirdProps = {
  readonly speakerName: string;
  readonly roleOrTitle: string;
  readonly organization?: string;
  readonly topic?: string;
  readonly accentColor?: string;
  readonly secondaryAccent?: string;
  readonly style?: React.CSSProperties;
};

const SpeakerLowerThirdInner: React.FC<SpeakerLowerThirdProps> = ({
  speakerName = "Pastor Henry Odewale",
  roleOrTitle = "Lead Pastor",
  organization = "MakeChurchEazy Ministry",
  topic = "Keys to Forceful Advancement",
  accentColor = "#2563EB",
  secondaryAccent = "#06B6D4",
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Intro: 0 to 1 sec (0 to fps frames)
  // Hold: 1 sec to (durationInFrames - fps)
  // Outro: (durationInFrames - fps) to durationInFrames
  const introDuration = Math.round(fps * 0.9);
  const outroDuration = Math.round(fps * 0.7);
  const outroStart = durationInFrames - outroDuration;

  // Slide & scale animation for the main card
  const entranceProgress = interpolate(frame, [0, introDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1), // smooth overshoot-like feel
  });

  const exitProgress = interpolate(
    frame,
    [outroStart, durationInFrames],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.7, 0, 0.84, 0),
    }
  );

  // Overall opacity
  const opacity = interpolate(
    frame,
    [0, Math.round(fps * 0.3), outroStart + Math.round(fps * 0.3), durationInFrames],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  // Translate Y & X motion
  const translateY =
    (1 - entranceProgress) * 45 + exitProgress * 35;
  const translateX =
    (1 - entranceProgress) * -25 + exitProgress * -20;

  // Staggered reveal for details tag (badge)
  const badgeProgress = interpolate(
    frame,
    [Math.round(fps * 0.25), Math.round(fps * 0.95)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  // Accent bar scale
  const barScaleY = interpolate(
    frame,
    [Math.round(fps * 0.1), Math.round(fps * 0.7)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  // Subtitle wipe in
  const subtitleOpacity = interpolate(
    frame,
    [Math.round(fps * 0.35), Math.round(fps * 0.85)],
    [0, 1],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }
  );

  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        bottom: 90,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        zIndex: 50,
        opacity,
        transform: `translate(${translateX}px, ${translateY}px)`,
        ...style,
      }}
    >
      {/* Optional Top Live / Topic Tag */}
      {topic && (
        <div
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            borderRadius: 999,
            backgroundColor: "rgba(15, 23, 42, 0.82)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.35)",
            opacity: badgeProgress,
            translate: `0px ${(1 - badgeProgress) * 12}px`,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: secondaryAccent,
              boxShadow: `0 0 10px ${secondaryAccent}`,
            }}
          />
          <span
            style={{
              color: "#E2E8F0",
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {topic}
          </span>
        </div>
      )}

      {/* Main Glassmorphic Lower-Third Card */}
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          backgroundColor: "rgba(15, 23, 42, 0.88)",
          backdropFilter: "blur(20px)",
          borderRadius: 20,
          border: "1px solid rgba(255, 255, 255, 0.16)",
          boxShadow:
            "0 24px 50px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)",
          overflow: "hidden",
          minWidth: 440,
          maxWidth: 820,
        }}
      >
        {/* Dynamic Glowing Accent Pillar */}
        <div
          style={{
            width: 8,
            backgroundColor: accentColor,
            background: `linear-gradient(180deg, ${secondaryAccent} 0%, ${accentColor} 100%)`,
            transformOrigin: "bottom",
            scale: `1 ${barScaleY}`,
            boxShadow: `0 0 16px ${accentColor}`,
          }}
        />

        {/* Text Content Block */}
        <div
          style={{
            padding: "20px 32px 22px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {/* Speaker Full Name */}
          <div
            style={{
              color: "#FFFFFF",
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              fontSize: 42,
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
              textShadow: "0 2px 8px rgba(0,0,0,0.5)",
            }}
          >
            {speakerName}
          </div>

          {/* Role, Title & Church / Organization */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              opacity: subtitleOpacity,
              translate: `0px ${(1 - subtitleOpacity) * 8}px`,
            }}
          >
            <span
              style={{
                color: "#60A5FA",
                fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: "0.01em",
              }}
            >
              {roleOrTitle}
            </span>

            {organization && (
              <>
                <span
                  style={{
                    color: "rgba(148, 163, 184, 0.6)",
                    fontSize: 16,
                  }}
                >
                  •
                </span>
                <span
                  style={{
                    color: "#94A3B8",
                    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    fontSize: 18,
                    fontWeight: 500,
                  }}
                >
                  {organization}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const speakerLowerThirdSchema = {
  speakerName: {
    type: "text-content",
    default: "Pastor Henry Odewale",
    description: "Speaker Name",
  },
  roleOrTitle: {
    type: "text-content",
    default: "Lead Pastor",
    description: "Role or Title",
  },
  organization: {
    type: "text-content",
    default: "MakeChurchEazy Ministry",
    description: "Organization / Church",
  },
  topic: {
    type: "text-content",
    default: "Keys to Forceful Advancement",
    description: "Service or Message Topic",
  },
  accentColor: {
    type: "color",
    default: "#2563EB",
    description: "Primary Accent Color",
  },
  secondaryAccent: {
    type: "color",
    default: "#06B6D4",
    description: "Secondary Glow Color",
  },
} as const satisfies InteractivitySchema;

export const SpeakerLowerThird = Interactive.withSchema({
  Component: SpeakerLowerThirdInner,
  componentName: "<SpeakerLowerThird>",
  schema: speakerLowerThirdSchema,
  wrapInSequence: true,
});
