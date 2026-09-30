"use client";

import {
  getCreditTransactions,
  getDevices,
  type CreditTransaction,
  type Device,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { getUserId } from "@/lib/userId";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  CreditCard,
  Download,
  FileAudio,
  Monitor,
  RefreshCw,
  Zap,
  Sparkles,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Laptop,
  Smartphone,
  Landmark,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Card, Badge, Button, CardSkeleton } from "@/components/ui";
import { getAmbassadorInfo } from "@/lib/ambassadorUtils";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function detectDeviceIcon(platform: string) {
  const lower = (platform || "").toLowerCase();
  if (lower.includes("mac")) return Laptop;
  if (lower.includes("windows") || lower.includes("win")) return Monitor;
  if (lower.includes("android") || lower.includes("ios")) return Smartphone;
  return Monitor;
}

export default function Overview() {
  const t = useTranslations();
  const {
    planLabel,
    planTier,
    subscription,
    user,
    mongoUser,
    maxCredits,
    isUnlimited,
    isOnTrial,
    isFreePlan,
    trialDaysLeft,
    trialEndsAt,
    loading: subLoading,
  } = useSubscription();

  const [recentTx, setRecentTx] = useState<CreditTransaction[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) { setLoading(false); return; }
    Promise.all([
      getCreditTransactions(userId, { limit: 5 }),
      getDevices(),
    ])
      .then(([tx, devs]) => {
        setRecentTx(tx.transactions);
        setDevices(devs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const credits = mongoUser?.credits ?? 0;
  const creditLimit = mongoUser?.totalAvailable ?? maxCredits;
  const isCreditUnlimited = creditLimit === -1 || isUnlimited;
  const creditsUsed = isCreditUnlimited
    ? mongoUser?.totalConsumed ?? 0
    : Math.max(0, creditLimit - credits);

  const totalDevices = devices.length;
  const deviceLimit = planTier?.entitlements?.devices ?? 1;
  const isDeviceUnlimited = deviceLimit === -1 || isUnlimited;
  const hasDownloadedStudio = mongoUser?.onboarding?.downloadedStudio || false;
  const isPastDue = subscription?.status === "past_due";
  const isCancelling = subscription?.status === "cancelled";

  if (subLoading || loading) {
    return (
      <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-6 pb-16">
        <div className="h-8 w-48 bg-slate-100 rounded-lg animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </div>
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const firstName = user?.name?.split(" ")[0] || "there";
  const churchName = user?.churchName || "";
  const ambassadorInfo = getAmbassadorInfo(mongoUser?.ambassador || (user as any)?.ambassador, mongoUser?.role || user?.role);
  const now = Date.now();
  const onlineDevicesCount = devices.filter((d) => now - new Date(d.lastSeen).getTime() < 5 * 60 * 1000).length;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-1">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome back, {firstName}
            </h1>
            {ambassadorInfo.isAmbassador ? (
              <Badge variant="purple" size="sm" dot>Ambassador</Badge>
            ) : ambassadorInfo.isAdmin ? (
              <Badge variant="default" size="sm">System Admin</Badge>
            ) : isOnTrial ? (
              <Badge variant="warning" size="sm">14-Day Trial</Badge>
            ) : null}
          </div>
          <p className="text-xs sm:text-sm text-slate-500">
            {churchName && churchName !== "Your Church" ? `${churchName} · ` : ""}
            Sanctuary Presentation & Media Hub
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <Link href="/devices">
            <Button size="sm" icon={<Monitor className="w-3.5 h-3.5" />}>
              Pair Sanctuary Device
            </Button>
          </Link>
          <Link href="/downloads">
            <Button variant="secondary" size="sm" icon={<Download className="w-3.5 h-3.5" />}>
              Download Studio
            </Button>
          </Link>
        </div>
      </div>

      {/* Ambassador Banner */}
      {ambassadorInfo.isAmbassador && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-950 via-slate-900 to-indigo-950 border border-purple-500/30 p-5 sm:p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                Ambassador Access Active · {ambassadorInfo.tenureLabel} Grant
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Welcome as a MakeChurchEasy Ambassador!
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Thank you for championing MakeChurchEasy in your community. You have full <strong>Growth Plan</strong> capabilities unlocked with {ambassadorInfo.creditsGranted > 0 ? `${ambassadorInfo.creditsGranted.toLocaleString()} monthly AI credits` : "monthly AI credits"} to empower your church services.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-purple-200">
                <span className="px-2.5 py-0.5 rounded-md bg-purple-900/60 border border-purple-500/30 font-medium">
                  {ambassadorInfo.remainingLabel}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-purple-900/60 border border-purple-500/30 font-medium">
                  Growth Plan Features Included
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/credits"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-purple-600/30 whitespace-nowrap cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>Check AI Credits</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Free Plan Overview Banner */}
      {!ambassadorInfo.isAmbassador && isFreePlan && !isOnTrial && (
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/30 p-5 sm:p-6 text-white shadow-lg">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-xs font-bold tracking-wide uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                <Zap className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                Free Plan Active
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                Unlock Full Church Presentation Features
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Subscribe now to unlock automated OBS lower-thirds, unlimited offline Bibles, full sermon transcript exports, and multi-device sanctuary sync.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/subscription/plans"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/30 whitespace-nowrap cursor-pointer"
              >
                <span>Compare Plans</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 3 Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Plan */}
        <Card padding="md" className="flex flex-col justify-between hover:border-slate-300 transition-colors shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <CreditCard className="w-4 h-4 text-blue-600" /> Plan & Licensing
            </div>
            <Badge
              variant={
                ambassadorInfo.isAmbassador ? "purple" :
                isOnTrial ? "warning" :
                isPastDue ? "error" :
                isCancelling ? "warning" :
                subscription?.status === "active" ? "success" : "default"
              }
              size="sm"
            >
              {ambassadorInfo.isAmbassador ? "Ambassador Tier" : isOnTrial ? "Trial" : isPastDue ? "Past Due" : isCancelling ? "Cancels" : subscription?.status === "active" ? "Active" : "Free"}
            </Badge>
          </div>

          <div className="my-3">
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {ambassadorInfo.isAmbassador ? "Growth Plan" : isOnTrial ? `${planLabel} Trial` : `${planLabel} Plan`}
            </p>
            {ambassadorInfo.isAmbassador ? (
              <p className="text-xs text-purple-700 font-medium mt-1">{ambassadorInfo.tenureLabel} ({ambassadorInfo.remainingLabel})</p>
            ) : isOnTrial && trialEndsAt ? (
              <p className="text-xs text-slate-500 mt-1">Trial ends {new Date(trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
            ) : (
              <p className="text-xs text-slate-500 mt-1">Sanctuary broadcast license</p>
            )}
          </div>

          <Link href={ambassadorInfo.isAmbassador ? "/credits" : "/subscription"} className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
            <span>{ambassadorInfo.isAmbassador ? "Ambassador credits" : "Manage subscription"}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </Card>

        {/* Card 2: AI Speech Credits */}
        <Card padding="md" className="flex flex-col justify-between hover:border-slate-300 transition-colors shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <Zap className="w-4 h-4 text-amber-500" /> AI Sermon Credits
            </div>
            <Badge variant={isCreditUnlimited ? "purple" : credits > 500 ? "success" : "warning"} size="sm">
              {isCreditUnlimited ? "Unlimited" : `${credits.toLocaleString()} Balance`}
            </Badge>
          </div>

          <div className="my-3">
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {isCreditUnlimited ? "Unlimited" : credits.toLocaleString()}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isCreditUnlimited ? "Full real-time speech AI active" : `of ${creditLimit.toLocaleString()} monthly AI credits`}
            </p>
          </div>

          <Link href="/credits" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
            <span>View usage & top up</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </Card>

        {/* Card 3: Sanctuary Devices */}
        <Card padding="md" className="flex flex-col justify-between hover:border-slate-300 transition-colors shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <Monitor className="w-4 h-4 text-emerald-600" /> Sanctuary Devices
            </div>
            <Badge variant={totalDevices > 0 ? "success" : "default"} size="sm" dot={totalDevices > 0}>
              {totalDevices > 0 ? `${totalDevices} Paired` : "Not Setup"}
            </Badge>
          </div>

          <div className="my-3">
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">
              {totalDevices} {totalDevices === 1 ? "Computer" : "Computers"}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {isDeviceUnlimited ? "Unlimited devices allowed" : `of ${deviceLimit} device slots used`}
            </p>
          </div>

          <Link href="/devices" className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1">
            <span>Manage devices & pairing</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </Card>
      </div>

      {/* Prominent Studio Download Card if not downloaded yet */}
      {!hasDownloadedStudio && (
        <Card padding="md" className="border-blue-200 bg-gradient-to-r from-blue-50/60 to-white shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-blue-100/80 flex items-center justify-center text-blue-700 shrink-0">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Step 1: Download MakeChurchEasy Studio
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Install our desktop app on your sanctuary Mac or Windows computer to project scriptures, lyric lower-thirds, and sermon AI.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <Link href="/downloads">
                <Button size="sm" icon={<Download className="w-4 h-4" />}>
                  Download Studio
                </Button>
              </Link>
              <a href="https://www.youtube.com/watch?v=NmneQhxY2jQ&t=2s" target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">Watch 2-Min Demo</Button>
              </a>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Actions Grid */}
      <section>
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link
            href="/devices"
            className="flex items-center gap-3.5 p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-xs transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Monitor className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">Pair Device</p>
              <p className="text-xs text-slate-400 truncate">Sync sanctuary PC / Mac</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
          </Link>

          <Link
            href="/downloads"
            className="flex items-center gap-3.5 p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-xs transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Download className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">Downloads</p>
              <p className="text-xs text-slate-400 truncate">Mac & Windows installers</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
          </Link>

          <Link
            href="/credits"
            className="flex items-center gap-3.5 p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-xs transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Zap className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">AI Credits</p>
              <p className="text-xs text-slate-400 truncate">Top-up sermon minutes</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 transition-colors" />
          </Link>

          <Link
            href="/church-profile"
            className="flex items-center gap-3.5 p-4 bg-white border border-slate-200 rounded-2xl hover:border-blue-300 hover:shadow-xs transition-all group"
          >
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0 group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <Landmark className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900 truncate">Church Profile</p>
              <p className="text-xs text-slate-400 truncate">Ministry & Bible settings</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-purple-600 transition-colors" />
          </Link>
        </div>
      </section>

      {/* Connected Presentation Nodes */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Connected Sanctuary Devices
            </h2>
          </div>
          <Link href="/devices" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
            <span>Manage all ({devices.length})</span>
            <ChevronRight className="w-3 h-3" />
          </Link>
        </div>

        {devices.length === 0 ? (
          <Card padding="md" className="text-center py-8">
            <Monitor className="w-10 h-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-slate-900">No sanctuary computer linked yet</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-4">
              Open MakeChurchEasy Studio on your AV desktop and enter a 6-digit code to pair.
            </p>
            <Link href="/devices">
              <Button size="sm" icon={<Monitor className="w-3.5 h-3.5" />}>Pair Sanctuary Computer</Button>
            </Link>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {devices.slice(0, 2).map((dev) => {
              const DevIcon = detectDeviceIcon(dev.deviceName);
              const isOnline = now - new Date(dev.lastSeen).getTime() < 5 * 60 * 1000;

              return (
                <div key={dev.id} className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isOnline ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-50 border-slate-200 text-slate-500"
                    }`}>
                      <DevIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{dev.deviceName || "Sanctuary Device"}</span>
                        <Badge variant={isOnline ? "success" : "default"} size="sm" dot>
                          {isOnline ? "Online" : "Offline"}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Active {timeAgo(dev.lastSeen)} · Studio Presentation Node
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Recent Service Activity</h2>
          <Link href="/credits/history" className="text-xs font-semibold text-blue-600 hover:underline">
            View history →
          </Link>
        </div>
        <Card padding="none" className="overflow-hidden divide-y divide-slate-100">
          {recentTx.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-slate-600">No recent credit activity</p>
              <p className="text-xs text-slate-400 mt-1">Your sermon speech-to-scripture sessions will be logged here.</p>
            </div>
          ) : (
            recentTx.slice(0, 5).map((tx, i) => (
              <div
                key={tx._id || i}
                className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50/70 transition-colors"
              >
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    tx.amount > 0 ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-slate-50 text-slate-500 border border-slate-200"
                  }`}
                >
                  {tx.amount > 0 ? <RefreshCw className="w-4 h-4" /> : <FileAudio className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {tx.description || "Service Presentation Session"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} credits
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0 font-medium">{timeAgo(tx.createdAt)}</span>
              </div>
            ))
          )}
        </Card>
      </section>
    </div>
  );
}
