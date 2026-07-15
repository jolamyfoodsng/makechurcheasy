import { useEffect, useMemo, useRef, useState } from "react";

import type { CSSProperties } from "react";
import type { PresentationCountdownPayload, PresentationRemoteItem } from "../types";

interface PresentationPreviewProps {
  content: PresentationRemoteItem | null;
  label: string;
  live?: boolean;
  waitingCopy?: string;
}

function normalizeCountdownPayload(
  countdown: PresentationRemoteItem["countdown"] | undefined,
): PresentationCountdownPayload | null {
  if (!countdown) return null;
  if ("config" in countdown) {
    const durationSeconds = Math.max(0, Math.floor(countdown.config.timer.durationSeconds || 0));
    const startedAt = new Date(countdown.startedAt || Date.now()).toISOString();
    const endsAt = countdown.config.timer.mode === "end-at-time"
      ? countdown.config.timer.endAt
      : new Date((countdown.startedAt || Date.now()) + durationSeconds * 1000).toISOString();
    return {
      title: countdown.config.title || "Countdown",
      mode: countdown.config.timer.mode === "end-at-time" ? "time" : "duration",
      status: "running",
      durationSeconds,
      startedAt,
      endsAt,
      pausedRemainingSeconds: durationSeconds,
      completionMessage: countdown.config.message?.text,
      soundEnabled: false,
      showTitle: true,
      showHours: countdown.config.timer.showHours,
      showMinutes: countdown.config.timer.showMinutes,
      showSeconds: countdown.config.timer.showSeconds,
      updatedAt: new Date().toISOString(),
      sourceCountdownId: countdown.config.id,
    };
  }
  return countdown;
}

function formatCountdown(
  remainingSeconds: number,
  showHours: boolean,
  showMinutes: boolean,
  showSeconds: boolean,
): string {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const parts: string[] = [];

  if (showHours || hours > 0) {
    parts.push(String(hours).padStart(2, "0"));
  }
  if (showMinutes || parts.length > 0) {
    parts.push(String(minutes).padStart(2, "0"));
  }
  if (showSeconds || parts.length === 0) {
    parts.push(String(seconds).padStart(2, "0"));
  }

  return parts.join(":");
}

function getCountdownRemaining(item: PresentationRemoteItem | null): number {
  const payload = normalizeCountdownPayload(item?.countdown);
  if (!payload) return 0;
  if (payload.status === "completed") return 0;
  if (payload.status === "paused") {
    return Math.max(0, Math.floor(payload.pausedRemainingSeconds || 0));
  }
  if (payload.mode === "time" && payload.endsAt) {
    return Math.max(0, Math.floor((new Date(payload.endsAt).getTime() - Date.now()) / 1000));
  }
  if (payload.status === "running" && payload.startedAt) {
    const startedAt = new Date(payload.startedAt).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    return Math.max(0, Math.floor(payload.durationSeconds || 0) - elapsedSeconds);
  }
  if (payload.pausedRemainingSeconds != null) {
    return Math.max(0, Math.floor(payload.pausedRemainingSeconds));
  }
  return Math.max(0, Math.floor(payload.durationSeconds || 0));
}

function getMediaObjectFit(value: string | undefined): CSSProperties["objectFit"] {
  switch (value) {
    case "fit":
    case "contain":
      return "contain";
    case "stretch":
      return "fill";
    case "fill":
    default:
      return "cover";
  }
}

export function PresentationPreview({
  content,
  label,
  live = false,
  waitingCopy = "Nothing selected yet.",
}: PresentationPreviewProps) {
  const [tick, setTick] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!content?.countdown) return undefined;
    const interval = window.setInterval(() => setTick((value) => value + 1), 250);
    return () => window.clearInterval(interval);
  }, [content?.countdown]);

  useEffect(() => {
    const video = videoRef.current;
    const playback = content?.media?.playback;
    if (!video || !playback) return;

    video.muted = playback.muted;
    video.loop = playback.loop;
    video.volume = Math.max(0, Math.min(1, playback.volume));
    if (Math.abs(video.currentTime - playback.positionSeconds) > 1.2) {
      try {
        video.currentTime = playback.positionSeconds;
      } catch {
        // Ignore seeking before metadata is ready.
      }
    }
    if (playback.playing) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [content?.id, content?.media?.playback, tick]);

  const style = content?.style;
  const stageStyle = useMemo<CSSProperties>(() => ({
    backgroundColor: style?.backgroundColor || "#050816",
    color: style?.textColor || "#ffffff",
    fontFamily: style?.fontFamily || '"CMG Sans", "Inter", sans-serif',
    textAlign: style?.textAlign || "center",
    textShadow: style?.textShadow || "0 12px 40px rgba(0,0,0,0.48)",
  }), [style]);

  const hasBackgroundOverlay = (style?.overlayOpacity || 0) > 0;
  const countdown = normalizeCountdownPayload(content?.countdown);
  const remaining = getCountdownRemaining(content);
  const ticker = content?.ticker;

  return (
    <section className="presentation-preview-card">
      <div className="presentation-preview-card__head">
        <div>
          <div className="presentation-panel-title">{label}</div>
          <div className="presentation-preview-card__subhead">
            {live ? "Remote screen output" : "Local preview"}
          </div>
        </div>
        <span className={`presentation-preview-badge${live ? " is-live" : ""}`}>
          {live ? "Live" : "Preview"}
        </span>
      </div>

      <div className="presentation-preview-stage" style={stageStyle}>
        {!content ? (
          <div className="presentation-preview-empty">{waitingCopy}</div>
        ) : (
          <>
            {style?.backgroundImage ? (
              <img
                className="presentation-preview-background"
                src={style.backgroundImage}
                alt=""
              />
            ) : null}
            {style?.backgroundVideo ? (
              <video
                className="presentation-preview-background"
                src={style.backgroundVideo}
                autoPlay
                muted
                loop
                playsInline
              />
            ) : null}
            {hasBackgroundOverlay ? (
              <div
                className="presentation-preview-overlay"
                style={{
                  backgroundColor: style?.overlayColor || "#000000",
                  opacity: style?.overlayOpacity || 0,
                }}
              />
            ) : null}

            {content.media ? (
              content.media.kind === "video" ? (
                <video
                  ref={videoRef}
                  className="presentation-preview-media"
                  src={content.media.url}
                  autoPlay
                  muted
                  loop
                  playsInline
                  style={{
                    objectFit: getMediaObjectFit(content.media.fit),
                    backgroundColor: content.media.backgroundColor || "#000000",
                  }}
                />
              ) : (
                <img
                  className="presentation-preview-media"
                  src={content.media.url}
                  alt={content.title || "Presentation media"}
                  style={{
                    objectFit: getMediaObjectFit(content.media.fit),
                    backgroundColor: content.media.backgroundColor || "#000000",
                  }}
                />
              )
            ) : null}

            {countdown ? (
              <div className="presentation-preview-copy presentation-preview-copy--countdown">
                {countdown.showTitle !== false ? (
                  <div className="presentation-preview-title">{countdown.title || content.title}</div>
                ) : null}
                <div className="presentation-preview-clock">
                  {formatCountdown(
                    remaining,
                    Boolean(countdown.showHours),
                    Boolean(countdown.showMinutes),
                    Boolean(countdown.showSeconds),
                  )}
                </div>
                {countdown.completionMessage ? (
                  <div className="presentation-preview-subtitle">{countdown.completionMessage}</div>
                ) : null}
              </div>
            ) : !content.media ? (
              <div
                className={`presentation-preview-copy presentation-preview-copy--${style?.textAlign || "center"}`}
                style={{
                  padding: `${Math.max(24, style?.safeArea || 56)}px`,
                  lineHeight: style?.lineHeight || 1.2,
                }}
              >
                {content.reference ? (
                  <div className="presentation-preview-reference">{content.reference}</div>
                ) : null}
                {content.title ? (
                  <div
                    className="presentation-preview-title"
                    style={{
                      fontSize: `${Math.max(22, style?.fontSize || 64)}px`,
                      fontWeight: style?.fontWeight || 700,
                    }}
                  >
                    {content.title}
                  </div>
                ) : null}
                {content.subtitle ? (
                  <div className="presentation-preview-subtitle">{content.subtitle}</div>
                ) : null}
                {content.body ? (
                  <div className="presentation-preview-body">{content.body}</div>
                ) : null}
              </div>
            ) : null}

            {ticker && !ticker.hidden ? (
              <div
                className={`presentation-preview-ticker presentation-preview-ticker--${ticker.position || "bottom"}`}
                style={{
                  backgroundColor: ticker.backgroundColor,
                  color: ticker.textColor,
                  fontSize: `${Math.max(14, ticker.fontSize)}px`,
                }}
              >
                <div
                  className={`presentation-preview-ticker__track direction-${ticker.direction || "rtl"}${ticker.paused ? " is-paused" : ""}`}
                  style={{
                    animationDuration: `${Math.max(6, 42 / Math.max(0.25, ticker.speed || 1))}s`,
                  }}
                >
                  {ticker.text}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
