"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Shield,
  Crown,
  CreditCard,
  Calendar,
  Clock,
  Monitor,
  BookOpen,
  Music,
  Mic,
  FileText,
  Loader2,
  Mail,
  Church,
  Zap,
  Play,
  StopCircle,
  RotateCcw,
  Minus,
  Plus,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";

interface UserDetail {
  id: string;
  name: string;
  email: string;
  churchName: string;
  role: string;
  credits: number;
  plan: string;
  createdAt: string | null;
  lastLogin: string | null;
  appId: string;
  trial?: {
    active: boolean;
    status?: string;
    startedAt?: string;
    expiresAt?: string;
    endsAt?: string;
    durationDays?: number;
    extendedDays?: number;
    extensionCount?: number;
    stoppedAt?: string;
    stoppedReason?: string;
  } | null;
  ambassador?: {
    active: boolean;
    grantedBy?: string;
    grantedAt?: string;
    expiresAt?: string;
    creditsGranted?: number;
    previousPlan?: string;
    notes?: string;
  } | null;
  adminTemporaryPlan?: {
    active: boolean;
    plan?: string;
    previousPlan?: string;
    returnPlan?: "free";
    grantedAt?: string;
    expiresAt?: string;
    durationDays?: number;
    reason?: string;
    endedAt?: string;
    endedReason?: string;
  } | null;
  adminManagedSubscription?: {
    active: boolean;
    plan?: string;
    billingCycle?: string;
    expiresAt?: string;
    amountCollected?: number;
    currency?: string;
    paymentReference?: string;
    note?: string;
    renewedAt?: string;
  } | null;
  subscriptionExpiresAt?: string | null;
  scheduledDowngradeAt?: string | null;
  subscription?: {
    plan?: string;
    status?: string | null;
    billingCycle?: string | null;
    currentPeriodEnd?: string | null;
    nextBillingDate?: string | null;
    autoRenew?: boolean;
    adminManaged?: boolean;
    paymentProvider?: string | null;
  } | null;
  usage: {
    bibleSearches: number;
    songsCreated: number;
    mediaUploaded: number;
    aiHoursUsed: number;
    transcriptCount: number;
  };
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-gray-800 ${className ?? ""}`} />
  );
}

export default function AdminUserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Trial action state
  const [trialAction, setTrialAction] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState(7);
  const [trialReason, setTrialReason] = useState("");
  const [trialMsg, setTrialMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [tempPlan, setTempPlan] = useState("growth");
  const [tempDurationDays, setTempDurationDays] = useState("30");
  const [tempReason, setTempReason] = useState("");
  const [tempAction, setTempAction] = useState<"save" | "end" | null>(null);
  const [tempMsg, setTempMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [managedPlan, setManagedPlan] = useState("growth");
  const [managedBillingCycle, setManagedBillingCycle] = useState("monthly");
  const [managedAmount, setManagedAmount] = useState("");
  const [managedCurrency, setManagedCurrency] = useState("NGN");
  const [managedReference, setManagedReference] = useState("");
  const [managedNote, setManagedNote] = useState("");
  const [managedNotifyUser, setManagedNotifyUser] = useState(true);
  const [managedAction, setManagedAction] = useState(false);
  const [managedMsg, setManagedMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(t('admin.userDetail.userNotFound'));
      const data = await res.json();
      setUser(data);
      setTempPlan(data.plan === "free" ? "growth" : "free");
      setManagedPlan(data.plan === "free" ? "growth" : data.plan);
      setManagedBillingCycle(data.adminManagedSubscription?.billingCycle || data.subscription?.billingCycle || "monthly");
      setManagedCurrency(data.adminManagedSubscription?.currency || "NGN");
    } catch (err: any) {
      setError(err?.message || t('admin.userDetail.failedToLoad'));
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const performTrialAction = useCallback(
    async (action: string, days?: number, reason?: string) => {
      setTrialAction(action);
      setTrialMsg(null);
      try {
        const res = await fetch(`/api/admin/users/${params.id}/trial`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, days, reason }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        setTrialMsg({
          type: "success",
          text: t('admin.userDetail.trial.actionSuccess', { action }),
        });
        if (data.trial && user) {
          setUser({ ...user, trial: data.trial });
        } else {
          fetchUser();
        }
        setTimeout(() => setTrialMsg(null), 4000);
      } catch (err: any) {
        setTrialMsg({
          type: "error",
          text: err?.message || t('admin.userDetail.trial.actionFailed', { action }),
        });
      } finally {
        setTrialAction(null);
      }
    },
    [params.id, user, fetchUser]
  );

  const saveManagedSubscription = useCallback(async () => {
    if (!user) return;

    setManagedAction(true);
    setManagedMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${params.id}/plan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: managedPlan,
          billingCycle: managedBillingCycle,
          amountPaid: managedAmount || undefined,
          currency: managedCurrency || "NGN",
          paymentReference: managedReference || undefined,
          note: managedNote || undefined,
          notifyUser: managedNotifyUser,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUser({
        ...user,
        plan: data.plan,
        credits: data.credits ?? user.credits,
        adminManagedSubscription: data.adminManagedSubscription,
        subscriptionExpiresAt: data.subscriptionExpiresAt,
        scheduledDowngradeAt: data.scheduledDowngradeAt,
        ...(data.plan !== "free" ? { adminTemporaryPlan: { ...(user.adminTemporaryPlan || {}), active: false } } : {}),
      });
      setManagedMsg({
        type: "success",
        text: data.emailSent
          ? t('admin.userDetail.managedSubscription.savedEmail')
          : t('admin.userDetail.managedSubscription.saved'),
      });
      setManagedAmount("");
      setManagedReference("");
      setManagedNote("");
      setTimeout(() => setManagedMsg(null), 4000);
    } catch (err: any) {
      setManagedMsg({
        type: "error",
        text: err?.message || t('admin.userDetail.managedSubscription.failed'),
      });
    } finally {
      setManagedAction(false);
    }
  }, [managedAmount, managedBillingCycle, managedCurrency, managedNote, managedNotifyUser, managedPlan, params.id, user]);

  const saveTemporaryPlan = useCallback(async () => {
    if (!user) return;
    const durationDays = parseInt(tempDurationDays, 10);
    if (!durationDays || durationDays <= 0) return;

    setTempAction("save");
    setTempMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${params.id}/temporary-plan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: tempPlan,
          durationDays,
          reason: tempReason || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUser({
        ...user,
        plan: data.plan,
        credits: data.credits ?? user.credits,
        adminTemporaryPlan: data.adminTemporaryPlan,
      });
      setTempMsg({
        type: "success",
        text: data.emailSent
          ? t('admin.userDetail.temporaryPlan.savedEmail')
          : t('admin.userDetail.temporaryPlan.saved'),
      });
      setTempReason("");
      setTimeout(() => setTempMsg(null), 4000);
    } catch (err: any) {
      setTempMsg({
        type: "error",
        text: err?.message || t('admin.userDetail.temporaryPlan.failed'),
      });
    } finally {
      setTempAction(null);
    }
  }, [params.id, tempDurationDays, tempPlan, tempReason, user]);

  const endTemporaryPlan = useCallback(async () => {
    if (!user) return;

    setTempAction("end");
    setTempMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${params.id}/temporary-plan`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUser({
        ...user,
        plan: "free",
        credits: data.credits ?? user.credits,
        adminTemporaryPlan: data.adminTemporaryPlan,
      });
      setTempMsg({ type: "success", text: t('admin.userDetail.temporaryPlan.ended') });
      setTimeout(() => setTempMsg(null), 4000);
    } catch (err: any) {
      setTempMsg({
        type: "error",
        text: err?.message || t('admin.userDetail.temporaryPlan.endFailed'),
      });
    } finally {
      setTempAction(null);
    }
  }, [params.id, user]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <SkeletonBlock className="h-6 w-32 mb-6" />
        <div className="flex items-start gap-4 mb-8">
          <SkeletonBlock className="w-14 h-14 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <SkeletonBlock className="h-6 w-48" />
            <SkeletonBlock className="h-4 w-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-48" />
          <SkeletonBlock className="h-64 md:col-span-2" />
        </div>
        <SkeletonBlock className="h-32" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <p className="text-sm text-red-400 mb-4">{error || t('admin.userDetail.userNotFound')}</p>
        <Link
          href="/admin/users"
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          ← {t('admin.userDetail.backToUsers')}
        </Link>
      </div>
    );
  }

  const trialExpiry =
    user.trial?.endsAt || user.trial?.expiresAt
      ? new Date(user.trial!.endsAt || user.trial!.expiresAt!)
      : null;
  const trialExpired = trialExpiry && trialExpiry.getTime() < Date.now();
  const isTrialActive = user.trial?.active && !trialExpired;
  const temporaryPlanExpiresAt = user.adminTemporaryPlan?.expiresAt
    ? new Date(user.adminTemporaryPlan.expiresAt)
    : null;
  const isTemporaryPlanActive =
    !!user.adminTemporaryPlan?.active &&
    !!temporaryPlanExpiresAt &&
    temporaryPlanExpiresAt.getTime() > Date.now();
  const subscriptionExpiresAt = user.subscriptionExpiresAt || user.adminManagedSubscription?.expiresAt || user.subscription?.currentPeriodEnd;
  const subscriptionExpiryDate = subscriptionExpiresAt ? new Date(subscriptionExpiresAt) : null;
  const isAdminManagedSubscriptionActive =
    !!user.adminManagedSubscription?.active &&
    !!subscriptionExpiryDate &&
    subscriptionExpiryDate.getTime() > Date.now();

  function planBadgeClasses(plan: string) {
    const colors: Record<string, string> = {
      free: "bg-gray-800 text-slate-400",
      basic: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
      ambassador: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
      growth: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
      pro: "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50",
    };
    return colors[plan] || colors.free;
  }

  function statusBadgeClasses(active: boolean, expired?: boolean) {
    if (active) return "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50";
    if (expired) return "bg-red-900/50 text-red-300 border border-red-700/50";
    return "bg-gray-800 text-slate-400 border border-slate-700";
  }

  return (
    <div className="max-w-4xl mx-auto">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('admin.userDetail.backToUsers')}
      </button>

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <div className="w-14 h-14 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 text-xl font-bold shrink-0">
          {user.name?.charAt(0)?.toUpperCase() || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-50">
              {user.name || t('admin.userDetail.unnamedUser')}
            </h1>
            {user.role === "admin" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-900/50 text-sky-300 border border-sky-700/50">
                <Shield className="w-3 h-3" /> {t('admin.userDetail.adminBadge')}
              </span>
            )}
            {user.ambassador?.active && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
                <Crown className="w-3 h-3" /> {t('admin.userDetail.ambassadorBadge')}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5" /> {user.email}
          </p>
          {user.churchName && (
            <p className="text-sm text-slate-400 mt-0.5 flex items-center gap-1.5">
              <Church className="w-3.5 h-3.5" /> {user.churchName}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Plan Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.planCard.title')}</h2>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${planBadgeClasses(user.plan)}`}>
              {user.plan}
            </span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">
                {t('common.credits')}
              </p>
              <p className="text-lg font-bold text-slate-50">
                {user.credits.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase tracking-wide">
                {t('common.role')}
              </p>
              <p className="text-sm font-medium text-slate-300 capitalize">
                {user.role}
              </p>
            </div>
          </div>
          <div className="mt-5 pt-4 border-t border-slate-700/50 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InfoRow
                label={t('admin.userDetail.managedSubscription.status')}
                value={isAdminManagedSubscriptionActive ? t('common.active') : user.plan === "free" ? "Free" : (user.subscription?.status || "Active")}
              />
              <InfoRow
                label={t('admin.userDetail.managedSubscription.billingCycle')}
                value={user.adminManagedSubscription?.billingCycle || user.subscription?.billingCycle || "—"}
              />
              <InfoRow
                label={t('admin.userDetail.managedSubscription.accessUntil')}
                value={subscriptionExpiryDate ? subscriptionExpiryDate.toLocaleDateString() : "—"}
              />
              <InfoRow
                label={t('admin.userDetail.managedSubscription.source')}
                value={user.adminManagedSubscription?.active || user.subscription?.adminManaged ? t('admin.userDetail.managedSubscription.adminCollected') : (user.subscription?.paymentProvider || "—")}
              />
            </div>

            {managedMsg && (
              <div
                className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${managedMsg.type === "success"
                  ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50"
                  : "bg-red-900/40 text-red-300 border border-red-700/50"
                  }`}
              >
                {managedMsg.type === "success" ? <Play className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {managedMsg.text}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  {t('admin.userDetail.managedSubscription.plan')}
                </label>
                <select
                  value={managedPlan}
                  onChange={(e) => setManagedPlan(e.target.value)}
                  className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                >
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="growth">Growth</option>
                  <option value="pro">Pro</option>
                </select>
              </div>
              {managedPlan !== "free" && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    {t('admin.userDetail.managedSubscription.billingCycle')}
                  </label>
                  <select
                    value={managedBillingCycle}
                    onChange={(e) => setManagedBillingCycle(e.target.value)}
                    className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                  >
                    <option value="monthly">{t('admin.userDetail.managedSubscription.monthly')}</option>
                    <option value="yearly">{t('admin.userDetail.managedSubscription.yearly')}</option>
                  </select>
                </div>
              )}
              {managedPlan !== "free" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      {t('admin.userDetail.managedSubscription.amount')}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={managedAmount}
                      onChange={(e) => setManagedAmount(e.target.value)}
                      placeholder={t('admin.userDetail.managedSubscription.amountPlaceholder')}
                      className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      {t('admin.userDetail.managedSubscription.currency')}
                    </label>
                    <input
                      value={managedCurrency}
                      onChange={(e) => setManagedCurrency(e.target.value.toUpperCase())}
                      className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      {t('admin.userDetail.managedSubscription.reference')}
                    </label>
                    <input
                      value={managedReference}
                      onChange={(e) => setManagedReference(e.target.value)}
                      placeholder={t('admin.userDetail.managedSubscription.referencePlaceholder')}
                      className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      {t('admin.userDetail.managedSubscription.note')}
                    </label>
                    <input
                      value={managedNote}
                      onChange={(e) => setManagedNote(e.target.value)}
                      placeholder={t('admin.userDetail.managedSubscription.notePlaceholder')}
                      className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={managedNotifyUser}
                  onChange={(e) => setManagedNotifyUser(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
                />
                {t('admin.userDetail.managedSubscription.notifyUser')}
              </label>
              <button
                disabled={managedAction}
                onClick={saveManagedSubscription}
                className="h-10 inline-flex items-center justify-center gap-1.5 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                {managedAction ? t('admin.userDetail.managedSubscription.saving') : t('admin.userDetail.managedSubscription.button')}
              </button>
            </div>
          </div>
        </div>

        {/* Account Info Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.accountInfo')}</h2>
          </div>
          <div className="space-y-2">
            <InfoRow
              label={t('common.signedUp')}
              value={
                user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString()
                  : "—"
              }
            />
            <InfoRow
              label={t('common.lastLogin')}
              value={
                user.lastLogin
                  ? new Date(user.lastLogin).toLocaleString()
                  : t('common.never')
              }
            />
            <InfoRow label={t('admin.userDetail.appId')} value={user.appId || "—"} />
            <InfoRow
              label={t('admin.userDetail.activeStatus')}
              value={
                user.lastLogin &&
                  new Date(user.lastLogin).getTime() >
                  Date.now() - 30 * 24 * 60 * 60 * 1000
                  ? t('admin.userDetail.activeLast30d')
                  : t('admin.userDetail.notActive')
              }
            />
          </div>
        </div>

        {/* Temporary Plan Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6 md:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.temporaryPlan.title')}</h2>
          </div>
          <p className="text-xs text-slate-500 ml-10 mb-4">
            {t('admin.userDetail.temporaryPlan.description')}
          </p>

          {tempMsg && (
            <div
              className={`mb-4 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${tempMsg.type === "success"
                ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50"
                : "bg-red-900/40 text-red-300 border border-red-700/50"
                }`}
            >
              {tempMsg.type === "success" ? (
                <Play className="w-3.5 h-3.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" />
              )}
              {tempMsg.text}
            </div>
          )}

          {user.adminTemporaryPlan && (
            <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                  {t('common.status')}
                </p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadgeClasses(isTemporaryPlanActive, !!user.adminTemporaryPlan.endedAt)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isTemporaryPlanActive ? "bg-emerald-400" : "bg-slate-500"}`} />
                  {isTemporaryPlanActive ? t('common.active') : t('admin.userDetail.temporaryPlan.inactive')}
                </span>
              </div>
              {user.adminTemporaryPlan.plan && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.temporaryPlan.plan')}
                  </p>
                  <p className="text-sm font-medium text-slate-300 capitalize">
                    {user.adminTemporaryPlan.plan}
                  </p>
                </div>
              )}
              {temporaryPlanExpiresAt && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.temporaryPlan.expires')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {temporaryPlanExpiresAt.toLocaleDateString()}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                  {t('admin.userDetail.temporaryPlan.returnsTo')}
                </p>
                <p className="text-sm font-medium text-slate-300">Free</p>
              </div>
            </div>
          )}

          {isTemporaryPlanActive ? (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-700/50">
              <p className="text-xs text-slate-500">
                {t('admin.userDetail.temporaryPlan.activeNotice')}
              </p>
              <button
                disabled={tempAction === "end"}
                onClick={endTemporaryPlan}
                className="inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                <StopCircle className="w-3.5 h-3.5" />
                {tempAction === "end" ? t('admin.userDetail.temporaryPlan.ending') : t('admin.userDetail.temporaryPlan.endNow')}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3 pt-2 border-t border-slate-700/50">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    {t('admin.userDetail.temporaryPlan.plan')}
                  </label>
                  <select
                    value={tempPlan}
                    onChange={(e) => setTempPlan(e.target.value)}
                    className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                  >
                    <option value="free">Free</option>
                    <option value="basic">Basic</option>
                    <option value="growth">Growth</option>
                    <option value="pro">Pro</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    {t('admin.userDetail.temporaryPlan.duration')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={tempDurationDays}
                    onChange={(e) => setTempDurationDays(e.target.value)}
                    className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5">
                    {t('admin.userDetail.temporaryPlan.reason')}
                  </label>
                  <input
                    type="text"
                    value={tempReason}
                    onChange={(e) => setTempReason(e.target.value)}
                    placeholder={t('admin.userDetail.temporaryPlan.reasonPlaceholder')}
                    className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <button
                  disabled={tempAction === "save" || !tempDurationDays || parseInt(tempDurationDays) <= 0}
                  onClick={saveTemporaryPlan}
                  className="h-10 w-full inline-flex items-center justify-center gap-1.5 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  {tempAction === "save" ? t('admin.userDetail.temporaryPlan.saving') : t('admin.userDetail.temporaryPlan.button')}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Trial Management Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6 md:col-span-2">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.trial.title')}</h2>
          </div>
          <p className="text-xs text-slate-500 ml-10 mb-4">
            {isTrialActive
              ? t('admin.userDetail.trial.activeDescription')
              : user.trial
                ? `${t('admin.userDetail.trial.title')} ${user.trial.status || "inactive"}`
                : t('admin.userDetail.trial.noTrialRecord')}
          </p>

          {trialMsg && (
            <div
              className={`mb-4 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${trialMsg.type === "success"
                ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50"
                : "bg-red-900/40 text-red-300 border border-red-700/50"
                }`}
            >
              {trialMsg.type === "success" ? (
                <Play className="w-3.5 h-3.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" />
              )}
              {trialMsg.text}
            </div>
          )}

          {user.trial && (
            <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                  {t('common.status')}
                </p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadgeClasses(!!isTrialActive, !!trialExpired)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${isTrialActive ? "bg-emerald-400" : trialExpired ? "bg-red-400" : "bg-slate-500"}`} />
                  {isTrialActive
                    ? t('common.active')
                    : trialExpired
                      ? t('admin.userDetail.trial.expired')
                      : user.trial.status || t('admin.userDetail.trial.inactive')}
                </span>
              </div>
              {user.trial.startedAt && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.trial.started')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {new Date(user.trial.startedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {trialExpiry && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.trial.expires')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {trialExpiry.toLocaleDateString()}
                  </p>
                </div>
              )}
              {user.trial.durationDays != null && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.trial.duration')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {t('admin.userDetail.trial.days', { count: user.trial.durationDays })}
                  </p>
                </div>
              )}
            </div>
          )}

          {user.trial?.extendedDays != null && user.trial.extendedDays !== 0 && (
            <div className="mb-4 text-xs text-slate-400">
              Extended by <span className="font-semibold text-slate-200">{user.trial.extendedDays}</span> days
              {user.trial.extensionCount
                ? ` (${user.trial.extensionCount}x)`
                : ""}
            </div>
          )}

          {/* Trial Actions */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/50">
            {/* Extend */}
            {isTrialActive && (
              <>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value))}
                    className="h-8 w-16 px-2 text-xs text-center border border-slate-700 rounded-lg bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                  />
                  <button
                    disabled={trialAction === "extend"}
                    onClick={() => performTrialAction("extend", trialDays)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {t('admin.userDetail.trial.extend')}
                  </button>
                </div>

                {/* Reduce */}
                <button
                  disabled={trialAction === "reduce"}
                  onClick={() => performTrialAction("reduce", trialDays)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-300 border border-slate-700 hover:bg-gray-800 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <Minus className="w-3.5 h-3.5" />
                  {t('admin.userDetail.trial.reduce')}
                </button>

                {/* Stop */}
                <button
                  disabled={trialAction === "stop"}
                  onClick={() => performTrialAction("stop", undefined, trialReason || "Stopped by admin")}
                  className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
                >
                  <StopCircle className="w-3.5 h-3.5" />
                  {t('admin.userDetail.trial.stopTrial')}
                </button>
              </>
            )}

            {/* Restart */}
            <button
              disabled={trialAction === "restart"}
              onClick={() => performTrialAction("restart", trialDays)}
              className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-300 border border-slate-700 hover:bg-gray-800 rounded-lg disabled:opacity-50 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {isTrialActive ? t('admin.userDetail.trial.restart') : t('admin.userDetail.trial.startTrial')}
            </button>

            {/* Expire (if trial exists but not active) */}
            {user.trial && !isTrialActive && user.trial.status !== "expired" && (
              <button
                disabled={trialAction === "expire"}
                onClick={() => performTrialAction("expire")}
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50 transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                {t('admin.userDetail.trial.expire')}
              </button>
            )}
          </div>

          {/* Stop reason input */}
          {isTrialActive && (
            <div className="mt-3">
              <input
                type="text"
                value={trialReason}
                onChange={(e) => setTrialReason(e.target.value)}
                placeholder={t('admin.userDetail.trial.stopReason')}
                className="h-8 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
              />
            </div>
          )}
        </div>

        {/* Ambassador Card */}
        {user.ambassador && (
          <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6 md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                <Crown className="w-4 h-4 text-amber-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.ambassador.title')}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
              <div>
                <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                  {t('common.status')}
                </p>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadgeClasses(user.ambassador.active)}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${user.ambassador.active ? "bg-emerald-400" : "bg-slate-500"}`} />
                  {user.ambassador.active ? t('common.active') : t('admin.userDetail.ambassador.expiredRevoked')}
                </span>
              </div>
              {user.ambassador.grantedAt && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.ambassador.granted')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {new Date(user.ambassador.grantedAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {user.ambassador.expiresAt && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.ambassador.expires')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {new Date(user.ambassador.expiresAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {user.ambassador.creditsGranted != null && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.ambassador.creditsGranted')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {user.ambassador.creditsGranted.toLocaleString()}
                  </p>
                </div>
              )}
              {user.ambassador.previousPlan && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.ambassador.previousPlan')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {user.ambassador.previousPlan}
                  </p>
                </div>
              )}
              {user.ambassador.notes && (
                <div>
                  <p className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">
                    {t('admin.userDetail.ambassador.notes')}
                  </p>
                  <p className="text-sm font-medium text-slate-300">
                    {user.ambassador.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Usage Stats */}
      <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
            <Zap className="w-4 h-4 text-indigo-400" />
          </div>
          <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.usage.title')}</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-2">
          <UsageStat
            icon={<BookOpen className="w-4 h-4" />}
            label={t('admin.userDetail.usage.bibleSearches')}
            value={user.usage.bibleSearches}
          />
          <UsageStat
            icon={<Music className="w-4 h-4" />}
            label={t('admin.userDetail.usage.songsCreated')}
            value={user.usage.songsCreated}
          />
          <UsageStat
            icon={<Monitor className="w-4 h-4" />}
            label={t('admin.userDetail.usage.mediaUploaded')}
            value={user.usage.mediaUploaded}
          />
          <UsageStat
            icon={<Mic className="w-4 h-4" />}
            label={t('admin.userDetail.usage.aiHours')}
            value={user.usage.aiHoursUsed}
          />
          <UsageStat
            icon={<FileText className="w-4 h-4" />}
            label={t('admin.userDetail.usage.transcripts')}
            value={user.usage.transcriptCount}
          />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm text-slate-300 font-medium">{value}</span>
    </div>
  );
}

function UsageStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="text-center">
      <div className="w-8 h-8 bg-gray-800 rounded-xl flex items-center justify-center text-slate-400 mx-auto mb-1.5">
        {icon}
      </div>
      <p className="text-lg font-bold text-slate-50">
        {value.toLocaleString()}
      </p>
      <p className="text-[11px] text-slate-500">{label}</p>
    </div>
  );
}
