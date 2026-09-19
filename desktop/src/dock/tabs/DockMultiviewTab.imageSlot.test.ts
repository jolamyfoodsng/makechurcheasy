import { describe, expect, it } from "vitest";

import dockMultiviewTabSource from "./DockMultiviewTab.tsx?raw";

describe("DockMultiviewTab image slot picker", () => {
  it("uses an upload/list picker for image slots instead of the raw path input", () => {
    expect(dockMultiviewTabSource).toContain("function ImageSlotControl");
    expect(dockMultiviewTabSource).toContain('slot.contentType === "image"');
    expect(dockMultiviewTabSource).toContain('accept="image/*"');
    expect(dockMultiviewTabSource).toContain('t("multiview.uploadImage", "Upload image")');
    expect(dockMultiviewTabSource).toContain('t("multiview.savedImages", "Saved images")');
    expect(dockMultiviewTabSource).not.toContain("placeholder={isUrl ? t('multiview.urlPlaceholder') : t('multiview.imagePathPlaceholder')}");
  });
});
