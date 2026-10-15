/**
 * graphicCategory.ts — which library category a graphic belongs to (Speaker, Giving, Welcome, ...).
 * Same rules the Broadcast Graphics page uses, kept here so the Studio drawer lists the same groups.
 */
import type { LowerThirdTheme } from "./types";

export const GRAPHIC_CATEGORY_TABS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mine", label: "My graphics" },
  { key: "speaker", label: "Speaker" },
  { key: "service", label: "Service" },
  { key: "welcome", label: "Welcome" },
  { key: "giving", label: "Giving" },
  { key: "subscribe", label: "Subscribe" },
  { key: "announcements", label: "Announcements" },
  { key: "countdown", label: "Countdown" },
  { key: "social", label: "Social Media" },
  { key: "branding", label: "Logo & Branding" },
  { key: "scripture", label: "Scripture" },
  { key: "quotes", label: "Quotes" },
  { key: "others", label: "Others" },
];

const KEYS = new Set(GRAPHIC_CATEGORY_TABS.map((c) => c.key).filter((k) => k !== "all" && k !== "mine"));

export function graphicCategoryOf(theme: Pick<LowerThirdTheme, "id" | "name" | "category" | "tags"> & { graphicCategory?: string }): string {
  const own = String(theme.graphicCategory || "").toLowerCase();
  if (KEYS.has(own)) return own;
  const tags = (theme.tags || []).map((t) => t.toLowerCase());
  const id = theme.id.toLowerCase();
  const name = theme.name.toLowerCase();
  if (tags.includes("speaker") || theme.category === "speaker") return "speaker";
  if (tags.includes("welcome") || name.includes("welcome") || id.includes("join") || id.includes("guest") || id.includes("connect")) return "welcome";
  if (tags.includes("giving") || name.includes("giving") || id.includes("give") || id.includes("tithe") || id.includes("offering")) return "giving";
  if (tags.includes("subscribe") || id.includes("sub-") || id.includes("subscribe")) return "subscribe";
  if (tags.includes("announcement") || name.includes("announcement") || id.includes("service-times") || id.includes("kids-checkin") || id.includes("event") || id.includes("baptism")) return "announcements";
  if (tags.includes("countdown") || name.includes("countdown") || id.includes("countdown")) return "countdown";
  if (tags.includes("social") || name.includes("social") || id.includes("handle") || id.includes("website")) return "social";
  if (tags.includes("scripture") || theme.category === "bible" || id.includes("prayer")) return "scripture";
  return "others";
}
