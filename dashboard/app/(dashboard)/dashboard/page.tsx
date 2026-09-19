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
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Card, Badge, Button, CardSkeleton } from "@/components/ui";

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

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      {/* Welcome header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Welcome back, {firstName}
        </h1>
        {churchName && churchName !== "Your Church" && (
          <p className="text-sm text-slate-500">{churchName}</p>
        )}
      </div>

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
                {isOnTrial ? "Trial" : planLabel}
              </span>
              <Badge
                variant={
                  isOnTrial ? "warning" :
                  isPastDue ? "error" :
                  isCancelling ? "warning" :
                  subscription?.status === "active" ? "success" : "default"
                }
                size="sm"
              >
                {isOnTrial ? "Trial" : isPastDue ? "Past Due" : isCancelling ? "Cancels" : subscription?.status === "active" ? "Active" : "Free"}
              </Badge>
            </div>
            {isOnTrial && trialEndsAt && (
              <p className="text-xs text-slate-500">Ends {new Date(trialEndsAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
            )}
            <Link href="/subscription" className="text-xs font-medium text-blue-600 hover:underline mt-1 inline-block">
              Manage plan →
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
