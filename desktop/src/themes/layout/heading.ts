/**
 * heading.ts — which layers make up a theme's heading (the reference / label
 * line plus any box drawn behind it), so the heading can be switched off in the
 * Theme Editor, or hidden live when Worship / Notes send no label.
 */
import { hasTokens, isVerseTextPattern } from "./content";
import type { ThemeLayer, ThemeLayout } from "./types";

export interface HeadingLayers {
  /** Text layers that carry the reference / label. */
  text: Set<string>;
  /** Boxes, dividers and images that belong to the heading. */
  decor: Set<string>;
}

/** heading: false opts a token text out of the automatic heading. */
const isLabelText = (l: ThemeLayer) =>
  l.type === "text" && l.heading !== false && hasTokens(l.content) && !isVerseTextPattern(l.content);

export function headingLayers(layout: Pick<ThemeLayout, "layers">): HeadingLayers {
  const flagged = layout.layers.filter((l) => l.heading === true);
  if (flagged.length) {
    return {
      text: new Set(flagged.filter((l) => l.type === "text").map((l) => l.id)),
      decor: new Set(flagged.filter((l) => l.type !== "text").map((l) => l.id)),
    };
  }
  return { text: new Set(layout.layers.filter(isLabelText).map((l) => l.id)), decor: new Set() };
}

/** True when the layout has a heading the editor can switch on/off. */
export function hasHeading(layout: Pick<ThemeLayout, "layers">): boolean {
  return headingLayers(layout).text.size > 0;
}

export function isHeadingShown(layout: Pick<ThemeLayout, "showHeading">): boolean {
  return layout.showHeading !== false;
}
