"use client";

import {
  CheckCircle,
  Command,
  Download,
  ExternalLink,
  Loader2,
  Monitor,
  Server,
  X
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  if (typeof window === "undefined") return { os: "mac", arch: null };
  const ua = navigator.userAgent;
  if (/mac os/i.test(ua)) {
    const arch = /arm64|aarch64/i.test(navigator.userAgent) ? "arm64" : "x64";
    return { os: "mac", arch: arch as MacArch };
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
  if (lower.includes("aarch64")) return "macos-silicon";
  if (lower.includes("x64")) return "macos-intel";
  if (lower.endsWith(".dmg")) return "macos-intel";
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

const PLATFORM_LABELS: Record<PlatformKey, { label: string; subtitle: string; icon: typeof Monitor | typeof Command | typeof Server }> = {
  windows: { label: "Windows", subtitle: "Windows 10 (64-bit) or later", icon: Monitor },
  "macos-silicon": { label: "macOS \u2014 Apple Silicon", subtitle: "M1 / M2 / M3 / M4", icon: Command },
  "macos-intel": { label: "macOS \u2014 Intel", subtitle: "Intel-based Macs", icon: Server },
};

function buildPlatforms(assets: GitHubAsset[]): PlatformInfo[] {
  const best = new Map<PlatformKey, { asset: GitHubAsset; priority: number }>();
  for (const asset of assets) {
    const key = getPlatformKey(asset.name);
    if (!key) continue;
    const priority = assetPriority(asset.name);
    const existing = best.get(key);
    if (!existing || priority > existing.priority || (priority === existing.priority && asset.size > existing.asset.size)) {
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

  const detected = detectOS();

  useEffect(() => {
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
  }, []);

  const version = release?.tag_name?.replace(/^v/, "") ?? "";

  const platforms = useMemo(() => release ? buildPlatforms(release.assets) : [], [release]);

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
      : "Download";

  return (
    <div className="bg-[#F8FAFC] text-[#0F172A] antialiased min-h-screen flex flex-col selection:bg-[#1D4ED8]/15 selection:text-[#1D4ED8]" style={{ fontFamily: "Inter, -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* ─── Navbar ─── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#CBD5E1]/60">
        <div className="max-w-[1440px] mx-auto px-6 md:px-10 h-[72px] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logos/make_church_easy_logo.png" alt="MakeChurchEasy" className="h-12 w-auto" />
            <span className="text-sm font-bold text-[#0F172A] hidden sm:inline">MakeChurchEasy</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm font-semibold text-[#334155] hover:text-[#0F172A] transition-colors px-4 py-2">
              Log in
            </Link>
          </div>
        </div>
      </nav>

      <main className="pt-28 md:pt-36 pb-20 flex-1">
        <div className="max-w-3xl mx-auto px-8 md:px-10">
          {/* ─── Header ─── */}
          <div className="text-center mb-12">
            <h1 className="text-[36px] md:text-[44px] font-bold leading-[1.1] text-[#0F172A] tracking-tight mb-4">
              Download MakeChurchEasy
            </h1>
            <p className="text-base md:text-lg text-[#64748B] leading-relaxed max-w-xl mx-auto">
              Bible presentation, worship lyrics, media, and production control {"\u2014"} all inside OBS Studio. No account required to download.
            </p>
          </div>

          {/* ─── Download Card ─── */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-8 mb-12 text-center">
            {loading && (
              <div className="flex items-center justify-center gap-2 text-sm text-[#64748B] py-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking for latest version...
              </div>
            )}

            {error && (
              <div className="py-8">
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 mb-4 inline-block">
                  {error}
                </div>
                <div className="flex justify-center gap-3">
                  <button onClick={() => window.location.reload()} className="text-sm font-semibold text-[#1D4ED8] hover:underline">
                    Retry
                  </button>
                  <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[#1D4ED8] hover:underline inline-flex items-center gap-1">
                    Download from GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}

            {detected.os === "unsupported" && !loading && (
              <div className="py-8">
                <Monitor className="h-10 w-10 text-[#94A3B8] mx-auto mb-3" />
                <h2 className="text-lg font-bold text-[#0F172A] mb-1">Unsupported Operating System</h2>
                <p className="text-sm text-[#64748B] mb-4">MakeChurchEasy is available for macOS and Windows. Select a platform below or check back for future support.</p>
              </div>
            )}

            {!loading && !error && detected.os !== "unsupported" && (
              <div>
                <button
                  onClick={() => handleDownload(primaryAsset)}
                  disabled={!primaryAsset || status === "downloading"}
                  className="bg-gradient-to-r from-[#1D4ED8] to-[#7C3AED] text-white px-10 py-4 rounded-xl text-base font-bold flex items-center justify-center gap-3 mx-auto hover:shadow-lg transition-all transform hover:-translate-y-0.5 group disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                >
                  {status === "downloading" ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Download className="h-5 w-5 group-hover:-translate-y-0.5 transition-transform" />
                  )}
                  {status === "downloading" ? "Downloading\u2026" : primaryLabel}
                </button>
                {version && primaryAsset && (
                  <p className="text-xs text-[#64748B] mt-3">
                    Version {version}
                    {primaryAsset.size > 0 && (
                      <> {"\u2022"} {formatSize(primaryAsset.size)}</>
                    )}
                    {" \u2022 "}{detected.os === "mac" ? ".dmg" : ".exe"}
                  </p>
                )}
              </div>
            )}

            {status === "downloaded" && (
              <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-700 flex items-center gap-2 justify-center mt-4">
                <CheckCircle className="h-4 w-4 shrink-0" />
                Download started. Open the file to install, then launch the app to create your account or log in.
              </div>
            )}

            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
              <p className="text-[#64748B]">Already have the app? <Link href="/login" className="font-semibold text-[#1D4ED8] hover:underline">Log in</Link></p>
              <Link href="/" className="font-semibold text-[#1D4ED8] hover:underline">&larr; Back to home</Link>
            </div>
          </div>

          {/* ─── All Platforms ─── */}
          {platforms.length > 1 && (
            <div className="mb-12">
              <h2 className="text-sm font-bold text-[#0F172A] mb-4 text-center">Download for another platform</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {platforms.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => { setSelectedPlatform(p.key); handleDownload(p.asset); }}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-left ${
                      selectedPlatform === p.key
                        ? "border-[#1D4ED8] bg-[#1D4ED8]/5"
                        : "border-[#E2E8F0] bg-white hover:border-[#94A3B8] hover:bg-[#F8FAFC]"
                    }`}
                  >
                    <p.icon className="h-6 w-6 text-[#64748B]" />
                    <div className="text-center">
                      <p className="text-sm font-semibold text-[#0F172A]">{p.label}</p>
                      <p className="text-xs text-[#64748B]">{p.subtitle}</p>
                    </div>
                    {version && p.asset && p.asset.size > 0 && (
                      <p className="text-[10px] text-[#94A3B8]">{formatSize(p.asset.size)}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─── Supported OS + Requirements ─── */}
          <div className="grid md:grid-cols-2 gap-6 mb-12">
            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
              <h3 className="text-xs font-bold tracking-[0.2em] text-[#1D4ED8] uppercase mb-4">Supported OS</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Monitor className="h-4 w-4 text-[#334155]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">Windows</p>
                    <p className="text-xs text-[#64748B]">Windows 10 (64-bit) or later</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Command className="h-4 w-4 text-[#334155]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">macOS {"\u2014"} Apple Silicon</p>
                    <p className="text-xs text-[#64748B]">M1 / M2 / M3 / M4 Macs</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Server className="h-4 w-4 text-[#334155]" />
                  <div>
                    <p className="text-sm font-semibold text-[#0F172A]">macOS {"\u2014"} Intel</p>
                    <p className="text-xs text-[#64748B]">Intel-based Macs</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6">
              <h3 className="text-xs font-bold tracking-[0.2em] text-[#1D4ED8] uppercase mb-4">System Requirements</h3>
              <ul className="space-y-2">
                {[
                  { label: "OS", value: "Windows 10+ or macOS 13+" },
                  { label: "RAM", value: "4 GB minimum (8 GB recommended)" },
                  { label: "Storage", value: "500 MB available space" },
                  { label: "OBS", value: "OBS Studio 30.0 or later" },
                  { label: "Internet", value: "Required for account setup and downloads" },
                ].map((r) => (
                  <li key={r.label} className="flex items-start gap-2 text-sm text-[#334155]">
                    <CheckCircle className="h-3.5 w-3.5 text-[#22C55E] shrink-0 mt-0.5" />
                    <span><strong>{r.label}:</strong> {r.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* ─── Installation ─── */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 md:p-8 mb-8">
            <h3 className="text-xs font-bold tracking-[0.2em] text-[#1D4ED8] uppercase mb-4">Installation</h3>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-3">macOS</h4>
                <ol className="space-y-2 text-sm text-[#334155] list-decimal list-inside">
                  <li>Open the downloaded <code className="bg-[#F1F5F9] px-1.5 py-0.5 rounded text-xs">.dmg</code> file</li>
                  <li>Drag MakeChurchEasy to your Applications folder</li>
                  <li>Open MakeChurchEasy from Applications</li>
                  <li>If macOS warns about an unidentified developer, go to <strong>System Settings &gt; Privacy &amp; Security</strong> and click <strong>Open Anyway</strong></li>
                   <li>Sign in or create your account on the website</li>
                 </ol>
               </div>
               <div>
                 <h4 className="text-sm font-bold text-[#0F172A] mb-3">Windows</h4>
                 <ol className="space-y-2 text-sm text-[#334155] list-decimal list-inside">
                   <li>Open the downloaded <code className="bg-[#F1F5F9] px-1.5 py-0.5 rounded text-xs">.exe</code> installer</li>
                   <li>If Windows SmartScreen appears, click <strong>More info</strong> then <strong>Run anyway</strong></li>
                   <li>Follow the setup wizard to install the app</li>
                   <li>Launch MakeChurchEasy from the Start Menu or desktop shortcut</li>
                   <li>Sign in or create your account on the website</li>
                </ol>
              </div>
            </div>
          </div>

          {/* ─── Troubleshooting ─── */}
          <div className="bg-[#F1F5F9] border border-[#E2E8F0] rounded-2xl p-6 md:p-8">
            <h3 className="text-xs font-bold tracking-[0.2em] text-[#1D4ED8] uppercase mb-4">Troubleshooting</h3>
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1">Download is blocked</h4>
                <p className="text-sm text-[#64748B]">Try using Chrome, Firefox, or Safari. You can also download directly from our <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="text-[#1D4ED8] font-semibold hover:underline">GitHub releases page</a>.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1">App won{"\u2019"}t open after install</h4>
                <p className="text-sm text-[#64748B]">On macOS, allow the app in <strong>System Settings &gt; Privacy &amp; Security</strong>. On Windows, run the installer as Administrator.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1">OBS Studio not detected</h4>
                <p className="text-sm text-[#64748B]">Ensure OBS Studio 30.0 or later is installed and running. Download from <a href="https://obsproject.com" target="_blank" rel="noopener noreferrer" className="text-[#1D4ED8] font-semibold hover:underline">obsproject.com</a>.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1">OBS WebSocket connection failed</h4>
                <p className="text-sm text-[#64748B]">In OBS, go to <strong>Tools &gt; WebSocket Server Settings</strong> and ensure the WebSocket server is enabled. Default port is 4455.</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-[#0F172A] mb-1">Need more help?</h4>
                <p className="text-sm text-[#64748B]">Contact <a href="mailto:support@makechurcheasy.com" className="text-[#1D4ED8] font-semibold hover:underline">support@makechurcheasy.com</a>.</p>
              </div>
            </div>
          </div>

          {/* ─── Back link ─── */}
          <div className="text-center mt-12">
            <Link href="/" className="text-sm font-semibold text-[#1D4ED8] hover:underline">&larr; Back to home</Link>
          </div>
        </div>
      </main>

      {/* ─── Footer ─── */}
      <footer className="bg-[#0F172A] text-[#CBD5E1] border-t border-[#334155] w-full py-12 px-8 md:px-10">
        <div className="max-w-[1440px] mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left">
          <div className="flex items-center gap-2">
            <img src="/logos/make_church_easy_white_logo.png" alt="MakeChurchEasy" className="h-8 w-auto" />
            <span className="text-sm font-bold text-white">MakeChurchEasy</span>
          </div>
          <div className="text-xs text-[#94A3B8]">\u00a9 2026 MakeChurchEasy. Elevating worship through intelligent automation.</div>
        </div>
      </footer>
    </div>
  );
}
