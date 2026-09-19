/**
 * updateDownloadManager.ts
 *
 * Centralized singleton managing update download lifecycle across:
 * - UpdateNotification modal
 * - Top downloading banner (when dismissed to background)
 * - MVSettings About/Updates section
 * - App close prevention during active download
 */

import { useState, useEffect } from "react";
import type { Update } from "@tauri-apps/plugin-updater";
import {
  downloadAndInstallVerifiedUpdate,
  type DownloadProgress,
} from "./updateService";
import { exit } from "@tauri-apps/plugin-process";

export type UpdateManagerStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
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
};

class UpdateDownloadManager {
  private state: UpdateDownloadState = { ...initialState };
  private listeners: Set<(state: UpdateDownloadState) => void> = new Set();

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
    this.notify();
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

  public registerAvailableUpdate(
    update: Update | null,
    version: string,
    currentVersion: string,
    manualDownloadUrl?: string,
    autoShowModal = false,
  ): void {
    if (this.isBusy()) return;
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
    if (this.isBusy()) {
      // User closed modal while download is in progress:
      // Hide modal and show background notice modal
      this.updateState({
        isModalVisible: false,
        showBackgroundNotice: true,
      });
    } else {
      this.updateState({ isModalVisible: false });
    }
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
    try {
      await exit(0);
    } catch {
      window.close();
    }
  }

  public async startDownload(customUpdate?: Update | null, customVersion?: string): Promise<void> {
    if (this.isBusy()) return;

    const targetUpdate = customUpdate !== undefined ? customUpdate : this.state.update;
    const targetVersion = customVersion || this.state.version;

    this.updateState({
      status: "downloading",
      errorMsg: "",
      progress: { contentLength: 0, downloaded: 0, percent: 0 },
      version: targetVersion,
      update: targetUpdate ?? null,
    });

    try {
      await downloadAndInstallVerifiedUpdate(
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
        (status: "downloading" | "installing" | "relaunching") => {
          this.updateState({ status });
        },
      );
    } catch (err: any) {
      console.error("[UpdateDownloadManager] Download failed:", err);
      this.updateState({
        status: "error",
        errorMsg: err?.message || "Update failed. Please try again.",
      });
    }
  }

  public retry(): void {
    this.updateState({
      status: "available",
      progress: { contentLength: 0, downloaded: 0, percent: 0 },
      errorMsg: "",
      isModalVisible: true,
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
