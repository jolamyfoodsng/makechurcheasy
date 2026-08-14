/**
 * Shared size choices used by the Bible and text quick output controls.
 * The labels stay short so the controls remain usable when the dock is narrow.
 */
export const DOCK_QUICK_SIZE_OPTIONS = [
  { id: "big", labelKey: "bible.sizeLg", label: "LG", width: "xxl" },
  { id: "bigger", labelKey: "bible.sizeXl", label: "XL", width: "xl" },
  { id: "biggest", labelKey: "bible.sizeXxl", label: "XXL", width: "lg" },
] as const;

export type DockQuickSizeOption = (typeof DOCK_QUICK_SIZE_OPTIONS)[number];
