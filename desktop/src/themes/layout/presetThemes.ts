/**
 * The layout presets as BibleTheme records, so they show up anywhere the app
 * lists themes (Create Theme library, Themes page, dock pickers).
 */
import { DEFAULT_THEME_SETTINGS, type BibleTheme } from "../../bible/types";
import { THEME_PRESETS } from "./presets";

const PRESET_DATE = "2026-10-08T00:00:00.000Z";

export const LAYOUT_PRESET_THEMES: BibleTheme[] = THEME_PRESETS.map(({ id, name, layout }) => {
  const settings = { ...DEFAULT_THEME_SETTINGS, layout };
  const isLowerThird = layout.format === "lower-third";
  return {
    id,
    name,
    source: "builtin",
    templateType: layout.format,
    category: "bible",
    categories: ["bible", "worship", "general"],
    settings,
    variants: isLowerThird ? { lowerThird: { settings } } : { fullscreen: { settings } },
    enabledVariants: [layout.format],
    createdAt: PRESET_DATE,
    updatedAt: PRESET_DATE,
  };
});

/** Layout of a theme for a mode, if it is an editor-built theme. */
export function getThemeLayout(theme: Pick<BibleTheme, "settings" | "variants" | "templateType">) {
  return (
    theme.settings?.layout ??
    theme.variants?.lowerThird?.settings?.layout ??
    theme.variants?.fullscreen?.settings?.layout ??
    null
  );
}
