/**
 * useStudioThemes.ts — the presentation themes (the ones on the Themes page) for the Studio:
 * what Bible / Worship / Notes use now, the list to pick from, and picking one.
 *
 * Picking a theme here saves it the same way the Themes page does and syncs it to the Dock,
 * so the OBS Dock and the Studio keep the same look.
 */
import { useCallback, useEffect, useState } from "react";
import type { BibleTheme } from "../bible/types";
import { themeSupportsBibleOverlayMode } from "../bible/themeVariantSupport";
import {
  getProductionSettings,
  loadAvailableProductionThemes,
  saveProductionSettings,
  syncProductionSettingsToDock,
} from "../services/productionSettings";
import { loadStudioThemes, type StudioMode, type StudioTextModule, type StudioThemes } from "./studioEngine";

export interface StudioThemesApi {
  themes: StudioThemes | null;
  /** Every theme (built-in and custom) that is not hidden. */
  all: BibleTheme[];
  /** Themes that have this look (full screen or lower third). */
  forMode: (mode: StudioMode) => BibleTheme[];
  /** The theme a module uses for a look. */
  current: (module: StudioTextModule, mode: StudioMode) => BibleTheme | null;
  choose: (module: StudioTextModule, mode: StudioMode, themeId: string) => Promise<void>;
  reload: () => void;
  error: string;
}

export function useStudioThemes(): StudioThemesApi {
  const [themes, setThemes] = useState<StudioThemes | null>(null);
  const [all, setAll] = useState<BibleTheme[]>([]);
  const [error, setError] = useState("");

  const reload = useCallback(() => {
    void loadStudioThemes().then(setThemes).catch(() => undefined);
    void loadAvailableProductionThemes().then((list) => setAll(list.filter((t) => !t.hidden))).catch(() => undefined);
  }, []);

  useEffect(() => {
    reload();
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);

  const forMode = useCallback(
    (mode: StudioMode) => all.filter((t) => themeSupportsBibleOverlayMode(t, mode)),
    [all],
  );

  const current = useCallback((module: StudioTextModule, mode: StudioMode): BibleTheme | null => {
    const set = themes?.[module];
    if (!set) return null;
    return mode === "lower-third" ? set.lowerThird ?? set.fullscreen : set.fullscreen ?? set.lowerThird;
  }, [themes]);

  const choose = useCallback(async (module: StudioTextModule, mode: StudioMode, themeId: string) => {
    setError("");
    try {
      const settings = await getProductionSettings();
      const key = mode === "lower-third" ? "lowerThirdThemeId" : "fullscreenThemeId";
      const next = { ...settings, [module]: { ...settings[module], [key]: themeId } };
      const saved = await saveProductionSettings(next);
      await syncProductionSettingsToDock(saved).catch(() => undefined);
      setThemes(await loadStudioThemes());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change the theme.");
    }
  }, []);

  return { themes, all, forMode, current, choose, reload, error };
}
