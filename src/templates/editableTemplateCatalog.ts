/**
 * Editable church graphic templates.
 *
 * A template is deliberately stored as structured layers instead of a flat
 * image. That keeps the artwork vector-friendly while allowing operators to
 * change the text without rebuilding the design.
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
}

export interface TemplateShapeLayer {
  id: string;
  kind: "rect" | "circle";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity?: number;
  cornerRadius?: number;
}

export type TemplateLayer = TemplateTextLayer | TemplateShapeLayer;

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

const CANVAS: TemplateCanvas = { width: 1600, height: 900 };
const DISPLAY_FONT = "Questrial, Inter, sans-serif";
const BODY_FONT = "Questrial, Inter, sans-serif";

function text(
  id: string,
  value: string,
  x: number,
  y: number,
  width: number,
  fontSize: number,
  fill: string,
  options: Partial<Omit<TemplateTextLayer, "id" | "kind" | "x" | "y" | "width" | "text" | "fontSize" | "fill">> = {},
): TemplateTextLayer {
  return {
    id,
    kind: "text",
    x,
    y,
    width,
    height: Math.max(54, Math.ceil(fontSize * 1.45)),
    text: value,
    fill,
    fontSize,
    fontFamily: BODY_FONT,
    fontWeight: 500,
    lineHeight: 1.2,
    ...options,
  };
}

function rect(
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

function circle(id: string, x: number, y: number, diameter: number, fill: string, opacity = 1): TemplateShapeLayer {
  return { id, kind: "circle", x, y, width: diameter, height: diameter, fill, opacity };
}

export const EDITABLE_TEMPLATE_LIBRARY: EditableTemplate[] = [
  {
    id: "sunday-service",
    name: "Sunday Service",
    description: "A calm, high-contrast welcome slide for the start of service.",
    category: "Service",
    tags: ["welcome", "service", "weekly"],
    accentColor: "#F4B942",
    canvas: CANVAS,
    background: {
      base: "#10253D",
      gradientStart: "#091521",
      gradientEnd: "#1B4E5F",
      accent: "#F4B942",
    },
    layers: [
      circle("sunday-orb", 1190, -180, 640, "#2D7C82", 0.42),
      rect("sunday-rule", 112, 176, 122, 8, "#F4B942", { cornerRadius: 4 }),
      text("sunday-kicker", "MAKECHURCHEASY  /  SERVICE", 112, 112, 720, 22, "#B9D4DB", {
        fontWeight: 700,
        letterSpacing: 3,
      }),
      text("sunday-title", "Welcome to\nSunday Service", 112, 232, 900, 86, "#FFFFFF", {
        fontFamily: DISPLAY_FONT,
        fontWeight: 700,
        lineHeight: 1.02,
      }),
      text("sunday-subtitle", "Prepare your heart. Find your place. Worship together.", 116, 486, 840, 30, "#D7E5E8"),
      rect("sunday-date-bg", 112, 690, 374, 92, "#F4B942", { cornerRadius: 10 }),
      text("sunday-date", "SUNDAY  •  10:00 AM", 140, 720, 320, 25, "#10253D", {
        fontWeight: 700,
        letterSpacing: 1.5,
      }),
      text("sunday-footer", "Grace Community Church", 1120, 792, 360, 22, "#B9D4DB", { align: "right" }),
    ],
  },
  {
    id: "worship-night",
    name: "Worship Night",
    description: "A bold lyric-led graphic for worship nights, praise sets, and live moments.",
    category: "Worship",
    tags: ["worship", "praise", "lyrics"],
    accentColor: "#EAA3FF",
    canvas: CANVAS,
    background: {
      base: "#251A3D",
      gradientStart: "#120F26",
      gradientEnd: "#5A2866",
      accent: "#EAA3FF",
    },
    layers: [
      circle("worship-glow", -190, 500, 660, "#D946EF", 0.26),
      circle("worship-glow-small", 1160, -250, 680, "#7C3AED", 0.25),
      text("worship-kicker", "AN EVENING OF", 108, 146, 500, 26, "#F3D8FF", { fontWeight: 700, letterSpacing: 5 }),
      text("worship-title", "Worship\nNight", 104, 214, 820, 112, "#FFFFFF", {
        fontFamily: DISPLAY_FONT,
        fontWeight: 700,
        lineHeight: 0.96,
      }),
      rect("worship-line", 108, 500, 150, 8, "#EAA3FF", { cornerRadius: 4 }),
      text("worship-description", "One voice. One church. One sound of praise.", 108, 550, 670, 32, "#F0DFF5"),
      text("worship-meta", "FRIDAY  •  7:00 PM\nMAIN AUDITORIUM", 108, 720, 500, 25, "#EAA3FF", {
        fontWeight: 700,
        lineHeight: 1.35,
        letterSpacing: 1.2,
      }),
      text("worship-brand", "MAKECHURCHEASY", 1170, 804, 330, 22, "#E7C4F1", { align: "right", letterSpacing: 2 }),
    ],
  },
  {
    id: "bible-verse",
    name: "Bible Verse",
    description: "A focused Scripture card with a generous reading area and editable reference.",
    category: "Bible",
    tags: ["scripture", "verse", "teaching"],
    accentColor: "#8DD6CA",
    canvas: CANVAS,
    background: {
      base: "#0F2A2A",
      gradientStart: "#08191D",
      gradientEnd: "#1D5A54",
      accent: "#8DD6CA",
    },
    layers: [
      rect("bible-frame", 88, 86, 1424, 728, "rgba(255,255,255,0.035)", { cornerRadius: 24 }),
      rect("bible-rule", 158, 176, 92, 8, "#8DD6CA", { cornerRadius: 4 }),
      text("bible-kicker", "SCRIPTURE FOR TODAY", 158, 126, 600, 24, "#9FC9C4", { fontWeight: 700, letterSpacing: 3 }),
      text("bible-quote", "Be strong and courageous.\nDo not be afraid; do not be discouraged.", 158, 260, 1220, 67, "#FFFFFF", {
        fontFamily: DISPLAY_FONT,
        fontWeight: 700,
        lineHeight: 1.12,
      }),
      text("bible-reference", "Joshua 1:9  •  KJV", 162, 565, 700, 34, "#8DD6CA", { fontWeight: 700, letterSpacing: 1 }),
      text("bible-footer", "MAKECHURCHEASY  /  BIBLE", 158, 744, 800, 20, "#9FC9C4", { fontWeight: 700, letterSpacing: 2 }),
    ],
  },
  {
    id: "prayer-meeting",
    name: "Prayer Meeting",
    description: "A warm, practical announcement for prayer gatherings and ministry moments.",
    category: "Service",
    tags: ["prayer", "announcement", "midweek"],
    accentColor: "#F08D71",
    canvas: CANVAS,
    background: {
      base: "#2A1D24",
      gradientStart: "#17131C",
      gradientEnd: "#61342E",
      accent: "#F08D71",
    },
    layers: [
      circle("prayer-orb", 1060, 98, 560, "#A34B42", 0.34),
      text("prayer-kicker", "MIDWEEK GATHERING", 112, 132, 640, 24, "#E9C7BF", { fontWeight: 700, letterSpacing: 3 }),
      text("prayer-title", "Prayer\nMeeting", 110, 214, 770, 108, "#FFFFFF", {
        fontFamily: DISPLAY_FONT,
        fontWeight: 700,
        lineHeight: 0.98,
      }),
      text("prayer-copy", "Come with expectation. Leave strengthened.", 114, 510, 720, 32, "#F2DCD6"),
      rect("prayer-pill", 112, 674, 512, 98, "#F08D71", { cornerRadius: 12 }),
      text("prayer-meta", "WEDNESDAY  •  6:30 PM", 146, 708, 430, 24, "#2A1D24", { fontWeight: 700, letterSpacing: 1 }),
      text("prayer-brand", "YOUR CHURCH NAME", 1170, 804, 320, 20, "#E9C7BF", { align: "right", letterSpacing: 2 }),
    ],
  },
  {
    id: "church-announcement",
    name: "Church Announcement",
    description: "A clean announcement layout for dates, reminders, and service-wide notices.",
    category: "Announcements",
    tags: ["notice", "calendar", "community"],
    accentColor: "#F1D38B",
    canvas: CANVAS,
    background: {
      base: "#F2EBDD",
      gradientStart: "#E8E0CF",
      gradientEnd: "#C9D5D2",
      accent: "#1A4247",
    },
    layers: [
      rect("announcement-block", 0, 0, 540, 900, "#1A4247"),
      text("announcement-kicker", "CHURCH NEWS", 112, 124, 340, 24, "#B7D6D0", { fontWeight: 700, letterSpacing: 3 }),
      text("announcement-number", "01", 112, 260, 310, 160, "#F1D38B", { fontFamily: DISPLAY_FONT, fontWeight: 700 }),
      text("announcement-side", "THIS WEEK", 112, 700, 340, 22, "#B7D6D0", { fontWeight: 700, letterSpacing: 2 }),
      text("announcement-title", "Community\nOutreach", 638, 198, 800, 90, "#1A4247", {
        fontFamily: DISPLAY_FONT,
        fontWeight: 700,
        lineHeight: 1.02,
      }),
      text("announcement-copy", "We are serving our neighbours with food, prayer, and practical support.", 642, 458, 700, 36, "#39555A", { lineHeight: 1.3 }),
      text("announcement-meta", "SATURDAY  •  9:00 AM\nMEET AT THE CHURCH FOYER", 642, 686, 670, 24, "#1A4247", { fontWeight: 700, lineHeight: 1.45, letterSpacing: 1 }),
    ],
  },
  {
    id: "youth-service",
    name: "Youth Service",
    description: "An energetic title card for youth church, campus ministry, and student events.",
    category: "Worship",
    tags: ["youth", "students", "event"],
    accentColor: "#B9F55A",
    canvas: CANVAS,
    background: {
      base: "#101A26",
      gradientStart: "#091018",
      gradientEnd: "#17455B",
      accent: "#B9F55A",
    },
    layers: [
      rect("youth-accent", 110, 132, 22, 636, "#B9F55A", { cornerRadius: 11 }),
      circle("youth-circle", 1190, 80, 480, "#B9F55A", 0.14),
      text("youth-kicker", "MAKECHURCHEASY  /  YOUTH", 178, 142, 700, 22, "#C7D6DE", { fontWeight: 700, letterSpacing: 3 }),
      text("youth-title", "Built for\nMore", 178, 238, 760, 108, "#FFFFFF", { fontFamily: DISPLAY_FONT, fontWeight: 700, lineHeight: 0.98 }),
      text("youth-copy", "A night of worship, real conversations, and a faith that moves.", 182, 536, 800, 30, "#D2E1E5", { lineHeight: 1.3 }),
      text("youth-meta", "THURSDAY  •  5:00 PM", 182, 738, 520, 25, "#B9F55A", { fontWeight: 700, letterSpacing: 1.2 }),
      text("youth-brand", "YOUTH CHURCH", 1170, 804, 310, 20, "#B9F55A", { align: "right", letterSpacing: 2 }),
    ],
  },
  {
    id: "giving-partnership",
    name: "Giving & Partnership",
    description: "A trustworthy, people-first graphic for giving moments and partnership updates.",
    category: "Announcements",
    tags: ["giving", "partnership", "impact"],
    accentColor: "#F0B45B",
    canvas: CANVAS,
    background: {
      base: "#142E28",
      gradientStart: "#091A16",
      gradientEnd: "#37634C",
      accent: "#F0B45B",
    },
    layers: [
      circle("giving-orb", 1120, -160, 620, "#F0B45B", 0.14),
      text("giving-kicker", "GENEROSITY IN ACTION", 118, 144, 700, 24, "#B9D6C4", { fontWeight: 700, letterSpacing: 3 }),
      text("giving-title", "Together,\nwe make room", 116, 242, 920, 92, "#FFFFFF", { fontFamily: DISPLAY_FONT, fontWeight: 700, lineHeight: 1.02 }),
      rect("giving-rule", 118, 548, 132, 8, "#F0B45B", { cornerRadius: 4 }),
      text("giving-copy", "Your giving helps the Gospel reach people, places, and generations.", 118, 600, 780, 31, "#D7E7DB", { lineHeight: 1.3 }),
      text("giving-footer", "GIVE  •  SERVE  •  BUILD", 118, 782, 660, 23, "#F0B45B", { fontWeight: 700, letterSpacing: 2 }),
      text("giving-brand", "YOUR CHURCH NAME", 1170, 804, 320, 20, "#B9D6C4", { align: "right", letterSpacing: 2 }),
    ],
  },
  {
    id: "sermon-title",
    name: "Sermon Title",
    description: "A restrained title slide for sermon series, teaching sessions, and Bible studies.",
    category: "Bible",
    tags: ["sermon", "teaching", "series"],
    accentColor: "#A9B9FF",
    canvas: CANVAS,
    background: {
      base: "#1B2037",
      gradientStart: "#0F1327",
      gradientEnd: "#303B70",
      accent: "#A9B9FF",
    },
    layers: [
      rect("sermon-top-rule", 112, 106, 1376, 2, "rgba(255,255,255,0.22)"),
      text("sermon-kicker", "SERMON SERIES  /  WEEK 04", 112, 148, 720, 23, "#B8C2ED", { fontWeight: 700, letterSpacing: 3 }),
      text("sermon-title-text", "Faith in\nthe waiting", 112, 268, 920, 110, "#FFFFFF", { fontFamily: DISPLAY_FONT, fontWeight: 700, lineHeight: 0.98 }),
      text("sermon-reference", "Psalm 27:14", 116, 602, 430, 36, "#A9B9FF", { fontWeight: 700, letterSpacing: 1 }),
      rect("sermon-bottom-rule", 112, 748, 1376, 2, "rgba(255,255,255,0.22)"),
      text("sermon-brand", "MAKECHURCHEASY  /  BIBLE", 112, 790, 700, 20, "#B8C2ED", { fontWeight: 700, letterSpacing: 2 }),
    ],
  },
];

export function cloneEditableTemplate(template: EditableTemplate): EditableTemplate {
  return JSON.parse(JSON.stringify(template)) as EditableTemplate;
}
