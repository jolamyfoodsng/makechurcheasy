"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Gift,
  Mail,
  Share2,
  Sparkles,
  Users,
  Check,
  ArrowRight,
  Loader2,
  AlertCircle,
  ExternalLink,
  MessageSquare,
} from "lucide-react";
import { Badge, Button, Card, CardSkeleton, EmptyState } from "@/components/ui";
import {
  getReferrals,
  applyReferralCode as apiApplyReferralCode,
  type ReferralDashboardData,
  type ReferralListItem,
} from "@/lib/api";

function formatDate(value: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

function referralName(referral: ReferralListItem): string {
  return (
    referral.referredUser?.name ||
    referral.referredUser?.churchName ||
    referral.referredUser?.email ||
    "Church Partner"
  );
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  // New User referral code redemption state
  const [inputCode, setInputCode] = useState("");
  const [applyingCode, setApplyingCode] = useState(false);
  const [applyError, setApplyError] = useState("");
  const [applySuccess, setApplySuccess] = useState("");

  const loadData = async () => {
    try {
      setError("");
      const result = await getReferrals();
      setData(result);
    } catch (err: any) {
      setError(err?.message || "Failed to load referrals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const shareLink = useMemo(() => {
    if (!data?.code) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "https://makechurcheazy.com";
    return `${origin}/signup?ref=${encodeURIComponent(data.code)}`;
  }, [data?.code]);

  async function copyValue(value: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("Could not copy automatically. Please select and copy manually.");
    }
  }

  async function handleApplyCode(e: React.FormEvent) {
    e.preventDefault();
    const clean = inputCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (!clean) return;

    setApplyingCode(true);
    setApplyError("");
    setApplySuccess("");

    try {
      const res = await apiApplyReferralCode(clean);
      if (res.alreadyApplied) {
        setApplySuccess("Referral code was already applied to your account.");
      } else {
        setApplySuccess(`Referral code ${clean} applied successfully! Bonus credits have been queued.`);
      }
      setInputCode("");
      await loadData();
    } catch (err: any) {
      setApplyError(err?.message || "Could not apply referral code. Please check the code and try again.");
    } finally {
      setApplyingCode(false);
    }
  }

  const shareMessage = useMemo(() => {
    return `We use MakeChurchEasy for Sunday service presentation and offline scripture display. Sign up with our church invite link: ${shareLink}`;
  }, [shareLink]);

  const whatsappUrl = useMemo(() => {
    return `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  }, [shareMessage]);

  const mailtoUrl = useMemo(() => {
    return `mailto:?subject=${encodeURIComponent("Join MakeChurchEasy for Church Presentations")}&body=${encodeURIComponent(shareMessage)}`;
  }, [shareMessage]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6 pb-16 md:p-8">
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto w-full max-w-4xl p-6 md:p-8">
        <EmptyState
          icon={<Gift className="h-10 w-10 text-slate-400" />}
          title="Referrals could not load"
          description={error}
          action={
            <Button onClick={() => loadData()} variant="secondary">
              Try Again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6 pb-16 md:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Referrals & Invitations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Invite neighboring churches and ministries. Earn bonus AI presentation credits when they join and upgrade.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200/60">
            <Gift className="w-3.5 h-3.5" />
            Active Partner Program
          </span>
        </div>
      </div>

      {/* Attribution Status Banner (for the new user perspective) */}
      {data?.referredBy ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0 text-emerald-700 mt-0.5 sm:mt-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-emerald-950">Referral Attribution Active</h3>
                <span className="font-mono text-xs uppercase px-2 py-0.5 rounded bg-emerald-200/60 text-emerald-900 font-bold">
                  {data.referredBy.code}
                </span>
              </div>
              <p className="text-xs text-emerald-800 mt-0.5">
                You were invited to MakeChurchEasy through a partner church referral on {formatDate(data.referredBy.appliedAt)}.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-emerald-700 shrink-0 bg-white/70 px-3 py-1.5 rounded-lg border border-emerald-200/80">
            Linked to Sponsor
          </span>
        </div>
      ) : (
        /* If user doesn't have a referrer, allow them to claim one here */
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                <h3 className="text-sm font-bold text-slate-900">Were you invited by another ministry?</h3>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                If a church recommended MakeChurchEasy to you, enter their 8-character referral code below to link accounts and receive bonus credits.
              </p>
            </div>
            <form onSubmit={handleApplyCode} className="flex items-center gap-2 w-full md:w-auto">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                placeholder="e.g. MCEABC12"
                maxLength={16}
                className="h-10 w-full sm:w-48 rounded-xl border border-slate-200 bg-slate-50/50 px-3.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-900 outline-none transition placeholder:font-sans placeholder:normal-case placeholder:font-normal placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:ring-4 focus:ring-blue-600/10"
              />
              <button
                type="submit"
                disabled={applyingCode || !inputCode.trim()}
                className="h-10 px-4 rounded-xl bg-slate-900 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
              >
                {applyingCode ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                Apply Code
              </button>
            </form>
          </div>
          {applyError && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{applyError}</span>
            </div>
          )}
          {applySuccess && (
            <div className="mt-3 flex items-center gap-2 text-xs text-emerald-600">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{applySuccess}</span>
            </div>
          )}
        </div>
      )}

      {/* Referral Link & Code Card */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-7 shadow-xs">
        <div className="grid gap-8 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Your Personal Referral Tools</h2>
                <p className="text-xs text-slate-500">Share your invite link or code with leaders, media directors, or tech volunteers.</p>
              </div>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-[180px_1fr] mt-5">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Referral Code
                </label>
                <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5">
                  <span className="font-mono text-sm font-bold tracking-wider text-slate-900">
                    {data?.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => data?.code && copyValue(data.code, "code")}
                    className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition cursor-pointer"
                    title="Copy code"
                  >
                    {copied === "code" ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Direct Signup Link
                </label>
                <div className="flex h-11 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5">
                  <span className="truncate font-mono text-xs text-slate-700">
                    {shareLink}
                  </span>
                  <button
                    type="button"
                    onClick={() => shareLink && copyValue(shareLink, "link")}
                    className="p-1 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-white transition cursor-pointer"
                    title="Copy invite link"
                  >
                    {copied === "link" ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Share Buttons */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Share via:</span>
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                WhatsApp
              </a>
              <a
                href={mailtoUrl}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition"
              >
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                Email
              </a>
              <button
                type="button"
                onClick={() => shareLink && copyValue(shareLink, "link")}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5 text-slate-500" />
                {copied === "link" ? "Copied!" : "Copy Link"}
              </button>
            </div>
          </div>

          {/* Program explanation side card */}
          <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 text-xs text-blue-950">
            <div className="flex items-center gap-2 font-bold text-blue-900 mb-2.5">
              <Sparkles className="w-4 h-4 text-blue-600" />
              How Attribution Works
            </div>
            <ul className="space-y-2.5 text-blue-900/80 leading-relaxed">
              <li className="flex items-start gap-2">
                <span className="font-bold text-blue-600">•</span>
                <span>When anyone opens your link, your code is saved automatically to their device.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-blue-600">•</span>
                <span>Their account appears as <strong>Signed Up</strong> in your dashboard immediately.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-blue-600">•</span>
                <span>When they activate a paid subscription, their status moves to <strong>Paid</strong> and referral bonuses are credited.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Signups</span>
            <Users className="w-4 h-4 text-blue-600" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            {data?.stats.totalSignups ?? 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Referred accounts created</span>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Paid Referrals</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-emerald-600">
            {data?.stats.paidSignups ?? 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Subscribed & active</span>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending</span>
            <Mail className="w-4 h-4 text-amber-500" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-amber-600">
            {data?.stats.pendingSignups ?? 0}
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Currently on trial or free</span>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Conversion</span>
            <Sparkles className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-indigo-600">
            {data?.stats.conversionRate ?? 0}%
          </p>
          <span className="text-[11px] text-slate-400 mt-1 block">Paid conversion rate</span>
        </div>
      </div>

      {/* Referrals Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-5 sm:px-6">
          <div>
            <h2 className="text-base font-bold text-slate-900">Referral Activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live status of individuals and churches that joined through your invitation.
            </p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
            {data?.referrals.length || 0} Total Records
          </span>
        </div>

        {data?.referrals.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">Referred User / Ministry</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-4 py-3.5">Signup Date</th>
                  <th className="px-4 py-3.5">Paid Date</th>
                  <th className="px-6 py-3.5 text-right">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {data.referrals.map((referral) => (
                  <tr key={referral.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="font-bold text-slate-900">{referralName(referral)}</div>
                      <div className="text-[11px] text-slate-400">
                        {referral.referredUser?.churchName
                          ? `${referral.referredUser.churchName} • ${referral.referredUser.email || ""}`
                          : referral.referredUser?.email || "Account created"}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {referral.status === "paid" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Paid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
                          Signed up
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600 font-medium">
                      {formatDate(referral.createdAt)}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap text-slate-600">
                      {referral.paidAt ? formatDate(referral.paidAt) : "—"}
                    </td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-slate-100 text-slate-800">
                        {referral.paidPlan || referral.referredUser?.plan || "Free"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-400">
              <Share2 className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">No referrals yet</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 mb-5">
              Share your personal link or code with another church or ministry. As soon as they register, their account will be tracked here.
            </p>
            <button
              type="button"
              onClick={() => shareLink && copyValue(shareLink, "link")}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 transition cursor-pointer shadow-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied === "link" ? "Link Copied!" : "Copy Referral Link"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

