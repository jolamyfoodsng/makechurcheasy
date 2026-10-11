export interface EmailBrandingSettings {
  appName: string;
  logoUrl: string;
  logoAlt: string;
  /** Cropped brand mark shown in the email header (on the light panel). */
  markUrl: string;
  /** White brand mark shown in the dark email footer. */
  markLightUrl: string;
  primaryColor: string;
  accentColor: string;
  supportEmail: string;
  websiteUrl: string;
  preferencesUrl: string;
  footerText: string;
  social: {
    twitterUrl: string;
    facebookUrl: string;
    instagramUrl: string;
    linkedinUrl: string;
    youtubeUrl: string;
    whatsappUrl: string;
    tiktokUrl: string;
  };
}

const DEFAULT_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheazy.com";

export const DEFAULT_EMAIL_BRANDING: EmailBrandingSettings = {
  appName: "MakeChurchEazy",
  logoUrl: `${DEFAULT_APP_URL}/logos/make_church_easy_logo.png`,
  logoAlt: "MakeChurchEazy",
  markUrl: `${DEFAULT_APP_URL}/email/mark-blue.png`,
  markLightUrl: `${DEFAULT_APP_URL}/email/mark-white.png`,
  primaryColor: "#1D4ED8",
  accentColor: "#F97316",
  supportEmail: process.env.SUPPORT_EMAIL || "support@makechurcheazy.com",
  websiteUrl: DEFAULT_APP_URL,
  preferencesUrl: `${DEFAULT_APP_URL}/settings`,
  footerText:
    "MakeChurchEazy helps churches run presentations, lyrics, Bible, and livestream workflows from one platform.",
  social: {
    twitterUrl: "",
    facebookUrl: "",
    instagramUrl: "",
    linkedinUrl: "",
    youtubeUrl: "https://www.youtube.com/playlist?list=PLRua6gJfgC0o",
    whatsappUrl: "https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t",
    tiktokUrl: "",
  },
};
