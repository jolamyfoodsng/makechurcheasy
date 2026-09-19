/**
 * UpdatedSubscriptionPage — Subscription plans page with Paystack payment.
 *
 * Public pricing is limited to Free, Basic, and Growth.
 */
"use client";

import { useState } from "react";
import { ArrowRight, Check, Clock, LifeBuoy, Loader2, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useCountryPricing } from "../lib/useCountryPricing";
import { useSubscription } from "../lib/useSubscription";

type BillingCycle = "monthly" | "yearly";
type PublicPlan = "free" | "basic" | "growth";
type PaidPlan = Exclude<PublicPlan, "free">;

interface PlanDef {
  id: PublicPlan;
  name: string;
  description: string;
  features: string[];
  badge?: string;
}

const PLANS: PlanDef[] = [
  {
    id: "free",
    name: "Free",
    description: "Start with the essentials",
    features: [
      "3 songs, 3 images, and 2 videos",
      "3 Bible versions",
      "1 device",
      "50 credits",
      "No credit card required",
    ],
  },
  {
    id: "basic",
    name: "Basic",
    description: "For small and medium churches",
    features: [
      "100 songs, 100 images, and 100 videos",
      "Unlimited Bible versions",
      "3 devices",
      "Bible, Worship, Media, and Countdowns",
      "Verse AI with 100 monthly credits",
      "No Tickers, Lower Thirds, Multiview, or transcript translation",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    description: "For churches ready to run production with confidence",
    features: [
      "Unlimited songs, images, videos, and Bible versions",
      "10 devices and 20 team members",
      "Presentation Mode and mobile control",
      "Bulk import, EasyWorship, and ProPresenter import",
      "Cloud Sync and 2,000 monthly credits",
      "Priority support",
    ],
    badge: "MOST POPULAR",
  },
];

function normalizePublicPlan(plan?: string | null): PublicPlan {
  const value = String(plan || "free").toLowerCase();
  if (value === "basic") return "basic";
  if (value === "growth" || value === "pro") return "growth";
  return "free";
}

export default function UpdatedSubscriptionPage() {
  const { plan: currentPlan, planLabel, isOnTrial, trialDaysLeft, loading: subLoading } = useSubscription();
  const { getFormattedPlanPrice, getPlanPrice, getIntroPrice, formatPrice, pricing, loading: pricingLoading } = useCountryPricing();

  const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
  const [processing, setProcessing] = useState<PaidPlan | null>(null);

  const normalizedCurrentPlan = normalizePublicPlan(currentPlan);

  async function handleSelectPlan(planId: PaidPlan) {
    if (normalizedCurrentPlan === planId) return;
    setProcessing(planId);
    try {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId, billingCycle }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Payment initialization failed");
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    } catch (err) {
      console.error("[SubscriptionPage] Payment init failed:", err);
      alert(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setProcessing(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 font-sans text-[#0F172A] lg:py-20">
      <div className="mb-10 text-center">
        <h1 className="mb-3 text-[40px] font-bold leading-tight">Choose Your Plan</h1>
        <p className="mx-auto max-w-lg text-base text-[#64748B]">
          Choose the plan that fits your church: Free, Basic, or Growth.
        </p>

        {!subLoading && currentPlan && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[#CBD5E1] bg-[#F1F5F9] px-4 py-1.5 text-sm text-[#334155]">
            <span className="font-semibold">Current plan:</span>
            <span className="font-bold text-[#1D4ED8]">
              {isOnTrial ? "Growth Trial" : normalizedCurrentPlan === "growth" ? "Growth" : normalizedCurrentPlan === "basic" ? "Basic" : planLabel}
            </span>
            {isOnTrial && (
              <span className="text-xs font-semibold text-[#F59E0B]">({trialDaysLeft}d left)</span>
            )}
          </div>
        )}

        <div className="mt-6 inline-flex items-center rounded-full border border-[#CBD5E1] bg-[#F1F5F9] p-1">
          {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => (
            <button
              key={cycle}
              onClick={() => setBillingCycle(cycle)}
              className={`rounded-full px-5 py-2 text-sm font-semibold capitalize transition-all duration-150 ${
                billingCycle === cycle
                  ? "bg-white text-[#0F172A] shadow-sm"
                  : "text-[#64748B] hover:text-[#334155]"
              }`}
              type="button"
            >
              {cycle}
              {cycle === "yearly" && (
                <span className="ml-1.5 text-xs font-bold text-[#22C55E]">Save 2mo</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-12 grid grid-cols-1 items-start gap-6 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isGrowth = plan.id === "growth";
          const isBasic = plan.id === "basic";
          const paidPlan = plan.id === "free" ? null : plan.id;
          const isPaid = paidPlan !== null;
          const isCurrent = normalizedCurrentPlan === plan.id;
          const price = paidPlan ? getPlanPrice(paidPlan, billingCycle) : 0;
          const introPrice = paidPlan && billingCycle === "monthly" ? getIntroPrice(paidPlan) : undefined;
          const yearlySavings = paidPlan ? getPlanPrice(paidPlan, "monthly") * 12 - getPlanPrice(paidPlan, "yearly") : 0;

          return (
            <div
              key={plan.id}
              className={`relative flex h-full flex-col bg-white p-8 transition-all duration-150 ${
                isGrowth ? "border-2 border-[#1D4ED8] shadow-md" : "border border-[#CBD5E1]"
              }`}
              style={{ borderRadius: 12 }}
            >
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#1D4ED8] px-5 py-1.5 text-[11px] font-bold text-white">
                  {plan.badge}
                </div>
              )}

              {isCurrent && (
                <div className="absolute right-4 top-4 rounded-full bg-[#22C55E] px-2.5 py-1 text-[10px] font-bold text-white">
                  CURRENT
                </div>
              )}

              <div className="mb-6 mt-2 flex flex-col items-center text-center">
                <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full ${isGrowth ? "bg-[#EFF6FF]" : "bg-[#F8FAFC]"}`}>
                  {isGrowth ? (
                    <Sparkles className="h-7 w-7 text-[#1D4ED8]" />
                  ) : isBasic ? (
                    <Zap className="h-7 w-7 text-[#1D4ED8]" />
                  ) : (
                    <Check className="h-7 w-7 text-[#64748B]" />
                  )}
                </div>
                <h2 className="mb-1 text-[28px] font-bold">{plan.name}</h2>
                <p className="text-sm leading-relaxed text-[#64748B]">{plan.description}</p>
              </div>

              <div className="mb-6 text-center">
                {pricingLoading ? (
                  <div className="flex h-[48px] items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-[#64748B]" />
                  </div>
                ) : isPaid ? (
                  billingCycle === "monthly" && introPrice ? (
                    <div>
                      <div className="mb-1 text-[13px] font-semibold text-[#22C55E]">First month</div>
                      <div className="text-[40px] font-bold leading-none">{formatPrice(introPrice)}</div>
                      <div className="mt-1.5 text-xs text-[#64748B]">
                        Then {formatPrice(getPlanPrice(paidPlan!, "monthly"))}/mo
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="text-[40px] font-bold leading-none">
                        {getFormattedPlanPrice(paidPlan!, billingCycle)}
                      </div>
                      <div className="mt-1 text-sm text-[#64748B]">
                        /{billingCycle === "yearly" ? "yr" : "mo"}
                        {billingCycle === "yearly" && yearlySavings > 0 && (
                          <span className="ml-2 text-xs font-semibold text-[#22C55E]">
                            Save {pricing.currencySymbol}{Math.round(yearlySavings).toLocaleString("en-US")}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div>
                    <div className="text-[40px] font-bold leading-none">{formatPrice(price)}</div>
                    <div className="mt-1 text-sm text-[#64748B]">/forever</div>
                  </div>
                )}
              </div>

              <hr className="mb-6 border-[#E2E8F0]" />

              <ul className="mb-8 flex-grow space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start text-sm text-[#334155]">
                    <Check className={`mr-2.5 mt-0.5 h-[18px] w-[18px] shrink-0 ${isGrowth || isBasic ? "text-[#1D4ED8]" : "text-[#64748B]"}`} />
                    {feature}
                  </li>
                ))}
              </ul>

              <button
                onClick={paidPlan ? () => handleSelectPlan(paidPlan) : undefined}
                disabled={isCurrent || !!processing || !isPaid || normalizedCurrentPlan === "growth"}
                className={`flex w-full items-center justify-center gap-2 rounded-lg py-3.5 text-sm font-semibold transition-all duration-150 ${
                  isCurrent
                    ? "cursor-default bg-[#F1F5F9] text-[#64748B]"
                    : isGrowth
                      ? "bg-[#1D4ED8] text-white shadow-sm hover:bg-[#1E40AF]"
                      : isBasic
                        ? "bg-white text-[#1D4ED8] border border-[#1D4ED8] hover:bg-[#EFF6FF]"
                        : "cursor-default bg-[#F8FAFC] text-[#64748B]"
                }`}
                type="button"
              >
                {isCurrent ? (
                  "Current Plan"
                ) : processing === plan.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : isPaid && normalizedCurrentPlan !== "growth" ? (
                  <>
                    Upgrade to {plan.name}
                    <ArrowRight className="h-4 w-4" />
                  </>
                ) : (
                  `${plan.name} Plan`
                )}
              </button>
            </div>
          );
        })}
      </div>

      <div
        className="flex flex-wrap items-center justify-between gap-6 bg-white p-6 md:p-8"
        style={{ borderRadius: 12, border: "1px solid #E2E8F0" }}
      >
        <TrustItem icon={<ShieldCheck className="h-5 w-5 text-[#1D4ED8]" />} title="Secure Payments" text="Powered by Paystack" />
        <TrustItem icon={<Clock className="h-5 w-5 text-[#22C55E]" />} title="Cancel Anytime" text="No questions asked" />
        <TrustItem icon={<LifeBuoy className="h-5 w-5 text-[#1D4ED8]" />} title="Support" text="We are here to help" />
      </div>
    </main>
  );
}

function TrustItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EFF6FF]">
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-[#0F172A]">{title}</h4>
        <p className="text-xs text-[#64748B]">{text}</p>
      </div>
    </div>
  );
}
