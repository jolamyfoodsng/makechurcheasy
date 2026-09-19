"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Search,
  Shield,
  Crown,
  ArrowUpDown,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Eye,
  CreditCard,
  X,
  StopCircle,
  UserX,
  UserCheck,
  Trash2,
  RotateCcw,
  LogOut,
  ShieldOff,
  Play,
  Clock,
  Monitor as MonitorIcon,
  MoreHorizontal,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getPlanConfig, type PlanConfig } from "@/lib/planConfigService";
import {
  formatPlanCredits,
  getAdminManagedPlanAmount,
  getAdminManagedPlanCredits,
} from "@/lib/adminManagedSubscriptionForm";

interface AdminUser {
  id: string;
  name: string;
  email: string;
  churchName: string;
  country?: string;
  deviceId?: string;
  deviceIds?: string[];
  role: string;
  accountStatus?: "active" | "suspended" | "deleted";
  credits: number;
  plan: string;
  createdAt: string | null;
  lastLogin: string | null;
  lastActive: string | null;
  isActive: boolean;
  trial?: { active: boolean; expiresAt?: string } | null;
  ambassador?: {
    active: boolean;
    grantedAt?: string;
    expiresAt?: string;
    creditsGranted?: number;
    previousPlan?: string;
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
  } | null;
  adminManagedSubscription?: {
    active: boolean;
    plan?: string;
    billingCycle?: string;
    expiresAt?: string;
    amountCollected?: number;
    currency?: string;
    paymentReference?: string;
  } | null;
  subscriptionExpiresAt?: string | null;
  scheduledDowngradeAt?: string | null;
}

type SortField = "name" | "email" | "plan" | "credits" | "createdAt" | "lastLogin" | "lastActive";
type ActivityFilter = "all" | "1d" | "3d" | "7d" | "14d" | "30d" | "inactive";
type SortDir = "asc" | "desc";
type AdminUserAction =
  | "suspend"
  | "unsuspend"
  | "delete"
  | "reset_credits"
  | "reset_devices"
  | "force_logout"
  | "make_admin"
  | "remove_admin";

interface ConfirmActionState {
  user: AdminUser;
  action: AdminUserAction;
  label: string;
  effects: string[];
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-2xl bg-gray-800 ${className ?? ""}`} />
  );
}

function formatLastActive(timestamp: string | null | undefined): {
  text: string;
  full: string;
  tone: "recent" | "warm" | "cool" | "muted";
} {
  if (!timestamp) return { text: "Never", full: "No recorded activity", tone: "muted" };
  const date = new Date(timestamp);
  const time = date.getTime();
  if (Number.isNaN(time) || time <= 0) return { text: "Never", full: "No recorded activity", tone: "muted" };

  const now = Date.now();
  const diffMs = Math.max(0, now - time);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  const full = date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (diffSec < 60) return { text: "Just now", full, tone: "recent" };
  if (diffMin < 60) return { text: `${diffMin}m ago`, full, tone: "recent" };
  if (diffHr < 24) return { text: `${diffHr}h ago`, full, tone: "recent" };
  if (diffDays === 1) return { text: "Yesterday", full, tone: "warm" };
  if (diffDays <= 3) return { text: `${diffDays}d ago`, full, tone: "warm" };
  if (diffDays <= 7) return { text: `${diffDays}d ago`, full, tone: "cool" };
  if (diffDays <= 30) return { text: `${diffDays}d ago`, full, tone: "muted" };

  return {
    text: date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    full,
    tone: "muted",
  };
}

export default function AdminUsersPage() {
  const t = useTranslations();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Modal states
  const [showGrantCredits, setShowGrantCredits] = useState<string | null>(null);
  const [creditsAmount, setCreditsAmount] = useState("");
  const [grantingCredits, setGrantingCredits] = useState(false);

  const [showChangePlan, setShowChangePlan] = useState<string | null>(null);
  const [newPlan, setNewPlan] = useState("free");
  const [changingPlan, setChangingPlan] = useState(false);
  const [subscriptionBillingCycle, setSubscriptionBillingCycle] = useState("monthly");
  const [subscriptionAmount, setSubscriptionAmount] = useState("");
  const [subscriptionCurrency, setSubscriptionCurrency] = useState("NGN");
  const [subscriptionReference, setSubscriptionReference] = useState("");
  const [subscriptionNote, setSubscriptionNote] = useState("");
  const [notifySubscriptionUser, setNotifySubscriptionUser] = useState(true);
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);

  const [showTemporaryPlan, setShowTemporaryPlan] = useState<string | null>(null);
  const [temporaryPlan, setTemporaryPlan] = useState("growth");
  const [temporaryDurationDays, setTemporaryDurationDays] = useState("30");
  const [temporaryReason, setTemporaryReason] = useState("");
  const [savingTemporaryPlan, setSavingTemporaryPlan] = useState(false);
  const [showEndTemporaryPlan, setShowEndTemporaryPlan] = useState<string | null>(null);
  const [endingTemporaryPlan, setEndingTemporaryPlan] = useState(false);

  const [showAmbassador, setShowAmbassador] = useState<string | null>(null);
  const [ambassadorDuration, setAmbassadorDuration] = useState("6");
  const [ambassadorCredits, setAmbassadorCredits] = useState("");
  const [defaultAmbassadorCredits, setDefaultAmbassadorCredits] = useState<number | null>(null);
  const [ambassadorNotes, setAmbassadorNotes] = useState("");
  const [grantingAmbassador, setGrantingAmbassador] = useState(false);
  const [showRevokeAmbassador, setShowRevokeAmbassador] = useState<string | null>(null);
  const [revokingAmbassador, setRevokingAmbassador] = useState(false);

  const [showCancelTrial, setShowCancelTrial] = useState<string | null>(null);
  const [cancellingTrial, setCancellingTrial] = useState(false);
  const [showGrantTrial, setShowGrantTrial] = useState<string | null>(null);
  const [trialDuration, setTrialDuration] = useState("14");
  const [grantingTrial, setGrantingTrial] = useState(false);
  const [showExtendTrial, setShowExtendTrial] = useState<string | null>(null);
  const [extendTrialDays, setExtendTrialDays] = useState("30");
  const [extendingTrial, setExtendingTrial] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmActionState | null>(null);

  const [actionMsg, setActionMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/users", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => setUsers(data.users || []))
      .catch(() => { })
      .finally(() => setLoading(false));

    fetch("/api/admin/platform-settings", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => {
        const credits = data?.ambassador?.creditsPerAmbassador;
        if (typeof credits === "number" && credits > 0) {
          setDefaultAmbassadorCredits(credits);
        }
        const configuredTrialDays = Number(data?.trial?.defaultDurationDays);
        if (Number.isInteger(configuredTrialDays) && configuredTrialDays > 0) {
          setTrialDuration(String(configuredTrialDays));
        }
      })
      .catch(() => { });

    fetch("/api/admin/plan-config", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((data) => setPlanConfig(data))
      .catch(() => {
        getPlanConfig()
          .then((data) => setPlanConfig(data))
          .catch(() => { });
      });
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

  const activityCounts = useMemo(() => {
    const counts = {
      all: users.length,
      "1d": 0,
      "3d": 0,
      "7d": 0,
      "14d": 0,
      "30d": 0,
      inactive: 0,
    };
    const now = Date.now();
    for (const u of users) {
      const ts = u.lastActive || u.lastLogin;
      const time = ts ? new Date(ts).getTime() : NaN;
      if (Number.isFinite(time) && time > 0) {
        const diffDays = (now - time) / (24 * 60 * 60 * 1000);
        if (diffDays <= 1) counts["1d"]++;
        if (diffDays <= 3) counts["3d"]++;
        if (diffDays <= 7) counts["7d"]++;
        if (diffDays <= 14) counts["14d"]++;
        if (diffDays <= 30) counts["30d"]++;
        else counts.inactive++;
      } else {
        counts.inactive++;
      }
    }
    return counts;
  }, [users]);

  const filtered = useMemo(() => {
    let result = users;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.churchName.toLowerCase().includes(q) ||
          (u.country || "").toLowerCase().includes(q) ||
          (u.plan || "").toLowerCase().includes(q) ||
          (u.deviceId || "").toLowerCase().includes(q) ||
          (u.deviceIds || []).some((deviceId) => deviceId.toLowerCase().includes(q))
      );
    }

    if (filter === "active") result = result.filter((u) => u.isActive);
    else if (filter === "inactive") result = result.filter((u) => !u.isActive);
    else if (filter === "paid") result = result.filter((u) => u.plan !== "free");
    else if (filter === "free") result = result.filter((u) => u.plan === "free");
    else if (filter === "trial") result = result.filter((u) => u.plan === "free" && u.trial?.active);
    else if (filter === "ambassador") result = result.filter((u) => u.ambassador?.active);
    else if (filter === "temporary") result = result.filter((u) => u.adminTemporaryPlan?.active);
    else if (filter === "admin") result = result.filter((u) => u.role === "admin");
    else if (filter === "suspended") result = result.filter((u) => u.accountStatus === "suspended");

    // Activity window filter
    if (activityFilter !== "all") {
      const now = Date.now();
      result = result.filter((u) => {
        const ts = u.lastActive || u.lastLogin;
        const time = ts ? new Date(ts).getTime() : NaN;
        const hasTime = Number.isFinite(time) && time > 0;
        const diffDays = hasTime ? (now - time) / (24 * 60 * 60 * 1000) : Infinity;

        if (activityFilter === "1d") return diffDays <= 1;
        if (activityFilter === "3d") return diffDays <= 3;
        if (activityFilter === "7d") return diffDays <= 7;
        if (activityFilter === "14d") return diffDays <= 14;
        if (activityFilter === "30d") return diffDays <= 30;
        if (activityFilter === "inactive") return !hasTime || diffDays > 30;
        return true;
      });
    }

    result.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      if (sortField === "name") { av = a.name; bv = b.name; }
      else if (sortField === "email") { av = a.email; bv = b.email; }
      else if (sortField === "plan") { av = a.plan; bv = b.plan; }
      else if (sortField === "credits") { av = a.credits; bv = b.credits; }
      else if (sortField === "createdAt") { av = a.createdAt || ""; bv = b.createdAt || ""; }
      else if (sortField === "lastLogin") { av = a.lastLogin || ""; bv = b.lastLogin || ""; }
      else if (sortField === "lastActive") {
        av = a.lastActive || a.lastLogin || "";
        bv = b.lastActive || b.lastLogin || "";
      }
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv as string) : (bv as string).localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

    return result;
  }, [users, search, filter, activityFilter, sortField, sortDir]);

  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = filtered.slice((page - 1) * perPage, page * perPage);
  const selectedSubscriptionCredits = getAdminManagedPlanCredits(planConfig, newPlan);
  const revokeAmbassadorUser = showRevokeAmbassador
    ? users.find((u) => u.id === showRevokeAmbassador) ?? null
    : null;

  useEffect(() => { setPage(1); }, [search, filter, activityFilter]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDir("asc"); }
  }

  function flash(type: "success" | "error", text: string) {
    setActionMsg({ type, text });
    setTimeout(() => setActionMsg(null), 3000);
  }

  async function handleGrantCredits(userId: string) {
    const amount = parseFloat(creditsAmount);
    if (!amount || amount <= 0) return;
    setGrantingCredits(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, credits: data.credits } : u));
      flash("success", t('admin.users.flash.grantedCredits', { amount }));
      setShowGrantCredits(null);
      setCreditsAmount("");
    } catch (err: any) {
      flash("error", err?.message || t('admin.users.errors.grantCreditsFailed'));
    } finally {
      setGrantingCredits(false);
    }
  }

  async function handleChangePlan(userId: string) {
    setChangingPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/plan`, {
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
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: data.plan || newPlan,
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        adminManagedSubscription: data.adminManagedSubscription,
        subscriptionExpiresAt: data.subscriptionExpiresAt,
        scheduledDowngradeAt: data.scheduledDowngradeAt,
        ...(data.trial !== undefined ? { trial: data.trial } : {}),
        ...(data.plan !== "free" ? { adminTemporaryPlan: { ...(u.adminTemporaryPlan || {}), active: false } } : {}),
      } : u));
      flash("success", data.emailSent ? t('admin.users.flash.planChangedEmail', { plan: data.plan || newPlan }) : t('admin.users.flash.planChanged', { plan: data.plan || newPlan }));
      setShowChangePlan(null);
      setSubscriptionAmount("");
      setSubscriptionReference("");
      setSubscriptionNote("");
    } catch (err: any) {
      flash("error", err?.message || t('admin.users.errors.changePlanFailed'));
    } finally {
      setChangingPlan(false);
    }
  }

  async function handleSaveTemporaryPlan(userId: string) {
    const durationDays = parseInt(temporaryDurationDays, 10);
    if (!temporaryPlan || !durationDays || durationDays <= 0) return;
    setSavingTemporaryPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/temporary-plan`, {
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
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: data.plan,
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        adminTemporaryPlan: data.adminTemporaryPlan,
      } : u));
      flash("success", data.emailSent ? t('admin.users.flash.temporaryPlanSavedEmail') : t('admin.users.flash.temporaryPlanSaved'));
      setShowTemporaryPlan(null);
      setTemporaryReason("");
    } catch (err: any) {
      flash("error", err?.message || t('admin.users.errors.temporaryPlanFailed'));
    } finally {
      setSavingTemporaryPlan(false);
    }
  }

  async function handleEndTemporaryPlan(userId: string) {
    setEndingTemporaryPlan(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/temporary-plan`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: "free",
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        adminTemporaryPlan: data.adminTemporaryPlan,
      } : u));
      flash("success", t('admin.users.flash.temporaryPlanEnded'));
      setShowEndTemporaryPlan(null);
    } catch (err: any) {
      flash("error", err?.message || t('admin.users.errors.temporaryPlanEndFailed'));
    } finally {
      setEndingTemporaryPlan(false);
    }
  }

  async function handleGrantAmbassador(userId: string) {
    setGrantingAmbassador(true);
    try {
      const parsedCredits = ambassadorCredits ? parseInt(ambassadorCredits) : undefined;
      const res = await fetch(`/api/admin/users/${userId}/ambassador`, {
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
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: "growth",
        credits: data.ambassador?.creditsGranted ?? u.credits,
        ambassador: data.ambassador,
      } : u));
      flash("success", t('admin.users.flash.ambassadorGranted'));
      setShowAmbassador(null);
    } catch (err: any) {
      flash("error", err?.message || t('admin.users.errors.ambassadorGrantFailed'));
    } finally {
      setGrantingAmbassador(false);
    }
  }

  async function handleRevokeAmbassador(userId: string) {
    setRevokingAmbassador(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/ambassador`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: data.revertedPlan,
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        ambassador: { ...(u.ambassador || {}), active: false },
      } : u));
      flash("success", t('admin.users.flash.ambassadorRevoked', { plan: data.revertedPlan }));
      setShowRevokeAmbassador(null);
    } catch (err: any) {
      flash("error", err?.message || t('admin.users.errors.ambassadorRevokeFailed'));
    } finally {
      setRevokingAmbassador(false);
    }
  }

  async function handleCancelTrial(userId: string) {
    setCancellingTrial(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: "free",
        ...(data.credits !== undefined ? { credits: data.credits } : {}),
        trial: { ...(u.trial || {}), active: false },
      } : u));
      flash("success", t('admin.users.flash.trialCancelled'));
      setShowCancelTrial(null);
    } catch (err: any) {
      flash("error", err?.message || t('admin.users.errors.cancelTrialFailed'));
    } finally {
      setCancellingTrial(false);
    }
  }

  async function handleGrantTrial(userId: string) {
    setGrantingTrial(true);
    try {
      const days = parseInt(trialDuration, 10);
      if (!Number.isInteger(days) || days < 1 || days > 365) {
        throw new Error("Trial duration must be between 1 and 365 days");
      }
      const res = await fetch(`/api/admin/users/${userId}/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", days }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        plan: "growth",
        trial: data.trial,
      } : u));
      flash("success", `Trial granted for ${days} days`);
      setShowGrantTrial(null);
    } catch (err: any) {
      flash("error", err?.message || "Failed to grant trial");
    } finally {
      setGrantingTrial(false);
    }
  }

  async function handleExtendTrial(userId: string) {
    setExtendingTrial(true);
    try {
      const days = parseInt(extendTrialDays, 10);
      if (!days || days <= 0) throw new Error("Days must be a positive number");
      const res = await fetch(`/api/admin/users/${userId}/trial`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "extend", days }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Failed");
      const data = await res.json();
      setUsers((prev) => prev.map((u) => u.id === userId ? {
        ...u,
        trial: data.trial,
      } : u));
      flash("success", `Trial extended by ${days} days`);
      setShowExtendTrial(null);
    } catch (err: any) {
      flash("error", err?.message || "Failed to extend trial");
    } finally {
      setExtendingTrial(false);
    }
  }

  async function runAdminAction(
    user: AdminUser,
    action: AdminUserAction,
    label: string,
  ) {
    setRunningAction(`${user.id}:${action}`);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/actions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: label }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action failed");

      setUsers((prev) => {
        if (action === "delete") return prev.filter((u) => u.id !== user.id);
        return prev.map((u) => {
          if (u.id !== user.id) return u;
          if (action === "suspend") return { ...u, accountStatus: "suspended" };
          if (action === "unsuspend") return { ...u, accountStatus: "active" };
          if (action === "make_admin") return { ...u, role: "admin" };
          if (action === "remove_admin") return { ...u, role: "user" };
          if (action === "reset_credits" && typeof data.credits === "number") return { ...u, credits: data.credits };
          if (action === "reset_devices") return { ...u, deviceIds: [] };
          return u;
        });
      });
      flash("success", `${label} completed`);
    } catch (err: any) {
      flash("error", err?.message || `${label} failed`);
    } finally {
      setRunningAction(null);
    }
  }

  function openAdminAction(user: AdminUser, action: AdminUserAction, label: string) {
    const destructiveEffects: Partial<Record<AdminUserAction, string[]>> = {
      suspend: [
        "Suspend account access immediately",
        "Send a suspension email",
        "Create a dashboard notification and modal",
        "Record an audit log entry",
      ],
      delete: [
        "Disable the account immediately",
        "Send the final account deletion email",
        "Remove the user from the active admin list",
        "Record an audit log entry",
      ],
      reset_credits: [
        "Reset the user's admin-granted credits",
        "Send a credit reset email",
        "Create a dashboard notification and modal",
        "Record an audit log entry",
      ],
      remove_admin: [
        "Remove administrator access",
        "Send an administrator access removal email",
        "Create a dashboard notification and modal",
        "Record an audit log entry",
      ],
      reset_devices: [
        "Remove all connected devices",
        "Send a device reset email",
        "Create a dashboard notification and modal",
        "Record an audit log entry",
      ],
      force_logout: [
        "End all active sessions",
        "Send a security email",
        "Create a dashboard notification and modal",
        "Record an audit log entry",
      ],
    };

    const effects = destructiveEffects[action];
    if (effects) {
      setConfirmAction({ user, action, label, effects });
      return;
    }

    void runAdminAction(user, action, label);
  }

  function planBadge(plan: string) {
    const colors: Record<string, string> = {
      free: "bg-gray-800 text-slate-400",
      basic: "bg-sky-900/50 text-sky-300 border border-sky-700/50",
      growth: "bg-amber-900/50 text-amber-300 border border-amber-700/50",
      ambassador: "bg-purple-900/50 text-purple-300 border border-purple-700/50",
      unlimited: "bg-yellow-900/50 text-yellow-300 border border-yellow-700/50",
    };
    return colors[plan] || colors.free;
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-600" />;
    return <ArrowUpDown className={`w-3 h-3 ${sortDir === "asc" ? "text-indigo-400" : "text-indigo-400 rotate-180"}`} />;
  }

  if (loading) {
    return (
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-6">
          <SkeletonBlock className="h-8 w-48 mb-2" />
          <SkeletonBlock className="h-4 w-32" />
        </div>
        <SkeletonBlock className="h-11 w-full mb-4" />
        <SkeletonBlock className="h-[480px] w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-50">{t('admin.users.title')}</h1>
        <p className="text-sm text-slate-400 mt-1">{t('admin.users.totalUsers', { count: users.length })}</p>
      </div>

      {actionMsg && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${actionMsg.type === "success" ? "bg-emerald-900/40 text-emerald-300 border border-emerald-700/50" : "bg-red-900/40 text-red-300 border border-red-700/50"
          }`}>
          {actionMsg.text}
        </div>
      )}

      {/* Activity Cohort Filter Pills */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            Activity Cohorts
          </span>
          {activityFilter !== "all" && (
            <button
              onClick={() => setActivityFilter("all")}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Reset to all
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 scrollbar-thin">
          {[
            { id: "all", label: "All Users", count: activityCounts.all },
            { id: "1d", label: "Past 24h", count: activityCounts["1d"], live: true },
            { id: "3d", label: "Past 3 Days", count: activityCounts["3d"] },
            { id: "7d", label: "Past 7 Days", count: activityCounts["7d"] },
            { id: "14d", label: "Past 14 Days", count: activityCounts["14d"] },
            { id: "30d", label: "Past 30 Days", count: activityCounts["30d"] },
            { id: "inactive", label: "Inactive (>30d)", count: activityCounts.inactive },
          ].map((item) => {
            const isActive = activityFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivityFilter(item.id as ActivityFilter)}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 ring-1 ring-indigo-400/50"
                    : "bg-gray-900 text-slate-300 hover:bg-gray-800 hover:text-slate-100 border border-slate-800"
                }`}
              >
                {item.live && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                )}
                <span>{item.label}</span>
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                    isActive
                      ? "bg-white/20 text-white"
                      : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300"
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder={t('admin.users.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-9 pr-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-900 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
        >
          <option value="all">{t('admin.users.filters.all')}</option>
          <option value="active">{t('admin.users.filters.active')}</option>
          <option value="inactive">{t('admin.users.filters.inactive')}</option>
          <option value="paid">{t('admin.users.filters.paid')}</option>
          <option value="free">{t('admin.users.filters.free')}</option>
          <option value="trial">{t('admin.users.filters.trial')}</option>
          <option value="ambassador">{t('admin.users.filters.ambassadors')}</option>
          <option value="temporary">{t('admin.users.filters.temporary')}</option>
          <option value="admin">{t('admin.users.filters.admins')}</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-slate-700 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700/50">
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide">
                  <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                    {t('admin.users.tableHeaders.user')} <SortIcon field="name" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden md:table-cell">
                  <button onClick={() => toggleSort("plan")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                    {t('admin.users.tableHeaders.plan')} <SortIcon field="plan" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden lg:table-cell">
                  <button onClick={() => toggleSort("credits")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                    {t('admin.users.tableHeaders.credits')} <SortIcon field="credits" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden lg:table-cell">{t('admin.users.tableHeaders.status')}</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden md:table-cell">
                  <button onClick={() => toggleSort("lastActive")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                    Last Active <SortIcon field="lastActive" />
                  </button>
                </th>
                <th className="text-left px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide hidden xl:table-cell">
                  <button onClick={() => toggleSort("createdAt")} className="flex items-center gap-1 hover:text-slate-200 transition-colors">
                    {t('admin.users.tableHeaders.created')} <SortIcon field="createdAt" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 font-semibold text-slate-400 text-xs uppercase tracking-wide">{t('admin.users.tableHeaders.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {paged.map((user) => (
                <tr key={user.id} className="border-b border-slate-800/60 hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 text-xs font-bold shrink-0">
                        {user.name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="font-medium text-slate-100 truncate">{user.name || t('common.unnamed')}</p>
                          {user.role === "admin" && <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
                          {user.ambassador?.active && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        </div>
                        <p className="text-xs text-slate-500 truncate">{user.email}</p>
                        {user.churchName && <p className="text-[11px] text-slate-600 truncate">{user.churchName}</p>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex px-2 py-0.5 rounded-xl text-[11px] font-semibold ${planBadge(user.plan)}`}>
                        {user.plan}
                      </span>
                      {user.adminTemporaryPlan?.active && user.adminTemporaryPlan.expiresAt && (
                        <span className="text-[10px] text-amber-300">
                          {t('admin.users.temporaryPlan.until', { date: new Date(user.adminTemporaryPlan.expiresAt).toLocaleDateString() })}
                        </span>
                      )}
                      {!user.adminTemporaryPlan?.active && user.subscriptionExpiresAt && user.plan !== "free" && (
                        <span className="text-[10px] text-emerald-300">
                          {t('admin.users.changePlan.until', { date: new Date(user.subscriptionExpiresAt).toLocaleDateString() })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <span className="text-slate-300 font-medium">{user.credits.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${user.isActive ? "bg-emerald-400" : "bg-slate-600"}`} />
                      <span className="text-xs text-slate-400">{user.isActive ? t('admin.users.active') : t('admin.users.inactive')}</span>
                      {user.plan === "free" && user.trial?.active && (
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-900/50 text-amber-300 border border-amber-700/50">
                          {t('admin.users.trial')}
                        </span>
                      )}
                      {user.accountStatus === "suspended" && (
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-900/50 text-red-300 border border-red-700/50">
                          Suspended
                        </span>
                      )}
                      {user.adminTemporaryPlan?.active && (
                        <span className="ml-1 inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-900/50 text-indigo-300 border border-indigo-700/50">
                          {t('admin.users.temporaryPlan.badge')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {(() => {
                      const activeInfo = formatLastActive(user.lastActive || user.lastLogin);
                      return (
                        <div className="flex items-center gap-1.5" title={activeInfo.full}>
                          {activeInfo.tone === "recent" && (
                            <span className="relative flex h-1.5 w-1.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                            </span>
                          )}
                          <span
                            className={`text-xs font-medium ${
                              activeInfo.tone === "recent"
                                ? "text-emerald-300 font-semibold"
                                : activeInfo.tone === "warm"
                                ? "text-amber-300 font-medium"
                                : activeInfo.tone === "cool"
                                ? "text-sky-300 font-medium"
                                : "text-slate-500"
                            }`}
                          >
                            {activeInfo.text}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 hidden xl:table-cell">
                    <span className="text-xs text-slate-500">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <a
                        href={"mailto:" + encodeURIComponent(user.email)}
                        className="hidden sm:inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-slate-300 hover:bg-gray-800 hover:text-slate-100"
                      >
                        <Mail className="h-4 w-4" /> Email
                      </a>
                      <Link
                        href={"/admin/users/" + user.id}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 px-3 text-xs font-semibold text-indigo-200 hover:bg-indigo-500/20"
                      >
                        <Eye className="h-4 w-4" /> View profile
                      </Link>
                      <details className="relative">
                        <summary className="flex h-9 cursor-pointer list-none items-center gap-1 rounded-lg border border-slate-700 px-2.5 text-xs font-medium text-slate-300 hover:bg-gray-800 [&::-webkit-details-marker]:hidden">
                          <MoreHorizontal className="h-4 w-4" /> Actions
                        </summary>
                        <div className="absolute right-0 z-30 mt-2 max-h-[70vh] w-56 overflow-y-auto rounded-xl border border-slate-700 bg-gray-900 p-1.5 shadow-2xl">
                          <button type="button" onClick={() => { setShowGrantCredits(user.id); setCreditsAmount(""); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800">Grant credits</button>
                          <button type="button" onClick={() => { setShowChangePlan(user.id); setNewPlan(user.plan === "free" ? "growth" : user.plan); setSubscriptionBillingCycle(user.adminManagedSubscription?.billingCycle || "monthly"); setSubscriptionAmount(""); setSubscriptionCurrency(user.adminManagedSubscription?.currency || "NGN"); setSubscriptionReference(""); setSubscriptionNote(""); setNotifySubscriptionUser(true); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800">Change plan</button>
                          {!(user.plan === "free" && user.trial?.active) && <button type="button" onClick={() => { setShowGrantTrial(user.id); setTrialDuration("14"); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800">Grant trial</button>}
                          <button type="button" onClick={() => { if (user.adminTemporaryPlan?.active) { setShowEndTemporaryPlan(user.id); return; } setShowTemporaryPlan(user.id); setTemporaryPlan(user.plan === "free" ? "growth" : "free"); setTemporaryDurationDays("30"); setTemporaryReason(""); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800">{user.adminTemporaryPlan?.active ? "End temporary plan" : "Set temporary plan"}</button>
                          <button type="button" onClick={() => { if (user.ambassador?.active) setShowRevokeAmbassador(user.id); else { setShowAmbassador(user.id); setAmbassadorDuration("6"); setAmbassadorCredits(""); setAmbassadorNotes(""); } }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800">{user.ambassador?.active ? "Revoke ambassador" : "Grant ambassador"}</button>
                          {user.plan === "free" && user.trial?.active && <>
                            <button type="button" onClick={() => { setShowExtendTrial(user.id); setExtendTrialDays("30"); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-gray-800">Extend trial</button>
                            <button type="button" onClick={() => setShowCancelTrial(user.id)} className="w-full rounded-lg px-3 py-2 text-left text-xs text-red-300 hover:bg-red-950/40">Cancel trial</button>
                          </>}
                          <div className="my-1 border-t border-slate-800" />
                          <Link href={"/admin/users/" + user.id} className="block rounded-lg px-3 py-2 text-xs font-medium text-indigo-300 hover:bg-indigo-500/10">Access and account controls</Link>
                        </div>
                      </details>
                    </div>
                  </td>
                </tr>
              ))}
              {paged.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-slate-500">
                    {t('admin.users.noUsersFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-500">
              Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400 px-2">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {confirmAction && (
        <Modal onClose={() => setConfirmAction(null)} title={confirmAction.label}>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-gray-800/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">User</p>
              <p className="mt-1 text-sm font-medium text-slate-100">{confirmAction.user.name || t('common.unnamed')}</p>
              <p className="text-xs text-slate-400 mt-0.5">{confirmAction.user.email}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-200 mb-2">This action will:</p>
              <ul className="space-y-2">
                {confirmAction.effects.map((effect) => (
                  <li key={effect} className="text-sm text-slate-400 flex items-start gap-2">
                    <span className="mt-1 w-1.5 h-1.5 rounded-full bg-slate-500 shrink-0" />
                    <span>{effect}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  const payload = confirmAction;
                  setConfirmAction(null);
                  void runAdminAction(payload.user, payload.action, payload.label);
                }}
                disabled={runningAction === `${confirmAction.user.id}:${confirmAction.action}`}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Grant Credits Modal */}
      {showGrantCredits && (
        <Modal onClose={() => setShowGrantCredits(null)} title={t('admin.users.grantCredits.title')}>
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
              <button onClick={() => setShowGrantCredits(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleGrantCredits(showGrantCredits)}
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
        <Modal onClose={() => setShowChangePlan(null)} title={t('admin.users.changePlan.title')}>
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
              <button onClick={() => setShowChangePlan(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleChangePlan(showChangePlan)}
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
        <Modal onClose={() => setShowTemporaryPlan(null)} title={t('admin.users.temporaryPlan.title')}>
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
              <button onClick={() => setShowTemporaryPlan(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleSaveTemporaryPlan(showTemporaryPlan)}
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
        <Modal onClose={() => setShowEndTemporaryPlan(null)} title={t('admin.users.temporaryPlan.endTitle')}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              {t('admin.users.temporaryPlan.endDescription')}
            </p>
            <p className="text-xs text-slate-500">
              {t('admin.users.temporaryPlan.endWarning')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowEndTemporaryPlan(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleEndTemporaryPlan(showEndTemporaryPlan)}
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
        <Modal onClose={() => setShowAmbassador(null)} title={t('admin.users.ambassador.title')}>
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
              <button onClick={() => setShowAmbassador(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleGrantAmbassador(showAmbassador)}
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
      {showRevokeAmbassador && revokeAmbassadorUser && (
        <Modal onClose={() => !revokingAmbassador && setShowRevokeAmbassador(null)} title={t('admin.users.actions.revokeAmbassador')}>
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-700 bg-gray-800/60 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">User</p>
              <p className="mt-1 text-sm font-medium text-slate-100">{revokeAmbassadorUser.name || t('common.unnamed')}</p>
              <p className="text-xs text-slate-400 mt-0.5">{revokeAmbassadorUser.email}</p>
            </div>
            <p className="text-sm text-slate-300">
              Are you sure you want to revoke ambassador access for this user?
            </p>
            <p className="text-xs text-slate-500">
              This will remove the ambassador badge, return the account to the server-selected previous plan, and update their credits from the revoke result.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowRevokeAmbassador(null)}
                disabled={revokingAmbassador}
                className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl disabled:opacity-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleRevokeAmbassador(showRevokeAmbassador)}
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
        <Modal onClose={() => setShowCancelTrial(null)} title={t('admin.users.cancelTrial.title')}>
          <div className="space-y-4">
            <p className="text-sm text-slate-300">
              {t('admin.users.cancelTrial.description')}
            </p>
            <p className="text-xs text-slate-500">
              {t('admin.users.cancelTrial.warning')}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCancelTrial(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleCancelTrial(showCancelTrial)}
                disabled={cancellingTrial}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {cancellingTrial ? t('admin.users.cancelTrial.cancelling') : t('admin.users.cancelTrial.button')}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showGrantTrial && (
        <Modal onClose={() => setShowGrantTrial(null)} title="Grant Trial">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Duration (days)</label>
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={trialDuration}
                onChange={(e) => setTrialDuration(e.target.value)}
                autoFocus
                className="w-full h-11 px-3 rounded-xl border border-slate-700 text-sm bg-gray-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                {[7, 14, 20, 30].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setTrialDuration(String(days))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${trialDuration === String(days)
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
              <button onClick={() => setShowGrantTrial(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleGrantTrial(showGrantTrial)}
                disabled={grantingTrial}
                className="px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl disabled:opacity-50 transition-colors"
              >
                {grantingTrial ? "Granting..." : "Grant Trial"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showExtendTrial && (
        <Modal onClose={() => setShowExtendTrial(null)} title="Extend Trial">
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
              <button onClick={() => setShowExtendTrial(null)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-gray-800 rounded-xl transition-colors">
                {t('common.cancel')}
              </button>
              <button
                onClick={() => handleExtendTrial(showExtendTrial)}
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
        <div className="px-6 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}
