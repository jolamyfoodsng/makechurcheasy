import { describe, expect, it } from "vitest";
import presentationSetupPageSource from "./PresentationSetupPage.tsx?raw";
import dockPageSource from "../dock/DockPage.tsx?raw";
import dockLmTabSource from "../dock/tabs/DockLmTab.tsx?raw";
import presentationHtml from "../../public/presentation.html?raw";

describe("presentation page Scripture Assistant", () => {
  it("enables local mic controls only from the presentation link page", () => {
    expect(presentationSetupPageSource).toContain("enablePresentationAssistantMicControls");
    expect(dockPageSource).toContain("enablePresentationAssistantMicControls = false");
    expect(dockPageSource).toContain("enablePresentationMicControls={enablePresentationAssistantMicControls}");
    expect(dockLmTabSource).toContain("enablePresentationMicControls = false");
    expect(dockLmTabSource).toContain("const allowLocalMicControls = presentationLinkMode && enablePresentationMicControls");
    expect(dockLmTabSource).toContain("async function loadLmDockService");
    expect(dockLmTabSource).toContain("await service.startListening(selectedMic || undefined)");
    expect(dockLmTabSource).toContain("await service.getMics()");
  });

  it("uses a preview-only presentation URL and caps preview text size", () => {
    expect(presentationSetupPageSource).toContain("function buildPresentationPreviewLink");
    expect(presentationSetupPageSource).toContain('url.searchParams.set("preview", "1")');
    expect(presentationSetupPageSource).toContain("src={previewLink}");
    expect(presentationSetupPageSource).toContain("session.presentationLink");

    expect(presentationHtml).toContain('const isPreviewFrame = initialParams.get("preview") === "1"');
    expect(presentationHtml).toContain("const PREVIEW_MAX_FONT_SIZE = 75");
    expect(presentationHtml).toContain("const PREVIEW_DEFAULT_FONT_SIZE = 50");
    expect(presentationHtml).toContain("function getPreviewTextFontSize");
    expect(presentationHtml).toContain("function formatScaledTextSize");
  });
});
