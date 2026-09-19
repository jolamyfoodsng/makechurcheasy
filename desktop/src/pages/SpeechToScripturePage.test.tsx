import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import SpeechToScripturePage from "./SpeechToScripturePage";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "test", plan: "unlimited" }, isAdmin: true }) }));
vi.mock("../components/CreditsDisplay", () => ({ default: () => null }));
vi.mock("../services/licenseService", () => ({ getEffectivePlan: () => "unlimited" }));
vi.mock("../services/credits", () => ({ getCreditsBalance: () => 100, calculateTranscriptionCredits: vi.fn(), deductCreditsWithSync: vi.fn(), onCreditChange: vi.fn(), syncCreditsWithBackend: vi.fn() }));
vi.mock("../services/localDockSettings", () => ({ readNativeDockSetting: () => undefined, writeNativeDockSetting: vi.fn() }));
vi.mock("../dock/usePerformanceMonitor", () => ({ usePerformanceMonitor: () => ({ current: {}, memorySupported: false }) }));
vi.mock("../services/lmDockService", () => ({ lmDockService: {
  getSnapshot: () => ({ status: "idle", entries: [], queue: [], suggestions: [], candidates: [],
    latestMatch: { book: "John", chapter: 3, verse: 16, label: "John 3:16", translation: "KJV", snippet: "For God so loved the world", confidence: 1, source: "keyword" } }),
  getDiagnostics: () => ({}),
} }));

describe("speech page latest detection", () => {
  it("renders an explicit reference in the top-match panel without quote suggestions", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const html = renderToStaticMarkup(<MemoryRouter><SpeechToScripturePage /></MemoryRouter>);
    expect(html).toContain("John 3:16");
    expect(html).toContain("For God so loved the world");
    expect(html).toContain('aria-label="verseAi.selectMicrophone"');
    vi.unstubAllGlobals();
  });
});
