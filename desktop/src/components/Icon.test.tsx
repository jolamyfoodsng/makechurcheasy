import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Icon from "./Icon";

describe("template editor icons", () => {
  it("renders text color and italic controls as SVGs", () => {
    const markup = renderToStaticMarkup(
      <>
        <Icon name="format_color_text" />
        <Icon name="format_italic" />
      </>,
    );

    expect(markup).toContain("<svg");
    expect(markup).not.toContain("format_color_text");
    expect(markup).not.toContain("format_italic");
  });

  it("renders user, crown, upgrade, and sparkles as SVGs and never raw text fallback", () => {
    const markup = renderToStaticMarkup(
      <>
        <Icon name="user" />
        <Icon name="crown" />
        <Icon name="upgrade" />
        <Icon name="sparkles" />
        <Icon name="logout" />
        <Icon name="login" />
        <Icon name="devices" />
        <Icon name="devices_other" />
      </>,
    );

    expect(markup).toContain("<svg");
    expect(markup).not.toContain(">user<");
    expect(markup).not.toContain(">crown<");
    expect(markup).not.toContain(">upgrade<");
    expect(markup).not.toContain(">sparkles<");
    expect(markup).not.toContain(">logout<");
    expect(markup).not.toContain(">login<");
    expect(markup).not.toContain(">devices<");
    expect(markup).not.toContain(">devices_other<");
  });
});
