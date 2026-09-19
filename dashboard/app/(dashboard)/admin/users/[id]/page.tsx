"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  MoreHorizontal,
  Globe,
  Phone,
  MapPin,
  Key,
  Users,
  Share2,
  Laptop,
  CheckCircle2,
  XCircle,
  UserCheck,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getPlanConfig, type PlanConfig } from "@/lib/planConfigService";
import {
  formatPlanCredits,
  getAdminManagedPlanAmount,
  getAdminManagedPlanCredits,
} from "@/lib/adminManagedSubscriptionForm";

function getCountryFlagEmoji(countryCode?: string | null): string {
  if (!countryCode || countryCode.trim().length !== 2) return "";
  const code = countryCode.trim().toUpperCase();
  const codePoints = [...code].map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

function getCountryDisplayName(countryCode?: string | null): string {
  if (!countryCode || !countryCode.trim()) return "—";
  const code = countryCode.trim().toUpperCase();
  const flag = getCountryFlagEmoji(code);
  try {
    const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
    const name = regionNames.of(code);
    return name ? `${flag} ${name} (${code})` : `${flag} ${code}`;
  } catch {
    return `${flag} ${code}`;
  }
}

interface UserDetail {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  phone?: string;
  country?: string;
  language?: string;
  city?: string;
  state?: string;
  churchName: string;
  churchRole?: string;
  denomination?: string;
  churchSize?: string;
  appVersion?: string;
  appPlatform?: string;
  authProvider?: string;
  emailVerified?: boolean;
  twoFactorEnabled?: boolean;
  referralCode?: string;
  referredBy?: string;
  lastIp?: string;
  role: string;
  accountStatus?: "active" | "suspended";
  credits: number;
  plan: string;
  createdAt: string | null;
  lastLogin: string | null;
  lastActive: string | null;
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
  activityPage?: number;
  activityPageCount?: number;
  activityCount?: number;
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
  const [activityPageLoading, setActivityPageLoading] = useState(false);
  const [activityPageError, setActivityPageError] = useState("");
  const [activityPage, setActivityPage] = useState(1);
  const [selectedPaymentReceipt, setSelectedPaymentReceipt] = useState<NonNullable<UserDetail["payments"]>[number] | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<"all" | "success" | "failed" | "cancelled" | "pending">("all");

  const activityScore = useMemo(() => user ? calculateUserActivityScore(user) : null, [user]);

  const filteredPayments = useMemo(() => {
    if (!user?.payments) return [];
    if (paymentStatusFilter === "all") return user.payments;
    if (paymentStatusFilter === "success") {
      return user.payments.filter((p) => p.status === "success" || p.status === "paid");
    }
    if (paymentStatusFilter === "failed") {
      return user.payments.filter((p) => p.status === "failed" || p.status === "failure" || p.status === "error");
    }
    if (paymentStatusFilter === "cancelled") {
      return user.payments.filter((p) => p.status === "cancelled" || p.status === "canceled" || p.status === "abandoned");
    }
    if (paymentStatusFilter === "pending") {
      return user.payments.filter((p) => p.status === "pending" || p.status === "processing");
    }
    return user.payments;
  }, [user?.payments, paymentStatusFilter]);

  const paymentCounts = useMemo(() => {
    const list = user?.payments || [];
    return {
      all: list.length,
      success: list.filter((p) => p.status === "success" || p.status === "paid").length,
      failed: list.filter((p) => p.status === "failed" || p.status === "failure" || p.status === "error").length,
      cancelled: list.filter((p) => p.status === "cancelled" || p.status === "canceled" || p.status === "abandoned").length,
      pending: list.filter((p) => p.status === "pending" || p.status === "processing").length,
    };
  }, [user?.payments]);

  // Trial action state
  const [showTrialModal, setShowTrialModal] = useState(false);
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

  // Admin Action Dropdown Modals State
  const [showGrantCredits, setShowGrantCredits] = useState(false);
  const [creditsAmount, setCreditsAmount] = useState("");
  const [grantingCredits, setGrantingCredits] = useState(false);

  const [showChangePlan, setShowChangePlan] = useState(false);
  const [newPlan, setNewPlan] = useState("growth");
  const [subscriptionBillingCycle, setSubscriptionBillingCycle] = useState("monthly");
  const [subscriptionAmount, setSubscriptionAmount] = useState("");
  const [subscriptionCurrency, setSubscriptionCurrency] = useState("NGN");
  const [subscriptionReference, setSubscriptionReference] = useState("");
  const [subscriptionNote, setSubscriptionNote] = useState("");
  const [notifySubscriptionUser, setNotifySubscriptionUser] = useState(true);
  const [changingPlan, setChangingPlan] = useState(false);

  const [showTemporaryPlan, setShowTemporaryPlan] = useState(false);
  const [showEndTemporaryPlan, setShowEndTemporaryPlan] = useState(false);
  const [temporaryPlan, setTemporaryPlan] = useState("growth");
  const [temporaryDurationDays, setTemporaryDurationDays] = useState("30");
  const [temporaryReason, setTemporaryReason] = useState("");
  const [savingTemporaryPlan, setSavingTemporaryPlan] = useState(false);
  const [endingTemporaryPlan, setEndingTemporaryPlan] = useState(false);

  const [showAmbassador, setShowAmbassador] = useState(false);
  const [showRevokeAmbassador, setShowRevokeAmbassador] = useState(false);
  const [ambassadorDuration, setAmbassadorDuration] = useState("6");
  const [ambassadorCredits, setAmbassadorCredits] = useState("");
  const [ambassadorNotes, setAmbassadorNotes] = useState("");
  const [defaultAmbassadorCredits, setDefaultAmbassadorCredits] = useState<number | null>(null);
  const [grantingAmbassador, setGrantingAmbassador] = useState(false);
  const [revokingAmbassador, setRevokingAmbassador] = useState(false);

  const [showGrantTrial, setShowGrantTrial] = useState(false);
  const [grantTrialDays, setGrantTrialDays] = useState("14");
  const [grantingTrial, setGrantingTrial] = useState(false);

  const [showExtendTrial, setShowExtendTrial] = useState(false);
  const [extendTrialDays, setExtendTrialDays] = useState("30");
  const [extendingTrial, setExtendingTrial] = useState(false);

  const [showCancelTrial, setShowCancelTrial] = useState(false);
  const [cancellingTrial, setCancellingTrial] = useState(false);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/users/${params.id}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(t('admin.userDetail.userNotFound'));
      const data = await res.json();
      setUser(data);
      setPaymentPage(data.paymentPage || 1);
      setActivityPage(data.activityPage || 1);
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
      const res = await fetch(`/api/admin/users/${params.id}?paymentsPage=${nextPage}&activityPage=${activityPage}`, { credentials: "include" });
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
  }, [params.id, user?.paymentPageCount, activityPage]);

  const loadActivityPage = useCallback(async (nextPage: number) => {
    if (nextPage < 1 || (user?.activityPageCount && nextPage > user.activityPageCount)) return;
    setActivityPageLoading(true);
    setActivityPageError("");
    try {
      const res = await fetch(`/api/admin/users/${params.id}?activityPage=${nextPage}&paymentsPage=${paymentPage}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setUser((current) => current ? {
        ...current,
        activity: data.activity || [],
        activityPage: data.activityPage || nextPage,
        activityPageCount: data.activityPageCount || 1,
        activityCount: data.activityCount || 0,
      } : current);
      setActivityPage(data.activityPage || nextPage);
    } catch (err: any) {
      setActivityPageError(err?.message || "Could not load activity history.");
    } finally {
      setActivityPageLoading(false);
    }
  }, [params.id, user?.activityPageCount, paymentPage]);

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
        const credits = data?.ambassador?.creditsPerAmbassador;
        if (typeof credits === "number" && credits > 0) {
          setDefaultAmbassadorCredits(credits);
        }
        const configuredTrialDays = Number(data?.trial?.defaultDurationDays);
        if (Number.isInteger(configuredTrialDays) && configuredTrialDays > 0) {
          setTrialDays(configuredTrialDays);
          setGrantTrialDays(String(configuredTrialDays));
        }
      })
      .catch(() => { });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!showChangePlan) return;
    setSubscriptionAmount(
      getAdminManagedPlanAmount(
        planConfig,
        newPlan,
        subscriptionBillingCycle,
        subscriptionCurrency,
      ),
    );
  }, [newPlan, planConfig, showChangePlan, subscriptionBillingCycle, subscriptionCurrency]);

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

  const handleGrantCredits = async () => {
    if (!user) return;
    const amount = parseFloat(creditsAmount);
    if (!amount || amount <= 0) return;
    setGrantingCredits(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/credits`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? { ...prev, credits: data.credits } : null));
      setAccountActionMessage(t('admin.users.flash.grantedCredits', { amount }));
      setShowGrantCredits(false);
      setCreditsAmount("");
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.grantCreditsFailed'));
    } finally {
      setGrantingCredits(false);
    }
  };

  const handleChangePlan = async () => {
    if (!user) return;
    setChangingPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/plan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: newPlan,
          billingCycle: subscriptionBillingCycle,
          amountPaid: subscriptionAmount || undefined,
          currency: subscriptionCurrency || "NGN",
          paymentReference: subscriptionReference || undefined,
          note: subscriptionNote || undefined,
          notifyUser: notifySubscriptionUser,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        plan: data.plan || newPlan,
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        adminManagedSubscription: data.adminManagedSubscription,
        subscriptionExpiresAt: data.subscriptionExpiresAt,
        scheduledDowngradeAt: data.scheduledDowngradeAt,
        ...(data.trial !== undefined ? { trial: data.trial } : {}),
        ...(data.plan !== "free" ? { adminTemporaryPlan: { ...(prev.adminTemporaryPlan || {}), active: false } } : {}),
      } : null));
      setAccountActionMessage(data.emailSent ? t('admin.users.flash.planChangedEmail', { plan: data.plan || newPlan }) : t('admin.users.flash.planChanged', { plan: data.plan || newPlan }));
      setShowChangePlan(false);
      setSubscriptionAmount("");
      setSubscriptionReference("");
      setSubscriptionNote("");
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.changePlanFailed'));
    } finally {
      setChangingPlan(false);
    }
  };

  const handleSaveTemporaryPlan = async () => {
    if (!user) return;
    const durationDays = parseInt(temporaryDurationDays, 10);
    if (!temporaryPlan || !durationDays || durationDays <= 0) return;
    setSavingTemporaryPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/temporary-plan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: temporaryPlan,
          durationDays,
          reason: temporaryReason || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        plan: data.plan,
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        adminTemporaryPlan: data.adminTemporaryPlan,
      } : null));
      setAccountActionMessage(data.emailSent ? t('admin.users.flash.temporaryPlanSavedEmail') : t('admin.users.flash.temporaryPlanSaved'));
      setShowTemporaryPlan(false);
      setTemporaryReason("");
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.temporaryPlanFailed'));
    } finally {
      setSavingTemporaryPlan(false);
    }
  };

  const handleEndTemporaryPlan = async () => {
    if (!user) return;
    setEndingTemporaryPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/temporary-plan`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        plan: "free",
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        adminTemporaryPlan: data.adminTemporaryPlan,
      } : null));
      setAccountActionMessage(t('admin.users.flash.temporaryPlanEnded'));
      setShowEndTemporaryPlan(false);
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.temporaryPlanEndFailed'));
    } finally {
      setEndingTemporaryPlan(false);
    }
  };

  const handleGrantAmbassador = async () => {
    if (!user) return;
    setGrantingAmbassador(true);
    try {
      const parsedCredits = ambassadorCredits ? parseInt(ambassadorCredits) : undefined;
      const res = await fetch(`/api/admin/users/${user.id}/ambassador`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          durationMonths: parseInt(ambassadorDuration),
          ...(parsedCredits && parsedCredits > 0 ? { credits: parsedCredits } : {}),
          notes: ambassadorNotes || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        plan: "growth",
        credits: data.ambassador?.creditsGranted ?? prev.credits,
        ambassador: data.ambassador,
      } : null));
      setAccountActionMessage(t('admin.users.flash.ambassadorGranted'));
      setShowAmbassador(false);
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.ambassadorGrantFailed'));
    } finally {
      setGrantingAmbassador(false);
    }
  };

  const handleRevokeAmbassadorModal = async () => {
    if (!user) return;
    setRevokingAmbassador(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/ambassador`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        plan: data.revertedPlan,
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        ambassador: { ...(prev.ambassador || {}), active: false },
      } : null));
      setAccountActionMessage(t('admin.users.flash.ambassadorRevoked', { plan: data.revertedPlan }));
      setShowRevokeAmbassador(false);
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.ambassadorRevokeFailed'));
    } finally {
      setRevokingAmbassador(false);
    }
  };

  const handleGrantTrial = async () => {
    if (!user) return;
    setGrantingTrial(true);
    try {
      const days = parseInt(grantTrialDays, 10);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error("Trial duration must be between 1 and 365 days");
      }
      const res = await fetch(`/api/admin/users/${user.id}/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", days }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        plan: "growth",
        trial: data.trial,
      } : null));
      setAccountActionMessage(`Trial granted for ${days} days`);
      setShowGrantTrial(false);
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || "Failed to grant trial");
    } finally {
      setGrantingTrial(false);
    }
  };

  const handleExtendTrial = async () => {
    if (!user) return;
    setExtendingTrial(true);
    try {
      const days = parseInt(extendTrialDays, 10);
      if (!Number.isInteger(days) || days < 1 || days > 3650) {
        throw new Error("Extension days must be between 1 and 3650");
      }
      const res = await fetch(`/api/admin/users/${user.id}/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend", days }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        trial: data.trial,
      } : null));
      setAccountActionMessage(t('admin.users.flash.trialExtended', { days }));
      setShowExtendTrial(false);
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.extendTrialFailed'));
    } finally {
      setExtendingTrial(false);
    }
  };

  const handleCancelTrial = async () => {
    if (!user) return;
    setCancellingTrial(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUser((prev) => (prev ? {
        ...prev,
        plan: "free",
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        trial: { ...(prev.trial || {}), active: false },
      } : null));
      setAccountActionMessage(t('admin.users.flash.trialCancelled'));
      setShowCancelTrial(false);
      fetchUser();
    } catch (err: any) {
      setAccountActionMessage(err?.message || t('admin.users.errors.cancelTrialFailed'));
    } finally {
      setCancellingTrial(false);
    }
  };

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
          setUser({
            ...user,
            trial: data.trial,
            plan: data.trial?.active ? "growth" : user.plan === "growth" && action === "stop" ? "free" : user.plan,
          });
        } else {
          fetchUser();
        }
        setTimeout(() => setTrialMsg(null), 4000);
        return true;
      } catch (err: any) {
        setTrialMsg({
          type: "error",
          text: err?.message || t('admin.userDetail.trial.actionFailed', { action }),
        });
        return false;
      } finally {
        setTrialAction(null);
      }
    },
    [params.id, user, fetchUser, t]
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
  const selectedSubscriptionCredits = getAdminManagedPlanCredits(planConfig, newPlan);

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
              {user.accountStatus === "suspended" ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-950/60 text-red-300 border border-red-800/60">
                  <AlertTriangle className="w-3 h-3" /> Blocked
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-800/60">
                  <Check className="w-3 h-3" /> Active
                </span>
              )}
              {user.emailVerified ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">
                  <CheckCircle2 className="w-3 h-3" /> Verified
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-950/40 text-amber-300 border border-amber-800/40">
                  <Clock className="w-3 h-3" /> Unverified
                </span>
              )}
              {user.country && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {getCountryDisplayName(user.country)}
                </span>
              )}
              {user.appVersion && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-950/60 text-indigo-300 border border-indigo-800/60">
                  <Laptop className="w-3 h-3" /> v{user.appVersion}{user.appPlatform ? ` (${user.appPlatform})` : ""}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-4 flex-wrap text-xs sm:text-sm text-slate-400">
              <p className="flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {user.email}
              </p>
              {user.phone && (
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {user.phone}
                </p>
              )}
              {user.churchName && (
                <p className="flex items-center gap-1.5">
                  <Church className="w-3.5 h-3.5 text-slate-500 shrink-0" /> {user.churchName}
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          {/* Actions Dropdown */}
          <details className="relative">
            <summary className="flex h-10 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-slate-700 bg-gray-900 px-3 text-sm font-medium text-slate-200 hover:bg-gray-800 [&::-webkit-details-marker]:hidden">
              <MoreHorizontal className="h-4 w-4" /> Actions
            </summary>
            <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-slate-700 bg-gray-900 p-1.5 shadow-2xl">
              <button
                type="button"
                onClick={() => { setShowGrantCredits(true); setCreditsAmount(""); }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800"
              >
                Grant credits
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowChangePlan(true);
                  setNewPlan(user.plan === "free" ? "growth" : user.plan);
                  setSubscriptionBillingCycle(user.adminManagedSubscription?.billingCycle || "monthly");
                  setSubscriptionAmount("");
                  setSubscriptionCurrency(user.adminManagedSubscription?.currency || "NGN");
                  setSubscriptionReference("");
                  setSubscriptionNote("");
                  setNotifySubscriptionUser(true);
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800"
              >
                Change plan
              </button>
              {!(user.plan === "free" && user.trial?.active) && (
                <button
                  type="button"
                  onClick={() => { setShowGrantTrial(true); setGrantTrialDays(String(trialDays || 14)); }}
                  className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800"
                >
                  Grant trial
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (user.adminTemporaryPlan?.active) {
                    setShowEndTemporaryPlan(true);
                    return;
                  }
                  setShowTemporaryPlan(true);
                  setTemporaryPlan(user.plan === "free" ? "growth" : "free");
                  setTemporaryDurationDays("30");
                  setTemporaryReason("");
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800"
              >
                {user.adminTemporaryPlan?.active ? "End temporary plan" : "Set temporary plan"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (user.ambassador?.active) {
                    setShowRevokeAmbassador(true);
                  } else {
                    setShowAmbassador(true);
                    setAmbassadorDuration("6");
                    setAmbassadorCredits("");
                    setAmbassadorNotes("");
                  }
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800"
              >
                {user.ambassador?.active ? "Revoke ambassador" : "Grant ambassador"}
              </button>
              {user.plan === "free" && user.trial?.active && (
                <>
                  <button
                    type="button"
                    onClick={() => { setShowExtendTrial(true); setExtendTrialDays("30"); }}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800"
                  >
                    Extend trial
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelTrial(true)}
                    className="w-full rounded-lg px-3 py-2 text-left text-xs text-red-300 hover:bg-red-950/40"
                  >
                    Cancel trial
                  </button>
                </>
              )}
              <div className="my-1 border-t border-slate-800" />
              {user.role !== "admin" && (
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscountModal(true);
                    handleDiscountPresetChange("half_off_2m");
                    setDiscountResult(null);
                    setDiscountError("");
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-xs text-indigo-300 hover:bg-indigo-500/10"
                >
                  Send discount
                </button>
              )}
              {user.role !== "admin" && (
                <button
                  type="button"
                  onClick={() => setConfirmAccountAction(user.accountStatus === "suspended" ? "unsuspend" : "suspend")}
                  className={`w-full rounded-lg px-3 py-2 text-left text-xs ${user.accountStatus === "suspended" ? "text-emerald-300 hover:bg-emerald-950/40" : "text-red-300 hover:bg-red-950/40"}`}
                >
                  {user.accountStatus === "suspended" ? "Unblock user" : "Block user"}
                </button>
              )}
            </div>
          </details>
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
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors inline-flex items-center gap-2 ${activeTab === tab ? "border-indigo-400 text-indigo-300" : "border-transparent text-slate-400 hover:text-slate-200"}`}
          >
            {label}
            {tab === "activity" && activityScore && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${activityScore.badgeBg}`}>
                {activityScore.score}%
              </span>
            )}
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

        {/* Account & Identity Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <Calendar className="w-4 h-4 text-indigo-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">{t('admin.userDetail.accountInfo')}</h2>
          </div>
          <div className="space-y-1">
            <InfoRow label="Full name" value={user.name || "—"} />
            <InfoRow label="Email address">
              <div className="flex items-center gap-1.5 justify-end">
                <span className="text-sm text-slate-300 font-medium truncate">{user.email}</span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${user.emailVerified ? "bg-emerald-900/60 text-emerald-300 border border-emerald-700/50" : "bg-amber-900/60 text-amber-300 border border-amber-700/50"}`}>
                  {user.emailVerified ? "Verified" : "Unverified"}
                </span>
              </div>
            </InfoRow>
            <InfoRow label="Phone number" value={user.phone || "—"} />
            <InfoRow label="Country" value={getCountryDisplayName(user.country)} />
            <InfoRow label="Location (City / State)" value={[user.city, user.state].filter(Boolean).join(", ") || "—"} />
            <InfoRow label="Preferred language" value={user.language ? user.language.toUpperCase() : "English (EN)"} />
            <InfoRow label={t('admin.userDetail.appId')} value={user.appId || "—"} />
            <InfoRow label="Role" value={user.role} />
            <InfoRow label="Account status" value={user.accountStatus === "suspended" ? "Blocked / Suspended" : "Active"} />
            <InfoRow label="Two-Factor Auth (2FA)">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${user.twoFactorEnabled ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                <Key className="w-3 h-3" /> {user.twoFactorEnabled ? "Enabled" : "Disabled"}
              </span>
            </InfoRow>
            <InfoRow label="Auth provider" value={user.authProvider ? user.authProvider.toUpperCase() : "CREDENTIALS"} />
          </div>
        </div>

        {/* Church & Ministry Profile Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <Church className="w-4 h-4 text-purple-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">Church & Ministry Profile</h2>
          </div>
          <div className="space-y-1">
            <InfoRow label="Church name" value={user.churchName || "—"} />
            <InfoRow label="Church role / Position" value={user.churchRole || "—"} />
            <InfoRow label="Denomination" value={user.denomination || "—"} />
            <InfoRow label="Congregation size" value={user.churchSize || "—"} />
          </div>
        </div>

        {/* Desktop App & Hardware Details Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-sky-500/15 flex items-center justify-center">
              <Monitor className="w-4 h-4 text-sky-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">App & Hardware Details</h2>
          </div>
          <div className="space-y-1">
            <InfoRow label="App version" value={user.appVersion ? `v${user.appVersion}` : "—"} />
            <InfoRow label="Platform / OS" value={user.appPlatform || "—"} />
            <InfoRow label="Connected devices" value={`${user.devices?.length ?? 0} active device${user.devices?.length === 1 ? "" : "s"}`} />
            <InfoRow label="Hardware paired">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${user.activationMilestones?.devicePaired ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                {user.activationMilestones?.devicePaired ? "Paired" : "Not paired"}
              </span>
            </InfoRow>
            <InfoRow label="App downloaded">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${user.activationMilestones?.appDownloaded ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                {user.activationMilestones?.appDownloaded ? "Downloaded" : "Pending"}
              </span>
            </InfoRow>
            <InfoRow label="OBS connected">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${user.activationMilestones?.obsConnected ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                {user.activationMilestones?.obsConnected ? "Connected" : "Not connected"}
              </span>
            </InfoRow>
            <InfoRow label="First presentation">
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${user.activationMilestones?.firstPresentation ? "bg-amber-950/60 text-amber-300 border border-amber-800/60" : "bg-slate-800 text-slate-400 border border-slate-700"}`}>
                {user.activationMilestones?.firstPresentation ? `Achieved (${user.activationMilestones?.firstPresentationType || "Live"})` : "Pending"}
              </span>
            </InfoRow>
          </div>
        </div>

        {/* Growth, Referral & Access Card */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6 md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <Share2 className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-sm font-semibold text-slate-50">Growth, Referrals & Network</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1">
            <InfoRow label="Referral code" value={user.referralCode || "—"} />
            <InfoRow label="Referred by" value={user.referredBy || "Direct / None"} />
            <InfoRow label="IP Address" value={user.lastIp || "—"} />
            <InfoRow
              label={t('common.signedUp')}
              value={formatRelativeTime(user.createdAt)}
              subValue={user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : null}
            />
            <InfoRow
              label={t('common.lastLogin')}
              value={user.lastLogin ? formatRelativeTime(user.lastLogin) : t('common.never')}
              subValue={user.lastLogin ? new Date(user.lastLogin).toLocaleString() : null}
            />
            <InfoRow
              label="Effective last active"
              value={user.lastActive ? formatRelativeTime(user.lastActive) : "—"}
              subValue={user.lastActive ? new Date(user.lastActive).toLocaleString() : null}
            />
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

        {/* User Activity & Engagement Health Score Card */}
        {activityScore && (
          <div className="bg-gray-900 border border-slate-700 rounded-2xl p-6 md:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-400 shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-sm font-semibold text-slate-50">User Activity & Engagement Score</h2>
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${activityScore.badgeBg}`}>
                      {activityScore.grade}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Multi-factor engagement score calculated from login recency, connected hardware, live presentation, content usage, and subscription health.
                  </p>
                </div>
              </div>
              <div className="flex items-baseline gap-1 self-start sm:self-auto shrink-0 bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-2">
                <span className={`text-2xl font-bold font-mono ${activityScore.color}`}>{activityScore.score}%</span>
                <span className="text-xs text-slate-500">/ 100%</span>
              </div>
            </div>

            {/* Score progress bar */}
            <div className="mt-4">
              <div className="h-2.5 w-full bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${activityScore.barColor}`}
                  style={{ width: `${Math.max(4, activityScore.score)}%` }}
                />
              </div>
            </div>

            {/* Metrics Breakdown Grid */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {activityScore.breakdown.map((item) => (
                <div
                  key={item.category}
                  className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-3 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[11px] font-medium text-slate-400 truncate">{item.category}</span>
                    <span className="text-xs font-semibold font-mono text-slate-200">
                      {item.score}/{item.maxScore}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 truncate" title={item.detail}>{item.detail}</p>
                  <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${item.score === item.maxScore ? "bg-emerald-500" : item.score > 0 ? "bg-indigo-500" : "bg-slate-700"}`}
                      style={{ width: `${(item.score / item.maxScore) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Signed up</p>
          <p className="mt-2 text-base font-semibold text-slate-100">{formatRelativeTime(user.createdAt)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(user.createdAt)}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Last sign-in</p>
          <p className="mt-2 text-base font-semibold text-slate-100">{user.lastLogin ? formatRelativeTime(user.lastLogin) : "Never"}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDateTime(user.lastLogin)}</p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Connected devices</p>
          <p className="mt-2 text-base font-semibold text-slate-100">{user.devices?.length ?? 0} active</p>
          <p className="mt-1 text-xs text-slate-500">{user.activationMilestones?.devicePaired ? "Hardware paired" : "No devices"}</p>
        </div>
        {activityScore && (
          <div className="rounded-2xl border border-slate-700 bg-gray-900 p-5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Activity Score</p>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${activityScore.badgeBg}`}>
                {activityScore.grade}
              </span>
            </div>
            <p className={`mt-2 text-2xl font-bold font-mono ${activityScore.color}`}>{activityScore.score}%</p>
            <div className="mt-1.5 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${activityScore.barColor}`}
                style={{ width: `${Math.max(4, activityScore.score)}%` }}
              />
            </div>
          </div>
        )}
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
                const isFirstPresentation = event.event === "first_presentation" || event.event === "first_presentation_milestone";
                const isModeSwitched = event.event === "overlay_mode_switched";
                const isBiblePresent = event.event === "bible_present";
                const isWorshipPresent = event.event === "worship_song_presented";
                const isPaymentSuccess = event.event === "payment_made" || event.event === "payment_success" || event.event === "billing_success";
                const isPaymentFailure = event.event === "payment_failure" || event.event === "payment_failed" || event.event === "billing_failed";
                const isPaymentCancelled = event.event === "payment_cancelled" || event.event === "subscription_cancelled";
                const isTrialEvent = event.event.startsWith("trial_");
                const isAmbassadorEvent = event.event.includes("ambassador");
                const isPasscodeEvent = event.event.includes("passcode");
                const isAdminEvent = event.event.startsWith("admin_");
                const isDowngradeEvent = event.event.includes("downgrade");

                return (
                  <li key={`${event.event}-${event.timestamp || index}`} className="flex gap-3 border-l border-slate-700 pl-4 pb-5 last:pb-0">
                    <span className={`-ml-[21px] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 bg-gray-900 ${
                      isPaymentFailure
                        ? "border-red-400 bg-red-400/40"
                        : isPaymentSuccess
                          ? "border-emerald-400 bg-emerald-400/40"
                          : isPaymentCancelled
                            ? "border-amber-400 bg-amber-400/40"
                            : isAmbassadorEvent || isPasscodeEvent
                              ? "border-purple-400 bg-purple-400/30"
                              : isTrialEvent
                                ? "border-indigo-400 bg-indigo-400/30"
                                : isFirstPresentation
                                  ? "border-amber-400 bg-amber-400/30"
                                  : isModeSwitched
                                    ? "border-purple-400"
                                    : isBiblePresent
                                      ? "border-sky-400"
                                      : isWorshipPresent
                                        ? "border-pink-400"
                                        : "border-slate-400"
                    }`} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-slate-200">{formatEventName(event.event)}</p>
                        {isFirstPresentation && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-900/40 text-amber-300 border border-amber-700/50">
                            <Star className="w-2.5 h-2.5" /> Milestone
                          </span>
                        )}
                        {isPaymentSuccess && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-900/50 text-emerald-300 border border-emerald-700/50">
                            <Check className="w-2.5 h-2.5" /> Payment Success
                          </span>
                        )}
                        {isPaymentFailure && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-900/50 text-red-300 border border-red-700/50">
                            <AlertTriangle className="w-2.5 h-2.5" /> Payment Failed
                          </span>
                        )}
                        {isPaymentCancelled && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
                            Cancelled
                          </span>
                        )}
                        {isAmbassadorEvent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-300 border border-purple-700/50">
                            <Crown className="w-2.5 h-2.5" /> Ambassador
                          </span>
                        )}
                        {isPasscodeEvent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-900/40 text-purple-300 border border-purple-700/50">
                            Passcode
                          </span>
                        )}
                        {isTrialEvent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-900/40 text-indigo-300 border border-indigo-700/50">
                            <Clock className="w-2.5 h-2.5" /> Trial
                          </span>
                        )}
                        {isAdminEvent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-900/40 text-sky-300 border border-sky-700/50">
                            <Shield className="w-2.5 h-2.5" /> Admin
                          </span>
                        )}
                        {isDowngradeEvent && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                            Downgraded
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

          {activityPageError && (
            <p role="alert" className="mt-4 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-2.5 text-xs text-red-300">
              {activityPageError}
            </p>
          )}

          {/* Activity Numbered Pagination Bar */}
          {user.activityPageCount && user.activityPageCount > 1 ? (
            <div className="mt-5 border-t border-slate-800 pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Page {activityPage} of {user.activityPageCount} · {user.activityCount?.toLocaleString() ?? 0} total events
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => void loadActivityPage(activityPage - 1)}
                  disabled={activityPage <= 1 || activityPageLoading}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  Previous
                </button>
                {Array.from({ length: user.activityPageCount }, (_, i) => i + 1)
                  .filter((pageNum) => {
                    if (pageNum === 1 || pageNum === user.activityPageCount) return true;
                    return Math.abs(pageNum - activityPage) <= 2;
                  })
                  .reduce<(number | string)[]>((acc, pageNum, idx, arr) => {
                    if (idx > 0) {
                      const prev = arr[idx - 1];
                      if (typeof prev === "number" && pageNum - prev > 1) {
                        acc.push(`ellipsis-${prev}`);
                      }
                    }
                    acc.push(pageNum);
                    return acc;
                  }, [])
                  .map((item) => {
                    if (typeof item === "string") {
                      return (
                        <span key={item} className="px-1.5 text-xs text-slate-600 select-none">
                          …
                        </span>
                      );
                    }
                    const isCurrent = item === activityPage;
                    return (
                      <button
                        key={item}
                        type="button"
                        onClick={() => void loadActivityPage(item)}
                        disabled={activityPageLoading}
                        className={`min-w-[32px] h-8 rounded-lg px-2 text-xs font-medium transition-colors ${
                          isCurrent
                            ? "bg-indigo-600 text-white font-semibold shadow-sm"
                            : "border border-slate-700 text-slate-300 hover:bg-gray-800 hover:text-white"
                        }`}
                      >
                        {item}
                      </button>
                    );
                  })}
                <button
                  type="button"
                  onClick={() => void loadActivityPage(activityPage + 1)}
                  disabled={activityPage >= (user.activityPageCount || 1) || activityPageLoading}
                  className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-gray-800 disabled:opacity-40 transition-colors"
                >
                  {activityPageLoading ? "Loading…" : "Next"}
                </button>
              </div>
            </div>
          ) : null}
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
        {/* Payment Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="bg-gray-900 border border-slate-700 rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Total Records</p>
            <p className="mt-2 text-2xl font-semibold text-slate-50">{paymentCounts.all.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">All recorded billing attempts</p>
          </div>
          <div className="bg-gray-900 border border-slate-700 rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-400">Successful Payments</p>
            <p className="mt-2 text-2xl font-semibold text-emerald-300">{paymentCounts.success.toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">Completed transactions</p>
          </div>
          {(user.paymentTotals || []).map((total) => (
            <div key={total.currency} className="bg-gray-900 border border-slate-700 rounded-2xl p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Collected · {total.currency}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-50">{formatCurrency(total.amount, total.currency)}</p>
              <p className="mt-1 text-xs text-slate-500">{total.count} success records</p>
            </div>
          ))}
          <div className="bg-gray-900 border border-slate-700 rounded-2xl p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">Failed / Cancelled</p>
            <p className="mt-2 text-2xl font-semibold text-red-300">{(paymentCounts.failed + paymentCounts.cancelled).toLocaleString()}</p>
            <p className="mt-1 text-xs text-slate-500">{paymentCounts.failed} failed · {paymentCounts.cancelled} cancelled</p>
          </div>
        </div>

        {/* Payment History Card with Filter Pills */}
        <div className="bg-gray-900 border border-slate-700 rounded-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
                <Receipt className="w-4 h-4 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-50">Payment history & transactions</h2>
                <p className="text-xs text-slate-500">All billing records including successes, failures, and cancellations</p>
              </div>
            </div>

            {/* Payment Status Filter Buttons */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {([
                { id: "all", label: "All", count: paymentCounts.all },
                { id: "success", label: "Successful", count: paymentCounts.success },
                { id: "failed", label: "Failed", count: paymentCounts.failed },
                { id: "cancelled", label: "Cancelled", count: paymentCounts.cancelled },
                { id: "pending", label: "Pending", count: paymentCounts.pending },
              ] as const).map((tab) => {
                if (tab.count === 0 && tab.id !== "all" && tab.id !== "success") return null;
                const isActive = paymentStatusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setPaymentStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? "bg-indigo-600 text-white shadow"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800 hover:bg-slate-800"
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] ${isActive ? "bg-white/20 text-white" : "bg-slate-800 text-slate-400"}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {filteredPayments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-gray-950/40 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Plan / item</th>
                    <th className="px-6 py-3 font-medium">Date</th>
                    <th className="px-6 py-3 font-medium">Provider</th>
                    <th className="px-6 py-3 font-medium">Reference</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 text-right font-medium">Amount</th>
                    <th className="px-6 py-3 text-right font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredPayments.map((payment, index) => (
                    <tr key={`${payment.reference}-${index}`} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-200">{payment.plan}</td>
                      <td className="px-6 py-4">
                        <p className="text-slate-200 text-xs font-medium">{formatRelativeTime(payment.paidAt)}</p>
                        <p className="text-slate-500 text-[11px]">{formatDateTime(payment.paidAt)}</p>
                      </td>
                      <td className="px-6 py-4 capitalize text-slate-400">{payment.provider.replaceAll("_", " ")}</td>
                      <td className="max-w-[200px] truncate px-6 py-4 font-mono text-xs text-slate-400">{payment.reference || "—"}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase border ${paymentStatusBadge(payment.status)}`}>
                          {paymentStatusLabel(payment.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-100">{formatCurrency(payment.amount, payment.currency)}</td>
                      <td className="px-6 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedPaymentReceipt(payment)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 transition cursor-pointer"
                        >
                          <Receipt className="w-3.5 h-3.5 text-indigo-400" />
                          Receipt
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-6 py-12 text-center text-sm text-slate-500">
              {paymentStatusFilter === "all"
                ? "No payment records found for this user."
                : `No ${paymentStatusFilter} payment records found for this user.`}
            </p>
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

      {/* Give / Extend Trial Modal */}
      {showTrialModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setShowTrialModal(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700 bg-gray-900 p-6 shadow-2xl text-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">
                    {isTrialActive ? "Extend Trial Access" : "Give Free Trial Access"}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {user.name || user.email} · {user.plan.toUpperCase()} plan
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTrialModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-gray-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4 text-xs">
              {isTrialActive && (
                <div className="p-3 bg-indigo-950/40 border border-indigo-800/60 rounded-xl text-indigo-300">
                  <p className="font-semibold">Current Active Trial</p>
                  <p className="text-slate-300 mt-0.5">
                    Expires on {trialExpiry ? trialExpiry.toLocaleDateString() : "—"} ({formatRelativeTime(trialExpiry?.toISOString())})
                  </p>
                </div>
              )}

              <div>
                <label className="block text-slate-400 font-medium mb-1.5">
                  {isTrialActive ? "Additional Days to Add" : "Trial Duration (Days)"}
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[7, 14, 30, 60].map((presetDays) => (
                    <button
                      key={presetDays}
                      type="button"
                      onClick={() => setTrialDays(presetDays)}
                      className={`py-2 px-2.5 rounded-lg font-semibold border transition text-center cursor-pointer ${
                        trialDays === presetDays
                          ? "bg-indigo-600 text-white border-indigo-500 shadow"
                          : "bg-gray-800 text-slate-300 border-slate-700 hover:bg-gray-700"
                      }`}
                    >
                      {presetDays} Days
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={trialDays}
                    onChange={(e) => setTrialDays(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 text-sm"
                    placeholder="Custom number of days"
                  />
                  <span className="text-slate-400 text-xs shrink-0">days</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 font-medium mb-1.5">Reason / Admin Note (Optional)</label>
                <input
                  type="text"
                  value={trialReason}
                  onChange={(e) => setTrialReason(e.target.value)}
                  placeholder="e.g. Requested via support, church onboarding promotion..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              {trialMsg && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    trialMsg.type === "success"
                      ? "bg-emerald-950/60 text-emerald-300 border-emerald-700/60"
                      : "bg-red-950/60 text-red-300 border-red-700/60"
                  }`}
                >
                  {trialMsg.text}
                </div>
              )}

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowTrialModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 hover:bg-slate-800 text-slate-300 font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!!trialAction || trialDays < 1}
                  onClick={async () => {
                    const ok = await performTrialAction(isTrialActive ? "extend" : "start", trialDays, trialReason);
                    if (ok) {
                      setShowTrialModal(false);
                    }
                  }}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {trialAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isTrialActive ? "Extend Trial" : "Give Trial"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Receipt Modal */}
      {selectedPaymentReceipt && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm print:p-0 print:bg-white"
          onClick={() => setSelectedPaymentReceipt(null)}
        >
          <div
            className="relative max-w-lg w-full bg-gray-900 border border-slate-700 rounded-2xl overflow-hidden shadow-2xl print:border-none print:shadow-none print:bg-white print:text-black"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-gray-950/60 print:bg-transparent print:border-b-2 print:border-gray-200">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center print:hidden ${
                  selectedPaymentReceipt.status === "success" || selectedPaymentReceipt.status === "paid"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : selectedPaymentReceipt.status === "failed" || selectedPaymentReceipt.status === "failure"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-amber-500/15 text-amber-400"
                }`}>
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-100 print:text-gray-900">MakeChurchEasy Official Receipt</h3>
                  <p className="text-xs text-slate-400 print:text-gray-500 font-mono">Ref: {selectedPaymentReceipt.reference || "N/A"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPaymentReceipt(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-gray-800 transition print:hidden cursor-pointer"
                aria-label="Close receipt"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Printable Receipt Content */}
            <div className="p-6 space-y-6 text-slate-200 print:text-gray-800" id="printable-receipt">
              {/* Receipt Top Status & Amount */}
              <div className="flex items-center justify-between bg-slate-950/50 p-4 rounded-xl border border-slate-800 print:bg-gray-50 print:border-gray-200">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 print:text-gray-500">Amount</span>
                  <p className="text-2xl font-bold text-slate-50 print:text-gray-900 mt-0.5">
                    {formatCurrency(selectedPaymentReceipt.amount, selectedPaymentReceipt.currency)}
                  </p>
                </div>
                <div className="text-right">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold uppercase border ${paymentStatusBadge(selectedPaymentReceipt.status)}`}>
                    {selectedPaymentReceipt.status === "success" || selectedPaymentReceipt.status === "paid" ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : selectedPaymentReceipt.status === "failed" || selectedPaymentReceipt.status === "failure" ? (
                      <AlertTriangle className="w-3.5 h-3.5" />
                    ) : null}
                    {paymentStatusLabel(selectedPaymentReceipt.status)}
                  </span>
                  <p className="text-[11px] text-slate-400 print:text-gray-500 mt-1">
                    {formatRelativeTime(selectedPaymentReceipt.paidAt)}
                  </p>
                </div>
              </div>

              {/* Notice for failed/cancelled */}
              {selectedPaymentReceipt.status !== "success" && selectedPaymentReceipt.status !== "paid" && (
                <div className={`p-3 rounded-xl border text-xs ${
                  selectedPaymentReceipt.status === "failed" || selectedPaymentReceipt.status === "failure"
                    ? "bg-red-950/40 text-red-300 border-red-800/60"
                    : "bg-amber-950/40 text-amber-300 border-amber-800/60"
                }`}>
                  <p className="font-semibold">
                    {selectedPaymentReceipt.status === "failed" || selectedPaymentReceipt.status === "failure"
                      ? "Payment Failed"
                      : "Payment Not Completed"}
                  </p>
                  <p className="text-slate-300 mt-0.5">
                    {selectedPaymentReceipt.status === "failed" || selectedPaymentReceipt.status === "failure"
                      ? "This billing transaction was declined or failed by the payment provider."
                      : "This transaction was cancelled or abandoned before payment completion."}
                  </p>
                </div>
              )}

              {/* Customer & Subscription Details */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 print:text-gray-500">Transaction Details</h4>
                <div className="rounded-xl border border-slate-800 divide-y divide-slate-800 bg-slate-950/30 text-xs print:bg-white print:border-gray-200 print:divide-gray-200">
                  <div className="flex justify-between py-2.5 px-3.5">
                    <span className="text-slate-400 print:text-gray-500">Customer / Church</span>
                    <span className="font-medium text-slate-200 print:text-gray-900 text-right">{user.name || user.email}{user.churchName ? ` (${user.churchName})` : ""}</span>
                  </div>
                  <div className="flex justify-between py-2.5 px-3.5">
                    <span className="text-slate-400 print:text-gray-500">Email Address</span>
                    <span className="font-mono text-slate-200 print:text-gray-900 text-right">{user.email}</span>
                  </div>
                  <div className="flex justify-between py-2.5 px-3.5">
                    <span className="text-slate-400 print:text-gray-500">App ID</span>
                    <span className="font-mono text-slate-200 print:text-gray-900">{user.appId || "N/A"}</span>
                  </div>
                  <div className="flex justify-between py-2.5 px-3.5">
                    <span className="text-slate-400 print:text-gray-500">Plan / Item</span>
                    <span className="font-medium text-slate-200 print:text-gray-900 capitalize">{selectedPaymentReceipt.plan} Plan</span>
                  </div>
                  <div className="flex justify-between py-2.5 px-3.5">
                    <span className="text-slate-400 print:text-gray-500">Payment Gateway</span>
                    <span className="font-medium text-slate-200 print:text-gray-900 capitalize">{selectedPaymentReceipt.provider.replaceAll("_", " ")}</span>
                  </div>
                  <div className="flex justify-between py-2.5 px-3.5">
                    <span className="text-slate-400 print:text-gray-500">Payment Date & Time</span>
                    <span className="font-medium text-slate-200 print:text-gray-900">{formatDateTime(selectedPaymentReceipt.paidAt)}</span>
                  </div>
                  <div className="flex justify-between py-2.5 px-3.5">
                    <span className="text-slate-400 print:text-gray-500">Transaction Reference</span>
                    <span className="font-mono text-[11px] text-slate-300 print:text-gray-700 truncate max-w-[220px]">{selectedPaymentReceipt.reference}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-4 border-t border-slate-800 bg-gray-950/60 flex items-center justify-between gap-3 print:hidden">
              <button
                type="button"
                onClick={() => {
                  if (selectedPaymentReceipt.reference) {
                    navigator.clipboard.writeText(selectedPaymentReceipt.reference);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-slate-700 rounded-xl transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Reference
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition cursor-pointer"
                >
                  <Receipt className="w-3.5 h-3.5" /> Print / Save PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentReceipt(null)}
                  className="px-3 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-xl hover:bg-gray-800 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Grant Credits Modal */}
      {showGrantCredits && (
        <Modal onClose={() => setShowGrantCredits(false)} title={t('admin.users.grantCredits.title')}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.grantCredits.amountLabel')}</label>
              <input
                type="number"
                min="1"
                value={creditsAmount}
                onChange={(e) => setCreditsAmount(e.target.value)}
                placeholder={t('admin.users.grantCredits.amountPlaceholder')}
                className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGrantCredits(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGrantCredits}
                disabled={!creditsAmount || parseFloat(creditsAmount) <= 0 || grantingCredits}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {grantingCredits ? t('admin.users.grantCredits.granting') : t('admin.users.grantCredits.button')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Change Plan Modal */}
      {showChangePlan && (
        <Modal onClose={() => setShowChangePlan(false)} title={t('admin.users.changePlan.title')}>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              {t('admin.users.changePlan.description')}
            </p>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.changePlan.newPlan')}</label>
              <select
                value={newPlan}
                onChange={(e) => setNewPlan(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
              >
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="growth">Growth</option>
              </select>
            </div>
            {newPlan !== "free" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.changePlan.billingCycle')}</label>
                    <select
                      value={subscriptionBillingCycle}
                      onChange={(e) => setSubscriptionBillingCycle(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    >
                      <option value="monthly">{t('admin.users.changePlan.monthly')}</option>
                      <option value="yearly">{t('admin.users.changePlan.yearly')}</option>
                      <optgroup label="Gift">
                        <option value="gift_3m">Gift — 3 months</option>
                        <option value="gift_6m">Gift — 6 months</option>
                        <option value="gift_12m">Gift — 12 months</option>
                      </optgroup>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.changePlan.currency')}</label>
                    <input
                      value={subscriptionCurrency}
                      onChange={(e) => setSubscriptionCurrency(e.target.value.toUpperCase())}
                      className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.changePlan.amount')}</label>
                    <input
                      type="number"
                      min="0"
                      value={subscriptionAmount}
                      onChange={(e) => setSubscriptionAmount(e.target.value)}
                      placeholder={t('admin.users.changePlan.amountPlaceholder')}
                      className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('common.credits')}</label>
                    <input
                      value={formatPlanCredits(selectedSubscriptionCredits)}
                      readOnly
                      className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800/60 text-slate-100 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.changePlan.reference')}</label>
                  <input
                    value={subscriptionReference}
                    onChange={(e) => setSubscriptionReference(e.target.value)}
                    placeholder={t('admin.users.changePlan.referencePlaceholder')}
                    className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.changePlan.note')}</label>
                  <input
                    value={subscriptionNote}
                    onChange={(e) => setSubscriptionNote(e.target.value)}
                    placeholder={t('admin.users.changePlan.notePlaceholder')}
                    className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                  />
                </div>
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={notifySubscriptionUser}
                onChange={(e) => setNotifySubscriptionUser(e.target.checked)}
                className="h-4 w-4 rounded border-slate-600 bg-gray-800 text-indigo-600 focus:ring-indigo-500"
              />
              {t('admin.users.changePlan.notifyUser')}
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowChangePlan(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleChangePlan}
                disabled={changingPlan}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {changingPlan ? t('admin.users.changePlan.changing') : t('admin.users.changePlan.button')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Temporary Plan Modal */}
      {showTemporaryPlan && (
        <Modal onClose={() => setShowTemporaryPlan(false)} title={t('admin.users.temporaryPlan.title')}>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              {t('admin.users.temporaryPlan.description')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.temporaryPlan.plan')}</label>
                <select
                  value={temporaryPlan}
                  onChange={(e) => setTemporaryPlan(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                >
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="growth">Growth</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.temporaryPlan.duration')}</label>
                <input
                  type="number"
                  min="1"
                  max="3650"
                  value={temporaryDurationDays}
                  onChange={(e) => setTemporaryDurationDays(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.temporaryPlan.reason')}</label>
              <textarea
                value={temporaryReason}
                onChange={(e) => setTemporaryReason(e.target.value)}
                placeholder={t('admin.users.temporaryPlan.reasonPlaceholder')}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-y transition-colors"
              />
            </div>
            <p className="text-xs text-slate-500">
              {t('admin.users.temporaryPlan.returnNotice')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowTemporaryPlan(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveTemporaryPlan}
                disabled={savingTemporaryPlan || !temporaryDurationDays || parseInt(temporaryDurationDays) <= 0}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {savingTemporaryPlan ? t('admin.users.temporaryPlan.saving') : t('admin.users.temporaryPlan.button')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* End Temporary Plan Modal */}
      {showEndTemporaryPlan && (
        <Modal onClose={() => setShowEndTemporaryPlan(false)} title={t('admin.users.temporaryPlan.endTitle')}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              {t('admin.users.temporaryPlan.endDescription')}
            </p>
            <p className="text-xs text-slate-500">
              {t('admin.users.temporaryPlan.endWarning')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEndTemporaryPlan(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleEndTemporaryPlan}
                disabled={endingTemporaryPlan}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {endingTemporaryPlan ? t('admin.users.temporaryPlan.ending') : t('admin.users.temporaryPlan.endButton')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Grant Ambassador Modal */}
      {showAmbassador && (
        <Modal onClose={() => setShowAmbassador(false)} title={t('admin.users.ambassador.title')}>
          <div className="space-y-4">
            <p className="text-xs text-slate-400">
              {t('admin.users.ambassador.description')}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.ambassador.duration')}</label>
                <select
                  value={ambassadorDuration}
                  onChange={(e) => setAmbassadorDuration(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                >
                  <option value="1">{t('admin.users.ambassador.oneMonth')}</option>
                  <option value="3">{t('admin.users.ambassador.threeMonths')}</option>
                  <option value="6">{t('admin.users.ambassador.sixMonths')}</option>
                  <option value="12">{t('admin.users.ambassador.twelveMonths')}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.ambassador.credits')}</label>
                <input
                  type="number"
                  min="1"
                  value={ambassadorCredits}
                  onChange={(e) => setAmbassadorCredits(e.target.value)}
                  placeholder={defaultAmbassadorCredits ? String(defaultAmbassadorCredits) : ""}
                  className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.users.ambassador.notes')}</label>
              <textarea
                value={ambassadorNotes}
                onChange={(e) => setAmbassadorNotes(e.target.value)}
                placeholder={t('admin.users.ambassador.notesPlaceholder')}
                rows={2}
                className="w-full px-3 py-2 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 resize-y transition-colors"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowAmbassador(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGrantAmbassador}
                disabled={grantingAmbassador || (ambassadorCredits !== "" && parseInt(ambassadorCredits) <= 0)}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {grantingAmbassador ? t('admin.users.ambassador.granting') : t('admin.users.ambassador.button')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Revoke Ambassador Modal */}
      {showRevokeAmbassador && (
        <Modal onClose={() => !revokingAmbassador && setShowRevokeAmbassador(false)} title={t('admin.users.actions.revokeAmbassador')}>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-gray-800/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">User</p>
              <p className="mt-1 text-sm font-medium text-slate-100">{user.name || t('common.unnamed')}</p>
              <p className="text-xs text-slate-400 mt-0.5">{user.email}</p>
            </div>
            <p className="text-sm text-slate-300">
              Are you sure you want to revoke ambassador access for this user?
            </p>
            <p className="text-xs text-slate-500">
              This will remove the ambassador badge, return the account to the server-selected previous plan, and update their credits from the revoke result.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRevokeAmbassador(false)}
                disabled={revokingAmbassador}
                className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl disabled:opacity-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleRevokeAmbassadorModal}
                disabled={revokingAmbassador}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {revokingAmbassador ? "Revoking..." : t('admin.users.actions.revokeAmbassador')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Cancel Trial Modal */}
      {showCancelTrial && (
        <Modal onClose={() => setShowCancelTrial(false)} title={t('admin.users.cancelTrial.title')}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              {t('admin.users.cancelTrial.description')}
            </p>
            <p className="text-xs text-slate-500">
              {t('admin.users.cancelTrial.warning')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCancelTrial(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleCancelTrial}
                disabled={cancellingTrial}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {cancellingTrial ? t('admin.users.cancelTrial.cancelling') : t('admin.users.cancelTrial.button')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Grant Trial Modal */}
      {showGrantTrial && (
        <Modal onClose={() => setShowGrantTrial(false)} title="Grant Trial">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Duration (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={grantTrialDays}
                onChange={(e) => setGrantTrialDays(e.target.value)}
                autoFocus
                className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {[7, 14, 20, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setGrantTrialDays(String(days))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${grantTrialDays === String(days)
                      ? "border-indigo-500 bg-indigo-500/15 text-indigo-300"
                      : "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200"
                      }`}
                  >
                    {days} days
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                This is an explicit admin grant. Signing in again will not restart the trial automatically.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowGrantTrial(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleGrantTrial}
                disabled={grantingTrial}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {grantingTrial ? "Granting..." : "Grant Trial"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Extend Trial Modal */}
      {showExtendTrial && (
        <Modal onClose={() => setShowExtendTrial(false)} title="Extend Trial">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Extend by (days)</label>
              <input
                type="number"
                min={1}
                value={extendTrialDays}
                onChange={(e) => setExtendTrialDays(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                autoFocus
              />
              <p className="text-xs text-slate-500 mt-1.5">Enter any positive number of days to add to the current trial.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowExtendTrial(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={handleExtendTrial}
                disabled={extendingTrial || !extendTrialDays || parseInt(extendTrialDays) <= 0}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {extendingTrial ? "Extending..." : "Extend Trial"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const now = Date.now();
  const diffInSeconds = Math.floor((now - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    const futureSec = Math.abs(diffInSeconds);
    if (futureSec < 60) return "in a few seconds";
    const minutes = Math.floor(futureSec / 60);
    if (minutes < 60) return `in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `in ${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `in ${days}d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `in ${months}mo`;
    const years = Math.floor(days / 365);
    return `in ${years}y`;
  }

  if (diffInSeconds < 45) return "just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes === 1 ? "" : "s"} ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    if (diffInHours === 1) return "1 hour ago";
    return `${diffInHours} hours ago`;
  }
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) return "yesterday";
  if (diffInDays < 7) return `${diffInDays} days ago`;
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks < 5) return `${diffInWeeks} week${diffInWeeks === 1 ? "" : "s"} ago`;
  const diffInMonths = Math.floor(diffInDays / 30);
  if (diffInMonths < 12) return `${diffInMonths} month${diffInMonths === 1 ? "" : "s"} ago`;
  const diffInYears = Math.floor(diffInDays / 365);
  return `${diffInYears} year${diffInYears === 1 ? "" : "s"} ago`;
}

interface ActivityScoreBreakdown {
  score: number;
  grade: "Champion" | "High Active" | "Moderate" | "Getting Started" | "Dormant";
  color: string;
  badgeBg: string;
  badgeBorder: string;
  barColor: string;
  breakdown: Array<{
    category: string;
    score: number;
    maxScore: number;
    detail: string;
  }>;
}

function calculateUserActivityScore(user: UserDetail): ActivityScoreBreakdown {
  let score = 0;
  const breakdown: ActivityScoreBreakdown["breakdown"] = [];

  // 1. Login Recency (max 25 pts)
  let loginPoints = 0;
  let loginDetail = "Never logged in";
  if (user.lastLogin) {
    const diffDays = Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) {
      loginPoints = 25;
      loginDetail = "Active in last 24h";
    } else if (diffDays <= 3) {
      loginPoints = 20;
      loginDetail = "Active within 3 days";
    } else if (diffDays <= 7) {
      loginPoints = 15;
      loginDetail = "Active this week";
    } else if (diffDays <= 14) {
      loginPoints = 10;
      loginDetail = "Active in last 2 weeks";
    } else if (diffDays <= 30) {
      loginPoints = 5;
      loginDetail = "Active this month";
    } else {
      loginPoints = 0;
      loginDetail = "Inactive > 30 days";
    }
  }
  score += loginPoints;
  breakdown.push({
    category: "Sign-in Recency",
    score: loginPoints,
    maxScore: 25,
    detail: loginDetail,
  });

  // 2. Hardware / Device Pairing (max 20 pts)
  let devicePoints = 0;
  const deviceCount = user.devices?.length || 0;
  const isPaired = user.activationMilestones?.devicePaired;
  if (deviceCount >= 1 || isPaired) {
    devicePoints = 20;
  }
  score += devicePoints;
  breakdown.push({
    category: "Connected Hardware",
    score: devicePoints,
    maxScore: 20,
    detail: deviceCount > 0 ? `${deviceCount} device${deviceCount > 1 ? "s" : ""} connected` : (isPaired ? "Previously paired" : "No devices connected"),
  });

  // 3. Presentation / OBS Milestone (max 25 pts)
  let presPoints = 0;
  let presDetail = "No presentation yet";
  if (user.activationMilestones?.firstPresentation) {
    presPoints += 15;
    presDetail = "First presentation completed";
  }
  if (user.activationMilestones?.firstPresentationScreenshotUrl) {
    presPoints += 5;
    presDetail += " + OBS screenshot";
  }
  if (user.activationMilestones?.obsConnected) {
    presPoints += 5;
  }
  score += presPoints;
  breakdown.push({
    category: "Live Presentation",
    score: presPoints,
    maxScore: 25,
    detail: presDetail,
  });

  // 4. Content Library Usage (max 15 pts)
  const usageCount = (user.usage?.bibleSearches || 0) + (user.usage?.songsCreated || 0) + (user.usage?.mediaUploaded || 0) + (user.usage?.transcriptCount || 0);
  let contentPoints = 0;
  if (usageCount >= 15) {
    contentPoints = 15;
  } else if (usageCount >= 5) {
    contentPoints = 10;
  } else if (usageCount >= 1) {
    contentPoints = 5;
  }
  score += contentPoints;
  breakdown.push({
    category: "Content Usage",
    score: contentPoints,
    maxScore: 15,
    detail: `${usageCount} total actions recorded`,
  });

  // 5. Subscription & Plan Health (max 15 pts)
  let planPoints = 0;
  let planDetail = "Free Tier";
  const plan = (user.plan || "").toLowerCase();
  const isPaid = plan === "growth" || plan === "pro" || plan === "basic" || plan === "managed" || user.subscription?.status === "active";
  if (isPaid) {
    planPoints = 15;
    planDetail = `${user.plan.toUpperCase()} (Active)`;
  } else if (user.trial?.active) {
    planPoints = 10;
    planDetail = "Active Trial";
  } else if (user.ambassador?.active) {
    planPoints = 12;
    planDetail = "Active Ambassador";
  } else {
    planPoints = 5;
    planDetail = "Free Tier";
  }
  score += planPoints;
  breakdown.push({
    category: "Plan Status",
    score: planPoints,
    maxScore: 15,
    detail: planDetail,
  });

  const finalScore = Math.min(100, Math.max(0, score));
  let grade: ActivityScoreBreakdown["grade"] = "Dormant";
  let color = "text-rose-400";
  let badgeBg = "bg-rose-950/50 text-rose-300 border-rose-800/60";
  let badgeBorder = "border-rose-500/30";
  let barColor = "bg-rose-500";

  if (finalScore >= 80) {
    grade = "Champion";
    color = "text-emerald-400";
    badgeBg = "bg-emerald-950/60 text-emerald-300 border-emerald-700/60";
    badgeBorder = "border-emerald-500/40";
    barColor = "bg-emerald-500";
  } else if (finalScore >= 60) {
    grade = "High Active";
    color = "text-indigo-400";
    badgeBg = "bg-indigo-950/60 text-indigo-300 border-indigo-700/60";
    badgeBorder = "border-indigo-500/40";
    barColor = "bg-indigo-500";
  } else if (finalScore >= 40) {
    grade = "Moderate";
    color = "text-amber-400";
    badgeBg = "bg-amber-950/60 text-amber-300 border-amber-700/60";
    badgeBorder = "border-amber-500/40";
    barColor = "bg-amber-500";
  } else if (finalScore >= 20) {
    grade = "Getting Started";
    color = "text-blue-400";
    badgeBg = "bg-blue-950/60 text-blue-300 border-blue-700/60";
    badgeBorder = "border-blue-500/40";
    barColor = "bg-blue-500";
  }

  return {
    score: finalScore,
    grade,
    color,
    badgeBg,
    badgeBorder,
    barColor,
    breakdown,
  };
}

function formatEventName(value: string): string {
  const eventDisplayMap: Record<string, string> = {
    trial_extended: "Trial Extended",
    trial_started: "Trial Started",
    trial_granted: "Trial Granted",
    trial_restarted: "Trial Restarted",
    trial_stopped: "Trial Stopped",
    trial_cancelled: "Trial Cancelled",
    trial_expired: "Trial Expired",
    upgraded_to_ambassador: "Upgraded to Ambassador",
    ambassador_granted: "Ambassador Status Granted",
    ambassador_revoked: "Ambassador Status Revoked",
    upgraded_from_passcode: "Upgraded from Passcode",
    passcode_redeemed: "Passcode Redeemed",
    payment_made: "Payment Made",
    payment_success: "Payment Successful",
    billing_success: "Subscription Payment Succeeded",
    payment_cancelled: "Payment Cancelled",
    subscription_cancelled: "Subscription Cancelled",
    payment_failure: "Payment Failed",
    payment_failed: "Payment Failed",
    billing_failed: "Payment Failed",
    admin_generated_account: "Admin Generated Account",
    admin_created: "Account Created by Admin",
    account_downgraded: "Account Downgraded",
    plan_downgraded: "Plan Downgraded to Free",
    temporary_plan_granted: "Temporary Plan Granted",
    temporary_plan_ended: "Temporary Plan Ended",
    first_presentation: "First Presentation Live",
    first_presentation_milestone: "First Presentation Milestone",
    overlay_mode_switched: "Overlay Mode Changed",
    bible_present: "Bible Verse Presented",
    bible_search: "Bible Search",
    worship_song_presented: "Worship Song Presented",
    worship_song_created: "Worship Song Created",
    media_presented: "Media Presented",
    media_uploaded: "Media Uploaded",
    device_paired: "Device Paired",
    obs_connected: "OBS Connected",
    credits_granted: "Credits Granted",
    credits_reset: "Credits Reset",
    account_suspended: "Account Suspended",
    account_unsuspended: "Account Restored",
    user_logged_in: "User Signed In",
    user_signup: "User Signed Up",
  };
  if (eventDisplayMap[value]) return eventDisplayMap[value];
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paymentStatusBadge(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "paid" || s === "completed") {
    return "bg-emerald-950/60 text-emerald-300 border border-emerald-700/60";
  }
  if (s === "failed" || s === "failure" || s === "error" || s === "declined") {
    return "bg-red-950/60 text-red-300 border border-red-700/60";
  }
  if (s === "cancelled" || s === "canceled" || s === "abandoned" || s === "void") {
    return "bg-amber-950/60 text-amber-300 border border-amber-700/60";
  }
  if (s === "pending" || s === "processing") {
    return "bg-sky-950/60 text-sky-300 border border-sky-700/60";
  }
  if (s === "refunded") {
    return "bg-purple-950/60 text-purple-300 border border-purple-700/60";
  }
  return "bg-slate-800 text-slate-400 border border-slate-700/60";
}

function paymentStatusLabel(status: string): string {
  const s = (status || "").toLowerCase();
  if (s === "success" || s === "paid") return "Successful";
  if (s === "failed" || s === "failure") return "Failed";
  if (s === "cancelled" || s === "canceled") return "Cancelled";
  if (s === "pending") return "Pending";
  if (s === "refunded") return "Refunded";
  return status.replaceAll("_", " ").replace(/\b\w/g, (l) => l.toUpperCase());
}

function formatCurrency(amount: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}

function InfoRow({
  label,
  value,
  subValue,
  children,
}: {
  label: string;
  value?: string;
  subValue?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-800/40 last:border-0 gap-3">
      <span className="text-xs text-slate-500 shrink-0">{label}</span>
      <div className="text-right min-w-0">
        {children ? (
          children
        ) : (
          <>
            <span className="text-sm text-slate-300 font-medium block truncate">{value || "—"}</span>
            {subValue && <span className="text-[11px] text-slate-500 block font-normal truncate">{subValue}</span>}
          </>
        )}
      </div>
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

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-gray-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
          <button onClick={onClose} className="p-1 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-gray-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-6 py-4 max-h-[80vh] overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

