"use client";

import { Badge, Button, Card } from "@/components/ui";
import { recordDownload } from "@/lib/api";
import { getUserId } from "@/lib/userId";
import { AlertTriangle, CheckCircle2, Command, Download, ExternalLink, Info, Loader2, Monitor, Server } from "lucide-react";
import { useEffect, useState } from "react";

const REPO = "jolamyfoodsng/makechurcheasy-releases";
const INSTALL_GUIDE_URL = "https://www.youtube.com/playlist?list=PLRua6gJfgC0o";

interface GitHubAsset {
  name: string;
  size: number;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  assets: GitHubAsset[];
}

interface PlatformDownload {
  icon: typeof Monitor;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  filename: string;
  size: string;
  recommended?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

type PlatformKey = "windows" | "macos-silicon" | "macos-intel";

function getPlatformKey(filename: string): PlatformKey | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".exe")) return "windows";
  if (lower.includes("aarch64")) return "macos-silicon";
  if (lower.includes("x64")) return "macos-intel";
  if (lower.endsWith(".dmg")) return "macos-intel";
  return null;
}

// Prefer DMG installers for macOS when both .dmg and .app.tar.gz are available
function assetPriority(filename: string): number {
  const lower = filename.toLowerCase();

  // Prefer DMG installers for macOS because they provide the familiar
  // drag-to-Applications installation experience.
  if (lower.endsWith(".dmg")) return 10;
  if (lower.endsWith(".app.tar.gz")) return 5;

  // Windows installer
  if (lower.endsWith(".exe")) return 10;

  return 0;
}

const PLATFORM_META: Record<PlatformKey, Omit<PlatformDownload, "filename" | "size">> = {
  windows: {
    icon: Monitor,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-700",
    title: "Windows",
    subtitle: "Windows 10 (64-bit) or later",
    recommended: true,
  },
  "macos-silicon": {
    icon: Command,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-800",
    title: "macOS",
    subtitle: "Apple Silicon (M1/M2/M3/M4)",
  },
  "macos-intel": {
    icon: Server,
    iconBg: "bg-slate-100",
    iconColor: "text-slate-800",
    title: "macOS",
    subtitle: "Intel (x64 CPU)",
  },
};

function deduplicatePlatforms(assets: GitHubAsset[]): PlatformDownload[] {
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
    ...PLATFORM_META[key],
    filename: asset.name,
    size: "",
  }));
}

export default function Downloads() {
  const [release, setRelease] = useState<GitHubRelease | null>(null);
  const [platforms, setPlatforms] = useState<PlatformDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    fetch("/api/releases/latest", {
      headers: { Accept: "application/json" },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
        return res.json();
      })
      .then((data: GitHubRelease) => {
        setRelease(data);
        const matched = deduplicatePlatforms(data.assets);
        matched.forEach((p) => {
          const asset = data.assets.find((a) => a.name === p.filename);
          if (asset) p.size = formatFileSize(asset.size);
        });
        setPlatforms(matched);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch release:", err);
        setError("Could not load release information. Please try again later.");
        setLoading(false);
      });
  }, []);

  const version = release?.tag_name?.replace(/^v/, "") ?? "";
  const releaseName = release?.name ?? "";
  const releaseNotes = release?.body ?? "";
  const publishedDate = release?.published_at
    ? new Date(release.published_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    : "";

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Downloads</h1>
          <p className="text-sm text-slate-500">Download and install MakeChurchEasy on your devices.</p>
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Downloads</h1>
          <p className="text-sm text-slate-500">Download and install MakeChurchEasy on your devices.</p>
        </div>
        <Card padding="lg">
          <div className="flex flex-col items-center text-center py-8">
            <AlertTriangle className="w-10 h-10 text-amber-500 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">Unable to Load Releases</h3>
            <p className="text-sm text-slate-500 mb-4">{error}</p>
            <a
              href={`https://github.com/${REPO}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700 hover:underline"
            >
              View Releases on GitHub <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </Card>
      </div>
    );

  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">Downloads</h1>
        <p className="text-sm text-slate-500">Download and install MakeChurchEasy on your devices.</p>
      </div>

      {/* Release header */}
      <Card padding="lg">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="info" size="md">LATEST RELEASE</Badge>
              <Badge variant="success" size="sm">Stable</Badge>
            </div>
            <h2 className="text-xl font-bold text-slate-900">
              {releaseName || `MakeChurchEasy ${version}`}
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {publishedDate && `Released ${publishedDate}`}
              {version && ` — Version ${version}`}
            </p>
          </div>
        </div>

      </Card>

      {/* Platform downloads */}
      {platforms.length > 0 && (
        <div>
          <h3 className="text-base font-bold text-slate-900 mb-4">Download for Your Platform</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {platforms.map((platform) => (
              <Card key={platform.filename} padding="md" className="flex flex-col">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`w-10 h-10 ${platform.iconBg} rounded-xl flex items-center justify-center shrink-0`}>
                    <platform.icon className={`w-5 h-5 ${platform.iconColor}`} />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">{platform.title}</h4>
                    <p className="text-xs text-slate-500">{platform.subtitle}</p>
                  </div>
                </div>
                {platform.recommended && (
                  <Badge variant="info" size="sm" className="mb-3 self-start">Recommended</Badge>
                )}
                <div className="space-y-0.5 mb-5 mt-auto pt-3 text-sm">
                  <p className="text-slate-700"><span className="text-slate-400">Version </span>{version}</p>
                  <p className="text-slate-700"><span className="text-slate-400">Size: </span>{platform.size}</p>
                </div>
                <a
                  href={`/api/releases/download/${encodeURIComponent(platform.filename)}`}
                  onClick={() => {
                    const userId = getUserId();
                    if (userId) recordDownload(userId, version).catch(() => { });
                    setShowToast(true);
                    setTimeout(() => setShowToast(false), 3000);
                  }}
                >
                  <Button className="w-full" icon={<Download className="w-4 h-4" />}>Download</Button>
                </a>
              </Card>
            ))}
          </div>
        </div>
      )}

      {platforms.length === 0 && !loading && (
        <Card padding="lg">
          <div className="flex flex-col items-center text-center py-8">
            <Download className="w-10 h-10 text-slate-300 mb-4" />
            <h3 className="text-lg font-bold text-slate-900 mb-2">No Downloads Available</h3>
            <p className="text-sm text-slate-500 mb-4">No compatible download files were found for this release.</p>

          </div>
        </Card>
      )}

      {/* Help banner */}
      <Card padding="md" className="bg-slate-50">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-700">
              <Info className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-900">Need help installing?</h4>
              <p className="text-xs text-slate-500">Follow our step-by-step installation guide.</p>
            </div>
          </div>
          <a href={INSTALL_GUIDE_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">View Guide</Button>
          </a>
        </div>
      </Card>

      {/* Download started toast */}
      {showToast && (
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center gap-3 bg-green-600 text-white px-4 py-3 rounded-xl shadow-lg">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="text-sm font-semibold">Download started! Check your downloads folder.</span>
          </div>
        </div>
      )}
    </div>
  );
}
