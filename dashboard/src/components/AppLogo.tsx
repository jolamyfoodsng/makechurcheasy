"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";

type LogoMode = "auto" | "dark" | "light";

type AppLogoProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  mode?: LogoMode;
};

const LOGO_LIGHT = "/logos/make_church_easy_logo.png";
const LOGO_DARK = "/logos/make_church_easy_white_logo.png";

function detectThemeMode(): "light" | "dark" {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "light";
  }

  const root = document.documentElement;
  const body = document.body;
  const rootTheme = root.getAttribute("data-theme");
  const bodyTheme = body?.getAttribute("data-theme");

  if (
    root.classList.contains("mv-theme-dark") ||
    body?.classList.contains("mv-theme-dark") ||
    root.classList.contains("dark") ||
    body?.classList.contains("dark") ||
    rootTheme === "dark" ||
    bodyTheme === "dark"
  ) {
    return "dark";
  }

  if (
    root.classList.contains("mv-theme-light") ||
    body?.classList.contains("mv-theme-light") ||
    root.classList.contains("light") ||
    body?.classList.contains("light") ||
    rootTheme === "light" ||
    bodyTheme === "light"
  ) {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function AppLogo({
  mode = "auto",
  alt = "MakeChurchEasy",
  ...imgProps
}: AppLogoProps) {
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">(
    () => (mode === "auto" ? detectThemeMode() : mode)
  );

  useEffect(() => {
    if (mode !== "auto") {
      setResolvedMode(mode);
      return;
    }

    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const updateMode = () => setResolvedMode(detectThemeMode());
    updateMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateMode);
    } else {
      mediaQuery.addListener(updateMode);
    }

    const rootObserver = new MutationObserver(updateMode);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme"],
    });

    const bodyObserver = new MutationObserver(updateMode);
    if (document.body) {
      bodyObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "data-theme"],
      });
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", updateMode);
      } else {
        mediaQuery.removeListener(updateMode);
      }
      rootObserver.disconnect();
      bodyObserver.disconnect();
    };
  }, [mode]);

  const src = resolvedMode !== "dark" ? LOGO_LIGHT : LOGO_DARK;
  return <img {...imgProps} src={src} alt={alt} />;
}
