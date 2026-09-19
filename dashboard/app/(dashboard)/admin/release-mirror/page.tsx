"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Copy,
  ExternalLink,
  Github,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type MirrorAssetResult = {
  name: string;
  size: number;
  action: "uploaded" | "replaced" | "skipped" | "would-upload" | "would-replace" | "would-skip";
  message?: string;
};

type MirrorResponse = {
  ok: boolean;
  dryRun: boolean;
  sourceRepo: string;
  targetRepo: string;
  tag: string;
  sourceReleaseUrl: string;
  targetReleaseUrl: string;
  latestManifestUrl: string;
  assets: MirrorAssetResult[];
  logs: string[];
};

const DEFAULT_SOURCE_REPO = "jolamyfoodsng/makechurcheasy";
const DEFAULT_TARGET_REPO = "jolamyfoodsng/makechurcheasy-releases";

function formatBytes(size: number): string {
  if (!Number.isFinite(size) || size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function actionLabel(action: MirrorAssetResult["action"]): string {
  switch (action) {
    case "uploaded":
      return "Uploaded";
    case "replaced":
      return "Replaced";
    case "skipped":
      return "Skipped";
    case "would-upload":
      return "Would upload";
    case "would-replace":
      return "Would replace";
    case "would-skip":
      return "Would skip";
  }
}

function actionClass(action: MirrorAssetResult["action"]): string {
  if (action === "uploaded" || action === "replaced") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (action.startsWith("would")) return "bg-blue-50 text-blue-700 border-blue-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

export default function AdminReleaseMirrorPage() {
  const [sourceRepo, setSourceRepo] = useState(DEFAULT_SOURCE_REPO);
  const [targetRepo, setTargetRepo] = useState(DEFAULT_TARGET_REPO);
  const [tag, setTag] = useState("latest");
  const [token, setToken] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [busyMode, setBusyMode] = useState<"mirror" | "check" | null>(null);
  const [result, setResult] = useState<MirrorResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const totalSize = useMemo(
    () => result?.assets.reduce((sum, asset) => sum + asset.size, 0) ?? 0,
    [result],
  );

  const runMirror = async (dryRun: boolean) => {
    setBusyMode(dryRun ? "check" : "mirror");
    setError(null);
    setCopied(false);

    try {
      const res = await fetch("/admin/release-mirror/action", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceRepo,
          targetRepo,
          tag,
          token,
          replaceExisting,
          dryRun,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Release mirror failed");
      setResult(body as MirrorResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release mirror failed");
    } finally {
      setBusyMode(null);
    }
  };

  const copyManifestUrl = async () => {
    if (!result?.latestManifestUrl) return;
    await navigator.clipboard.writeText(result.latestManifestUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <UploadCloud className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Admin Release Tool</p>
            <h1 className="text-2xl font-semibold text-slate-950">Release Mirror</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Copy a release from the app repo into the updater release repo without rebuilding or redeploying.
            </p>
          </div>
        </div>
        <a
          href={`https://github.com/${targetRepo}/releases`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Github className="h-4 w-4" />
          Target releases
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {error && (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-semibold text-slate-950">Mirror setup</h2>
            <p className="mt-1 text-sm text-slate-600">
              Use <span className="font-semibold text-slate-900">latest</span> to mirror the newest published release, or enter a tag like <span className="font-semibold text-slate-900">v3.0.0</span>.
            </p>
          </div>

          <div className="grid gap-5 p-5">
            <div className="grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-end">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">From</span>
                <input
                  value={sourceRepo}
                  onChange={(event) => setSourceRepo(event.target.value)}
                  className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <div className="hidden h-11 items-center justify-center text-slate-400 md:flex">
                <ArrowRight className="h-5 w-5" />
              </div>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">To</span>
                <input
                  value={targetRepo}
                  onChange={(event) => setTargetRepo(event.target.value)}
                  className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Release tag</span>
                <input
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder="latest or v3.0.0"
                  className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">GitHub token override</span>
                <input
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  type="password"
                  placeholder="Optional. Leave empty to use gh login or RELEASE_MIRROR_GITHUB_TOKEN."
                  className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
              </label>
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(event) => setReplaceExisting(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Replace existing assets with the same filename</span>
                <span className="mt-0.5 block text-xs leading-5 text-slate-600">
                  Keep this on for updater releases, especially <span className="font-semibold">latest.json</span>, so the target repo points to the newest downloads.
                </span>
              </span>
            </label>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void runMirror(false)}
                disabled={busyMode !== null}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyMode === "mirror" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                Mirror release
              </button>
              <button
                type="button"
                onClick={() => void runMirror(true)}
                disabled={busyMode !== null}
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busyMode === "check" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Dry check
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
              <ShieldCheck className="h-4 w-4 text-blue-700" />
              Local access
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The token never goes into client code. The server uses <span className="font-semibold">RELEASE_MIRROR_GITHUB_TOKEN</span>, <span className="font-semibold">UPDATER_GITHUB_TOKEN</span>, your local GitHub CLI login, or the one-time token you paste above.
            </p>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Important
            </div>
            This copies release assets. It does not build the desktop app. Run the release workflow first, then mirror the completed release here.
          </div>
        </aside>
      </div>

      {result && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 p-5">
            <div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={cn("h-5 w-5", result.dryRun ? "text-blue-700" : "text-emerald-600")} />
                <h2 className="text-lg font-semibold text-slate-950">
                  {result.dryRun ? "Dry check complete" : `Mirrored ${result.tag}`}
                </h2>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {result.assets.length} assets checked, total source size {formatBytes(totalSize)}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={result.targetReleaseUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open target
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => void copyManifestUrl()}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy manifest URL"}
              </button>
            </div>
          </div>

          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_300px]">
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <div className="grid grid-cols-[1fr_120px_120px] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                <span>Asset</span>
                <span>Size</span>
                <span>Status</span>
              </div>
              <div className="divide-y divide-slate-100">
                {result.assets.map((asset) => (
                  <div key={asset.name} className="grid grid-cols-[1fr_120px_120px] items-center gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{asset.name}</p>
                      {asset.message && <p className="mt-0.5 text-xs text-slate-500">{asset.message}</p>}
                    </div>
                    <span className="text-slate-500">{formatBytes(asset.size)}</span>
                    <span className={cn("w-fit rounded-full border px-2 py-1 text-xs font-bold", actionClass(asset.action))}>
                      {actionLabel(asset.action)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Run log</p>
              <div className="mt-3 space-y-2">
                {result.logs.map((log, index) => (
                  <div key={`${log}-${index}`} className="rounded-md bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
