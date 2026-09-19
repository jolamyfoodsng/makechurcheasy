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
  Activity,
  Smartphone,
  Receipt,
  Percent,
  Copy,
  Check,
  X,
  Trash2,
  Star,
  Tv,
  ExternalLink,
  Image as ImageIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getPlanConfig, type PlanConfig } from "@/lib/planConfigService";
import {
  formatPlanCredits,
  getAdminManagedPlanAmount,
  getAdminManagedPlanCredits,
} from "@/lib/adminManagedSubscriptionForm";

interface UserDetail {
  id: string;
  name: string;
  email: string;
  churchName: string;
  role: string;
  accountStatus?: "active" | "suspended";
  credits: number;
  plan: string;
  createdAt: string | null;
  lastLogin: string | null;
  appId: string;
  activationMilestones?: {
    firstPresentation?: boolean;
    firstPresentationAt?: string | null;
    firstPresentationScreenshotUrl?: string | null;
    firstPresentationType?: string | null;
    appDownloaded?: boolean;
    appDownloadedAt?: string | null;
    devicePaired?: boolean;
    devicePairedAt?: string | null;
    obsConnected?: boolean;
    obsConnectedAt?: string | null;
    firstUse?: boolean;
    firstUseAt?: string | null;
    trialActivated?: boolean;
    trialActivatedAt?: string | null;
  } | null;
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
  activity?: Array<{
    event: string;
    properties: Record<string, unknown>;
    timestamp: string | null;
  }>;
  devices?: Array<{
    deviceId: string;
    deviceName: string;
    appVersion: string;
    appPlatform: string;
    lastSeen: string | null;
    createdAt: string | null;
    status: string;
  }>;
  payments?: Array<{
    plan: string;
    amount: number;
    currency: string;
    provider: string;
    reference: string;
    status: string;
    paidAt: string | null;
  }>;
  paymentTotals?: Array<{ currency: string; amount: number; count: number }>;
  paymentPage?: number;
  paymentPageCount?: number;
  paymentCount?: number;
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
  const [activeTab, setActiveTab] = useState<"profile" | "activity" | "payments">("profile");
  const [previewScreenshotUrl, setPreviewScreenshotUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [accountAction, setAccountAction] = useState<"suspend" | "unsuspend" | null>(null);
  const [confirmAccountAction, setConfirmAccountAction] = useState<"suspend" | "unsuspend" | null>(null);
  const [accountActionMessage, setAccountActionMessage] = useState("");
  const [paymentPageLoading, setPaymentPageLoading] = useState(false);
  const [paymentPageError, setPaymentPageError] = useState("");
  const [paymentPage, setPaymentPage] = useState(1);

  // Trial action state
  const [trialAction, setTrialAction] = useState<string | null>(null);
  const [ambassadorLoading, setAmbassadorLoading] = useState(false);
  const [ambassadorError, setAmbassadorError] = useState("");
  const [trialDays, setTrialDays] = useState(14);
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
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [managedMsg, setManagedMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Discount modal state
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [discountPreset, setDiscountPreset] = useState("half_off_2m");
  const [discountCode, setDiscountCode] = useState("");
  const [discountPercent, setDiscountPercent] = useState(50);
  const [discountDurationMonths, setDiscountDurationMonths] = useState(2);
  const [discountTrialDays, setDiscountTrialDays] = useState(7);
  const [discountPlan, setDiscountPlan] = useState("growth");
  const [discountBillingCycle, setDiscountBillingCycle] = useState("monthly");
  const [discountExpiresInDays, setDiscountExpiresInDays] = useState(14);
  const [discountCustomNote, setDiscountCustomNote] = useState("");
  const [discountSendEmail, setDiscountSendEmail] = useState(true);
  const [discountSubmitting, setDiscountSubmitting] = useState(false);
  const [discountResult, setDiscountResult] = useState<{
    code?: string;
    claimUrl?: string;
    emailSent?: boolean;
    preset?: string;
    trialExtensionDays?: number;
  } | null>(null);
  const [discountError, setDiscountError] = useState("");
  const [discountCopied, setDiscountCopied] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(t('admin.userDetail.userNotFound'));
      const data = await res.json();
      setUser(data);
      setPaymentPage(data.paymentPage || 1);
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

  const handleDiscountPresetChange = (newPreset: string) => {
    setDiscountPreset(newPreset);
    const userSuffix = String(params.id || "").slice(-4).toUpperCase();
    if (newPreset === "half_off_1m") {
      setDiscountCode(`SAVE50-${userSuffix}`);
      setDiscountPercent(50);
      setDiscountDurationMonths(1);
      setDiscountBillingCycle("monthly");
    } else if (newPreset === "half_off_2m") {
      setDiscountCode(`SAVE50-2M-${userSuffix}`);
      setDiscountPercent(50);
      setDiscountDurationMonths(2);
      setDiscountBillingCycle("monthly");
    } else if (newPreset === "trial_extension_7d") {
      setDiscountTrialDays(7);
    } else if (newPreset === "intro_90_off_15d") {
      setDiscountCode(`INTRO90-${userSuffix}`);
      setDiscountPercent(90);
      setDiscountDurationMonths(1);
      setDiscountBillingCycle("monthly");
      setDiscountExpiresInDays(15);
    } else if (newPreset === "annual_20_off") {
      setDiscountCode(`ANNUAL20-${userSuffix}`);
      setDiscountPercent(20);
      setDiscountDurationMonths(12);
      setDiscountBillingCycle("yearly");
    }
  };

  const handleSendDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDiscountSubmitting(true);
    setDiscountError("");
    setDiscountResult(null);

    try {
      const payload = {
        preset: discountPreset,
        code: discountCode,
        discountPercent: Number(discountPercent),
        durationMonths: Number(discountDurationMonths),
        trialExtensionDays: Number(discountTrialDays),
        plan: discountPlan,
        billingCycle: discountBillingCycle,
        expiresInDays: Number(discountExpiresInDays),
        customNote: discountCustomNote,
        sendEmail: discountSendEmail,
      };

      const res = await fetch(`/api/admin/users/${params.id}/discount`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send discount");

      setDiscountResult(data);
      if (discountPreset === "trial_extension_7d") {
        fetchUser();
      }
    } catch (err: any) {
      setDiscountError(err?.message || "Failed to send discount");
    } finally {
      setDiscountSubmitting(false);
    }
  };

  const loadPaymentPage = useCallback(async (nextPage: number) => {
    if (nextPage < 1 || (user?.paymentPageCount && nextPage > user.paymentPageCount)) return;
    setPaymentPageLoading(true);
    setPaymentPageError("");
    try {
      const res = await fetch(`/api/admin/users/${params.id}?paymentsPage=${nextPage}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUser((current) => current ? {
        ...current,
        payments: data.payments || [],
        paymentPage: data.paymentPage || nextPage,
        paymentPageCount: data.paymentPageCount || 1,
        paymentCount: data.paymentCount || 0,
      } : current);
      setPaymentPage(data.paymentPage || nextPage);
    } catch (err: any) {
      setPaymentPageError(err?.message || "Could not load payment history.");
    } finally {
      setPaymentPageLoading(false);
    }
  }, [params.id, user?.paymentPageCount]);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/admin/plan-config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        if (!cancelled) setPlanConfig(data);
      })
      .catch(() => {
        getPlanConfig()
          .then((data) => {
            if (!cancelled) setPlanConfig(data);
          })
          .catch(() => { });
      });

    fetch("/api/admin/platform-settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        const configuredTrialDays = Number(data?.trial?.defaultDurationDays);
        if (Number.isInteger(configuredTrialDays) && configuredTrialDays > 0) {
          setTrialDays(configuredTrialDays);
        }
      })
      .catch(() => { });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setManagedAmount(
      getAdminManagedPlanAmount(
        planConfig,
        managedPlan,
        managedBillingCycle,
        managedCurrency,
      ),
    );
  }, [managedBillingCycle, managedCurrency, managedPlan, planConfig]);

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

  const performAccountAction = useCallback(async (action: "suspend" | "unsuspend") => {
    if (!user) return;
    setAccountAction(action);
    setAccountActionMessage("");
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUser({ ...user, accountStatus: data.accountStatus });
      setAccountActionMessage(action === "suspend" ? "User account blocked." : "User account restored.");
    } catch (err: any) {
      setAccountActionMessage(err?.message || "Could not update account access.");
    } finally {
      setAccountAction(null);
      setConfirmAccountAction(null);
    }
  }, [params.id, user]);

  const handleRevokeAmbassador = useCallback(async () => {
    if (!confirm("Are you sure you want to remove ambassador status for this user?")) return;
    setAmbassadorLoading(true);
    setAmbassadorError("");
    try {
      const res = await fetch(`/api/admin/users/${params.id}/ambassador`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove ambassador");
      if (user) {
        setUser({ ...user, ambassador: undefined, plan: data.revertedPlan || user.plan });
      }
      fetchUser();
    } catch (err: any) {
      setAmbassadorError(err?.message || "Failed to remove ambassador");
    } finally {
      setAmbassadorLoading(false);
    }
  }, [params.id, user, fetchUser]);

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
        ...(data.trial !== undefined ? { trial: data.trial } : {}),
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
  const trialExpired = trialExpiry && trialExpiry.getTime() <= Date.now();
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
  const selectedManagedCredits = getAdminManagedPlanCredits(planConfig, managedPlan);

  function planBadgeClasses(plan: string) {
    const colors: Record<string, string> = {
      free: "bg-gray-800 text-slate-400",
      basic: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
      ambassador: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
      growth: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
    };
    return colors[plan] || colors.free;
  }

  function statusBadgeClasses(active: boolean, expired?: boolean) {
    if (active) return "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50";
    if (expired) return "bg-red-900/50 text-red-300 border border-red-700/50";
    return "bg-gray-800 text-slate-400 border border-slate-700";
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('admin.userDetail.backToUsers')}
      </button>

      {/* Header */}
      <div className="flex flex-col xl:flex-row xl:items-start gap-5 mb-7">
        <div className="flex items-start gap-4 min-w-0 flex-1">
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
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {user.role !== "admin" && (
            <>
              <label className="sr-only" htmlFor="header-trial-days">Trial duration in days</label>
              <input
                id="header-trial-days"
                type="number"
                min={1}
                max={365}
                value={trialDays}
                onChange={(event) => setTrialDays(Number(event.target.value))}
                className="h-10 w-20 px-2 text-sm text-center border border-slate-700 rounded-lg bg-gray-900 text-slate-100"
              />
              <button
                onClick={() => performTrialAction(isTrialActive ? "extend" : "start", trialDays)}
                disabled={!!trialAction || !trialDays || trialDays < 1 || trialDays > 365}
                className="h-10 px-3 inline-flex items-center gap-2 text-sm font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50"
              >
                <Clock className="w-4 h-4" />
                {isTrialActive ? "Extend trial" : "Grant trial"}
              </button>
            </>
          )}
          <a
            href={`mailto:${encodeURIComponent(user.email)}`}
            className="h-10 px-3 inline-flex items-center gap-2 text-sm font-medium rounded-lg border border-slate-700 text-slate-200 hover:bg-gray-800"
          >
            <Mail className="w-4 h-4" /> Email user
          </a>
          {user.role !== "admin" && (
            <button
              type="button"
              onClick={() => {
                setShowDiscountModal(true);
                handleDiscountPresetChange("half_off_2m");
                setDiscountResult(null);
                setDiscountError("");
              }}
              className="h-10 px-3 inline-flex items-center gap-2 text-sm font-medium rounded-lg border border-indigo-500/40 bg-indigo-600/10 text-indigo-300 hover:bg-indigo-600/20 transition"
            >
              <Percent className="w-4 h-4 text-indigo-400" /> Send discount
            </button>
          )}
          {user.role !== "admin" && (
            <button
              onClick={() => setConfirmAccountAction(user.accountStatus === "suspended" ? "unsuspend" : "suspend")}
              disabled={!!accountAction}
              className={`h-10 px-3 inline-flex items-center gap-2 text-sm font-medium rounded-lg border disabled:opacity-50 ${user.accountStatus === "suspended" ? "border-emerald-700/60 text-emerald-300 hover:bg-emerald-900/30" : "border-red-700/60 text-red-300 hover:bg-red-900/30"}`}
            >
              <Shield className="w-4 h-4" />
              {user.accountStatus === "suspended" ? "Unblock user" : "Block user"}
            </button>
          )}
        </div>
      </div>

      {accountActionMessage && (
        <p role="status" className="mb-4 rounded-lg border border-slate-700 bg-gray-900 px-4 py-3 text-sm text-slate-300">
          {accountActionMessage}
        </p>
      )}

      <nav aria-label="User profile sections" className="mb-6 flex gap-1 border-b border-slate-700">
        {([
          ["profile", "User information"],
          ["activity", "Activity"],
          ["payments", "Payments"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            aria-current={activeTab === tab ? "page" : undefined}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-indigo-400 text-indigo-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      <section aria-label="User information" hidden={activeTab !== "profile"}>
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
          <details className="mt-5 border-t border-slate-700/50">
            <summary className="cursor-pointer py-3 text-sm font-medium text-indigo-300 hover:text-indigo-200">
              Manage subscription and billing
            </summary>
            <div className="pb-1 space-y-4">
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
                      {t('common.credits')}
                    </label>
                    <input
                      value={formatPlanCredits(selectedManagedCredits)}
                      readOnly
                      className="h-10 w-full px-3 text-xs border border-slate-700 rounded-lg bg-gray-800/60 text-slate-100 focus:outline-none"
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
          </details>
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
            <InfoRow label="Account status" value={user.accountStatus === "suspended" ? "Blocked" : "Active"} />
            <InfoRow label="Connected devices" value={String(user.devices?.length ?? 0)} />
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
        <details className="bg-gray-900 border border-slate-700 rounded-2xl p-6 md:col-span-2">
          <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.temporaryPlan.title')}</h2>
              <p className="mt-1 text-xs text-slate-500">{isTemporaryPlanActive ? `${user.adminTemporaryPlan?.plan || "Temporary"} plan until ${temporaryPlanExpiresAt?.toLocaleDateString() || "—"}` : "Set time-limited access or return the account to Free."}</p>
            </div>
          </summary>
          <div className="pt-4">

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
        </details>

        {/* Trial Management Card */}
        <details className="bg-gray-900 border border-slate-700 rounded-2xl p-6 md:col-span-2">
          <summary className="flex cursor-pointer list-none items-start gap-3 [&::-webkit-details-marker]:hidden">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Clock className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.trial.title')}</h2>
              <p className="mt-1 text-xs text-slate-500">
                {isTrialActive
              ? t('admin.userDetail.trial.activeDescription')
              : user.trial
                ? `${t('admin.userDetail.trial.title')} ${user.trial.status || "inactive"}`
                : t('admin.userDetail.trial.noTrialRecord')}
              </p>
            </div>
          </summary>
          <div className="pt-4">

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
          {user.role === "admin" ? (
            <div className="pt-3 border-t border-slate-700/50 flex items-center gap-2 text-xs text-slate-400">
              <Shield className="w-4 h-4 text-sky-400" />
              <span>Admin users have full system access and do not require trial management.</span>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-700/50">
                {/* Extend */}
                {isTrialActive && (
                  <>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={365}
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

                    {/* Expire immediately for support/testing */}
                    <button
                      disabled={trialAction === "expire"}
                      onClick={() => performTrialAction("expire", undefined, "Expired by admin")}
                      className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-red-300 border border-red-700/60 hover:bg-red-900/30 rounded-lg disabled:opacity-50 transition-colors"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      {t('admin.userDetail.trial.expire')}
                    </button>
                  </>
                )}

                {/* Restart */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-500" htmlFor="trial-duration-days">
                    New trial
                  </label>
                  <input
                    id="trial-duration-days"
                    type="number"
                    min={1}
                    max={365}
                    value={trialDays}
                    onChange={(e) => setTrialDays(Number(e.target.value))}
                    className="h-8 w-16 px-2 text-xs text-center border border-slate-700 rounded-lg bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    title="Duration for a manually started or restarted trial"
                  />
                  <span className="text-xs text-slate-500">days</span>
                </div>
                <button
                  disabled={trialAction === "restart" || trialAction === "start"}
                  onClick={() => performTrialAction(isTrialActive ? "restart" : "start", trialDays)}
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

              <p className="mt-3 text-[11px] text-slate-500">
                Starting or restarting here is an explicit admin grant. Account switching and sign-in do not renew a trial.
              </p>

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
            </>
          )}
          </div>
        </details>

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
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between">
              {ambassadorError ? (
                <span className="text-xs text-red-400">{ambassadorError}</span>
              ) : (
                <span className="text-xs text-slate-500">Remove ambassador status and revert to previous plan.</span>
              )}
              <button
                type="button"
                disabled={ambassadorLoading}
                onClick={handleRevokeAmbassador}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {ambassadorLoading ? "Removing..." : "Remove Ambassador"}
              </button>
            </div>
          </div>
        )}
      </div>
      </section>

      <section aria-label="User activity" hidden={activeTab !== "activity"} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed up</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">{formatDateTime(user.createdAt)}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last sign-in</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">{formatDateTime(user.lastLogin)}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Connected devices</p>
          <p className="mt-2 text-sm font-semibold text-slate-100">{user.devices?.length ?? 0}</p>
        </div>
      </div>

      {/* First Presentation Milestone & OBS Screenshot Banner */}
      <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-400 shrink-0">
              <Star className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-semibold text-slate-50">First Presentation Milestone</h2>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  user.activationMilestones?.firstPresentation
                    ? "bg-emerald-900/50 text-emerald-300 border border-emerald-700/50"
                    : "bg-amber-900/40 text-amber-300 border border-amber-700/50"
                }`}>
                  {user.activationMilestones?.firstPresentation ? "Achieved" : "Pending"}
                </span>
                {user.activationMilestones?.firstPresentationType && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/60 uppercase">
                    {user.activationMilestones.firstPresentationType}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {user.activationMilestones?.firstPresentation
                  ? `Presented on ${formatDateTime(user.activationMilestones.firstPresentationAt)}`
                  : "User has not presented any Bible verses, worship songs, or media to OBS yet."}
              </p>
            </div>
          </div>
          {user.activationMilestones?.firstPresentationScreenshotUrl && (
            <button
              type="button"
              onClick={() => setPreviewScreenshotUrl(user.activationMilestones!.firstPresentationScreenshotUrl!)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 rounded-lg hover:bg-indigo-500/20 transition self-start lg:self-auto cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View Full Screenshot
            </button>
          )}
        </div>

        {user.activationMilestones?.firstPresentationScreenshotUrl ? (
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-slate-400" /> OBS Live Presentation Output:
            </p>
            <div
              onClick={() => setPreviewScreenshotUrl(user.activationMilestones!.firstPresentationScreenshotUrl!)}
              className="group relative cursor-pointer overflow-hidden rounded-xl border border-slate-700 bg-black/60 max-w-xl transition-all hover:border-indigo-500/60"
            >
              <img
                src={user.activationMilestones.firstPresentationScreenshotUrl}
                alt="First Presentation OBS Output"
                className="w-full h-auto aspect-video object-contain bg-black/40 transition-transform duration-300 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="px-3 py-1.5 rounded-lg bg-gray-900/90 text-white text-xs font-medium shadow-lg border border-slate-600 flex items-center gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" /> Click to enlarge
                </span>
              </div>
            </div>
          </div>
        ) : user.activationMilestones?.firstPresentation ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-700 bg-gray-900/50 p-4 text-xs text-slate-400 flex items-center gap-2">
            <Monitor className="w-4 h-4 text-slate-500 shrink-0" />
            <span>First presentation was completed, but no OBS screenshot was recorded (OBS may have been offline or headless).</span>
          </div>
        ) : null}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center"><Activity className="w-4 h-4 text-indigo-400" /></div>
            <div>
              <h2 className="text-sm font-semibold text-slate-50">Recent activity</h2>
              <p className="text-xs text-slate-500">Latest recorded account events</p>
            </div>
          </div>
          {user.activity?.length ? (
            <ol className="space-y-0">
              {user.activity.map((event, index) => {
                const props = (event.properties || {}) as Record<string, unknown>;
                const screenshotUrl = typeof props.screenshotUrl === "string" ? props.screenshotUrl : null;
                const isFirstPresentation = event.event === "first_presentation";
                const isModeSwitched = event.event === "overlay_mode_switched";
                const isBiblePresent = event.event === "bible_present";
                const isWorshipPresent = event.event === "worship_song_presented";

                return (
                  <li key={`${event.event}-${event.timestamp || index}`} className="flex gap-3 border-l border-slate-700 pl-4 pb-5 last:pb-0">
                    <span className={`-ml-[21px] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-gray-900 ${
                      isFirstPresentation
                        ? "border-amber-400 bg-amber-400/30"
                        : isModeSwitched
                          ? "border-purple-400"
                          : isBiblePresent
                            ? "border-sky-400"
                            : isWorshipPresent
                              ? "border-pink-400"
                              : "border-indigo-400"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-200">{formatEventName(event.event)}</p>
                        {isFirstPresentation && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-900/40 text-amber-300 border border-amber-700/50">
                            <Star className="w-2.5 h-2.5" /> Milestone
                          </span>
                        )}
                        {typeof props.mode === "string" && props.mode && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-300 border border-purple-700/50">
                            <Tv className="w-2.5 h-2.5" /> {props.mode}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">{formatDateTime(event.timestamp)}</p>

                      {/* Event Details Chips */}
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs">
                        {typeof props.source === "string" && props.source && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-slate-400 border border-slate-700/60">
                            Source: {props.source}
                          </span>
                        )}
                        {typeof props.module === "string" && props.module && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-slate-300 border border-slate-700/60">
                            Module: {props.module}
                          </span>
                        )}
                        {typeof props.ref === "string" && props.ref && (
                          <span className="px-2 py-0.5 rounded bg-sky-950/60 text-sky-300 border border-sky-800/60">
                            Ref: {props.ref}
                          </span>
                        )}
                        {typeof props.translation === "string" && props.translation && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-slate-300 border border-slate-700/60">
                            Version: {props.translation}
                          </span>
                        )}
                        {typeof props.songTitle === "string" && props.songTitle && (
                          <span className="px-2 py-0.5 rounded bg-pink-950/60 text-pink-300 border border-pink-800/60">
                            Song: {props.songTitle}
                          </span>
                        )}
                        {typeof props.type === "string" && props.type && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-slate-300 border border-slate-700/60">
                            Type: {props.type}
                          </span>
                        )}
                        {typeof props.overlayMode === "string" && props.overlayMode && (
                          <span className="px-2 py-0.5 rounded bg-purple-950/50 text-purple-300 border border-purple-800/60">
                            Mode: {props.overlayMode}
                          </span>
                        )}
                        {typeof props.appVersion === "string" && props.appVersion && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-slate-300 border border-slate-700/60">
                            v{props.appVersion}
                          </span>
                        )}
                        {typeof props.platform === "string" && props.platform && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-slate-400 border border-slate-700/60">
                            {props.platform}
                          </span>
                        )}
                        {typeof props.method === "string" && props.method && (
                          <span className="px-2 py-0.5 rounded bg-gray-800 text-slate-300 border border-slate-700/60">
                            Method: {props.method}
                          </span>
                        )}
                        {typeof props.trialDaysLeft === "number" && (
                          <span className="px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/60">
                            Trial: {props.trialDaysLeft} days left
                          </span>
                        )}
                      </div>

                      {/* Inline Screenshot Thumbnail if available */}
                      {screenshotUrl && (
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => setPreviewScreenshotUrl(screenshotUrl)}
                            className="group relative block overflow-hidden rounded-lg border border-slate-700 bg-black/40 hover:border-indigo-500 transition cursor-pointer"
                          >
                            <img
                              src={screenshotUrl}
                              alt="Activity OBS Screenshot"
                              className="h-20 w-auto object-cover transition duration-200 group-hover:opacity-90"
                            />
                            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-[10px] text-white font-medium">
                              Enlarge
                            </div>
                          </button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">No activity events recorded yet.</p>
          )}
        </div>

        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center"><Smartphone className="w-4 h-4 text-indigo-400" /></div>
            <div>
              <h2 className="text-sm font-semibold text-slate-50">Connected devices</h2>
              <p className="text-xs text-slate-500">{user.devices?.length ?? 0} active device{user.devices?.length === 1 ? "" : "s"}</p>
            </div>
          </div>
          {user.devices?.length ? (
            <ul className="divide-y divide-slate-800">
              {user.devices.map((device) => (
                <li key={device.deviceId} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-200">{device.deviceName || device.appPlatform || "Unknown device"}{device.appVersion ? ` · ${device.appVersion}` : ""}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{device.deviceId || "Device ID unavailable"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="inline-flex rounded-full bg-emerald-900/40 px-2 py-0.5 text-[11px] text-emerald-300">Connected</span>
                    <p className="mt-1 text-xs text-slate-500">Last seen {formatDateTime(device.lastSeen)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">No connected devices.</p>
          )}
        </div>
      </div>
      </section>

      <section aria-label="User payments" hidden={activeTab !== "payments"} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-slate-700 rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Successful payments</p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">{(user.paymentTotals || []).reduce((count, total) => count + total.count, 0).toLocaleString()}</p>
          </div>
          {(user.paymentTotals || []).map((total) => (
            <div key={total.currency} className="bg-gray-900 border border-slate-700 rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Collected · {total.currency}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-50">{formatCurrency(total.amount, total.currency)}</p>
            </div>
          ))}
        </div>

        <div className="bg-gray-900 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center"><Receipt className="w-4 h-4 text-indigo-400" /></div>
            <div>
              <h2 className="text-sm font-semibold text-slate-50">Payment history</h2>
              <p className="text-xs text-slate-500">Latest 50 billing records · totals include successful payments only</p>
            </div>
          </div>
          {user.payments?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-950/40 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Plan / payment</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Provider</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {user.payments.map((payment, index) => (
                    <tr key={`${payment.reference}-${index}`}>
                      <td className="px-6 py-4 font-medium text-slate-200">{payment.plan}</td>
                      <td className="px-6 py-4 text-slate-400">{formatDateTime(payment.paidAt)}</td>
                      <td className="px-6 py-4 capitalize text-slate-400">{payment.provider.replaceAll("_", " ")}</td>
                      <td className="max-w-[200px] truncate px-6 py-4 font-mono text-xs text-slate-500">{payment.reference || "—"}</td>
                      <td className="px-6 py-4"><span className={`rounded-full px-2 py-1 text-[11px] font-medium ${payment.status === "success" ? "bg-emerald-900/40 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>{payment.status}</span></td>
                      <td className="px-6 py-4 text-right font-medium text-slate-200">{formatCurrency(payment.amount, payment.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-slate-500">No payment records found for this user.</p>
          )}
          {paymentPageError && <p role="alert" className="border-t border-slate-800 px-6 py-3 text-sm text-red-300">{paymentPageError}</p>}
          {!!user.paymentCount && (
            <div className="flex items-center justify-between gap-4 border-t border-slate-800 px-6 py-3">
              <p className="text-xs text-slate-500">Page {paymentPage} of {user.paymentPageCount || 1} · {user.paymentCount.toLocaleString()} records</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void loadPaymentPage(paymentPage - 1)} disabled={paymentPage <= 1 || paymentPageLoading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-gray-800 disabled:opacity-40">Previous</button>
                <button type="button" onClick={() => void loadPaymentPage(paymentPage + 1)} disabled={paymentPage >= (user.paymentPageCount || 1) || paymentPageLoading} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-gray-800 disabled:opacity-40">{paymentPageLoading ? "Loading…" : "Next"}</button>
              </div>
            </div>
          )}
        </div>
      </section>

      {confirmAccountAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="presentation">
          <div role="alertdialog" aria-modal="true" aria-labelledby="account-action-title" aria-describedby="account-action-description" className="w-full max-w-md rounded-2xl border border-slate-700 bg-gray-900 p-6 shadow-2xl">
            <h2 id="account-action-title" className="text-base font-semibold text-slate-50">{confirmAccountAction === "suspend" ? "Block this user?" : "Restore this user?"}</h2>
            <p id="account-action-description" className="mt-2 text-sm leading-6 text-slate-400">
              {confirmAccountAction === "suspend" ? "The user will lose access to MakeChurchEasy until you unblock the account." : "The user will be able to sign in and use MakeChurchEasy again."}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmAccountAction(null)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-gray-800">Cancel</button>
              <button type="button" onClick={() => void performAccountAction(confirmAccountAction)} disabled={!!accountAction} className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${confirmAccountAction === "suspend" ? "bg-red-600 hover:bg-red-500" : "bg-emerald-600 hover:bg-emerald-500"}`}>
                {accountAction ? "Saving…" : confirmAccountAction === "suspend" ? "Block user" : "Unblock user"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Send Discount Modal ── */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-gray-900 p-6 shadow-2xl max-h-[90vh] overflow-y-auto text-slate-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">Send Discount Offer</h2>
                  <p className="text-xs text-slate-400">{user.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDiscountModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {discountResult ? (
              <div className="py-5 space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  <p className="font-semibold text-sm">Discount Created Successfully!</p>
                  <p className="text-xs mt-1 text-emerald-400/80">
                    {discountResult.emailSent
                      ? `A branded discount email has been sent directly to ${user.email}.`
                      : "The discount has been generated and is active."}
                  </p>
                </div>

                {discountResult.code && (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Promo Code
                      </label>
                      <div className="p-2.5 bg-slate-950 border border-slate-700 rounded-xl font-mono text-sm font-bold text-indigo-300">
                        {discountResult.code}
                      </div>
                    </div>

                    {discountResult.claimUrl && (
                      <div>
                        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                          Direct Claim Link
                        </label>
                        <div className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-700 rounded-xl">
                          <input
                            readOnly
                            value={discountResult.claimUrl}
                            className="bg-transparent text-xs text-indigo-300 font-mono flex-1 outline-none px-2"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(discountResult.claimUrl || "");
                              setDiscountCopied(true);
                              setTimeout(() => setDiscountCopied(false), 2000);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0"
                          >
                            {discountCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                            {discountCopied ? "Copied" : "Copy"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowDiscountModal(false)}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendDiscount} className="space-y-4 pt-4 text-xs">
                {/* Popular SaaS Presets */}
                <div>
                  <label className="font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                    Select Discount Preset
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["half_off_2m", "50% Off for 2 Months", "Apple/SaaS half-price offer"],
                      ["half_off_1m", "50% Off for 1 Month", "50% off first month"],
                      ["trial_extension_7d", "7-Day Trial Extension", "Extend free trial by 7 days"],
                      ["intro_90_off_15d", "10% of Price for 15 Days", "90% off introductory price"],
                      ["annual_20_off", "20% Off Annual Plan", "Yearly billing incentive"],
                      ["custom", "Custom Discount", "Customize % and duration"],
                    ].map(([id, title, desc]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleDiscountPresetChange(id)}
                        className={`p-2.5 rounded-xl border text-left transition ${
                          discountPreset === id
                            ? "border-indigo-500 bg-indigo-600/15 text-white ring-1 ring-indigo-500/50"
                            : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <p className="font-bold text-white text-xs">{title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {discountPreset === "trial_extension_7d" ? (
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">Extension Days</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={discountTrialDays}
                      onChange={(e) => setDiscountTrialDays(Number(e.target.value))}
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                    />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 font-medium mb-1">Promo Code</label>
                        <input
                          required
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono uppercase font-bold outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-medium mb-1">Discount %</label>
                        <input
                          type="number"
                          min={1}
                          max={95}
                          required
                          value={discountPercent}
                          onChange={(e) => setDiscountPercent(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 font-medium mb-1">Duration (Months)</label>
                        <input
                          type="number"
                          min={1}
                          max={60}
                          required
                          value={discountDurationMonths}
                          onChange={(e) => setDiscountDurationMonths(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 font-medium mb-1">Expires in (Days)</label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={discountExpiresInDays}
                          onChange={(e) => setDiscountExpiresInDays(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 font-medium mb-1">Applicable Plan</label>
                        <select
                          value={discountPlan}
                          onChange={(e) => setDiscountPlan(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                        >
                          <option value="growth">Growth Plan</option>
                          <option value="basic">Basic Plan</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 font-medium mb-1">Billing Cycle</label>
                        <select
                          value={discountBillingCycle}
                          onChange={(e) => setDiscountBillingCycle(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500"
                        >
                          <option value="monthly">Monthly</option>
                          <option value="yearly">Yearly (Annual)</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-slate-400 font-medium mb-1">Custom Note (Included in Email)</label>
                  <textarea
                    rows={2}
                    value={discountCustomNote}
                    onChange={(e) => setDiscountCustomNote(e.target.value)}
                    placeholder="We'd love to help your ministry take worship to the next level..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <input
                    id="discount-send-email"
                    type="checkbox"
                    checked={discountSendEmail}
                    onChange={(e) => setDiscountSendEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="discount-send-email" className="text-slate-300 font-medium text-xs">
                    Send discount offer email to <strong>{user.email}</strong>
                  </label>
                </div>

                {discountError && (
                  <p className="text-red-400 text-xs">{discountError}</p>
                )}

                <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDiscountModal(false)}
                    className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={discountSubmitting}
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    {discountSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Send Discount
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* OBS Screenshot Modal Preview */}
      {previewScreenshotUrl && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
          onClick={() => setPreviewScreenshotUrl(null)}
        >
          <div
            className="relative max-w-5xl w-full bg-gray-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-gray-950/60">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-100">First Presentation OBS Screenshot</h3>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewScreenshotUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-slate-700 rounded-lg transition inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Open full image
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewScreenshotUrl(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-gray-800 transition"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-black flex items-center justify-center">
              <img
                src={previewScreenshotUrl}
                alt="Full OBS Presentation Screenshot"
                className="max-h-[75vh] w-auto object-contain rounded-lg shadow-inner"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatEventName(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
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
