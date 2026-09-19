import { describe, expect, it } from "vitest";
import {
  DOCK_SESSION_FORMAT,
  DOCK_SESSION_VERSION,
  parseDockSessionJSON,
} from "./dockSessionTransfer";

describe("Dock session transfer", () => {
  it("accepts the versioned session format and keeps known section data", () => {
    const parsed = parseDockSessionJSON(JSON.stringify({
      _format: DOCK_SESSION_FORMAT,
      _version: DOCK_SESSION_VERSION,
      _exportedAt: "2026-08-13T12:00:00.000Z",
      app: {
        activeTab: "worship",
        disabledTabs: ["ministry"],
        colorMode: "light",
        appearance: { palette: "ocean-teal" },
        typography: { fontFamily: "Inter", fontScale: 1.1 },
      },
      sections: [
        {
          id: "worship",
          label: "Lyrics",
          storage: {
            "ocs-dock-worship-preferences": {
              scope: "user",
              encoding: "json",
              value: {
                fullscreenThemeId: "sermon-clean",
                linesPerSlide: 2,
              },
            },
            "ocs-dock-output-typography": {
              scope: "user",
              encoding: "json",
              value: {
                fontFamily: '"Oswald", "Arial Narrow", sans-serif',
                fontScale: 1,
              },
            },
            "not-a-dock-key": {
              scope: "global",
              encoding: "text",
              value: "must be ignored",
            },
          },
        },
      ],
      records: {
        worshipSongs: [],
        countdowns: [],
        mediaLibrary: [],
        multiview: { layouts: [], assets: [], media: [], mappings: [] },
      },
    }));

    expect(parsed.app).toEqual({
      activeTab: "worship",
      disabledTabs: ["ministry"],
      colorMode: "light",
      appearance: { palette: "ocean-teal" },
      typography: { fontFamily: "Inter", fontScale: 1.1 },
    });
    expect(parsed.sections).toHaveLength(1);
    expect(parsed.sections[0].storage["ocs-dock-worship-preferences"]?.scope).toBe("user");
    expect(parsed.sections[0].storage["ocs-dock-output-typography"]?.value).toMatchObject({
      fontFamily: '"Oswald", "Arial Narrow", sans-serif',
    });
    expect(parsed.sections[0].storage["not-a-dock-key"]).toBeUndefined();
  });

  it("rejects malformed or unsupported session files", () => {
    expect(() => parseDockSessionJSON("not json")).toThrow("not valid JSON");
    expect(() => parseDockSessionJSON(JSON.stringify({ _format: "other", _version: 1 })))
      .toThrow("not a MakeChurchEasy Dock session");
    expect(() => parseDockSessionJSON(JSON.stringify({
      _format: DOCK_SESSION_FORMAT,
      _version: 99,
    }))).toThrow("Unsupported Dock session version");
  });

  it("normalizes missing optional sections and records", () => {
    const parsed = parseDockSessionJSON(JSON.stringify({
      _format: DOCK_SESSION_FORMAT,
      _version: DOCK_SESSION_VERSION,
    }));

    expect(parsed.sections).toEqual([]);
    expect(parsed.records).toEqual({
      worshipSongs: [],
      countdowns: [],
      mediaLibrary: [],
      multiview: { layouts: [], assets: [], media: [], mappings: [] },
    });
    expect(parsed.app.activeTab).toBe("bible");
  });
});
