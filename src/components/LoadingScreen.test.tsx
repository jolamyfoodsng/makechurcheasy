import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LoadingScreen, { LoadingSpinner } from "./LoadingScreen";

describe("LoadingScreen component", () => {
  it("renders with default label and accessibility attributes", () => {
    const html = renderToStaticMarkup(<LoadingScreen />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading…");
  });

  it("renders custom label and sublabel", () => {
    const html = renderToStaticMarkup(
      <LoadingScreen
        label="Connecting to MakeChurchEasy…"
        sublabel="Please wait a moment"
      />
    );
    expect(html).toContain("Connecting to MakeChurchEasy…");
    expect(html).toContain("Please wait a moment");
  });

  it("applies variant classes correctly", () => {
    expect(renderToStaticMarkup(<LoadingScreen variant="page" />)).toContain("mce-loading-screen--page");
    expect(renderToStaticMarkup(<LoadingScreen variant="dock" />)).toContain("mce-loading-screen--dock");
    expect(renderToStaticMarkup(<LoadingScreen variant="fullscreen" />)).toContain("mce-loading-screen--fullscreen");
  });

  it("renders LoadingSpinner with specified size", () => {
    const html = renderToStaticMarkup(<LoadingSpinner size="large" />);
    expect(html).toContain("mce-spinner--large");
  });
});
