/**
 * configService.ts — Centralized configuration transformation layer.
 *
 * Reads from the single `platform_settings` document and transforms it
 * into safe, client-specific configurations. Clients never access
 * platform_settings directly.
 *
 * Every future client (desktop, mobile, OBS plugin) should use a method
 * here rather than reading raw admin settings.
 */

import { getPlatformSettings, type PlatformSettings } from "./platformSettings";
import { getPlanConfig } from "./db";

// ── Desktop Config ──────────────────────────────────────────────────────────

export interface DesktopConfig {
  appUpdates: {
    latestVersion: string;
    minimumSupportedVersion: string;
    forceUpdatesEnabled: boolean;
    emergencyLock: boolean;
    emergencyLockDelay: number;
    gracePeriodHours: number;
    updateMessage: string;
    emergencyLockMessage: string;
    windowsDownloadUrl: string;
    macDownloadUrl: string;
    linuxDownloadUrl: string;
    releaseNotesUrl: string;
    policyPublishedAt: string;
    emergencyLockEnabledAt: string | null;
    emergencyLockEffectiveAt: string | null;
  };
  trial: {
    enabled: boolean;
    defaultDurationDays: number;
  };
  credits: {
    translationCost: number;
    speechToScriptureCost: number;
    aiSummaryCost: number;
  };
  authentication: {
    maxDevicesPerUser: number;
  };
  obs: {
    enableOBSIntegration: boolean;
    requireOBSAuthentication: boolean;
    allowAutoDiscovery: boolean;
    enableOBSDock: boolean;
    enableMultiview: boolean;
    minSupportedOBSVersion: string;
    minSupportedWebSocketVersion: string;
    websocketPort: number;
    autoDetect: boolean;
    reconnectIntervalMs: number;
  };
  ai: {
    scriptureTranslation: boolean;
    speechToScripture: boolean;
    aiSummaries: boolean;
    sermonNotes: boolean;
    aiAssistant: boolean;
    dailyRequestLimit: number;
    maximumTranslationMinutes: number;
    supportedLanguages: string[];
  };
  storage: {
    enableCloudSync: boolean;
    maxUploadSizeMB: number;
    allowedFileTypes: string;
    compressionEnabled: boolean;
    imageTargetSizeBytes: number;
    videoTargetSizeBytes: number;
    imageMaxDimension: number;
    videoMaxWidth: number;
    allowedImageExtensions: string[];
    allowedVideoExtensions: string[];
    maximumBackgroundVideoSizeMB: number;
    churchLogoSizeLimitMB: number;
    mediaLibraryQuotaGB: number;
  };
  security: {
    maintenanceMode: boolean;
    internetVerificationEnabled: boolean;
    maxOfflineDays: number;
    verificationIntervalHours: number;
  };
  themes: {
    defaultBibleTheme: string;
    defaultWorshipTheme: string;
    defaultLowerThirdTheme: string;
    defaultAnnouncementTheme: string;
    defaultFont: string;
    defaultBrandColours: {
      primary: string;
      secondary: string;
      accent: string;
    };
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
  analytics: {
    usageAnalytics: boolean;
    crashReporting: boolean;
    errorTracking: boolean;
    performanceMonitoring: boolean;
  };
}

export async function getDesktopConfig(): Promise<DesktopConfig> {
  const settings = await getPlatformSettings();
  const planConfig = await getPlanConfig();
  const creditCosts = planConfig.creditCosts || [];
  const getCost = (name: string) => creditCosts.find((c) => c.name === name)?.cost ?? 0;

  return {
    appUpdates: {
      latestVersion: settings.appUpdates.latestVersion,
      minimumSupportedVersion: settings.appUpdates.minimumSupportedVersion,
      forceUpdatesEnabled: settings.appUpdates.forceUpdatesEnabled,
      emergencyLock: settings.appUpdates.emergencyLock,
      emergencyLockDelay: settings.appUpdates.emergencyLockDelay,
      gracePeriodHours: settings.appUpdates.gracePeriodHours,
      updateMessage: settings.appUpdates.updateMessage,
      emergencyLockMessage: settings.appUpdates.emergencyLockMessage,
      windowsDownloadUrl: settings.appUpdates.windowsDownloadUrl,
      macDownloadUrl: settings.appUpdates.macDownloadUrl,
      linuxDownloadUrl: settings.appUpdates.linuxDownloadUrl,
      releaseNotesUrl: settings.appUpdates.releaseNotesUrl,
      policyPublishedAt: settings.appUpdates.policyPublishedAt,
      emergencyLockEnabledAt: settings.appUpdates.emergencyLockEnabledAt,
      emergencyLockEffectiveAt: settings.appUpdates.emergencyLockEffectiveAt,
    },
    trial: {
      enabled: settings.trial.enabled,
      defaultDurationDays: settings.trial.defaultDurationDays,
    },
    credits: {
      translationCost: getCost("Live Translation"),
      speechToScriptureCost: getCost("Speech-to-Scripture"),
      aiSummaryCost: getCost("AI Summary"),
    },
    authentication: {
      maxDevicesPerUser: settings.authentication.maxDevicesPerUser,
    },
    obs: {
      enableOBSIntegration: settings.obs.enableOBSIntegration,
      requireOBSAuthentication: settings.obs.requireOBSAuthentication,
      allowAutoDiscovery: settings.obs.allowAutoDiscovery,
      enableOBSDock: settings.obs.enableOBSDock,
      enableMultiview: settings.obs.enableMultiview,
      minSupportedOBSVersion: settings.obs.minSupportedOBSVersion,
      minSupportedWebSocketVersion: settings.obs.minSupportedWebSocketVersion,
      websocketPort: settings.obs.websocketPort,
      autoDetect: settings.obs.autoDetect,
      reconnectIntervalMs: settings.obs.reconnectIntervalMs,
    },
    ai: {
      scriptureTranslation: settings.ai.featureToggles.scriptureTranslation,
      speechToScripture: settings.ai.featureToggles.speechToScripture,
      aiSummaries: settings.ai.featureToggles.aiSummaries,
      sermonNotes: settings.ai.featureToggles.sermonNotes,
      aiAssistant: settings.ai.featureToggles.aiAssistant,
      dailyRequestLimit: settings.ai.dailyRequestLimit,
      maximumTranslationMinutes: settings.ai.maximumTranslationMinutes,
      supportedLanguages: [...settings.ai.supportedLanguages],
    },
    storage: {
      enableCloudSync: settings.storage.enableCloudSync,
      maxUploadSizeMB: settings.storage.maxUploadSizeMB,
      allowedFileTypes: settings.storage.allowedFileTypes,
      compressionEnabled: settings.storage.compressionEnabled,
      imageTargetSizeBytes: settings.storage.imageTargetSizeBytes,
      videoTargetSizeBytes: settings.storage.videoTargetSizeBytes,
      imageMaxDimension: settings.storage.imageMaxDimension,
      videoMaxWidth: settings.storage.videoMaxWidth,
      allowedImageExtensions: [...settings.storage.allowedImageExtensions],
      allowedVideoExtensions: [...settings.storage.allowedVideoExtensions],
      maximumBackgroundVideoSizeMB: settings.storage.maximumBackgroundVideoSizeMB,
      churchLogoSizeLimitMB: settings.storage.churchLogoSizeLimitMB,
      mediaLibraryQuotaGB: settings.storage.mediaLibraryQuotaGB,
    },
    security: {
      maintenanceMode: settings.security.maintenanceMode,
      internetVerificationEnabled: settings.security.internetVerificationEnabled,
      maxOfflineDays: settings.security.maxOfflineDays,
      verificationIntervalHours: settings.security.verificationIntervalHours,
    },
    themes: {
      defaultBibleTheme: settings.themes.defaultBibleTheme,
      defaultWorshipTheme: settings.themes.defaultWorshipTheme,
      defaultLowerThirdTheme: settings.themes.defaultLowerThirdTheme,
      defaultAnnouncementTheme: settings.themes.defaultAnnouncementTheme,
      defaultFont: settings.themes.defaultFont,
      defaultBrandColours: { ...settings.themes.defaultBrandColours },
      bibleDefaults: { ...settings.themes.bibleDefaults },
      worshipDefaults: { ...settings.themes.worshipDefaults },
      lowerThirdDefaults: { ...settings.themes.lowerThirdDefaults },
    },
    analytics: {
      usageAnalytics: settings.analytics.usageAnalytics,
      crashReporting: settings.analytics.crashReporting,
      errorTracking: settings.analytics.errorTracking,
      performanceMonitoring: settings.analytics.performanceMonitoring,
    },
  };
}

// ── Dashboard Config ────────────────────────────────────────────────────────

export async function getDashboardConfig(): Promise<PlatformSettings> {
  return getPlatformSettings();
}

// ── Mobile Config ───────────────────────────────────────────────────────────

export interface MobileConfig {
  appUpdates: DesktopConfig["appUpdates"];
  features: DesktopConfig["ai"];
  security: DesktopConfig["security"];
}

export async function getMobileConfig(): Promise<MobileConfig> {
  const desktop = await getDesktopConfig();
  return {
    appUpdates: desktop.appUpdates,
    features: desktop.ai,
    security: desktop.security,
  };
}

// ── OBS Plugin Config ──────────────────────────────────────────────────────

export interface OBSPluginConfig {
  obs: DesktopConfig["obs"];
  themes: DesktopConfig["themes"];
  features: {
    scriptureTranslation: boolean;
    speechToScripture: boolean;
    aiSummaries: boolean;
    sermonNotes: boolean;
    aiAssistant: boolean;
  };
}

export async function getOBSPluginConfig(): Promise<OBSPluginConfig> {
  const desktop = await getDesktopConfig();
  return {
    obs: desktop.obs,
    themes: desktop.themes,
    features: {
      scriptureTranslation: desktop.ai.scriptureTranslation,
      speechToScripture: desktop.ai.speechToScripture,
      aiSummaries: desktop.ai.aiSummaries,
      sermonNotes: desktop.ai.sermonNotes,
      aiAssistant: desktop.ai.aiAssistant,
    },
  };
}
