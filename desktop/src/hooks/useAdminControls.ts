/**
 * useAdminControls — Admin → Settings → Controls (feature off switches,
 * speech model, support links), re-read from the desktop config cache.
 * The cache refreshes every few minutes, so this polls it cheaply.
 */
import { useEffect, useState } from "react";
import { getAdminControls } from "../services/desktopConfig";
import type { DesktopAdminControls, DesktopFeatureSwitch } from "../services/desktopConfigTypes";

const POLL_MS = 30_000;

export function useAdminControls(): DesktopAdminControls {
  const [controls, setControls] = useState<DesktopAdminControls>(() => getAdminControls());
  useEffect(() => {
    let last = JSON.stringify(controls);
    const check = () => {
      const next = getAdminControls();
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setControls(next);
      }
    };
    const timer = window.setInterval(check, POLL_MS);
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("storage", check);
      window.removeEventListener("focus", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return controls;
}

export function useAdminFeatureEnabled(feature: DesktopFeatureSwitch): boolean {
  return useAdminControls().features[feature] !== false;
}
