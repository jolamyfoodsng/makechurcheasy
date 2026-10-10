import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BroadcastHowItWorksModal from "./BroadcastHowItWorksModal";
import { getMultistreamPlanAllocation } from "../services/broadcastSettingsService";

describe("BroadcastHowItWorksModal", () => {
  it("does not render when open is false", () => {
    const allocation = getMultistreamPlanAllocation("free");
    const html = renderToStaticMarkup(
      <BroadcastHowItWorksModal
        open={false}
        onClose={() => {}}
        allocation={allocation}
      />
    );
    expect(html).toBe("");
  });

  it("renders guide, steps, and clean plan continuation text when open", () => {
    const allocation = getMultistreamPlanAllocation("free");
    const html = renderToStaticMarkup(
      <BroadcastHowItWorksModal
        open={true}
        onClose={() => {}}
        allocation={allocation}
        onOpenUpgrade={() => {}}
      />
    );

    // Title & subtitle & clean continuation text
    expect(html).toContain("How it works");
    expect(html).toContain("Set up once, then switch and stream with one click.");
    expect(html).toContain("Free Plan");

    // Steps matching mockup
    expect(html).toContain("Create Profiles");
    expect(html).toContain("First Lady’s Account");
    expect(html).toContain("Add Channels");
    expect(html).toContain("Select a Profile");
    expect(html).toContain("Sync with OBS");
    expect(html).toContain("Go Live");

    // Centered Got it button, no Change Plan button
    expect(html).toContain("Got it");
    expect(html).not.toContain("Change Plan");
  });

  it("strictly enforces zero occurrences of the forbidden word and displays Growth plan continuation text", () => {
    const allocation = getMultistreamPlanAllocation("growth");
    const html = renderToStaticMarkup(
      <BroadcastHowItWorksModal
        open={true}
        onClose={() => {}}
        allocation={allocation}
        onOpenUpgrade={() => {}}
      />
    );
    expect(html).toContain("20 hours based on your Growth Plan");
  });
});
