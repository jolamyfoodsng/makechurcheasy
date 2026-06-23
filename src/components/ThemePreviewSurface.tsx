import type { CSSProperties, HTMLAttributes, PropsWithChildren } from "react";
import { resolveOverlayAssetUrl } from "../services/overlayUrl";

interface ThemePreviewSurfaceProps extends PropsWithChildren, HTMLAttributes<HTMLDivElement> {
  className?: string;
  style?: CSSProperties;
  videoSrc?: string;
  posterSrc?: string;
}

function sanitizeMediaSrc(value: string | undefined): string {
  const trimmed = String(value || "").trim();
  if (!trimmed || trimmed.startsWith("__")) return "";
  return resolveOverlayAssetUrl(trimmed);
}

export default function ThemePreviewSurface({
  className,
  style,
  videoSrc,
  posterSrc,
  children,
  ...rest
}: ThemePreviewSurfaceProps) {
  const resolvedVideoSrc = sanitizeMediaSrc(videoSrc);
  const resolvedPosterSrc = sanitizeMediaSrc(posterSrc);

  return (
    <div
      className={className}
      {...rest}
      style={{
        position: "relative",
        overflow: "hidden",
        ...style,
      }}
    >
      {resolvedVideoSrc && (
        <video
          aria-hidden="true"
          autoPlay
          loop
          muted
          playsInline
          poster={resolvedPosterSrc || undefined}
          preload="metadata"
          src={resolvedVideoSrc}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            pointerEvents: "none",
          }}
        />
      )}
      {children}
    </div>
  );
}
