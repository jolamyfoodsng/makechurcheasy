import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import TranscriptLibraryPage from "./TranscriptLibraryPage";

let mockEffectivePlan = "free";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string, fallback?: any) => (typeof fallback === "string" ? fallback : key) }),
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "test-user", plan: mockEffectivePlan } }),
}));

vi.mock("../services/entitlementClient", () => ({
  getEffectivePlan: () => mockEffectivePlan,
  checkEntitlementSync: () => ({ allowed: mockEffectivePlan !== "free", requiredPlan: "basic" }),
}));

vi.mock("../services/credits", () => ({
  syncCreditsWithBackend: vi.fn().mockResolvedValue(undefined),
  onCreditChange: () => () => {},
}));

vi.mock("../components/CreditsDisplay", () => ({
  default: () => null,
}));


vi.mock("../transcripts/transcriptService", () => ({
  loadTranscripts: vi.fn().mockResolvedValue([]),
  getTranscriptStats: vi.fn().mockResolvedValue({
    totalSessions: 0,
    totalDurationFormatted: "0m",
    totalScriptures: 0,
    usedThisMonth: "0m",
  }),
  deleteTranscript: vi.fn(),
  formatDuration: (s: number) => `${Math.floor(s / 60)}m`,
}));

describe("TranscriptLibraryPage plan gating", () => {
  it("renders with filter and view buttons using proper styles", () => {
    mockEffectivePlan = "free";
    const html = renderToStaticMarkup(<TranscriptLibraryPage />);
    expect(html).toContain("tl-table-section");
    expect(html).toContain("tl-filter-btn");
  });
});
