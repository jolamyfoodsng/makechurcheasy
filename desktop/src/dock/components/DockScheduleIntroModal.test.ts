import { describe, it, expect } from "vitest";
import { DOCK_SCHEDULE_INTRO_KEY } from "./DockScheduleIntroModal";
import introModalSource from "./DockScheduleIntroModal.tsx?raw";
import scheduleDrawerSource from "./DockScheduleDrawer.tsx?raw";
import dockPageSource from "../DockPage.tsx?raw";

describe("Dock Schedule & History Onboarding & OBS Error Enhancements", () => {
  it("defines the expected localStorage key for Schedule & History onboarding", () => {
    expect(DOCK_SCHEDULE_INTRO_KEY).toBe("__mce_dock_schedule_intro_v1");
  });

  it("mounts DockScheduleIntroModal at the DockPage root level and wires up the guide trigger from DockScheduleDrawer", () => {
    expect(dockPageSource).toContain("import DockScheduleIntroModal from \"./components/DockScheduleIntroModal\";");
    expect(dockPageSource).toContain("<DockScheduleIntroModal />");
    expect(scheduleDrawerSource).toContain("DOCK_OPEN_SCHEDULE_GUIDE_EVENT");
    expect(scheduleDrawerSource).toContain("handleOpenGuide");
    expect(scheduleDrawerSource).toContain("Schedule Guide...");
    expect(scheduleDrawerSource).not.toContain("<DockScheduleIntroModal");
  });

  it("explains Schedule and History features concisely and highlights where to locate it", () => {
    expect(introModalSource).toContain("Service Schedule & History");
    expect(introModalSource).toContain("Where to find it:");
    expect(introModalSource).toContain("Located on the left edge of your Dock");
    expect(introModalSource).toContain("Schedule & History Side-by-Side");
    expect(introModalSource).toContain("One-Click Live Projection");
    expect(introModalSource).toContain("Resize & Pin");
    expect(introModalSource).toContain("localStorage.setItem(DOCK_SCHEDULE_INTRO_KEY, \"true\")");
    expect(introModalSource).toContain("localStorage.getItem(DOCK_SCHEDULE_INTRO_KEY)");
  });

  it("provides helpful solutions and diagnostics for OBS WebSocket connection errors", () => {
    expect(dockPageSource).toContain("formatDockObsError");
    expect(dockPageSource).toContain("Tools → WebSocket Server Settings");
    expect(dockPageSource).toContain("MakeChurchEasy");
    expect(dockPageSource).toContain("port 4455");
  });

  it("sequences onboarding so the step-by-step dock guide shows first before the schedule modal", () => {
    expect(introModalSource).toContain("import { DOCK_ONBOARDING_KEY, DOCK_ONBOARDING_COMPLETED_EVENT } from \"./DockOnboardingTour\";");
    expect(introModalSource).toContain("localStorage.getItem(DOCK_ONBOARDING_KEY) === \"true\"");
    expect(introModalSource).toContain("window.addEventListener(DOCK_ONBOARDING_COMPLETED_EVENT");
  });
});
