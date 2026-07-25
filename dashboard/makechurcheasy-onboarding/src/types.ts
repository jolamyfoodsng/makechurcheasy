export interface ChurchBranding {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  logoDataUrl: string | null;
  uploadedLogoName: string | null;
}

export interface ChurchProfile {
  name: string;
  website: string;
  country: string;
  timezone: string;
  size: string;
}

export interface OnboardingState {
  currentStep: number;
  branding: ChurchBranding;
  profile: ChurchProfile;
  isComplete: boolean;
}

export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
  colorClass: string;
  textColorClass: string;
}
