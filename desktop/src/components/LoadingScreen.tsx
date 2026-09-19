import type { CSSProperties, ReactNode } from "react";
import "./loading-screen.css";

export interface LoadingSpinnerProps {
  size?: "small" | "medium" | "large";
  className?: string;
  style?: CSSProperties;
}

export function LoadingSpinner({ size = "medium", className = "", style }: LoadingSpinnerProps) {
  return (
    <div className={`mce-spinner-wrapper ${className}`} style={style} aria-hidden="true">
      <div className={`mce-spinner mce-spinner--${size}`} />
      <div className="mce-spinner-core" />
    </div>
  );
}

export interface LoadingScreenProps {
  label?: string;
  sublabel?: string;
  variant?: "fullscreen" | "page" | "dock" | "inline";
  size?: "small" | "medium" | "large";
  showLogo?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export default function LoadingScreen({
  label = "Loading…",
  sublabel,
  variant = "page",
  size,
  showLogo = false,
  className = "",
  style,
  children,
}: LoadingScreenProps) {
  const spinnerSize = size || (variant === "dock" ? "small" : variant === "fullscreen" ? "large" : "medium");

  return (
    <div
      className={`mce-loading-screen mce-loading-screen--${variant} ${className}`.trim()}
      style={style}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mce-loading-screen__glow" aria-hidden="true" />
      <div className="mce-loading-screen__content">
        {showLogo && (
          <div className="mce-loading-screen__logo" aria-hidden="true">
            <img
              src="/logo_icon.png"
              alt="MakeChurchEasy"
              className="mce-loading-screen__logo-img"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </div>
        )}
        <LoadingSpinner size={spinnerSize} />
        {label && <p className="mce-loading-screen__label">{label}</p>}
        {sublabel && <p className="mce-loading-screen__sublabel">{sublabel}</p>}
        {children}
      </div>
    </div>
  );
}
