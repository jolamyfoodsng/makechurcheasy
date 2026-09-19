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
});
