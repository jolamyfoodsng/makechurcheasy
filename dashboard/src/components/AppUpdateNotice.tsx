"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, LogOut, Timer } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tells a signed-in user that their MakeChurchEasy desktop app must be updated.
 *
 * It only appears when the admin has forced updates on AND one of the user's
 * registered computers reports a version below the minimum, so up-to-date users
 * never see it.
 *
 *   - A bar under the top bar: "N days left · Update now" (red in the last 24 hours).
 *   - Last 24 hours: a modal opens, but it can be closed; the bar stays.
 *   - Last 30 minutes and after the deadline: the modal cannot be closed.
 */

const DEFAULT_DOWNLOAD_URL = "https://makechurcheazy.com/download";
const FINAL_DAY_MS = 24 * 3_600_000;
const LOCK_WINDOW_MS = 30 * 60_000;
const REFETCH_MS = 5 * 60_000;

type Platform = "windows" | "mac" | "linux";

interface AppUpdateStatus {
  needsUpdate: boolean;
  minimumVersion?: string;
  latestVersion?: string;
  message?: string;
  releaseNotesUrl?: string;
  downloadUrls?: { windows: string; mac: string; linux: string };
  deadlineAt?: string | null;
  expired?: boolean;
  serverTime?: string;
  devices?: { name: string; version: string; platform: string }[];
}

function platformFromText(text: string): Platform | null {
  const value = text.toLowerCase();
  if (value.includes("win")) return "windows";
  if (value.includes("mac") || value.includes("darwin") || value.includes("os x")) return "mac";
  if (value.includes("linux") || value.includes("ubuntu")) return "linux";
  return null;
}

function pickDownloadUrl(status: AppUpdateStatus): string {
  const urls = status.downloadUrls;
  if (!urls) return DEFAULT_DOWNLOAD_URL;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const onPhone = /Android|iPhone|iPad|iPod/i.test(ua);
  // A phone cannot install the desktop app, so use the computer that is out of date.
  const platform =
    (onPhone ? null : platformFromText(ua)) ??
    platformFromText(status.devices?.[0]?.platform ?? "") ??
    null;

  return (
    (platform ? urls[platform] : "") ||
    urls.windows ||
    urls.mac ||
    urls.linux ||
    DEFAULT_DOWNLOAD_URL
  );
}

function formatLeft(msLeft: number): string {
  if (msLeft <= 0) return "Update required now";
  if (msLeft > FINAL_DAY_MS) {
    const days = Math.ceil(msLeft / (24 * 3_600_000));
    return `${days} day${days === 1 ? "" : "s"} left`;
  }
  const totalMinutes = Math.max(1, Math.ceil(msLeft / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m left`;
  return minutes > 0 ? `${hours}h ${minutes}m left` : `${hours}h left`;
}

export function AppUpdateNotice() {
  const { mongoUser, logOut } = useAuth();
  const [status, setStatus] = useState<AppUpdateStatus | null>(null);
  // server clock minus browser clock, so a wrong PC clock cannot stretch the deadline
  const offsetRef = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const downloadRef = useRef<HTMLAnchorElement | null>(null);
  const [closed, setClosed] = useState(false);

  const isAdmin = mongoUser?.role === "admin";
  const signedIn = Boolean(mongoUser);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/user/app-update-status", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as AppUpdateStatus;
      if (body.serverTime) {
        const serverMs = Date.parse(body.serverTime);
        if (Number.isFinite(serverMs)) offsetRef.current = serverMs - Date.now();
      }
      setStatus(body.needsUpdate ? body : null);
    } catch {
      // Not critical: keep whatever we showed before.
    }
  }, []);

  useEffect(() => {
    if (!signedIn || isAdmin) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), REFETCH_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [signedIn, isAdmin, refresh]);

  useEffect(() => {
    if (!status) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [status]);

  const deadlineMs = status?.deadlineAt ? Date.parse(status.deadlineAt) : NaN;
  const hasDeadline = Number.isFinite(deadlineMs);
  const msLeft = hasDeadline ? deadlineMs - (now + offsetRef.current) : 0;
  const expired = Boolean(status?.expired) || (hasDeadline && msLeft <= 0) || !hasDeadline;
  const finalDay = expired || msLeft <= FINAL_DAY_MS;
  // Only the last half hour (and after the deadline) cannot be closed.
  const locked = expired || msLeft <= LOCK_WINDOW_MS;
  const downloadUrl = useMemo(() => (status ? pickDownloadUrl(status) : ""), [status]);

  // Keep the page behind the modal still and put the keyboard on the one thing
  // the user needs to do.
  const modalOpen = Boolean(status) && (locked || (finalDay && !closed));
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    downloadRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [modalOpen]);

  if (!status || isAdmin || !signedIn) return null;

  const device = status.devices?.[0];
  const versionLine = device
    ? `${device.name} is on v${device.version}. Version v${status.minimumVersion} or newer is required.`
    : `Version v${status.minimumVersion} or newer is required.`;
  const message = status.message?.trim() || "Please update to get the latest features and fixes.";

  return (
    <>
      {!modalOpen && (
        <div
          className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-2 text-sm ${
            finalDay
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          }`}
          role="status"
        >
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className={`h-4 w-4 shrink-0 ${finalDay ? "text-red-600" : "text-amber-600"}`} />
            <span className="truncate">
              <span className="font-semibold">Update your desktop app.</span>{" "}
              <span className="hidden sm:inline">{versionLine}</span>
            </span>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Timer className="h-4 w-4" />
              {formatLeft(msLeft)}
            </span>
            <a
              href={downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold text-white transition-colors ${
                finalDay ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              Update now
            </a>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-update-title"
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl">
            <div className="flex items-center justify-between bg-red-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wide text-white">
              <span className="inline-flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {expired ? "Update required" : locked ? "Locking soon" : "Final day to update"}
              </span>
              {!expired && <span>{formatLeft(msLeft)}</span>}
            </div>
            <div className="px-6 py-5">
              <h2 id="app-update-title" className="text-lg font-semibold">
                {expired
                  ? "Your desktop app needs an update"
                  : "Update your desktop app today"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{message}</p>
              <p className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-[13px] text-slate-600">
                {versionLine}
              </p>
              <p className="mt-3 text-[13px] text-slate-500">
                {expired
                  ? "The old version has been switched off. Download the new version to keep using MakeChurchEasy."
                  : "After the countdown ends the old version stops working. Download the new version now."}
              </p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <a
                  ref={downloadRef}
                  href={downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-offset-2"
                >
                  <Download className="h-4 w-4" />
                  Update now
                </a>
                {status.releaseNotesUrl ? (
                  <a
                    href={status.releaseNotesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
                  >
                    What&apos;s new
                  </a>
                ) : null}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => void logOut()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setClosed(true)}
                    className="text-xs font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900"
                  >
                    Close for now
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
