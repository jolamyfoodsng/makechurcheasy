import { describe, it, expect } from "vitest";
import { DOCK_ONBOARDING_KEY } from "./DockOnboardingTour";
import tourSource from "./DockOnboardingTour.tsx?raw";
import dockBibleTabSource from "../tabs/DockBibleTab.tsx?raw";

describe("DockOnboardingTour", () => {
  it("defines the expected localStorage key for onboarding persistence", () => {
    expect(DOCK_ONBOARDING_KEY).toBe("mce_dock_onboarding_completed_v1");
  });

  it("targets the scripture search input and quick edits toolbar button", () => {
    expect(tourSource).toContain(".dock-bible-search-row__input .dock_search__input");
    expect(tourSource).toContain(".dock-bible-reader__quick-edit-toolbar-btn");
    expect(tourSource).toContain("Quick Scripture Search");
    expect(tourSource).toContain("Quick Edits & Styling");
  });

  it("supports skipping and completion with localStorage persistence", () => {
    expect(tourSource).toContain("localStorage.setItem(DOCK_ONBOARDING_KEY, \"true\")");
    expect(tourSource).toContain("localStorage.getItem(DOCK_ONBOARDING_KEY)");
    expect(tourSource).toContain("Skip tour");
    expect(tourSource).toContain("Got it!");
    expect(tourSource).toContain("Step {currentStep + 1} of {TOUR_STEPS.length}");
  });

  it("mounts DockOnboardingTour inside DockBibleTab", () => {
    expect(dockBibleTabSource).toContain("import { DockOnboardingTour } from \"../components/DockOnboardingTour\";");
    expect(dockBibleTabSource).toContain("<DockOnboardingTour />");
  });
});
