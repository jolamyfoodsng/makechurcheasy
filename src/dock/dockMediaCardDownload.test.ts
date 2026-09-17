import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dockMediaTabSource = readFileSync(
  fileURLToPath(new URL("./tabs/DockMediaTab.tsx", import.meta.url)),
  "utf8",
);

const tauriLibSource = readFileSync(
  fileURLToPath(new URL("../../src-tauri/src/lib.rs", import.meta.url)),
  "utf8",
);

describe("Dock Media Card Download to User Device", () => {
  it("includes runtime detection and multi-target saving in downloadMediaEntry", () => {
    // Detects Tauri runtime for native save dialog
    expect(dockMediaTabSource).toContain("function isTauriRuntime()");
    expect(dockMediaTabSource).toContain('@tauri-apps/plugin-dialog');
    expect(dockMediaTabSource).toContain('@tauri-apps/plugin-fs');

    // Falls back to overlay server save-to-downloads API for OBS CEF dock
    expect(dockMediaTabSource).toContain("/api/save-to-downloads");

    // Falls back to browser save picker or file-saver
    expect(dockMediaTabSource).toContain("showSaveFilePicker");
    expect(dockMediaTabSource).toContain("file-saver");
  });

  it("adds direct download button to media gallery card overlay top", () => {
    // The media card overlay-top has the download button with progress spinner
    expect(dockMediaTabSource).toContain('downloadingMediaKey === entry.key ? "downloading" : "download"');
    expect(dockMediaTabSource).toContain('downloadMediaEntry(entry)');
  });

  it("renders download success feedback banner", () => {
    expect(dockMediaTabSource).toContain("downloadSuccess && (");
    expect(dockMediaTabSource).toContain("dock-media-send-error--info");
  });

  it("exposes api/save-to-downloads on tiny_http server in src-tauri lib.rs", () => {
    expect(tauriLibSource).toContain('clean == "api/save-to-downloads"');
    expect(tauriLibSource).toContain("dirs::download_dir()");
  });
});
