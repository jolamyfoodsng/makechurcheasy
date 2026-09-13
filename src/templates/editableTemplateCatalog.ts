/**
 * Shared editable-template types and the built-in template catalog.
 *
 * The catalog is intentionally empty while the template library is being
 * rebuilt. The editor, storage, import, and Dock handoff remain available.
 */

export type TemplateCategory = "Bible" | "Worship" | "Announcements" | "Service";

export interface TemplateCanvas {
  width: number;
  height: number;
}

export interface TemplateBackground {
  base: string;
  gradientStart: string;
  gradientEnd: string;
  accent: string;
  imageUrl?: string;
  previewImageUrl?: string;
  imageOpacity?: number;
}

export interface TemplateTextLayer {
  id: string;
  kind: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fill: string;
  fontSize: number;
  fontFamily: string;
  fontStyle?: "normal" | "italic";
  fontWeight?: number;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  letterSpacing?: number;
  wrap?: "word" | "none";
  scaleX?: number;
  preserveScaleX?: boolean;
  scaleY?: number;
}

export interface TemplateShapeLayer {
  id: string;
  kind: "rect" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  cornerRadius?: number;
}

export interface TemplateImageLayer {
  id: string;
  kind: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  src: string;
  opacity?: number;
  scaleX?: number;
  scaleY?: number;
  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  sourceWidth?: number;
  sourceHeight?: number;
  removeBackgroundOnLoad?: boolean;
}

export type TemplateLayer = TemplateTextLayer | TemplateShapeLayer | TemplateImageLayer;

export interface EditableTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  accentColor: string;
  canvas: TemplateCanvas;
  background: TemplateBackground;
  layers: TemplateLayer[];
}

const WEEKLY_ACTIVITIES_SOURCE = "/templates/weekly-activities-source.png";
const WEEKLY_ACTIVITIES_RIGHT_ARTWORK = "/templates/weekly-right-artwork.png";
const WEEKLY_ACTIVITIES_LOGO = "/templates/weekly-logo.png";
const WEEKLY_ACTIVITIES_RIBBON = "/templates/weekly-ribbon.png";
const WEEKLY_ACTIVITIES_TUESDAY_ICON = "/templates/weekly-tuesday-icon.png";
const WEEKLY_ACTIVITIES_THURSDAY_ICON = "/templates/weekly-thursday-icon.png";
const WEEKLY_ACTIVITIES_SUNDAY_ICON = "/templates/weekly-sunday-icon.png";
const WEEKLY_ACTIVITIES_CANVAS: TemplateCanvas = { width: 1672, height: 941 };
const WEEKLY_ACTIVITIES_FONT = "Arial Black, Arial, sans-serif";
const WEEKLY_ACTIVITIES_BODY_FONT = "Arial, Helvetica, sans-serif";

function weeklyText(
  id: string,
  value: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fontSize: number,
  fill = "#FFFFFF",
  options: Partial<Omit<TemplateTextLayer, "id" | "kind" | "x" | "y" | "width" | "height" | "text" | "fontSize" | "fill">> = {},
): TemplateTextLayer {
  return {
    id,
    kind: "text",
    x,
    y,
    width,
    height,
    text: value,
    fill,
    fontSize,
    fontFamily: WEEKLY_ACTIVITIES_BODY_FONT,
    fontWeight: 700,
    lineHeight: 1.08,
    wrap: "none",
    ...options,
  };
}

function weeklyRect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  options: Partial<Omit<TemplateShapeLayer, "id" | "kind" | "x" | "y" | "width" | "height" | "fill">> = {},
): TemplateShapeLayer {
  return { id, kind: "rect", x, y, width, height, fill, ...options };
}

function weeklyImage(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  src: string,
): TemplateImageLayer {
  return { id, kind: "image", x, y, width, height, src };
}

export const EDITABLE_TEMPLATE_LIBRARY: EditableTemplate[] = [
  {
    id: "weekly-activities",
    name: "Weekly Activities",
    description: "An editable weekly church schedule for prayers, Bible study, and Sunday services.",
    category: "Service",
    tags: ["weekly", "schedule", "activities"],
    accentColor: "#6B5BFF",
    canvas: WEEKLY_ACTIVITIES_CANVAS,
    background: {
      base: "#2F287E",
      gradientStart: "#F6F5F1",
      gradientEnd: "#27206C",
      accent: "#6B5BFF",
      previewImageUrl: WEEKLY_ACTIVITIES_SOURCE,
    },
    layers: [
      // Preserve the supplied artwork while masking the original copy so the
      // recreated text remains independently selectable in the editor.
      weeklyRect("weekly-clean-top", 0, 0, 1260, 465, "rgba(247, 246, 242, 0.99)"),
      weeklyRect("weekly-clean-bottom", 0, 425, 1260, 516, "rgba(47, 40, 126, 0.99)"),
      weeklyImage("weekly-right-artwork", 1260, 0, 412, 941, WEEKLY_ACTIVITIES_RIGHT_ARTWORK),
      weeklyImage("weekly-logo", 48, 35, 218, 82, WEEKLY_ACTIVITIES_LOGO),
      weeklyImage("weekly-ribbon", 390, 355, 390, 125, WEEKLY_ACTIVITIES_RIBBON),
      weeklyRect("weekly-ribbon-text-cover", 438, 388, 310, 52, "#F72A28"),

      weeklyText("weekly-title", "Weekly", 238, 78, 760, 180, 170, "#050505", {
        fontFamily: WEEKLY_ACTIVITIES_FONT,
        fontWeight: 900,
        letterSpacing: -4,
      }),
      weeklyText("weekly-subtitle", "Activities", 238, 238, 780, 180, 158, "#050505", {
        fontFamily: WEEKLY_ACTIVITIES_FONT,
        fontWeight: 900,
        letterSpacing: -4,
      }),
      weeklyText("weekly-ribbon-copy", "Join us every week!", 450, 394, 300, 48, 27, "#FFFFFF", {
        fontFamily: "Georgia, serif",
        fontWeight: 700,
        align: "center",
      }),

      weeklyText("weekly-days-heading", "WEEK DAYS", 146, 478, 230, 38, 25),
      weeklyText("weekly-activity-heading", "ACTIVITY", 503, 478, 210, 38, 25),
      weeklyText("weekly-time-heading", "TIME", 809, 478, 150, 38, 25),
      weeklyText("weekly-venue-heading", "VENUE", 1068, 478, 180, 38, 25),

      weeklyImage("weekly-tuesday-icon", 111, 526, 75, 75, WEEKLY_ACTIVITIES_TUESDAY_ICON),
      weeklyText("weekly-tuesday-day", "TUESDAY\nEVERY WEEK", 210, 540, 180, 64, 24),
      weeklyText("weekly-tuesday-activity", "GENERAL\nHOUSE PRAYERS", 472, 540, 220, 64, 24, "#FFFFFF", { align: "center" }),
      weeklyText("weekly-tuesday-time", "5:00PM\nPROMPT", 786, 540, 165, 64, 23, "#FFFFFF", { align: "center" }),
      weeklyText("weekly-tuesday-venue", "VICTORY GROUND (VG)\nBESIDE ACCESS BANK", 1007, 541, 222, 64, 16, "#FFFFFF", { align: "center", fontWeight: 500, wrap: "word" }),

      weeklyImage("weekly-thursday-icon", 111, 616, 75, 75, WEEKLY_ACTIVITIES_THURSDAY_ICON),
      weeklyText("weekly-thursday-day", "THURSDAY\nEVERY WEEK", 210, 630, 180, 64, 24),
      weeklyText("weekly-thursday-activity", "BIBLE\nSTUDY", 472, 630, 220, 64, 24, "#FFFFFF", { align: "center" }),
      weeklyText("weekly-thursday-time", "4:00PM\nPROMPT", 786, 630, 165, 64, 23, "#FFFFFF", { align: "center" }),
      weeklyText("weekly-thursday-venue", "CHAPEL OF REDEMPTION\nRESOURCE CENTER CORRIDOR", 1007, 631, 222, 64, 16, "#FFFFFF", { align: "center", fontWeight: 500, wrap: "word" }),

      weeklyImage("weekly-sunday-icon", 111, 716, 75, 75, WEEKLY_ACTIVITIES_SUNDAY_ICON),
      weeklyText("weekly-sunday-day", "SUNDAY\nEVERY WEEK", 210, 730, 180, 64, 24),
      weeklyText("weekly-sunday-activity", "SUNDAY\nSERVICE", 472, 730, 220, 64, 24, "#FFFFFF", { align: "center" }),
      weeklyText("weekly-sunday-time", "9:00AM\nFIRST SERVICE\n\n11:30AM\nSECOND SERVICE", 770, 716, 195, 112, 18, "#FFFFFF", { align: "center", lineHeight: 1.12 }),
      weeklyText("weekly-sunday-venue", "CHAPEL OF REDEMPTION", 1007, 746, 222, 36, 16, "#FFFFFF", { align: "center", fontWeight: 500, wrap: "word" }),

      weeklyRect("weekly-divider-one", 409, 534, 2, 72, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-two", 717, 534, 2, 72, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-three", 969, 534, 2, 72, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-row-one-rule", 111, 605, 1122, 2, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-four", 409, 624, 2, 74, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-five", 717, 624, 2, 74, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-six", 969, 624, 2, 74, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-row-two-rule", 111, 700, 1122, 2, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-seven", 409, 724, 2, 88, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-eight", 717, 724, 2, 88, "rgba(255, 255, 255, 0.9)"),
      weeklyRect("weekly-divider-nine", 969, 724, 2, 88, "rgba(255, 255, 255, 0.9)"),

      weeklyRect("weekly-location-card", 110, 844, 960, 62, "rgba(39, 32, 108, 0.18)", { stroke: "#FFFFFF", strokeWidth: 2, cornerRadius: 12 }),
      weeklyText("weekly-location", "●   SAPPHIRE GRILLS EVENT HALL, OPPOSITE SAPPHIRE GARDENS ESTATE, LEKKI-EPE EXPRESS WAY", 145, 864, 900, 28, 14, "#FFFFFF", { fontWeight: 500, wrap: "word" }),
    ],
  },
];

export function cloneEditableTemplate(template: EditableTemplate): EditableTemplate {
  return JSON.parse(JSON.stringify(template)) as EditableTemplate;
}
