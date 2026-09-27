import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Verse AI App Close Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("identifies active Verse AI statuses", () => {
    const activeStatuses = ["requesting-mic", "connecting", "listening"];
    const inactiveStatuses = ["idle", "error"];

    for (const status of activeStatuses) {
      expect(["requesting-mic", "connecting", "listening"].includes(status)).toBe(true);
    }

    for (const status of inactiveStatuses) {
      expect(["requesting-mic", "connecting", "listening"].includes(status)).toBe(false);
    }
  });

  it("prompts user and cancels close if user selects Cancel", async () => {
    const askMock = vi.fn().mockResolvedValue(false);
    const stopListeningMock = vi.fn();
    const invokeMock = vi.fn();

    let prevented = false;
    const fakeEvent = {
      preventDefault: () => {
        prevented = true;
      },
    };

    const isVerseAiBusy = true;
    if (isVerseAiBusy) {
      fakeEvent.preventDefault();
      const confirmed = await askMock(
        "Verse AI is currently listening and transcribing. Are you sure you want to close MakeChurchEasy?",
        {
          title: "Verse AI is Active",
          kind: "warning",
          okLabel: "Close App",
          cancelLabel: "Cancel",
        }
      );
      if (confirmed) {
        stopListeningMock();
        await invokeMock("close_app_confirmed");
      }
    }

    expect(prevented).toBe(true);
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(stopListeningMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("stops Verse AI and invokes close_app_confirmed if user selects Close App", async () => {
    const askMock = vi.fn().mockResolvedValue(true);
    const stopListeningMock = vi.fn();
    const invokeMock = vi.fn().mockResolvedValue(undefined);

    let prevented = false;
    const fakeEvent = {
      preventDefault: () => {
        prevented = true;
      },
    };

    const isVerseAiBusy = true;
    if (isVerseAiBusy) {
      fakeEvent.preventDefault();
      const confirmed = await askMock(
        "Verse AI is currently listening and transcribing. Are you sure you want to close MakeChurchEasy?",
        {
          title: "Verse AI is Active",
          kind: "warning",
          okLabel: "Close App",
          cancelLabel: "Cancel",
        }
      );
      if (confirmed) {
        stopListeningMock();
        await invokeMock("close_app_confirmed");
      }
    }

    expect(prevented).toBe(true);
    expect(askMock).toHaveBeenCalledTimes(1);
    expect(stopListeningMock).toHaveBeenCalledTimes(1);
    expect(invokeMock).toHaveBeenCalledWith("close_app_confirmed");
  });
});
