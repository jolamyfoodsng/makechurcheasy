"use client";

import {
  ArrowUp,
  ArrowDown,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Monitor,
  Settings,
  TrendingUp,
  Wallet,
  XCircle,
  Zap,
  AlertCircle,
  ChevronRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useSubscription } from "@/lib/useSubscription";
import { Card, Badge, Button, EmptyState, CardSkeleton } from "@/components/ui";
import type { PlanEntitlements } from "@/lib/planConfigService";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatCurrency(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    if (currency === "NGN") return `₦${amount.toLocaleString()}`;
    return `$${amount.toLocaleString()}`;
  }
}

function limitLabel(value: number): string {
  if (value === -1) return "Unlimited";
  return value.toLocaleString();
}

function formatGbLabel(value: number): string {
  if (value === -1) return "Unlimited";
  return `${value} GB`;
}

export default function SubscriptionPage() {
  const t = useTranslations();
  const {
    plan,
    planLabel,
    planTier,
    planConfig,
    subscription,
    mongoUser,
    usage,
    maxCredits,
    isUnlimited,
    isFreePlan,
    isOnTrial,
    trialDaysLeft,
    trialEndsAt,
    loading: subLoading,
  } = useSubscription();

  const entitlements = planTier?.entitlements as PlanEntitlements | undefined;
  const credits = mongoUser?.credits ?? 0;
  const currency = subscription?.currency || "USD";
  const isActive = subscription?.status === "active";
  const isCancelling = subscription?.status === "cancelled";
  const isPastDue = subscription?.status === "past_due";
  const isOneTimePurchase =
    subscription?.purchaseKind === "one_time" || subscription?.billingCycle === "lifetime";

  const renewalDate =
    isOneTimePurchase ? null : subscription?.nextBillingDate || subscription?.currentPeriodEnd;

  const statusLabel = isOnTrial
    ? "Trial"
    : isActive
      ? "Active"
      : isCancelling
        ? "Cancels"
        : isPastDue
          ? "Past Due"
          : isFreePlan
            ? "Free"
            : "Inactive";

  const statusVariant = isOnTrial
    ? "warning"
    : isActive
      ? "success"
      : isCancelling
        ? "warning"
        : isPastDue
          ? "error"
          : "default";

  const priceLabel = isFreePlan
    ? "Free"
    : subscription?.price != null && subscription.price > 0
      ? isOneTimePurchase
        ? `${formatCurrency(subscription.price, currency)} one-time`
        : `${formatCurrency(subscription.price, currency)}/${subscription.billingCycle === "yearly" ? "yr" : "mo"}`
      : "—";

  const mobileLabel = isFreePlan
    ? "Not available"
    : entitlements?.mobileControl
        ? "Android Scene Controller"
        : null;

  const presentationLabel = isFreePlan
    ? "Not available"
    : entitlements?.presentationMode
        ? "2-Laptop Presentation Mode"
        : null;

  const deviceLimit = entitlements?.devices ?? 1;
  const deviceConnected = 2; // placeholder — real device count from mongoUser or API

  if (subLoading) {
    return (
      <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-6 pb-16">
        <CardSkeleton />
        <CardSkeleton />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto w-full space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-1">Subscription</h1>
          <p className="text-sm text-slate-500">
            Manage your plan, included features and billing.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/billing">
            <Button variant="secondary" size="sm" icon={<Settings className="w-4 h-4" />}>
              Manage Billing
            </Button>
          </Link>
          <Link href="/subscription/plans">
            <Button size="sm" icon={<ArrowUp className="w-4 h-4" />}>
              Change Plan
            </Button>
          </Link>
        </div>
        </div>

        {/* Past-due banner */}
        {isPastDue && (
          <Card padding="md" className="border-amber-200 bg-amber-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-900 mb-1">Payment failed</h3>
                  <p className="text-xs text-amber-700">
                    We couldn&apos;t process your {formatCurrency(subscription?.price ?? 0, currency)} {planLabel} renewal.
                    {subscription?.gracePeriodEndsAt && (
                      <> Your {planLabel} access remains available until {formatDate(subscription.gracePeriodEndsAt)} while you update your payment method.</>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href="/billing">
                  <Button variant="secondary" size="sm" icon={<RefreshCw className="w-4 h-4" />}>
                    Retry Payment
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        )}

        {/* Scheduled change banner */}
        {subscription?.pendingPlan && subscription?.pendingChangeType && (
          <Card padding="md" className="border-blue-200 bg-blue-50">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 mb-1">
                    Scheduled change
                  </h3>
                  <p className="text-xs text-blue-700">
                    Your plan will change to{" "}
                    <strong>{subscription.pendingPlan.charAt(0).toUpperCase() + subscription.pendingPlan.slice(1)}</strong>
                    {subscription.pendingChangeEffectiveAt && (
                      <> starting {formatDate(subscription.pendingChangeEffectiveAt)}</>
                    )}.
                    Your current plan remains active until then.
                  </p>
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch("/api/subscriptions", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "cancelPendingChange" }),
                    });
                    if (res.ok) window.location.reload();
                  } catch {}
                }}
                className="text-xs font-semibold text-blue-600 hover:underline shrink-0"
              >
                Cancel Scheduled Change
              </button>
            </div>
          </Card>
        )}

        {/* Current Plan */}
      <Card padding="lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                isOnTrial
                  ? "bg-amber-50 text-amber-600"
                  : isActive
                    ? "bg-blue-50 text-blue-600"
                    : "bg-slate-100 text-slate-500"
              }`}
            >
              {isOnTrial ? (
                <Clock className="w-6 h-6" />
              ) : isFreePlan ? (
                <Zap className="w-6 h-6" />
              ) : (
                <CreditCard className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-bold text-slate-900">{planLabel}</h2>
                <Badge variant={statusVariant as any} size="sm">
                  {statusLabel}
                </Badge>
              </div>
              <p className="text-2xl font-bold text-slate-900 mb-1">
                {priceLabel}
              </p>
              {isOnTrial && trialEndsAt ? (
                <p className="text-sm text-amber-600">
                  Trial ends {formatDate(trialEndsAt.toISOString())}
                </p>
              ) : renewalDate && !isFreePlan ? (
                <p className="text-sm text-slate-500">
                  {isCancelling
                    ? `Cancels ${formatDate(renewalDate)}`
                    : `Renews ${formatDate(renewalDate)}`}
                </p>
              ) : null}
              {isPastDue && (
                <p className="text-sm text-red-600 font-medium mt-1">
                  Payment overdue
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/subscription/plans">
              <Button variant="secondary" size="sm">
                Change Plan
              </Button>
            </Link>
            <Link href="/billing">
              <Button variant="secondary" size="sm">
                Manage Billing
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {/* Resource cards: AI Credits + Devices */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card padding="md">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                  AI Credits
                </h3>
                <p className="text-xs text-slate-500">
                  {isUnlimited ? (
                    "Unlimited"
                  ) : (
                    <>
                      <span className="font-bold text-slate-900">
                        {maxCredits.toLocaleString()}
                      </span>{" "}
                      included per month
                    </>
                  )}
                </p>
                {!isUnlimited && credits > 0 && (
                  <p className="text-xs text-slate-500 mt-0.5">
                    {credits.toLocaleString()} remaining
                  </p>
                )}
              </div>
            </div>
            <Link
              href="/credits"
              className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap flex items-center gap-1 shrink-0"
            >
              View credit usage
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Card>

        <Card padding="md">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <Monitor className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">
                  Devices
                </h3>
                <p className="text-xs text-slate-500">
                  <span className="font-bold text-slate-900">
                    {deviceLimit === -1 ? "Unlimited" : deviceLimit}
                  </span>{" "}
                  {deviceLimit === 1 ? "device" : "devices"} allowed
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {deviceConnected} currently connected
                </p>
              </div>
            </div>
            <Link
              href="/devices"
              className="text-xs font-semibold text-blue-600 hover:underline whitespace-nowrap flex items-center gap-1 shrink-0"
            >
              Manage devices
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </Card>
      </div>

      {/* Included Benefits */}
      {entitlements && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900">
              Included with your plan
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {/* Core Production */}
            <FeatureItem label="Bible & Scripture" included={true} />
            <FeatureItem label="Worship Lyrics" included={true} />
            <FeatureItem label="Media" included={true} />
            {entitlements.lowerThirds > 0 && (
              <FeatureItem label="Lower Thirds" included={true} />
            )}
            {entitlements.tickers && (
              <FeatureItem label="Tickers" included={true} />
            )}
            {entitlements.countdowns && (
              <FeatureItem label="Countdowns" included={true} />
            )}
            {entitlements.multiview && (
              <FeatureItem label="Multiview" included={true} />
            )}

            {/* AI & Intelligence */}
            {entitlements.aiFeatures && (
              <FeatureItem label="AI Model Access" included={true} />
            )}
            {entitlements.speechToScripture && (
              <FeatureItem label="Speech-to-Scripture" included={true} />
            )}
            {entitlements.translation && (
              <FeatureItem label="Live Translation" included={true} />
            )}
            {entitlements.sermonExport && (
              <FeatureItem label="Sermon Export" included={true} />
            )}

            {/* Content & Import */}
            {entitlements.cloudSync && (
              <FeatureItem label="Cloud Sync" included={true} />
            )}
            {entitlements.massImport && (
              <FeatureItem label="Advanced Imports" included={true} />
            )}
            {entitlements.easyWorshipImport && (
              <FeatureItem label="EasyWorship Import" included={true} />
            )}
            {entitlements.proPresenterImport && (
              <FeatureItem label="ProPresenter Import" included={true} />
            )}

            {/* Mobile & Presentation */}
            {mobileLabel && (
              <FeatureItem label={mobileLabel} included={true} />
            )}
            {presentationLabel && (
              <FeatureItem label={presentationLabel} included={true} />
            )}

            {/* Advanced */}
            {entitlements.apiAccess && (
              <FeatureItem label="API Access" included={true} />
            )}
            {entitlements.teamManagement && (
              <FeatureItem label="Team Management" included={true} />
            )}
            {entitlements.campusManagement && (
              <FeatureItem label="Campus Management" included={true} />
            )}
          </div>
        </section>
      )}

      {/* Plan Limits */}
      {entitlements && (
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-4">Plan limits</h2>
          <Card padding="none">
            <LimitRow label="Songs" value={limitLabel(entitlements.songs)} />
            <LimitRow
              label="Images &amp; Videos"
              value={limitLabel(entitlements.images)}
            />
            <LimitRow
              label="Themes"
              value={limitLabel(entitlements.themes)}
            />
            <LimitRow
              label="Lower Thirds"
              value={limitLabel(entitlements.lowerThirds)}
            />
            <LimitRow
              label="Bible Versions"
              value={limitLabel(entitlements.bibleVersions)}
            />
            <LimitRow
              label="Devices"
              value={limitLabel(entitlements.devices)}
            />
            <LimitRow
              label="Cloud Storage"
              value={formatGbLabel(entitlements.cloudStorageGB)}
              last
            />
            <LimitRow
              label="AI Credits"
              value={
                isUnlimited ? "Unlimited" : `${maxCredits.toLocaleString()}/mo`
              }
              last
            />
          </Card>
        </section>
      )}

      {/* Billing Summary */}
      <section>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Billing</h2>
        <Card padding="none">
          <BillingRow
            label="Current charge"
            value={priceLabel}
          />
          <BillingRow
            label="Next payment"
            value={isOneTimePurchase ? "No renewal" : renewalDate ? formatDate(renewalDate) : "—"}
          />
          <BillingRow
            label="Billing cycle"
            value={
              isOneTimePurchase
                ? "One-time purchase"
                : subscription?.billingCycle
                ? subscription.billingCycle.charAt(0).toUpperCase() +
                  subscription.billingCycle.slice(1)
                : "—"
            }
          />
          <BillingRow
            label="Payment method"
            value={
              subscription?.paymentProvider
                ? subscription.paymentProvider === "paystack"
                  ? "Visa ···· 4242"
                  : subscription.paymentProvider === "mtn_momo"
                  ? "MTN MoMo"
                  : subscription.paymentProvider
                : "—"
            }
            last
          />
        </Card>
        <div className="mt-3">
          <Link
            href="/billing"
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
          >
            Manage Billing <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* Recent Subscription Activity */}
      {subscription && (
        <section>
          <h2 className="text-lg font-bold text-slate-900 mb-4">
            Recent subscription activity
          </h2>
          <Card padding="none">
            {subscription.previousPlan ? (
              <ActivityRow
                label="Plan upgraded"
                detail={`${subscription.previousPlan} → ${planLabel}`}
                date={
                  subscription.updatedAt
                    ? formatDate(subscription.updatedAt)
                    : ""
                }
                icon={
                  <TrendingUp className="w-4 h-4 text-green-600" />
                }
              />
            ) : null}
            {isActive && subscription.currentPeriodStart ? (
              <ActivityRow
                label="Subscription active"
                detail={`${planLabel} Plan`}
                date={formatDate(subscription.currentPeriodStart)}
                icon={
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                }
                last
              />
            ) : null}
            {subscription.previousPlan == null &&
              isActive &&
              subscription.currentPeriodStart == null && (
                <div className="p-6 text-center">
                  <p className="text-sm text-slate-500">
                    No recent activity
                  </p>
                </div>
              )}
          </Card>
        </section>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function FeatureItem({
  label,
  included,
}: {
  label: string;
  included: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
      {included ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
      ) : (
        <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
      )}
      <span
        className={`text-sm ${included ? "text-slate-700" : "text-slate-400"}`}
      >
        {label}
      </span>
    </div>
  );
}

function LimitRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center px-6 py-3 ${
        !last ? "border-b border-slate-100" : ""
      }`}
    >
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function BillingRow({
  label,
  value,
  last,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex justify-between items-center px-6 py-3 ${
        !last ? "border-b border-slate-100" : ""
      }`}
    >
      <span className="text-sm text-slate-600">{label}</span>
      <span className="text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function ActivityRow({
  label,
  detail,
  date,
  icon,
  last,
}: {
  label: string;
  detail: string;
  date: string;
  icon: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-6 py-3 ${
        !last ? "border-b border-slate-100" : ""
      }`}
    >
      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <span className="text-xs text-slate-400 shrink-0">{date}</span>
    </div>
  );
}
