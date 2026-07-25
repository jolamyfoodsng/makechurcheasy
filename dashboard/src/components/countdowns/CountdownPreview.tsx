"use client";

import { useCountdownTimer, type TimerState } from "@/lib/countdowns/timer";
import type { Countdown } from "@/lib/countdowns/types";

interface Props {
  countdown: Countdown;
}

function CircularPreview({ cd, timer }: { cd: Countdown; timer: TimerState }) {
  const size = 280;
  const r = (size - 12) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (timer.progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="absolute inset-0">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth={6}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "center",
              transition: "stroke-dashoffset 0.5s ease",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="font-mono font-bold text-white"
            style={{ fontSize: 52 }}
          >
            {timer.formatted}
          </span>
        </div>
      </div>
      <div className="text-center">
        <div className="text-white font-semibold text-lg">{cd.text.title}</div>
        {cd.text.subtitle && (
          <div className="text-white/60 text-sm mt-1">{cd.text.subtitle}</div>
        )}
      </div>
    </div>
  );
}

function MinimalPreview({ cd, timer }: { cd: Countdown; timer: TimerState }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <span className="font-mono font-bold text-white" style={{ fontSize: 72 }}>
        {timer.formatted}
      </span>
      <div className="text-center">
        <div className="text-white font-semibold text-lg">{cd.text.title}</div>
        {cd.text.subtitle && (
          <div className="text-white/60 text-sm mt-1">{cd.text.subtitle}</div>
        )}
      </div>
    </div>
  );
}

function ModernPreview({ cd, timer }: { cd: Countdown; timer: TimerState }) {
  const digits = timer.formatted.split("");

  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <div className="flex items-center gap-1">
        {digits.map((d, i) => (
          <span
            key={i}
            className={
              d === ":"
                ? "text-white/40 text-4xl font-light mx-1 self-start mt-3"
                : "bg-white/10 backdrop-blur-sm rounded-lg w-14 h-16 flex items-center justify-center text-white font-mono text-4xl font-bold border border-white/10"
            }
          >
            {d}
          </span>
        ))}
      </div>
      <div className="text-center">
        <div className="text-white font-semibold text-lg">{cd.text.title}</div>
        {cd.text.subtitle && (
          <div className="text-white/60 text-sm mt-1">{cd.text.subtitle}</div>
        )}
      </div>
    </div>
  );
}

function ConferencePreview({ cd, timer }: { cd: Countdown; timer: TimerState }) {
  return (
    <div className="flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center text-2xl">
        ⛪
      </div>
      <div className="text-center">
        <div className="text-white font-bold text-2xl">{cd.text.title}</div>
        {cd.text.subtitle && (
          <div className="text-white/70 text-base mt-1">{cd.text.subtitle}</div>
        )}
      </div>
      <span className="font-mono font-bold text-white" style={{ fontSize: 56 }}>
        {timer.formatted}
      </span>
    </div>
  );
}

function LowerThirdPreview({ cd, timer }: { cd: Countdown; timer: TimerState }) {
  return (
    <div className="absolute bottom-8 left-8">
      <div className="bg-black/70 backdrop-blur-md px-6 py-3 rounded-xl border-l-4 border-blue-500">
        <div className="font-mono font-bold text-white text-xl">
          {timer.formatted}
        </div>
        <div className="text-white/60 text-xs mt-0.5">{cd.text.title}</div>
      </div>
    </div>
  );
}

function FullScreenPreview({ cd, timer }: { cd: Countdown; timer: TimerState }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <span
        className="font-mono font-black text-white"
        style={{ fontSize: 96 }}
      >
        {timer.formatted}
      </span>
      <div className="text-center">
        <div className="text-white font-bold text-2xl">{cd.text.title}</div>
        {cd.text.subtitle && (
          <div className="text-white/60 text-base mt-1">{cd.text.subtitle}</div>
        )}
      </div>
    </div>
  );
}

function CustomPreview({ cd, timer }: { cd: Countdown; timer: TimerState }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <span className="font-mono font-bold text-white" style={{ fontSize: 64 }}>
        {timer.formatted}
      </span>
      {cd.text.title && (
        <div className="text-white font-semibold text-xl">{cd.text.title}</div>
      )}
      {cd.text.subtitle && (
        <div className="text-white/60 text-sm">{cd.text.subtitle}</div>
      )}
    </div>
  );
}

const PREVIEW_MAP = {
  circular: CircularPreview,
  minimal: MinimalPreview,
  modern: ModernPreview,
  conference: ConferencePreview,
  "lower-third": LowerThirdPreview,
  "full-screen": FullScreenPreview,
  custom: CustomPreview,
};

export default function CountdownPreview({ countdown }: Props) {
  const timer = useCountdownTimer(countdown);
  const PreviewComponent = PREVIEW_MAP[countdown.template];

  const bg = countdown.background;
  let bgStyle: React.CSSProperties = {};

  switch (bg.type) {
    case "solid":
      bgStyle = { backgroundColor: bg.color };
      break;
    case "gradient":
      bgStyle = {
        background: `linear-gradient(${bg.gradientAngle}deg, ${bg.gradientStops.map((s) => `${s.color} ${s.position}%`).join(", ")})`,
      };
      break;
    case "image":
      bgStyle = {
        backgroundImage: `url(${bg.imageUrl})`,
        backgroundSize: "cover",
        backgroundPosition: `${bg.positionX}% ${bg.positionY}%`,
        filter: `blur(${bg.blur}px) brightness(${bg.brightness}%)`,
      };
      break;
    default:
      bgStyle = { backgroundColor: bg.color };
  }

  const textStyle: React.CSSProperties = {
    fontFamily: `'${countdown.text.fontFamily}', sans-serif`,
    fontWeight: countdown.text.fontWeight,
    fontSize: countdown.text.fontSize,
    letterSpacing: countdown.text.letterSpacing,
    lineHeight: countdown.text.lineHeight,
    color: countdown.text.color,
    textShadow: `${countdown.text.shadowOffsetX}px ${countdown.text.shadowOffsetY}px ${countdown.text.shadowBlur}px ${countdown.text.shadowColor}`,
  };

  const hasOverlay = bg.type === "image" || bg.type === "video";

  return (
    <div className="w-full aspect-video rounded-xl overflow-hidden relative shadow-2xl border border-slate-200">
      <div className="absolute inset-0" style={bgStyle}>
        {hasOverlay && (
          <div
            className="absolute inset-0"
            style={{ backgroundColor: `rgba(0,0,0,${bg.overlayOpacity / 100})` }}
          />
        )}
      </div>
      <div className="relative z-10 w-full h-full" style={textStyle}>
        <PreviewComponent cd={countdown} timer={timer} />
      </div>
      {!countdown.isRunning && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-20">
          <div className="bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white text-sm font-medium">
            Press Play to start preview
          </div>
        </div>
      )}
    </div>
  );
}
