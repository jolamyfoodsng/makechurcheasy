export interface PlatformSettings {
  appUpdates: {
    forceUpdatesEnabled: boolean;
    emergencyLock: boolean;
    emergencyLockDelay: number;
    latestVersion: string;
    minimumSupportedVersion: string;
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
    sendExtensionEmails: boolean;
    sendRestartEmails: boolean;
    sendStopEmails: boolean;
  };
  credits: {
    freePlanCredits: number;
    trialCredits: number;
    basicCredits: number;
    growthCredits: number;
    proCredits: number;
    translationCost: number;
    speechToScriptureCost: number;
    aiSummaryCost: number;
  };
  ambassador: {
    enabled: boolean;
    creditsPerAmbassador: number;
    defaultAmbassadorDurationDays: number;
    autoExpiry: boolean;
    sendWelcomeEmail: boolean;
    badgeText: string;
  };
  earlyAccess: {
    enabled: boolean;
    offerName: string;
    description: string;
    plan: "pro";
    priceNGN: number;
    priceUSD: number;
    allowRegistrationDateEligibility: boolean;
    registeredAfter: string;
    registeredBefore: string;
    eligibleUserIds: string[];
    eligibleEmails: string[];
  };
  authentication: {
    maxDevicesPerUser: number;
  };
  storage: {
    enableCloudSync: boolean;
    maxUploadSizeMB: number;
    allowedFileTypes: string;
    compressionEnabled: boolean;
    defaultQuotaGB: number;
    retentionDays: number;
    maximumBackgroundVideoSizeMB: number;
    churchLogoSizeLimitMB: number;
    mediaLibraryQuotaGB: number;
    imageTargetSizeBytes: number;
    videoTargetSizeBytes: number;
    imageMaxDimension: number;
    videoMaxWidth: number;
    allowedImageExtensions: string[];
    allowedVideoExtensions: string[];
  };
  security: {
    maintenanceMode: boolean;
    internetVerificationEnabled: boolean;
    maxOfflineDays: number;
    verificationIntervalHours: number;
  };
  system: {
    allowRegistrations: boolean;
    allowPayments: boolean;
  };
  featureFlags: {
    remotePresentationBeta: boolean;
    cloudSyncBeta: boolean;
    newTranslationEngine: boolean;
    newMobileApp: boolean;
  };
}

export const DEFAULT_SETTINGS: PlatformSettings = {
  appUpdates: {
    forceUpdatesEnabled: false,
    emergencyLock: false,
    emergencyLockDelay: 0,
    latestVersion: "2.6.0",
    minimumSupportedVersion: "2.0.0",
    gracePeriodHours: 48,
    updateMessage: "A new version is available. Please update to continue.",
    emergencyLockMessage: "MakeChurchEasy is temporarily unavailable due to emergency maintenance.",
    windowsDownloadUrl: "",
    macDownloadUrl: "",
    linuxDownloadUrl: "",
    releaseNotesUrl: "",
    policyPublishedAt: new Date(0).toISOString(),
    emergencyLockEnabledAt: null,
    emergencyLockEffectiveAt: null,
  },
  trial: {
    enabled: true,
    defaultDurationDays: 14,
    sendExtensionEmails: true,
    sendRestartEmails: true,
    sendStopEmails: true,
  },
  credits: {
    freePlanCredits: 50,
    trialCredits: 500,
    basicCredits: 50,
    growthCredits: 2000,
    proCredits: -1,
    translationCost: 1,
    speechToScriptureCost: 2,
    aiSummaryCost: 3,
  },
  ambassador: {
    enabled: false,
    creditsPerAmbassador: 1000,
    defaultAmbassadorDurationDays: 180,
    autoExpiry: true,
    sendWelcomeEmail: true,
    badgeText: "Ambassador",
  },
  earlyAccess: {
    enabled: false,
    offerName: "Early Access Lifetime",
    description: "One-time lifetime Pro access for selected early users.",
    plan: "pro",
    priceNGN: 50000,
    priceUSD: 99,
    allowRegistrationDateEligibility: true,
    registeredAfter: "",
    registeredBefore: "",
    eligibleUserIds: [],
    eligibleEmails: [],
  },
  authentication: {
    maxDevicesPerUser: 3,
  },
  storage: {
    enableCloudSync: true,
    maxUploadSizeMB: 50,
    allowedFileTypes: "jpg,png,gif,mp4,pdf,docx",
    compressionEnabled: true,
    defaultQuotaGB: 5,
    retentionDays: 365,
    maximumBackgroundVideoSizeMB: 500,
    churchLogoSizeLimitMB: 5,
    mediaLibraryQuotaGB: 10,
    imageTargetSizeBytes: 1024 * 1024,
    videoTargetSizeBytes: 1024 * 1024,
    imageMaxDimension: 1920,
    videoMaxWidth: 854,
    allowedImageExtensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
    allowedVideoExtensions: ["mp4", "mov", "m4v", "avi", "mkv", "webm", "wmv", "flv"],
  },
  security: {
    maintenanceMode: false,
    internetVerificationEnabled: false,
    maxOfflineDays: 28,
    verificationIntervalHours: 6,
  },
  system: {
    allowRegistrations: true,
    allowPayments: true,
  },
  featureFlags: {
    remotePresentationBeta: false,
    cloudSyncBeta: false,
    newTranslationEngine: false,
    newMobileApp: false,
  },
};
