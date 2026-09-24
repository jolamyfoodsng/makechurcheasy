/**
 * safeLazy.ts — MakeChurchEasy
 *
 * Robust wrapper around React.lazy() that handles dynamic chunk import failures,
 * network glitches, and stale asset hashes during updates or rebuilds. Automatically
 * retries failed module imports before raising to AppErrorBoundary.
 */

import { lazy, type ComponentType } from "react";

export function safeLazy<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: T }>
) {
  return lazy(async () => {
    try {
      const res = await factory();
      if ("default" in res) {
        return res as { default: T };
      }
      const firstKey = Object.keys(res)[0];
      return { default: res[firstKey] };
    } catch (err) {
      console.warn("[MakeChurchEasy] Transient chunk import error, retrying...", err);
      // Brief pause before first retry
      await new Promise((resolve) => setTimeout(resolve, 300));
      try {
        const res = await factory();
        if ("default" in res) {
          return res as { default: T };
        }
        const firstKey = Object.keys(res)[0];
        return { default: res[firstKey] };
      } catch (retryErr) {
        console.error("[MakeChurchEasy] Module script import failed after retry:", retryErr);
        // Force refresh page if asset bundle hash changed on client
        const reloadKey = "mce_module_chunk_reload_" + Math.floor(Date.now() / 15000);
        if (typeof window !== "undefined" && !sessionStorage.getItem(reloadKey)) {
          sessionStorage.setItem(reloadKey, "1");
          window.location.reload();
        }
        throw retryErr;
      }
    }
  });
}

export default safeLazy;
