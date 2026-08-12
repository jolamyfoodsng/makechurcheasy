import type { CountdownConfig } from "../countdowns/types";

export type PresentationMode = "ministry" | "bible";

export type MinistrySource =
  | "media"
  | "worship"
  | "text"
  | "countdown"
  | "ticker";

export type PresentationSource = MinistrySource | "bible";

export type PresentationConnectionStatus =
  | "waiting"
  | "connected"
  | "disconnected"
  | "error";

export type PresentationTextAlign = "left" | "center" | "right";

export type PresentationMediaFit = "fit" | "fill" | "contain" | "stretch";

export type PresentationTickerPosition = "top" | "bottom";

export type PresentationTickerDirection = "rtl" | "ltr" | "static";

export type PresentationBackgroundType = "theme" | "off" | "color" | "image" | "pattern" | "video";

export interface PresentationStyleSnapshot {
  themeId?: string;
  themeName?: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: string | number;
  lineHeight: number;
  textColor: string;
  textAlign: PresentationTextAlign;
  textShadow: string;
  backgroundColor: string;
  backgroundColorEnd?: string;
  bgGradientAngle?: number;
  backgroundType?: PresentationBackgroundType;
  backgroundImage?: string;
  backgroundVideo?: string;
  backgroundPattern?: string;
  backgroundOpacity: number;
  overlayColor: string;
  overlayOpacity: number;
  padding: number;
  safeArea: number;
}

export interface PresentationMediaPlaybackState {
  playing: boolean;
  muted: boolean;
  volume: number;
  loop: boolean;
  positionSeconds: number;
  version: number;
}

export interface PresentationMediaPayload {
  kind: "image" | "video";
  url: string;
  posterUrl?: string;
  fit: PresentationMediaFit;
  backgroundColor: string;
  playback?: PresentationMediaPlaybackState;
}

export interface PresentationCountdownPayload {
  title: string;
  mode: "duration" | "time";
  status: "idle" | "running" | "paused" | "completed";
  durationSeconds: number;
  startedAt?: string;
  endsAt?: string;
  pausedRemainingSeconds?: number;
  completionMessage?: string;
  soundEnabled: boolean;
  showTitle: boolean;
  showHours: boolean;
  showMinutes: boolean;
  showSeconds: boolean;
  updatedAt: string;
  sourceCountdownId?: string;
  sourceConfig?: CountdownConfig;
}

export interface PresentationTickerPayload {
  sourceTickerId?: string;
  text: string;
  divider?: string;
  messageSpacing?: number;
  position: PresentationTickerPosition;
  direction: PresentationTickerDirection;
  speed: number;
  textColor: string;
  backgroundColor: string;
  fontSize: number;
  fontFamily?: string;
  paused: boolean;
  hidden: boolean;
  version: number;
}

export type PresentationBibleCompareLayout = "line-by-line" | "side-by-side";

export interface PresentationBibleCompareColumn {
  reference: string;
  translation: string;
  text: string;
}

export interface PresentationBibleComparePayload {
  layout: PresentationBibleCompareLayout;
  columns: PresentationBibleCompareColumn[];
}

export interface PresentationRemoteItem {
  id: string;
  source: PresentationSource;
  variant?: "text" | "media" | "countdown" | "ticker";
  title: string;
  subtitle?: string;
  body?: string;
  reference?: string;
  style?: PresentationStyleSnapshot;
  media?: PresentationMediaPayload;
  countdown?: PresentationCountdownPayload | { config: CountdownConfig; startedAt: number };
  ticker?: PresentationTickerPayload;
  bibleCompare?: PresentationBibleComparePayload;
  imageUrl?: string;
  videoUrl?: string;
  meta?: {
    sequenceIndex?: number;
    sequenceTotal?: number;
    sequenceLabel?: string;
    zoom?: number;
    showReference?: boolean;
    showTitle?: boolean;
    showSubtitle?: boolean;
  };
}

export interface PresentationSessionSettings {
  sessionId: string;
  publicToken: string;
  presentationLink: string;
  connectedViewers: number;
  status: "active" | "ended";
  createdAt: string;
  updatedAt: string;
}

export interface PresentationTextSlideRecord {
  id: string;
  title: string;
  subtitle: string;
  body: string;
  themeId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationTickerRecord {
  id: string;
  name: string;
  text: string;
  position: PresentationTickerPosition;
  direction: PresentationTickerDirection;
  speed: number;
  textColor: string;
  backgroundColor: string;
  fontSize: number;
  createdAt: string;
  updatedAt: string;
}
