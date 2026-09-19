import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateDownloadManager } from "./updateDownloadManager";
import * as updateService from "./updateService";
import { resolveActionUrl, withOfferCode } from "../components/AnnouncementModalHost";
import type { DesktopAnnouncement } from "./announcementService";

vi.mock("./updateService", () => ({
  downloadAndInstallVerifiedUpdate: vi.fn(),
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
    };
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
    vi.mocked(updateService.downloadAndInstallVerifiedUpdate).mockImplementation(
      async (_update, onProgress) => {
        progressCallback = onProgress;
        await new Promise((resolve) => setTimeout(resolve, 50));
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
