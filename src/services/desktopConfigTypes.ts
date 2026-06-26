/**
 * desktopConfigTypes.ts — Types and default values for desktop-specific
 * platform configuration.
 *
 * The DEFAULT_DESKTOP_CONFIG serves as the offline fallback when the
 * /api/config/desktop endpoint is unreachable. It mirrors the API-side
 * defaults in api/src/lib/platformSettings.ts.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface DesktopConfig {
  appUpdates: {
    latestVersion: string;
    minimumSupportedVersion: string;
    forceUpdatesEnabled: boolean;
    emergencyLock: boolean;
    emergencyLockDelay: number;
    gracePeriodHours: number;
    updateMessage: string;
    downloadUrls: {
      windows: string;
      macosAppleSilicon: string;
      macosIntel: string;
      linux: string;
    };
  };
  obs: {
    websocketPort: number;
    autoDetect: boolean;
    width: number;
    height: number;
    fps: number;
    reconnectIntervalMs: number;
  };
  storage: {
    maxUploadSizeMB: number;
    allowedFileTypes: string;
    compressionEnabled: boolean;
    imageTargetSizeBytes: number;
    videoTargetSizeBytes: number;
    imageMaxDimension: number;
    videoMaxWidth: number;
    allowedImageExtensions: string[];
    allowedVideoExtensions: string[];
  };
  themes: {
    bibleDefaults: {
      font: string;
      textSize: number;
      textColor: string;
      backgroundColor: string;
      accentColor: string;
    };
    worshipDefaults: {
      font: string;
      textSize: number;
      textColor: string;
      backgroundColor: string;
      animationEnabled: boolean;
    };
    lowerThirdDefaults: {
      nameColor: string;
      titleColor: string;
      backgroundColor: string;
      nameSize: number;
    };
  };
  features: {
    scriptureTranslation: boolean;
    speechToScripture: boolean;
    aiSummaries: boolean;
    sermonNotes: boolean;
  };
  security: {
    maintenanceMode: boolean;
    maintenanceMessage: string;
  };
}

// ── Defaults (offline fallback) ─────────────────────────────────────────────

export const DEFAULT_DESKTOP_CONFIG: DesktopConfig = {
  appUpdates: {
    latestVersion: "2.6.0",
    minimumSupportedVersion: "2.0.0",
    forceUpdatesEnabled: false,
    emergencyLock: false,
    emergencyLockDelay: 0,
    gracePeriodHours: 48,
    updateMessage: "A new version is available. Please update to continue.",
    downloadUrls: {
      windows: "",
      macosAppleSilicon: "",
      macosIntel: "",
      linux: "",
    },
  },
  obs: {
    websocketPort: 4455,
    autoDetect: true,
    width: 1920,
    height: 1080,
    fps: 30,
    reconnectIntervalMs: 3000,
  },
  storage: {
    maxUploadSizeMB: 50,
    allowedFileTypes: "jpg,png,gif,mp4,pdf,docx",
    compressionEnabled: true,
    imageTargetSizeBytes: 1024 * 1024,
    videoTargetSizeBytes: 1024 * 1024,
    imageMaxDimension: 1920,
    videoMaxWidth: 854,
    allowedImageExtensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
    allowedVideoExtensions: ["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv"],
  },
  themes: {
    bibleDefaults: {
      font: "Inter",
      textSize: 48,
      textColor: "#ffffff",
      backgroundColor: "#000000",
      accentColor: "#3b82f6",
    },
    worshipDefaults: {
      font: "Inter",
      textSize: 64,
      textColor: "#ffffff",
      backgroundColor: "#000000",
      animationEnabled: true,
    },
    lowerThirdDefaults: {
      nameColor: "#ffffff",
      titleColor: "#a3a3a3",
      backgroundColor: "#000000",
      nameSize: 36,
    },
  },
  features: {
    scriptureTranslation: true,
    speechToScripture: true,
    aiSummaries: true,
    sermonNotes: false,
  },
  security: {
    maintenanceMode: false,
    maintenanceMessage: "We'll be back shortly!",
  },
};
