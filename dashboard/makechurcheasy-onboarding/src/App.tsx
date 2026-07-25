import { useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { OnboardingState, ChurchBranding, ChurchProfile } from "./types";
import Header from "./components/Header";
import Footer from "./components/Footer";
import StepWelcome from "./components/StepWelcome";
import StepBibleDisplay from "./components/StepBibleDisplay";
import StepBibleSearch from "./components/StepBibleSearch";
import StepBibleTranslations from "./components/StepBibleTranslations";
import StepBibleThemes from "./components/StepBibleThemes";
import StepBranding from "./components/StepBranding";
import StepProfile from "./components/StepProfile";
import StepDashboard from "./components/StepDashboard";

const LOCAL_STORAGE_KEY = "makechurcheasy_onboarding_state";

const initialBranding: ChurchBranding = {
  primaryColor: "#6C2BD9",
  secondaryColor: "#10B981",
  accentColor: "#F59E0B",
  logoDataUrl: null,
  uploadedLogoName: null,
};

const initialProfile: ChurchProfile = {
  name: "",
  website: "",
  country: "United States",
  timezone: "(GMT-05:00) EST",
  size: "51 - 100 Members",
};

export default function App() {
  // Initialize onboarding state with offline-first local storage detection
  const [state, setState] = useState<OnboardingState>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          currentStep: typeof parsed.currentStep === "number" ? parsed.currentStep : 0,
          branding: { ...initialBranding, ...parsed.branding },
          profile: { ...initialProfile, ...parsed.profile },
          isComplete: !!parsed.isComplete,
        };
      }
    } catch (e) {
      console.error("Local storage initialization failed", e);
    }
    return {
      currentStep: 0,
      branding: initialBranding,
      profile: initialProfile,
      isComplete: false,
    };
  });

  // Keep localStorage sync modern & reactive
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Failed to persist state", e);
    }
  }, [state]);

  // Navigate forward
  const handleNext = () => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 7),
      isComplete: prev.currentStep + 1 >= 7,
    }));
  };

  // Navigate backward
  const handleBack = () => {
    setState((prev) => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0),
    }));
  };

  // Skip wizard
  const handleSkipSetup = () => {
    if (confirm("Are you sure you want to skip the onboarding setup? You can always configure branding and profile information later inside settings.")) {
      setState((prev) => ({
        ...prev,
        currentStep: 7,
        isComplete: true,
      }));
    }
  };

  // Reset/re-try flows
  const handleResetFlow = () => {
    setState({
      currentStep: 0,
      branding: initialBranding,
      profile: initialProfile,
      isComplete: false,
    });
  };

  // Updates for branding colors/logos
  const handleBrandingChange = (updatedBranding: Partial<ChurchBranding>) => {
    setState((prev) => ({
      ...prev,
      branding: {
        ...prev.branding,
        ...updatedBranding,
      },
    }));
  };

  // Updates for profile details
  const handleProfileChange = (updatedProfile: Partial<ChurchProfile>) => {
    setState((prev) => ({
      ...prev,
      profile: {
        ...prev.profile,
        ...updatedProfile,
      },
    }));
  };

  const currentStep = state.currentStep;

  return (
    <div className="min-h-screen flex flex-col bg-bg-brand text-[#151c27] transition-colors duration-200">
      {/* Top Navbar */}
      <Header onSkipSetup={handleSkipSetup} currentStep={currentStep} />

      {/* Main Container Stage */}
      <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative overflow-y-auto">


        {/* Wizard step router */}
        <div className="">
          <AnimatePresence mode="wait">
            {currentStep === 0 && (
              <StepWelcome key="welcome" onNext={handleNext} onSkip={handleSkipSetup} />
            )}
            {currentStep === 1 && (
              <StepBibleDisplay key="bible-display" onNext={handleNext} onBack={handleBack} />
            )}
            {currentStep === 2 && (
              <StepBibleSearch key="bible-search" onNext={handleNext} onBack={handleBack} />
            )}
            {currentStep === 3 && (
              <StepBibleTranslations key="bible-translations" onNext={handleNext} onBack={handleBack} />
            )}
            {currentStep === 4 && (
              <StepBibleThemes key="bible-themes" onNext={handleNext} onBack={handleBack} />
            )}
            {currentStep === 5 && (
              <StepBranding
                key="branding"
                branding={state.branding}
                onChange={handleBrandingChange}
                onContinue={handleNext}
                onBack={handleBack}
              />
            )}
            {currentStep === 6 && (
              <StepProfile
                key="profile"
                profile={state.profile}
                branding={state.branding}
                onChangeProfile={handleProfileChange}
                onChangeBranding={handleBrandingChange}
                onSave={handleNext}
                onBack={handleBack}
              />
            )}
            {currentStep === 7 && (
              <StepDashboard
                key="dashboard"
                profile={state.profile}
                branding={state.branding}
                onReset={handleResetFlow}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Global trademark footer */}
      <Footer />
    </div>
  );
}
