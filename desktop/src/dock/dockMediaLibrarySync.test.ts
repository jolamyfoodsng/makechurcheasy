import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const appSource = readFileSync(
  fileURLToPath(new URL("../App.tsx", import.meta.url)),
  "utf8",
);

describe("Dock media library synchronization", () => {
  it("broadcasts resolved media arrays instead of Promise objects", () => {
    expect(appSource).toContain("const media = await getAllMedia();");
    expect(appSource).not.toContain("const media = getAllMedia();");
    expect(appSource).not.toContain("payload: getAllMedia(),");
  });
});
