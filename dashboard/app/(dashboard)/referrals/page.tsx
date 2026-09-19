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
} from "lucide-react";
import { Badge, Button, Card, CardSkeleton, EmptyState } from "@/components/ui";
import { getReferrals, type ReferralDashboardData, type ReferralListItem } from "@/lib/api";

function formatDate(value: string | null): string {
  if (!value) return "Not yet";
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
    referral.referredUser?.email ||
    "New signup"
  );
}

export default function ReferralsPage() {
  const [data, setData] = useState<ReferralDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getReferrals();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load referrals");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
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
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Could not copy. Select the text and copy it manually.");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 p-6 pb-16 md:p-8">
        <CardSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
          icon={<Gift className="h-10 w-10" />}
          title="Referrals could not load"
          description={error}
          action={
            <Button onClick={() => window.location.reload()} variant="secondary">
              Try Again
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6 pb-16 md:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Referrals</h1>
          <p className="mt-1 text-sm text-slate-500">
            Share MakeChurchEasy and track who signs up through your invite.
          </p>
        </div>
        <Badge variant="info" size="md">
          Open to every account
        </Badge>
      </div>

      <Card padding="lg" className="overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-center">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Gift className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Your referral link</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Anyone can use your code when creating an account. The referral is counted
              when they sign up and becomes eligible when they pay for a subscription.
            </p>

            <div className="mt-6 grid gap-3 md:grid-cols-[220px_1fr]">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Code
                </label>
                <div className="flex h-[44px] items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3">
                  <span className="font-mono text-sm font-bold tracking-wider text-slate-900">
                    {data?.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => data?.code && copyValue(data.code, "code")}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900"
                    title="Copy code"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Share Link
                </label>
                <div className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3">
                  <span className="truncate text-sm font-medium text-slate-700">
                    {shareLink}
                  </span>
                  <button
                    type="button"
                    onClick={() => shareLink && copyValue(shareLink, "link")}
                    className="rounded-lg p-1.5 text-slate-500 transition hover:bg-white hover:text-slate-900"
                    title="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {copied ? (
              <p className="mt-3 text-sm font-medium text-green-700">
                {copied === "code" ? "Code copied." : "Link copied."}
              </p>
            ) : null}
            {error ? (
              <p className="mt-3 text-sm font-medium text-red-700">{error}</p>
            ) : null}
          </div>

          <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-blue-800">
              <Sparkles className="h-4 w-4" />
              How it is counted
            </div>
            <p className="mt-3 text-sm leading-6 text-blue-900/80">
              A referral starts as signed up. It only moves to paid after the
              referred user completes a subscription payment.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Total Signups
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {data?.stats.totalSignups ?? 0}
              </p>
            </div>
            <Users className="h-6 w-6 text-blue-600" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Paid Referrals
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {data?.stats.paidSignups ?? 0}
              </p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pending
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">
                {data?.stats.pendingSignups ?? 0}
              </p>
            </div>
            <Mail className="h-6 w-6 text-amber-600" />
          </div>
        </Card>
      </div>

      <Card padding="none">
        <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Referral Activity</h2>
            <p className="mt-1 text-sm text-slate-500">
              People who created an account from your code.
            </p>
          </div>
          <Badge variant="default">{data?.stats.conversionRate ?? 0}% paid</Badge>
        </div>

        {data?.referrals.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-6 py-3">Person</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Signed Up</th>
                  <th className="px-6 py-3">Paid</th>
                  <th className="px-6 py-3 text-right">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.referrals.map((referral) => (
                  <tr key={referral.id} className="h-14">
                    <td className="px-6 py-3">
                      <div className="font-semibold text-slate-900">{referralName(referral)}</div>
                      <div className="text-xs text-slate-500">
                        {referral.referredUser?.churchName || referral.referredUser?.email || "Account created"}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <Badge
                        variant={referral.status === "paid" ? "success" : "warning"}
                        dot
                      >
                        {referral.status === "paid" ? "Paid" : "Signed up"}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-slate-600">{formatDate(referral.createdAt)}</td>
                    <td className="px-6 py-3 text-slate-600">{formatDate(referral.paidAt)}</td>
                    <td className="px-6 py-3 text-right font-semibold capitalize text-slate-900">
                      {referral.paidPlan || referral.referredUser?.plan || "Free"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState
              icon={<Share2 className="h-10 w-10" />}
              title="No referrals yet"
              description="Share your link with another church. Their signup will appear here after they create an account."
              action={
                <Button
                  variant="secondary"
                  icon={<Copy className="h-4 w-4" />}
                  onClick={() => shareLink && copyValue(shareLink, "link")}
                >
                  Copy Link
                </Button>
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}
