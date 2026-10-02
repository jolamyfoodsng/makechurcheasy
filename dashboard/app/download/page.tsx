"use client";

import {
  CheckCircle,
  Command,
  Download,
  ExternalLink,
  Loader2,
  Monitor,
  Server,
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  Laptop,
  Check,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MarketingHeader, MarketingFooter } from "../marketing-shell";
import styles from "../homepage.module.css";

type DetectedOS = "mac" | "windows" | "unsupported";
type MacArch = "arm64" | "x64" | null;

interface GitHubAsset {
  name: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  assets: GitHubAsset[];
  published_at: string;
}

type DownloadStatus = "idle" | "downloading" | "downloaded" | "error";
type PlatformKey = "windows" | "macos-silicon" | "macos-intel";

function detectOS(): { os: DetectedOS; arch: MacArch } {
  if (typeof window === "undefined") return { os: "mac", arch: "arm64" };
  const ua = navigator.userAgent;
  if (/mac os/i.test(ua)) {
    const navAny = navigator as any;
    const uaDataArch = navAny.userAgentData?.architecture?.toLowerCase?.();
    if (uaDataArch === "arm") return { os: "mac", arch: "arm64" };
    if (uaDataArch === "x86") return { os: "mac", arch: "x64" };
    if (/arm64|aarch64/i.test(ua)) return { os: "mac", arch: "arm64" };
    return { os: "mac", arch: "arm64" };
  }
  if (/windows/i.test(ua)) return { os: "windows", arch: null };
  return { os: "unsupported", arch: null };
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

const REPO_URL = "https://github.com/jolamyfoodsng/makechurcheasy-releases/releases";

function getPlatformKey(filename: string): PlatformKey | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".exe")) return "windows";
  if (lower.includes("aarch64") || lower.includes("arm64")) return "macos-silicon";
  if (lower.includes("x64") || lower.includes("x86_64")) return "macos-intel";
  if (lower.endsWith(".dmg")) return "macos-silicon";
  return null;
}

function assetPriority(filename: string): number {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".dmg")) return 10;
  if (lower.endsWith(".app.tar.gz")) return 5;
  if (lower.endsWith(".exe")) return 10;
  return 0;
}

interface PlatformInfo {
  key: PlatformKey;
  label: string;
  subtitle: string;
  icon: typeof Monitor | typeof Command | typeof Server;
  asset: GitHubAsset;
}

const PLATFORM_LABELS: Record<
  PlatformKey,
  { label: string; subtitle: string; icon: typeof Monitor | typeof Command | typeof Server }
> = {
  "macos-silicon": { label: "macOS (Apple Silicon)", subtitle: "M1 / M2 / M3 / M4 Macs", icon: Command },
  windows: { label: "Windows", subtitle: "Windows 10 / 11 (64-bit)", icon: Monitor },
  "macos-intel": { label: "macOS (Intel)", subtitle: "Intel-based Macs", icon: Server },
};

function buildPlatforms(assets: GitHubAsset[]): PlatformInfo[] {
  const best = new Map<PlatformKey, { asset: GitHubAsset; priority: number }>();
  for (const asset of assets) {
    const key = getPlatformKey(asset.name);
    if (!key) continue;
    const priority = assetPriority(asset.name);
    const existing = best.get(key);
    if (
      !existing ||
      priority > existing.priority ||
      (priority === existing.priority && asset.size > existing.asset.size)
    ) {
      best.set(key, { asset, priority });
    }
  }
  return Array.from(best.entries()).map(([key, { asset }]) => ({
    key,
    ...PLATFORM_LABELS[key],
    asset,
  }));
}

export default function DownloadPage() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DownloadStatus>("idle");
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [installTab, setInstallTab] = useState<"mac" | "win">("mac");

  const [detected, setDetected] = useState<{ os: DetectedOS; arch: MacArch }>(detectOS);

  useEffect(() => {
    const navAny = navigator as any;
    if (navAny.userAgentData?.getHighEntropyValues) {
      navAny.userAgentData
        .getHighEntropyValues(["architecture"])
        .then((hints: any) => {
          if (hints?.architecture === "x86") {
            setDetected((prev) => (prev.os === "mac" ? { os: "mac", arch: "x64" } : prev));
          } else if (hints?.architecture === "arm") {
            setDetected((prev) => (prev.os === "mac" ? { os: "mac", arch: "arm64" } : prev));
          }
        })
        .catch(() => {});
    }

    if (detected.os === "windows") {
      setInstallTab("win");
    }

    fetch("/api/releases/latest", {
      headers: { Accept: "application/json" },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load release info (${r.status})`);
        return r.json();
      })
      .then((data: GitHubRelease) => {
        setRelease(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch release:", err);
        setError("Could not load release information. Please try again later.");
        setLoading(false);
      });
  }, [detected.os]);

  const version = release?.tag_name?.replace(/^v/, "") ?? "";
  const platforms = useMemo(() => (release ? buildPlatforms(release.assets) : []), [release]);

  const windowsAsset = platforms.find((p) => p.key === "windows")?.asset;
  const macArmAsset = platforms.find((p) => p.key === "macos-silicon")?.asset;
  const macIntelAsset = platforms.find((p) => p.key === "macos-intel")?.asset;

  const primaryAsset =
    detected.os === "mac"
      ? detected.arch === "arm64"
        ? macArmAsset || macIntelAsset
        : macIntelAsset || macArmAsset
      : detected.os === "windows"
      ? windowsAsset
      : undefined;

  function handleDownload(asset?: GitHubAsset) {
    const target = asset || primaryAsset;
    if (!target) return;
    setStatus("downloading");
    const a = document.createElement("a");
    a.href = `/api/releases/download/${encodeURIComponent(target.name)}`;
    a.download = target.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setStatus("downloaded"), 1000);
  }

  const primaryLabel =
    detected.os === "mac"
      ? `Download for Mac${detected.arch === "arm64" ? " (Apple Silicon)" : " (Intel)"}`
      : detected.os === "windows"
      ? "Download for Windows"
      : "Download MakeChurchEasy";

  return (
    <div className={`${styles.home} min-h-screen flex flex-col bg-[#F8FAFC]`}>
      <MarketingHeader />

      <main className="flex-1 py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ─── Hero Section ─── */}
          <div className="text-center max-w-3xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200/80 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-blue-700 mb-4">
              <Sparkles size={13} className="text-blue-600" />
              <span>Native OBS Studio Dock · Free Download</span>
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0F172A] tracking-tight leading-[1.1] mb-5">
              Download MakeChurchEasy
            </h1>
            <p className="text-lg sm:text-xl text-[#475569] leading-relaxed">
              Bible presentation, worship lyrics, live media, and AI scripture detection — all unified directly inside OBS Studio. No account required to download.
            </p>
          </div>

          {/* ─── Primary Download Card (Wide Hero Banner) ─── */}
          <div className="bg-white border border-[#E2E8F0] rounded-3xl p-8 md:p-10 shadow-sm mb-12">
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
              {/* Left Column: CTA & Details */}
              <div className="flex-1 text-center lg:text-left space-y-3">
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200/80 rounded-full px-3 py-1">
                  <CheckCircle size={13} />
                  <span>Latest Stable Release {version ? `v${version}` : ""}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold text-[#0F172A]">
                  Ready for your next service
                </h2>
                <p className="text-sm sm:text-base text-[#64748B] max-w-xl">
                  Get the complete church presentation dock. Connects seamlessly with OBS Studio, supports multi-monitor output, and works with dual displays.
                </p>
                <div className="flex flex-wrap items-center justify-center lg:justify-start gap-x-6 gap-y-2 pt-2 text-xs text-[#64748B]">
                  <span>Already have the app? <Link href="/login" className="font-semibold text-blue-600 hover:underline">Log in</Link></span>
                  <span>·</span>
                  <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline inline-flex items-center gap-1">
                    Release notes on GitHub <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {/* Right Column: Download Button & Status */}
              <div className="w-full lg:w-auto shrink-0 flex flex-col items-center">
                {loading && (
                  <div className="flex items-center gap-2 text-sm text-[#64748B] py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
                    <span>Checking for latest version...</span>
                  </div>
                )}

                {error && (
                  <div className="text-center space-y-3">
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">
                      {error}
                    </div>
                    <button
                      onClick={() => window.location.reload()}
                      className="text-xs font-semibold text-blue-600 hover:underline"
                    >
                      Retry download
                    </button>
                  </div>
                )}

                {!loading && !error && (
                  <div className="w-full sm:w-auto text-center">
                    <button
                      onClick={() => handleDownload(primaryAsset)}
                      disabled={!primaryAsset || status === "downloading"}
                      className="w-full sm:w-auto min-w-[300px] bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-600 hover:from-blue-800 hover:to-indigo-700 text-white font-bold text-base px-8 py-4 rounded-2xl shadow-md hover:shadow-xl transition-all transform hover:-translate-y-0.5 flex items-center justify-center gap-3 disabled:opacity-60 disabled:cursor-not-allowed group cursor-pointer"
                    >
                      {status === "downloading" ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Download className="h-5 w-5 group-hover:-translate-y-0.5 transition-transform" />
                      )}
                      <span>{status === "downloading" ? "Starting download..." : primaryLabel}</span>
                    </button>

                    {version && primaryAsset && (
                      <p className="text-xs text-[#64748B] mt-3 font-medium">
                        Version {version}
                        {primaryAsset.size > 0 && <> · {formatSize(primaryAsset.size)}</>}
                        {" · "}{detected.os === "mac" ? ".dmg" : ".exe"}
                        {" · "}Free
                      </p>
                    )}
                  </div>
                )}

                {status === "downloaded" && (
                  <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800 flex items-center gap-2 max-w-sm text-left">
                    <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                    <span>Download started! Run installer, then open OBS Studio.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Platform Selection Cards Grid */}
            {platforms.length > 0 && (
              <div className="mt-10 pt-8 border-t border-[#E2E8F0]">
                <div className="text-xs font-bold uppercase tracking-wider text-[#475569] mb-4 text-center lg:text-left">
                  Or select your operating system
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {platforms.map((p) => {
                    const isSelected = selectedPlatform === p.key;
                    return (
                      <button
                        key={p.key}
                        onClick={() => {
                          setSelectedPlatform(p.key);
                          handleDownload(p.asset);
                        }}
                        className={`flex items-start gap-3.5 p-4 rounded-2xl border text-left transition-all group ${
                          isSelected
                            ? "border-blue-600 bg-blue-50/50 shadow-sm"
                            : "border-[#E2E8F0] bg-white hover:border-blue-300 hover:bg-[#F8FAFC]"
                        }`}
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 group-hover:bg-blue-100 text-[#334155] group-hover:text-blue-700 transition-colors">
                          <p.icon className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#0F172A] group-hover:text-blue-700 transition-colors truncate">
                            {p.label}
                          </p>
                          <p className="text-xs text-[#64748B] mt-0.5">{p.subtitle}</p>
                          {p.asset && p.asset.size > 0 && (
                            <p className="text-[11px] font-semibold text-blue-600 mt-2 flex items-center gap-1">
                              <Download size={11} /> {formatSize(p.asset.size)}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ─── 2-Column Content Layout (7 cols + 5 cols) ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* ─── Left Column (7 cols): Installation & Troubleshooting ─── */}
            <div className="lg:col-span-7 space-y-8">
              {/* Installation Guide */}
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-[#0F172A]">Installation Guide</h3>
                    <p className="text-xs text-[#64748B] mt-0.5">Quick setup steps to get running in under 2 minutes</p>
                  </div>
                  {/* OS Switcher Tabs */}
                  <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setInstallTab("mac")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        installTab === "mac"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Command size={13} />
                      macOS
                    </button>
                    <button
                      type="button"
                      onClick={() => setInstallTab("win")}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        installTab === "win"
                          ? "bg-white text-slate-900 shadow-sm"
                          : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <Monitor size={13} />
                      Windows
                    </button>
                  </div>
                </div>

                {installTab === "mac" ? (
                  <ol className="space-y-4 text-sm text-[#334155]">
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        1
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Open the downloaded file</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          Double-click the downloaded <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs text-slate-800 border border-slate-200">.dmg</code> image.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        2
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Drag to Applications</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          Drag the MakeChurchEasy icon into your macOS Applications folder.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        3
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Gatekeeper notice (if prompted)</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          If macOS prompts for permission, go to <strong>System Settings &gt; Privacy &amp; Security</strong> and click <strong>Open Anyway</strong>.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        4
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Launch &amp; connect to OBS</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          Launch MakeChurchEasy. It will detect OBS Studio and configure the presentation dock automatically.
                        </p>
                      </div>
                    </li>
                  </ol>
                ) : (
                  <ol className="space-y-4 text-sm text-[#334155]">
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        1
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Run the setup installer</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          Open the downloaded <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs text-slate-800 border border-slate-200">.exe</code> installer from your browser or Downloads folder.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        2
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Windows SmartScreen</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          If the SmartScreen prompt appears, click <strong>More info</strong>, then select <strong>Run anyway</strong>.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        3
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Complete installation</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          Follow the setup wizard. MakeChurchEasy will place a shortcut on your desktop and Start Menu.
                        </p>
                      </div>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                        4
                      </span>
                      <div>
                        <p className="font-semibold text-[#0F172A]">Launch &amp; connect to OBS</p>
                        <p className="text-xs text-[#64748B] mt-0.5">
                          Start MakeChurchEasy alongside OBS Studio to start projecting Bible passages and worship setlists.
                        </p>
                      </div>
                    </li>
                  </ol>
                )}
              </div>

              {/* Troubleshooting Card */}
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <HelpCircle size={20} className="text-blue-600" />
                  <h3 className="text-xl font-bold text-[#0F172A]">Troubleshooting &amp; FAQ</h3>
                </div>

                <div className="space-y-5 text-sm">
                  <div className="border-b border-[#F1F5F9] pb-4">
                    <h4 className="font-bold text-[#0F172A] mb-1">Download blocked by browser?</h4>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      Chrome or Edge may flag new software releases. Choose “Keep” or download directly from our{" "}
                      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-semibold hover:underline">
                        GitHub Releases
                      </a>.
                    </p>
                  </div>

                  <div className="border-b border-[#F1F5F9] pb-4">
                    <h4 className="font-bold text-[#0F172A] mb-1">OBS WebSocket connection failed?</h4>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      Inside OBS Studio, navigate to <strong>Tools &gt; WebSocket Server Settings</strong> and ensure the server is enabled (default port 4455).
                    </p>
                  </div>

                  <div className="border-b border-[#F1F5F9] pb-4">
                    <h4 className="font-bold text-[#0F172A] mb-1">Can I use MakeChurchEasy on multiple computers?</h4>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      Yes! You can install MakeChurchEasy on your media booth Mac, backup Windows laptop, and home preparation computer with cloud sync.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-[#0F172A] mb-1">Need live assistance?</h4>
                    <p className="text-xs sm:text-sm text-[#64748B] leading-relaxed">
                      Our church tech team is available at{" "}
                      <a href="mailto:support@makechurcheazy.com" className="text-blue-600 font-semibold hover:underline">
                        support@makechurcheazy.com
                      </a>{" "}
                      or browse our{" "}
                      <Link href="/tutorials" className="text-blue-600 font-semibold hover:underline">
                        step-by-step video tutorials
                      </Link>.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ─── Right Column (5 cols): Requirements & OBS Companion ─── */}
            <div className="lg:col-span-5 space-y-8">
              {/* System Requirements Card */}
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <ShieldCheck size={20} className="text-blue-600" />
                  <h3 className="text-lg font-bold text-[#0F172A]">System Requirements</h3>
                </div>

                <ul className="space-y-3">
                  {[
                    { label: "Operating System", value: "Windows 10 / 11 or macOS 13+ (Ventura, Sonoma, Sequoia)" },
                    { label: "Memory (RAM)", value: "4 GB minimum (8 GB recommended for video)" },
                    { label: "Disk Space", value: "500 MB free space for local Bibles & themes" },
                    { label: "OBS Studio", value: "OBS Studio 30.0 or later recommended" },
                    { label: "Network", value: "Required for cloud sync, AI detection, and activation" },
                  ].map((r) => (
                    <li key={r.label} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#334155] border-b border-[#F8FAFC] pb-2 last:border-b-0">
                      <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-[#0F172A] block font-semibold">{r.label}</strong>
                        <span className="text-[#64748B]">{r.value}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Supported Platforms Overview */}
              <div className="bg-white border border-[#E2E8F0] rounded-3xl p-6 sm:p-8 shadow-sm">
                <h3 className="text-lg font-bold text-[#0F172A] mb-4">Supported Platforms</h3>
                <div className="space-y-3.5">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Monitor size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0F172A]">Windows 64-bit</p>
                      <p className="text-xs text-[#64748B]">Windows 10 and Windows 11</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                      <Command size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0F172A]">macOS Apple Silicon</p>
                      <p className="text-xs text-[#64748B]">Native arm64 for M1, M2, M3, M4</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <Server size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#0F172A]">macOS Intel</p>
                      <p className="text-xs text-[#64748B]">Intel-based Mac computers</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* OBS Studio Companion Box */}
              <div className="rounded-3xl border border-blue-100 bg-gradient-to-br from-blue-50/80 to-indigo-50/60 p-6 sm:p-8 text-[#0F172A]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-700">
                  OBS COMPANION
                </span>
                <h4 className="text-base font-bold text-[#0F172A] mt-1 mb-2">
                  Need OBS Studio?
                </h4>
                <p className="text-xs text-[#64748B] leading-relaxed mb-4">
                  MakeChurchEasy integrates directly into OBS Studio. If your media computer doesn’t have OBS installed yet, get it free from the official project.
                </p>
                <a
                  href="https://obsproject.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-white border border-blue-200 px-4 py-2 text-xs font-bold text-blue-700 hover:bg-blue-50 transition w-full shadow-sm"
                >
                  <span>Download OBS Studio</span>
                  <ExternalLink size={12} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>

      <MarketingFooter />
    </div>
  );
}
