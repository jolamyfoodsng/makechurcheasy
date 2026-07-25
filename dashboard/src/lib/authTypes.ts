export interface MongoUser {
  _id: string;
  name: string;
  email: string;
  role: string;
  churchName: string;
  country: string;
  credits: number;
  planAllocation: number;
  adminGranted: number;
  totalConsumed: number;
  totalAvailable: number;
  plan: string;
  appId: string;
  emailVerified: boolean;
  provider?: string;
  password?: boolean;
  language: string;
  onboardingCompleted: boolean;
  trial?: {
    active?: boolean;
    status?: "active" | "expired" | "stopped" | "cancelled";
    startedAt?: string | null;
    endsAt?: string | null;
    durationDays?: number | null;
    welcomeShown?: boolean;
    extendedDays?: number;
    extensionCount?: number;
    stoppedAt?: string | null;
    stoppedReason?: string;
    restartedAt?: string | null;
    grantedBy?: string;
    lastModifiedBy?: string;
  } | null;
  activationMilestones?: {
    appDownloaded?: boolean;
    devicePaired?: boolean;
    obsConnected?: boolean;
    firstPresentation?: boolean;
    firstSpeechToScripture?: boolean;
    firstTranslation?: boolean;
  };
  onboarding?: {
    downloadedStudio?: boolean;
    pairedFirstDevice?: boolean;
    completedWelcome?: boolean;
  } | null;
}
