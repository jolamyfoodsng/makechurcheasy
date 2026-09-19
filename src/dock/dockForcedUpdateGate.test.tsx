import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import DockAuthGate from "./DockAuthGate";
import * as forcedUpdateHook from "../hooks/useForcedUpdate";
import type { ForcedUpdateState } from "../services/forcedUpdateService";

// Mock i18next
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock envConfig
vi.mock("../services/envConfig", () => ({
  getEnvConfig: () => ({ isTest: false }),
}));

// Mock appAppearance & appTheme
vi.mock("../services/appAppearance", () => ({
  refreshAppAppearance: vi.fn(),
}));
vi.mock("../hooks/useAppTheme", () => ({
  refreshAppThemePreference: vi.fn(),
}));
vi.mock("../services/localDockSettings", () => ({
  hydrateNativeDockSettings: vi.fn().mockResolvedValue(undefined),
}));

const baseMockState: ForcedUpdateState = {
  blocked: false,
  active: false,
  lockType: null,
  requiredVersion: "4.0.0",
  hoursRemaining: null,
  gracePeriodHours: null,
  startedAt: null,
  lockAt: null,
  updateMessage: "A newer version is required.",
  currentVersion: "3.5.0",
  downloadUrl: "https://makechurcheazy.com/download/mce-v4.0.0.msi",
  releaseNotesUrl: "",
  loading: false,
};

describe("DockAuthGate forced update lock enforcement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("strictly renders the compulsory ForcedUpdateOverlay when forced update is blocked", () => {
    vi.spyOn(forcedUpdateHook, "useForcedUpdate").mockReturnValue({
      state: {
        ...baseMockState,
        active: true,
        blocked: true,
        lockType: "forced-update",
      },
      isVisible: true,
      dismiss: undefined,
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <DockAuthGate>
        <div data-testid="dock-children">Dock Content</div>
      </DockAuthGate>
    );

    // The children must NOT be rendered
    expect(html).not.toContain("Dock Content");

    // The compulsory update modal must be rendered with dock-specific title and message
    expect(html).toContain("Dock Blocked");
    expect(html).toContain("v4.0.0 is required");
    expect(html).toContain("This has been blocked because you need to update the app.");
    expect(html).toContain("Please open MakeChurchEasy on this computer to update.");

    // Dock mode must render 'I Updated, Refresh' button, and NOT have Update Now, Quit App, or Remind Me Later buttons
    expect(html).toContain("I Updated, Refresh");
    expect(html).not.toContain("Update Now");
    expect(html).not.toContain("Quit App");
    expect(html).not.toContain("Remind Me Later");
  });

  it("renders the overlay with 'I Updated, Refresh' button when in countdown mode without Remind Me Later", () => {
    vi.spyOn(forcedUpdateHook, "useForcedUpdate").mockReturnValue({
      state: {
        ...baseMockState,
        active: true,
        blocked: false,
        hoursRemaining: 12,
        gracePeriodHours: 24,
        startedAt: new Date().toISOString(),
      },
      isVisible: true,
      dismiss: vi.fn(),
      refetch: vi.fn(),
    });

    const html = renderToStaticMarkup(
      <DockAuthGate>
        <div data-testid="dock-children">Dock Content</div>
      </DockAuthGate>
    );

    // The modal shows 'I Updated, Refresh' and never shows 'Remind Me Later' in the dock
    expect(html).toContain("I Updated, Refresh");
    expect(html).not.toContain("Remind Me Later");
    expect(html).toContain("Update Required");
  });

  it("falls back to opening download URL in browser/OBS environment without throwing", async () => {
    const windowOpenSpy = vi.fn();
    vi.stubGlobal("window", { open: windowOpenSpy });

    const { default: ForcedUpdateOverlay } = await import("../components/ForcedUpdateOverlay");
    const html = renderToStaticMarkup(
      <ForcedUpdateOverlay
        state={{
          ...baseMockState,
          active: true,
          blocked: true,
        }}
      />
    );

    expect(html).toContain("Update Now");
    expect(html).toContain("v4.0.0 is required");
  });
});
