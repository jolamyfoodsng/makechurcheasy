"use client";

import {
  getCreditTransactions,
  getDevices,
  getSecuritySessions,
  type CreditTransaction,
  type Device,
  type SecuritySession,
} from "@/lib/api";
import { useSubscription } from "@/lib/useSubscription";
import { getUserId } from "@/lib/userId";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileAudio,
  Loader2,
  Monitor,
  RefreshCw,
  TrendingUp,
  Zap,
  Sparkles,
  Shield,
  Award,
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

function deviceName(d: Device | SecuritySession): string {
  const name = ("deviceName" in d ? d.deviceName : (d as any).name) || "";
  if (name) return name;
  const platform = ("devicePlatform" in d ? d.devicePlatform : (d as any).platform) || "";
  const os = ("deviceOs" in d ? d.deviceOs : (d as any).os) || "";
  if (platform || os) return [platform, os].filter(Boolean).join(" · ");
  return "Unknown device";
}

function deviceSubtitle(d: Device | SecuritySession): string {
  const os = ("deviceOs" in d ? d.deviceOs : (d as any).os) || "";
  const browser = ("browser" in d ? d.browser : "") || "";
  const parts = [os, browser].filter(Boolean);
  return parts.join(" · ") || "Online";
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

  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [recentTx, setRecentTx] = useState<CreditTransaction[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) { setLoading(false); return; }
    Promise.all([
      getSecuritySessions(userId),
      getCreditTransactions(userId, { limit: 5 }),
      getDevices(),
    ])
      .then(([sess, tx, devs]) => {
        setSessions(sess);
        setRecentTx(tx.transactions);
        setDevices(devs);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const credits = mongoUser?.credits ?? 0;
  const creditLimit = mongoUser?.totalAvailable ?? maxCredits;
  const isCreditUnlimited = creditLimit === -1;
  const creditsUsed = isCreditUnlimited
    ? mongoUser?.totalConsumed ?? 0
    : Math.max(0, creditLimit - credits);

  const totalDevices = devices.length;
  const deviceLimit = planTier?.entitlements?.devices ?? 1;
  const isDeviceUnlimited = deviceLimit === -1;
  const hasDownloadedStudio = mongoUser?.onboarding?.downloadedStudio || false;
  const isPastDue = subscription?.status === "past_due";
  const isCancelling = subscription?.status === "cancelled";

  if (subLoading || loading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6 pb-16">
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

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      {/* Welcome header */}
      {ambassadorInfo.isAmbassador ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome as an Ambassador, {firstName}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-purple-100 text-purple-700 border border-purple-200">
                <Sparkles className="w-3 h-3 text-purple-600" />
                Ambassador
              </span>
            </div>
            <p className="text-sm text-slate-500">
              {churchName && churchName !== "Your Church" ? `${churchName} · ` : ""}
              {ambassadorInfo.tenureLabel} Ambassador Access · {ambassadorInfo.remainingLabel}
            </p>
          </div>
          <Link
            href="/credits"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 text-xs font-bold transition-colors w-fit"
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-600" />
            <span>Ambassador AI Credits</span>
          </Link>
        </div>
      ) : ambassadorInfo.isAdmin ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome back, Admin {firstName}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold bg-slate-800 text-slate-100">
                <Shield className="w-3 h-3 text-amber-300" />
                System Admin
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Full system privileges & platform controls
            </p>
          </div>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors w-fit shadow-sm"
          >
            <span>Open Admin Panel</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      ) : (
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">
            Welcome back, {firstName}
          </h1>
          {churchName && churchName !== "Your Church" && (
            <p className="text-sm text-slate-500">{churchName}</p>
          )}
        </div>
      )}

      {/* Ambassador VIP Banner */}
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
                Thank you for championing MakeChurchEasy in your community. You have full <strong>Growth Plan</strong> capabilities unlocked with {ambassadorInfo.creditsGranted > 0 ? `${ambassadorInfo.creditsGranted.toLocaleString()} monthly AI credits` : "monthly AI credits"} to empower your church and ministry services.
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-purple-200">
                <span className="px-2.5 py-0.5 rounded-md bg-purple-900/60 border border-purple-500/30 font-medium">
                  {ambassadorInfo.remainingLabel}
                </span>
                {ambassadorInfo.formattedExpiry && (
                  <span className="px-2.5 py-0.5 rounded-md bg-purple-900/60 border border-purple-500/30 font-medium">
                    Expires {ambassadorInfo.formattedExpiry}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-md bg-purple-900/60 border border-purple-500/30 font-medium">
                  Growth Plan Features Included
                </span>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/credits"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-purple-600/30 whitespace-nowrap"
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
                You are currently on the Free Plan
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Enjoy your basic church presentation features (3 offline Bible versions and manual OBS link). Subscribe now to unlock automated OBS scene control, unlimited offline Bibles, full transcript downloads, unlimited themes, and cloud backup.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/subscription/plans"
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/30 whitespace-nowrap"
              >
                <span>Subscribe Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Plan */}
        <Card padding="md" className="flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <CreditCard className="w-3.5 h-3.5" /> Plan
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-bold text-slate-900">
                {ambassadorInfo.isAmbassador ? "Ambassador" : isOnTrial ? "Trial" : planLabel}
              </span>
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
                {ambassadorInfo.isAmbassador ? "Growth Tier" : isOnTrial ? "Trial" : isPastDue ? "Past Due" : isCancelling ? "Cancels" : subscription?.status === "active" ? "Active" : "Free"}
              </Badge>
            </div>
            {ambassadorInfo.isAmbassador ? (
              <p className="text-xs text-purple-700 font-medium">{ambassadorInfo.tenureLabel} ({ambassadorInfo.remainingLabel})</p>
            ) : isOnTrial && trialEndsAt ? (
              <p className="text-xs text-slate-500">Ends {new Date(trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
            ) : null}
            <Link href={ambassadorInfo.isAmbassador ? "/credits" : "/subscription"} className="text-xs font-medium text-blue-600 hover:underline mt-1 inline-block">
              {ambassadorInfo.isAmbassador ? "Ambassador credits →" : "Manage plan →"}
            </Link>
          </div>
        </Card>

        {/* AI Credits */}
        <Card padding="md" className="flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5" /> AI Credits
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">
              {isCreditUnlimited ? "Unlimited" : credits.toLocaleString()}
            </p>
            {!isCreditUnlimited && (
              <p className="text-xs text-slate-500 mt-0.5">
                of {creditLimit.toLocaleString()} this cycle
              </p>
            )}
            {creditsUsed > 0 && (
              <p className="text-xs text-slate-400 mt-0.5">{creditsUsed.toLocaleString()} used</p>
            )}
            <Link href="/credits" className="text-xs font-medium text-blue-600 hover:underline mt-1 inline-block">
              View usage →
            </Link>
          </div>
        </Card>

        {/* Devices */}
        <Card padding="md" className="flex flex-col justify-between h-[120px]">
          <div className="flex items-center gap-2 text-slate-500 text-[11px] font-semibold uppercase tracking-wider">
            <Monitor className="w-3.5 h-3.5" /> Devices
          </div>
          <div>
            <p className="text-xl font-bold text-slate-900">
              {totalDevices} connected
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {isDeviceUnlimited ? "Unlimited allowed" : `of ${deviceLimit} allowed`}
            </p>
            <Link href="/devices" className="text-xs font-medium text-blue-600 hover:underline mt-1 inline-block">
              Manage devices →
            </Link>
          </div>
        </Card>
      </div>

      {/* Install Studio — show prominently if not downloaded */}
      {!hasDownloadedStudio && (
        <Card padding="md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <Download className="w-4 h-4 text-indigo-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                  Install MakeChurchEasy Studio
                </h3>
                <p className="text-xs text-slate-500">
                  Download and install the desktop app on your production computer.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/downloads">
                <Button size="sm" icon={<Download className="w-4 h-4" />}>
                  Download Studio
                </Button>
              </Link>
              <a href="https://www.youtube.com/watch?v=NmneQhxY2jQ&t=2s" target="_blank" rel="noopener noreferrer">
                <Button variant="secondary" size="sm">Watch Demo</Button>
              </a>
            </div>
          </div>
        </Card>
      )}

      {/* Quick Actions */}
      <section>
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2">
          <Link
            href="/devices"
            className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group"
          >
            <Monitor className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
            <span className="text-sm font-medium text-slate-700 flex-1">Pair Device</span>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
          </Link>
          {hasDownloadedStudio ? (
            <Link
              href="/subscription"
              className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group"
            >
              <CreditCard className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
              <span className="text-sm font-medium text-slate-700 flex-1">Manage Plan</span>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
            </Link>
          ) : (
            <Link
              href="/downloads"
              className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group"
            >
              <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
              <span className="text-sm font-medium text-slate-700 flex-1">Download Studio</span>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
            </Link>
          )}
          <Link
            href="/credits"
            className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group"
          >
            <Zap className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
            <span className="text-sm font-medium text-slate-700 flex-1">View Credits</span>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
          </Link>
          <Link
            href="/subscription/plans"
            className="flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:border-blue-300 transition-colors group"
          >
            <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
            <span className="text-sm font-medium text-slate-700 flex-1">Compare Plans</span>
            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500" />
          </Link>
        </div>
      </section>

      {/* Recent Activity */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Recent Activity</h2>
          <Link href="/credits/history" className="text-xs font-medium text-blue-600 hover:underline">
            View all →
          </Link>
        </div>
        <Card padding="none">
          {recentTx.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-slate-500">No recent activity</p>
              <p className="text-xs text-slate-400 mt-1">Your credit usage will appear here.</p>
            </div>
          ) : (
            recentTx.slice(0, 5).map((tx, i) => (
              <div
                key={tx._id || i}
                className={`flex items-center gap-3 px-5 py-3 ${
                  i < recentTx.slice(0, 5).length - 1 ? "border-b border-slate-100" : ""
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    tx.amount > 0 ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {tx.amount > 0 ? <RefreshCw className="w-4 h-4" /> : <FileAudio className="w-4 h-4" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {tx.description?.slice(0, 40) || "Transaction"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} credits
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">{timeAgo(tx.createdAt)}</span>
              </div>
            ))
          )}
        </Card>
      </section>

      {/* Connected Devices */}
      {sessions.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-900">Connected Devices</h2>
            <Link href="/devices" className="text-xs font-medium text-blue-600 hover:underline">
              Manage →
            </Link>
          </div>
          <Card padding="none">
            {sessions.slice(0, 3).map((s, i) => (
              <div
                key={s._id || i}
                className={`flex items-center gap-3 px-5 py-3 ${
                  i < Math.min(sessions.length, 3) - 1 ? "border-b border-slate-100" : ""
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Monitor className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{deviceName(s)}</p>
                  <p className="text-xs text-slate-500">{deviceSubtitle(s)}</p>
                </div>
                <Badge variant={("isCurrent" in s && s.isCurrent) ? "success" : "default"} size="sm" dot>
                  {("isCurrent" in s && s.isCurrent) ? "Current" : "Online"}
                </Badge>
              </div>
            ))}
            {sessions.length > 3 && (
              <Link
                href="/devices"
                className="flex items-center justify-center gap-1 px-5 py-3 text-xs font-medium text-slate-500 hover:text-slate-700 border-t border-slate-100"
              >
                View all ({sessions.length}) <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}
