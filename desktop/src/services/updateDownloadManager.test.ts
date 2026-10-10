import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateDownloadManager } from "./updateDownloadManager";
import * as updateService from "./updateService";
import { resolveActionUrl, withOfferCode } from "../components/AnnouncementModalHost";
import type { DesktopAnnouncement } from "./announcementService";

vi.mock("./updateService", () => ({
  downloadVerifiedUpdate: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-process", () => ({
  exit: vi.fn().mockResolvedValue(undefined),
}));

describe("updateDownloadManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateDownloadManager["state"] = {
      status: "idle",
      progress: { contentLength: 0, downloaded: 0, percent: 0 },
      errorMsg: "",
      version: "",
      currentVersion: "",
      update: null,
      isModalVisible: false,
      showBackgroundNotice: false,
      showAppCloseWarning: false,
      runInBackground: false,
      readyBannerDismissed: false,
    };
    updateDownloadManager["prepared"] = null;
  });

  it("registers an available update", () => {
    updateDownloadManager.registerAvailableUpdate(null, "3.20.0", "3.19.0", undefined, true);
    const state = updateDownloadManager.getState();
    expect(state.status).toBe("available");
    expect(state.version).toBe("3.20.0");
    expect(state.currentVersion).toBe("3.19.0");
    expect(state.isModalVisible).toBe(true);
  });

  it("handles dismissModal when not downloading (no background notice)", () => {
    updateDownloadManager.registerAvailableUpdate(null, "3.20.0", "3.19.0", undefined, true);
    updateDownloadManager.dismissModal();
    const state = updateDownloadManager.getState();
    expect(state.isModalVisible).toBe(false);
    expect(state.showBackgroundNotice).toBe(false);
  });

  it("handles dismissModal when actively downloading (shows background notice)", async () => {
    let progressCallback: any;
    const install = vi.fn().mockResolvedValue(undefined);
    vi.mocked(updateService.downloadVerifiedUpdate).mockImplementation(
      async (_update, onProgress) => {
        progressCallback = onProgress;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { version: "3.20.0", source: "signed", install };
      }
    );

    const downloadPromise = updateDownloadManager.startDownload(null, "3.20.0");
    expect(updateDownloadManager.isBusy()).toBe(true);

    // Simulate closing the modal during download
    updateDownloadManager.dismissModal();
    const state = updateDownloadManager.getState();
    expect(state.isModalVisible).toBe(false);
    expect(state.showBackgroundNotice).toBe(true);

    if (progressCallback) {
      progressCallback({ contentLength: 1000, downloaded: 500 });
      expect(updateDownloadManager.getState().progress.percent).toBe(50);
    }

    await downloadPromise;

    // Moved to the background: it must wait for the user, not restart.
    expect(install).not.toHaveBeenCalled();
    expect(updateDownloadManager.getState().status).toBe("ready");
  });

  it("installs and restarts right away for a foreground update", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    vi.mocked(updateService.downloadVerifiedUpdate).mockResolvedValue({ version: "3.20.0", source: "signed", install });

    await updateDownloadManager.startDownload(null, "3.20.0");

    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0][0]).toMatchObject({ relaunch: true });
  });

  it("background update stops at ready, then installs on Restart Now", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    vi.mocked(updateService.downloadVerifiedUpdate).mockResolvedValue({ version: "3.20.0", source: "signed", install });

    await updateDownloadManager.startDownload(null, "3.20.0", { background: true });
    const state = updateDownloadManager.getState();
    expect(state.status).toBe("ready");
    expect(state.isModalVisible).toBe(false);
    expect(install).not.toHaveBeenCalled();
    expect(updateDownloadManager.isReady()).toBe(true);

    await updateDownloadManager.installNow();
    expect(install).toHaveBeenCalledTimes(1);
    expect(install.mock.calls[0][0]).toMatchObject({ relaunch: true });
  });

  it("installs a ready update without restarting when the app quits", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    vi.mocked(updateService.downloadVerifiedUpdate).mockResolvedValue({ version: "3.20.0", source: "signed", install });

    await updateDownloadManager.startDownload(null, "3.20.0", { background: true });
    await expect(updateDownloadManager.installOnQuit()).resolves.toBe(true);
    expect(install.mock.calls[0][0]).toMatchObject({ relaunch: false });
  });

  it("does not let a later check replace a downloaded update", async () => {
    const install = vi.fn().mockResolvedValue(undefined);
    vi.mocked(updateService.downloadVerifiedUpdate).mockResolvedValue({ version: "3.20.0", source: "signed", install });

    await updateDownloadManager.startDownload(null, "3.20.0", { background: true });
    updateDownloadManager.registerAvailableUpdate(null, "3.21.0", "3.19.0", undefined, true);
    expect(updateDownloadManager.getState().status).toBe("ready");
    expect(updateDownloadManager.getState().version).toBe("3.20.0");
  });

  it("reports a failed download as an error", async () => {
    vi.mocked(updateService.downloadVerifiedUpdate).mockRejectedValue(new Error("network down"));
    await updateDownloadManager.startDownload(null, "3.20.0", { background: true });
    expect(updateDownloadManager.getState().status).toBe("error");
    expect(updateDownloadManager.getState().errorMsg).toBe("network down");
  });

  it("re-opens modal with openModal()", () => {
    updateDownloadManager.openModal();
    expect(updateDownloadManager.getState().isModalVisible).toBe(true);
  });

  it("closes background notice with closeBackgroundNotice()", () => {
    updateDownloadManager["updateState"]({ showBackgroundNotice: true });
    expect(updateDownloadManager.getState().showBackgroundNotice).toBe(true);

    updateDownloadManager.closeBackgroundNotice();
    expect(updateDownloadManager.getState().showBackgroundNotice).toBe(false);
  });

  it("manages app close warning modal", () => {
    updateDownloadManager.showAppCloseWarning();
    expect(updateDownloadManager.getState().showAppCloseWarning).toBe(true);

    updateDownloadManager.cancelAppClose();
    expect(updateDownloadManager.getState().showAppCloseWarning).toBe(false);
  });
});

describe("Dynamic Admin Discounts Resilience", () => {
  it("resolves action URL from explicit ctaUrl and adds offerCode if missing", () => {
    const announcement: DesktopAnnouncement = {
      id: "disc-1",
      deliveryId: "del-1",
      title: "Easter Special",
      message: "Get 40% off",
      tone: "offer",
      tags: ["discount"],
      ctaUrl: "https://makechurcheasy.com/pricing",
      offerCode: "EASTER40",
    };

    const url = resolveActionUrl(announcement);
    expect(url).toContain("promo=EASTER40");
    expect(url).toContain("https://makechurcheasy.com/pricing");
  });

  it("preserves existing promo parameters when using withOfferCode", () => {
    const urlWithCode = withOfferCode("https://makechurcheasy.com/subscription/plans?promo=EXISTING", "NEWCODE");
    expect(urlWithCode).toBe("https://makechurcheasy.com/subscription/plans?promo=EXISTING");
  });

  it("synthesizes valid fallback checkout URL when ctaUrl is omitted by admin", () => {
    const announcement: DesktopAnnouncement = {
      id: "disc-2",
      deliveryId: "del-2",
      title: "Summer Flash Deal",
      message: "50% off all annual plans",
      tone: "offer",
      tags: ["discount"],
      offerCode: "SUMMER50",
      offerDiscountPercent: 50,
      offerApplicablePlans: ["pro"],
      offerApplicableBillingCycles: ["yearly"],
    };

    const url = resolveActionUrl(announcement);
    expect(url).toBe("https://makechurcheasy.com/subscription/plans?promo=SUMMER50&plan=pro&billing=yearly");
  });

  it("falls back to default plan and billing cycle if not specified", () => {
    const announcement: DesktopAnnouncement = {
      id: "disc-3",
      deliveryId: "del-3",
      title: "General Promotion",
      message: "Save today",
      tone: "upgrade",
      tags: [],
    };

    const url = resolveActionUrl(announcement);
    expect(url).toBe("https://makechurcheasy.com/subscription/plans?plan=growth&billing=monthly");
  });
});
