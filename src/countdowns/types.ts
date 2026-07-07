/**
 * types.ts — Countdown feature types
 */

// ── Timer ──────────────────────────────────────────────────────────────────

export type TimerMode = "fixed-duration" | "end-at-time";

export interface TimerSettings {
  mode: TimerMode;
  /** Fixed duration in seconds (used when mode === "fixed-duration") */
  durationSeconds: number;
  /** ISO string of the target end time (used when mode === "end-at-time") */
  endAt?: string;
  showHours: boolean;
  showMinutes: boolean;
  showSeconds: boolean;
}

// ── Background ─────────────────────────────────────────────────────────────

export type BackgroundType = "solid" | "gradient" | "image" | "video";

export type BackgroundSource = "upload" | "media-library" | "builtin";

export type ImageFit = "cover" | "contain" | "stretch";

export interface BackgroundSettings {
  type: BackgroundType;
  /** Solid color hex */
  color: string;
  /** Gradient start color */
  gradientStart: string;
  /** Gradient end color */
  gradientEnd: string;
  /** Gradient angle in degrees */
  gradientAngle: number;
  /** URL or path to uploaded image */
  imageUrl: string;
  /** URL or path to uploaded video */
  videoUrl: string;
  /** Blur amount (0-20) */
  blur: number;
  /** Brightness (0-200, 100 = normal) */
  brightness: number;
  /** Dark overlay opacity (0-1) */
  overlayOpacity: number;
  /** Background scale / zoom (1-3) */
  zoom: number;
  /** Horizontal position (0-100) */
  positionX: number;
  /** Vertical position (0-100) */
  positionY: number;
  /** Where this background came from */
  source: BackgroundSource;
  /** Managed asset ID for uploads (stored in ~/Documents/MakeChurchEasy/uploads/countdowns/) */
  assetId?: string;
  /** Built-in background ID */
  builtinId?: string;
  /** Image fit mode */
  imageFit: ImageFit;
  /** Video: loop playback */
  loop: boolean;
  /** Video: start muted */
  muted: boolean;
  /** Flyer Mode: auto-darken + overlay for timer readability */
  flyerMode: boolean;
}

// ── Text ───────────────────────────────────────────────────────────────────

export interface TextSettings {
  title: string;
  subtitle: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  letterSpacing: number;
  lineHeight: number;
  color: string;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
}

// ── Animation ──────────────────────────────────────────────────────────────

export type AnimationType =
  | "none"
  | "fade-in"
  | "slide-up"
  | "scale"
  | "pulse"
  | "breathing";

export interface AnimationSettings {
  /** Timer entrance animation */
  entrance: AnimationType;
  /** Background motion type */
  backgroundMotion: "none" | "pan" | "zoom-pulse";
  /** Animation speed multiplier (0.5 - 2) */
  speed: number;
}

// ── OBS ────────────────────────────────────────────────────────────────────

export type AutoAction =
  | "none"
  | "switch-scene"
  | "hide-countdown"
  | "show-welcome"
  | "play-video";

export interface OBSSettings {
  /** Target OBS scene name */
  sceneName: string;
  /** Auto-action when countdown reaches zero */
  autoAction: AutoAction;
  /** Scene to switch to (when autoAction === "switch-scene") */
  autoActionScene: string;
  /** Enable automatic OBS scene switch at a specific remaining time */
  autoSwitchEnabled?: boolean;
  /** Target scene name for auto scene switch */
  autoSwitchScene?: string;
  /** Remaining seconds that triggers the switch (0 = at 00:00) */
  autoSwitchAtSeconds?: number;
}

// ── Template / Style ───────────────────────────────────────────────────────

export type CountdownTemplateId =
  | "circular"
  | "minimal"
  | "modern"
  | "conference"
  | "lower-third"
  | "full-screen"
  | "custom";

export interface CountdownTemplate {
  id: CountdownTemplateId;
  name: string;
  description: string;
  icon: string;
}

// ── Message ────────────────────────────────────────────────────────────────

export interface MessageSettings {
  /** Message text shown in the overlay */
  text: string;
  /** Message text color (hex) */
  color: string;
  /** Position relative to the timer */
  position?: "above" | "below";
}

// ── Main Countdown Record ──────────────────────────────────────────────────

export interface CountdownConfig {
  id: string;
  title: string;
  templateId: CountdownTemplateId;
  /** Selected text theme ID (references countdowns/textThemes.ts) */
  textThemeId?: string;
  timer: TimerSettings;
  background: BackgroundSettings;
  text: TextSettings;
  animation: AnimationSettings;
  obs: OBSSettings;
  /** Message displayed below timer in the overlay */
  message?: MessageSettings;
  createdAt: string;
  updatedAt: string;
}

// ── Overlay Sync State (sent to OBS browser source) ────────────────────────

export interface OverlaySyncState {
  /** Whether the countdown is paused */
  paused: boolean;
  /** Remaining seconds at the moment this payload was generated */
  remaining: number;
}

// ── Overlay Payload (sent to OBS browser source) ───────────────────────────

export interface CountdownOverlayPayload {
  config: CountdownConfig;
  baseUrl: string;
  timestamp: number;
  /** App-side sync state: pause/resume + exact remaining time */
  sync?: OverlaySyncState;
}

// ── Snapshot for sync ──────────────────────────────────────────────────────

export interface CountdownSnapshot {
  countdowns: CountdownConfig[];
  updatedAt: string;
}
