export type CountdownTemplate =
  | "circular"
  | "minimal"
  | "modern"
  | "conference"
  | "lower-third"
  | "full-screen"
  | "custom";

export type TimerMode = "fixed" | "endAt";

export type BackgroundType = "solid" | "gradient" | "image" | "video" | "motion";

export type AutoAction = "none" | "switchScene" | "hideCountdown" | "showWelcome" | "playVideo";

export type AnimationType =
  | "none"
  | "fadeIn"
  | "slideUp"
  | "scale"
  | "pulse"
  | "breathing";

export interface GradientStop {
  color: string;
  position: number;
}

export interface BackgroundConfig {
  type: BackgroundType;
  color: string;
  gradientAngle: number;
  gradientStops: GradientStop[];
  imageUrl: string;
  videoUrl: string;
  blur: number;
  brightness: number;
  overlayOpacity: number;
  zoom: number;
  positionX: number;
  positionY: number;
}

export interface TextConfig {
  title: string;
  subtitle: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

export interface AnimationConfig {
  ringAnimation: AnimationType;
  textAnimation: AnimationType;
  backgroundAnimation: AnimationType;
  speed: number;
}

export interface OBSConfig {
  enabled: boolean;
  sourceName: string;
  autoAction: AutoAction;
  sceneName: string;
}

export interface Countdown {
  id: string;
  title: string;
  template: CountdownTemplate;
  createdAt: string;
  updatedAt: string;

  // Timer
  timerMode: TimerMode;
  fixedDuration: number; // seconds
  endAtTime: string; // HH:mm
  showHours: boolean;
  showMinutes: boolean;
  showSeconds: boolean;

  // Design
  background: BackgroundConfig;
  text: TextConfig;
  animation: AnimationConfig;
  obs: OBSConfig;

  // Running state
  isRunning: boolean;
  startedAt: string | null;
  remainingSeconds: number;
}

export const DEFAULT_COUNTDOWN: Omit<Countdown, "id" | "createdAt" | "updatedAt"> = {
  title: "Service Starts Soon",
  template: "circular",

  timerMode: "fixed",
  fixedDuration: 600,
  endAtTime: "19:00",
  showHours: false,
  showMinutes: true,
  showSeconds: true,

  background: {
    type: "solid",
    color: "#0f172a",
    gradientAngle: 135,
    gradientStops: [
      { color: "#1e3a5f", position: 0 },
      { color: "#0f172a", position: 100 },
    ],
    imageUrl: "",
    videoUrl: "",
    blur: 0,
    brightness: 100,
    overlayOpacity: 50,
    zoom: 100,
    positionX: 50,
    positionY: 50,
  },

  text: {
    title: "Service Starts Soon",
    subtitle: "Welcome to Worship",
    fontFamily: "Inter",
    fontWeight: 700,
    fontSize: 48,
    letterSpacing: 0,
    lineHeight: 1.2,
    color: "#ffffff",
    shadowColor: "#000000",
    shadowBlur: 10,
    shadowOffsetX: 0,
    shadowOffsetY: 2,
  },

  animation: {
    ringAnimation: "none",
    textAnimation: "fadeIn",
    backgroundAnimation: "none",
    speed: 1,
  },

  obs: {
    enabled: false,
    sourceName: "MCE Countdown",
    autoAction: "none",
    sceneName: "",
  },

  isRunning: false,
  startedAt: null,
  remainingSeconds: 600,
};

export const TEMPLATE_LABELS: Record<CountdownTemplate, string> = {
  circular: "Circular Countdown",
  minimal: "Minimal",
  modern: "Modern",
  conference: "Conference",
  "lower-third": "Lower Third",
  "full-screen": "Full Screen",
  custom: "Custom",
};

export const TEMPLATE_DESCRIPTIONS: Record<CountdownTemplate, string> = {
  circular: "Animated circular progress ring with timer",
  minimal: "Large timer, clean design",
  modern: "Modern livestream-style countdown",
  conference: "Event title, logo, timer, speaker image",
  "lower-third": "Small countdown in corner for pre-service",
  "full-screen": "Massive timer with motion background",
  custom: "Start from scratch",
};

export const TEMPLATE_ICONS: Record<CountdownTemplate, string> = {
  circular: "⊙",
  minimal: "—",
  modern: "◎",
  conference: "▣",
  "lower-third": "▁",
  "full-screen": "□",
  custom: "+",
};

export const FONT_FAMILIES = [
  "Inter",
  "Poppins",
  "Montserrat",
  "Playfair Display",
  "Roboto",
  "Open Sans",
  "Lato",
  "Raleway",
  "Oswald",
  "Nunito",
  "Source Sans Pro",
  "Merriweather",
];

export const MOTION_BACKGROUNDS = [
  { id: "particles", name: "Floating Particles" },
  { id: "waves", name: "Ocean Waves" },
  { id: "aurora", name: "Aurora" },
  { id: "bokeh", name: "Bokeh Lights" },
  { id: "smoke", name: "Smoke" },
  { id: "geometric", name: "Geometric Shapes" },
];
