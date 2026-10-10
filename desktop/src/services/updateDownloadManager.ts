/**
 * updateDownloadManager.ts
 *
 * Centralized singleton managing update download lifecycle across:
 * - UpdateNotification modal
 * - Top downloading / "ready to restart" banner
 * - MVSettings About/Updates section
 * - App close handling (warn while downloading, install on quit when ready)
 *
 * Flow:
 *   available → downloading → (foreground) installing → relaunching
 *                           → (background) ready → installing on "Restart now"
 *                                                  or when the app is quit
 *
 * A background download never restarts the app on its own: the operator may
 * be in the middle of a live service, and restarting would take the OBS dock
 * and overlays offline.
 */

import { useState, useEffect } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  downloadVerifiedUpdate,
  type DownloadProgress,
  type PreparedUpdate,
} from "./updateService";
import { exit } from "@tauri-apps/plugin-process";

export type UpdateManagerStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "relaunching"
  | "error";

export interface UpdateDownloadProgress {
  contentLength: number;
  downloaded: number;
  percent: number;
}

export interface UpdateDownloadState {
  status: UpdateManagerStatus;
  progress: UpdateDownloadProgress;
  errorMsg: string;
  version: string;
  currentVersion: string;
  update: Update | null;
  manualDownloadUrl?: string;
  isModalVisible: boolean;
  showBackgroundNotice: boolean;
  showAppCloseWarning: boolean;
  /** True when the download should finish quietly and wait for a restart. */
  runInBackground: boolean;
  /** The "ready to restart" banner was hidden with "Later". */
  readyBannerDismissed: boolean;
}

const initialState: UpdateDownloadState = {
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

/** Tell the Rust window handler whether closing must go through JS first. */
async function setNativeCloseGuard(active: boolean): Promise<void> {
  try {
    if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("set_update_close_guard", { active });
  } catch {
    // Older native shell without the command — closing still works.
  }
}

class UpdateDownloadManager {
  private state: UpdateDownloadState = { ...initialState };
  private listeners: Set<(state: UpdateDownloadState) => void> = new Set();
  private prepared: PreparedUpdate | null = null;
  private closeGuardActive = false;

  public getState(): UpdateDownloadState {
    return this.state;
  }

  public subscribe(listener: (state: UpdateDownloadState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<UpdateDownloadState>): void {
    this.state = { ...this.state, ...partial };
    this.syncCloseGuard();
    this.notify();
  }

  private syncCloseGuard(): void {
    const needsGuard = this.isBusy() || this.state.status === "ready";
    if (needsGuard === this.closeGuardActive) return;
    this.closeGuardActive = needsGuard;
    void setNativeCloseGuard(needsGuard);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (err) {
        console.error("[UpdateDownloadManager] Listener error:", err);
      }
    }
  }

  public isBusy(): boolean {
    return (
      this.state.status === "downloading" ||
      this.state.status === "installing" ||
      this.state.status === "relaunching"
    );
  }

  /** An update is downloaded and waiting for a restart. */
  public isReady(): boolean {
    return this.state.status === "ready" && this.prepared !== null;
  }

  public registerAvailableUpdate(
    update: Update | null,
    version: string,
    currentVersion: string,
    manualDownloadUrl?: string,
    autoShowModal = false,
  ): void {
    // Never replace an in-flight or already-downloaded update.
    if (this.isBusy() || this.state.status === "ready") return;
    this.updateState({
      update,
      version: version || this.state.version,
      currentVersion: currentVersion || this.state.currentVersion,
      manualDownloadUrl: manualDownloadUrl ?? this.state.manualDownloadUrl,
      status: "available",
      isModalVisible: autoShowModal ? true : this.state.isModalVisible,
    });
  }

  public openModal(): void {
    this.updateState({ isModalVisible: true });
  }

  public dismissModal(): void {
    if (this.state.status === "downloading") {
      // Closing the dialog while downloading keeps the download going and
      // waits for a restart instead of restarting automatically.
      this.continueInBackground();
      return;
    }
    this.updateState({ isModalVisible: false });
  }

  /** Move an active download to the background (no automatic restart). */
  public continueInBackground(): void {
    this.updateState({
      runInBackground: true,
      isModalVisible: false,
      showBackgroundNotice: this.state.status === "downloading",
    });
  }

  public closeBackgroundNotice(): void {
    this.updateState({ showBackgroundNotice: false });
  }

  public showAppCloseWarning(): void {
    this.updateState({ showAppCloseWarning: true });
  }

  public cancelAppClose(): void {
    this.updateState({ showAppCloseWarning: false });
  }

  public async confirmAppClose(): Promise<void> {
    this.updateState({ showAppCloseWarning: false });
    await setNativeCloseGuard(false);
    this.closeGuardActive = false;
    try {
      await exit(0);
    } catch {
      window.close();
    }
  }

  /** Hide the "ready to restart" banner; the update installs when the app quits. */
  public dismissReadyBanner(): void {
    this.updateState({ readyBannerDismissed: true });
  }

  /**
   * Download the update. In the foreground ("Update Now") it installs and
   * restarts as soon as the download finishes. In the background it stops at
   * "ready" and waits for "Restart now" or for the app to be quit.
   */
  public async startDownload(
    customUpdate?: Update | null,
    customVersion?: string,
    options: { background?: boolean } = {},
  ): Promise<void> {
    if (this.isBusy()) return;
    if (this.isReady()) {
      if (!options.background) await this.installNow();
      return;
    }

    const targetUpdate = customUpdate !== undefined ? customUpdate : this.state.update;
    const targetVersion = customVersion || this.state.version;
    const background = Boolean(options.background);

    this.prepared = null;
    this.updateState({
      status: "downloading",
      errorMsg: "",
      progress: { contentLength: 0, downloaded: 0, percent: 0 },
      version: targetVersion,
      update: targetUpdate ?? null,
      runInBackground: background,
      readyBannerDismissed: false,
      isModalVisible: background ? false : this.state.isModalVisible,
    });

    let prepared: PreparedUpdate;
    try {
      prepared = await downloadVerifiedUpdate(
        targetUpdate ?? undefined,
        (progress: DownloadProgress) => {
          const percent =
            progress.contentLength > 0
              ? Math.min(100, Math.round((progress.downloaded / progress.contentLength) * 100))
              : 0;
          this.updateState({
            progress: {
              contentLength: progress.contentLength,
              downloaded: progress.downloaded,
              percent,
            },
          });
        },
      );
    } catch (err: any) {
      console.error("[UpdateDownloadManager] Download failed:", err);
      this.updateState({
        status: "error",
        errorMsg: err?.message || "Update failed. Please try again.",
      });
      return;
    }

    this.prepared = prepared;
    this.updateState({
      status: "ready",
      version: prepared.version || targetVersion,
      progress: { ...this.state.progress, percent: 100 },
      showBackgroundNotice: false,
    });

    if (!this.state.runInBackground) {
      await this.installNow();
    }
  }

  /** Install the downloaded update and restart MakeChurchEasy. */
  public async installNow(): Promise<void> {
    const prepared = this.prepared;
    if (!prepared || this.isBusy()) return;
    try {
      await prepared.install({
        relaunch: true,
        onStatusChange: (status) => this.updateState({ status }),
      });
    } catch (err: any) {
      console.error("[UpdateDownloadManager] Install failed:", err);
      this.prepared = null;
      this.updateState({
        status: "error",
        errorMsg: err?.message || "The update could not be installed. Please try again.",
      });
    }
  }

  /**
   * Called when the app is closing. Installs a downloaded update without
   * restarting. Returns true when an install ran (on Windows the installer
   * quits this process itself).
   */
  public async installOnQuit(): Promise<boolean> {
    const prepared = this.prepared;
    if (!prepared || this.state.status !== "ready") return false;
    try {
      await prepared.install({
        relaunch: false,
        onStatusChange: (status) => {
          if (status === "installing") this.updateState({ status });
        },
      });
      return true;
    } catch (err) {
      console.warn("[UpdateDownloadManager] Install on quit failed:", err);
      return false;
    }
  }

  public retry(): void {
    this.prepared = null;
    this.updateState({
      status: "available",
      progress: { contentLength: 0, downloaded: 0, percent: 0 },
      errorMsg: "",
      isModalVisible: true,
      runInBackground: false,
    });
  }
}

export const updateDownloadManager = new UpdateDownloadManager();

export function useUpdateDownload(): UpdateDownloadState {
  const [state, setState] = useState<UpdateDownloadState>(() =>
    updateDownloadManager.getState(),
  );

  useEffect(() => {
    return updateDownloadManager.subscribe(setState);
  }, []);

  return state;
}
