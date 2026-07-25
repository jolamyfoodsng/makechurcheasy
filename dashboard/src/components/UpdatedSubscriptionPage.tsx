/**
 * UpdatedSubscriptionPage — Subscription plans page with Paystack payment.
 *
 * Follows STYLE_DESIGN.md design system. Uses useSubscription() and
 * useCountryPricing() for dynamic data.
 */
"use client";

import { useState, useMemo } from "react";
import { Check, ShieldCheck, Clock, LifeBuoy, Loader2, ArrowRight, Sparkles, Zap, Crown } from "lucide-react";
import { useCountryPricing } from "../lib/useCountryPricing";
import { useSubscription } from "../lib/useSubscription";

type BillingCycle = "monthly" | "yearly";

interface PlanDef {
    id: "basic" | "growth" | "pro";
    name: string;
    description: string;
    icon: typeof Zap;
    color: string; // tailwind color class prefix
    features: string[];
    badge?: string;
}

const PLANS: PlanDef[] = [
    {
        id: "basic",
        name: "Basic",
        description: "For small congregations getting started",
        icon: Zap,
        color: "blue",
        features: [
            "30 songs, 20 images, 10 videos",
            "2 devices",
            "4 Bible versions",
            "50 credits / month",
            "Basic themes",
            "Basic lower thirds",
        ],
    },
    {
        id: "growth",
        name: "Growth",
        description: "For growing ministries that need more",
        icon: Sparkles,
        color: "purple",
        features: [
            "Everything in Basic",
            "Unlimited songs, images, videos",
            "10 themes, unlimited lower thirds",
            "5 devices",
            "Unlimited Bible versions",
            "500 credits / month",
            "Multi-View, tickers, mass import",
            "Countdowns & AI tools",
        ],
        badge: "MOST POPULAR",
    },
    {
        id: "pro",
        name: "Pro",
        description: "For ministries scaling their production",
        icon: Crown,
        color: "orange",
        features: [
            "Everything in Growth",
            "Unlimited themes & devices",
            "2,000 credits / month",
            "AI features, cloud sync",
            "Advanced analytics",
            "20 GB cloud storage",
            "Priority support",
            "Custom branding",
        ],
    },
];

export default function UpdatedSubscriptionPage() {
    const { plan: currentPlan, planLabel, isOnTrial, trialDaysLeft, loading: subLoading } = useSubscription();
    const { getFormattedPlanPrice, getPlanPrice, getIntroPrice, formatPrice, pricing, loading: pricingLoading } = useCountryPricing();

    const [billingCycle, setBillingCycle] = useState<BillingCycle>("monthly");
    const [processing, setProcessing] = useState<string | null>(null); // plan id being processed

    const isCurrentPlan = (planId: string) => currentPlan === planId;

    const yearlySavings = useMemo(() => {
        const savings: Record<string, number> = {};
        for (const p of PLANS) {
            const monthly = getPlanPrice(p.id, "monthly");
            const yearly = getPlanPrice(p.id, "yearly");
            savings[p.id] = monthly * 12 - yearly;
        }
        return savings;
    }, [pricing]);

    async function handleSelectPlan(planId: "basic" | "growth" | "pro") {
        if (isCurrentPlan(planId)) return;
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
        <main className="max-w-6xl mx-auto px-4 py-12 lg:py-20 font-sans text-[#0F172A]">
            {/* Header */}
            <div className="text-center mb-10">
                <h1 className="text-[40px] font-bold leading-tight mb-3">Choose Your Plan</h1>
                <p className="text-[#64748B] text-base max-w-lg mx-auto">
                    Everything your church needs, inside OBS.
                </p>

                {/* Current plan indicator */}
                {!subLoading && currentPlan && currentPlan !== "free" && (
                    <div className="mt-4 inline-flex items-center gap-2 bg-[#F1F5F9] border border-[#CBD5E1] rounded-full px-4 py-1.5 text-sm text-[#334155]">
                        <span className="font-semibold">Current plan:</span>
                        <span className="font-bold text-[#1D4ED8]">{planLabel}</span>
                        {isOnTrial && (
                            <span className="text-[#F59E0B] text-xs font-semibold">({trialDaysLeft}d left)</span>
                        )}
                    </div>
                )}

                {/* Billing cycle toggle */}
                <div className="mt-6 inline-flex items-center bg-[#F1F5F9] border border-[#CBD5E1] rounded-full p-1">
                    <button
                        onClick={() => setBillingCycle("monthly")}
                        className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-150 ${billingCycle === "monthly"
                            ? "bg-white text-[#0F172A] shadow-sm"
                            : "text-[#64748B] hover:text-[#334155]"
                            }`}
                    >
                        Monthly
                    </button>
                    <button
                        onClick={() => setBillingCycle("yearly")}
                        className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-150 ${billingCycle === "yearly"
                            ? "bg-white text-[#0F172A] shadow-sm"
                            : "text-[#64748B] hover:text-[#334155]"
                            }`}
                    >
                        Yearly
                        <span className="ml-1.5 text-xs text-[#22C55E] font-bold">Save 2mo</span>
                    </button>
                </div>
            </div>

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start mb-12">
                {PLANS.map((plan) => {
                    const Icon = plan.icon;
                    const isPopular = plan.badge === "MOST POPULAR";
                    const isCurrent = isCurrentPlan(plan.id);
                    const isProcessing = processing === plan.id;
                    const formattedPrice = getFormattedPlanPrice(plan.id, billingCycle);

                    return (
                        <div
                            key={plan.id}
                            className={`bg-white p-8 flex flex-col h-full transition-all duration-150 ${isPopular
                                ? "border-2 border-[#7C3AED] relative md:scale-[1.03] shadow-md"
                                : "border border-[#CBD5E1]"
                                }`}
                            style={{ borderRadius: 12 }}
                        >
                            {/* Popular badge */}
                            {isPopular && (
                                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-[#7C3AED] text-white text-[11px] font-bold px-5 py-1.5 rounded-full whitespace-nowrap">
                                    {plan.badge}
                                </div>
                            )}

                            {/* Current plan badge */}
                            {isCurrent && (
                                <div className="absolute top-4 right-4 bg-[#22C55E] text-white text-[10px] font-bold px-2.5 py-1 rounded-full">
                                    CURRENT
                                </div>
                            )}

                            {/* Icon + title */}
                            <div className="flex flex-col items-center text-center mb-6 mt-2">
                                <div
                                    className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${plan.color === "blue"
                                        ? "bg-[#EFF6FF]"
                                        : plan.color === "purple"
                                            ? "bg-[#F5F3FF]"
                                            : "bg-[#FFF7ED]"
                                        }`}
                                >
                                    <Icon
                                        className={`w-7 h-7 ${plan.color === "blue"
                                            ? "text-[#1D4ED8]"
                                            : plan.color === "purple"
                                                ? "text-[#7C3AED]"
                                                : "text-[#F97316]"
                                            }`}
                                    />
                                </div>
                                <h2 className="text-[28px] font-bold mb-1">{plan.name}</h2>
                                <p className="text-[#64748B] text-sm leading-relaxed">{plan.description}</p>
                            </div>

                            {/* Price */}
                            <div className="text-center mb-6">
                                {pricingLoading ? (
                                    <div className="h-[48px] flex items-center justify-center">
                                        <Loader2 className="w-5 h-5 animate-spin text-[#64748B]" />
                                    </div>
                                ) : billingCycle === "monthly" ? (
                                    <>
                                        {/* Introductory pricing */}
                                        {getIntroPrice(plan.id) ? (
                                            <div>
                                                <div className="text-[13px] text-[#22C55E] font-semibold mb-1">First month</div>
                                                <div className="text-[40px] font-bold leading-none">
                                                    {formatPrice(getIntroPrice(plan.id)!)}
                                                </div>
                                                <div className="text-xs text-[#64748B] mt-1.5">
                                                    Then {formatPrice(getPlanPrice(plan.id, "monthly"))}/mo
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="text-[40px] font-bold leading-none">
                                                    {formattedPrice}
                                                </div>
                                                <div className="text-sm text-[#64748B] mt-1">/mo</div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <div className="text-[40px] font-bold leading-none">
                                            {formattedPrice}
                                        </div>
                                        <div className="text-sm text-[#64748B] mt-1">
                                            /yr
                                            {yearlySavings[plan.id] > 0 && (
                                                <span className="ml-2 text-[#22C55E] text-xs font-semibold">
                                                    Save {pricing.currencySymbol}{Math.round(yearlySavings[plan.id]).toLocaleString("en-US")}
                                                </span>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            <hr className="border-[#E2E8F0] mb-6" />

                            {/* Features */}
                            <ul className="space-y-3 mb-8 flex-grow">
                                {plan.features.map((feature, i) => (
                                    <li key={i} className="flex items-start text-[#334155] text-sm">
                                        <Check
                                            className={`w-[18px] h-[18px] mr-2.5 mt-0.5 shrink-0 ${plan.color === "blue"
                                                ? "text-[#1D4ED8]"
                                                : plan.color === "purple"
                                                    ? "text-[#7C3AED]"
                                                    : "text-[#F97316]"
                                                }`}
                                        />
                                        {feature}
                                    </li>
                                ))}
                            </ul>

                            {/* CTA */}
                            <button
                                onClick={() => handleSelectPlan(plan.id)}
                                disabled={isCurrent || isProcessing}
                                className={`w-full py-3.5 rounded-lg text-sm font-semibold transition-all duration-150 flex items-center justify-center gap-2 ${isCurrent
                                    ? "bg-[#F1F5F9] text-[#64748B] cursor-default"
                                    : isProcessing
                                        ? "bg-[#CBD5E1] text-white cursor-wait"
                                        : isPopular
                                            ? "bg-[#7C3AED] text-white hover:bg-[#6D28D9] shadow-sm"
                                            : plan.color === "blue"
                                                ? "bg-[#1D4ED8] text-white hover:bg-[#1E40AF] shadow-sm"
                                                : "bg-[#F97316] text-white hover:bg-[#EA580C] shadow-sm"
                                    }`}
                            >
                                {isCurrent ? (
                                    "Current Plan"
                                ) : isProcessing ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Redirecting...
                                    </>
                                ) : (
                                    <>
                                        {isCurrentPlan("free") || isOnTrial ? `Start ${plan.name}` : `Upgrade to ${plan.name}`}
                                        <ArrowRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Trust Section */}
            <div
                className="bg-white p-6 md:p-8 flex flex-wrap justify-between items-center gap-6"
                style={{ borderRadius: 12, border: "1px solid #E2E8F0" }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#F5F3FF] rounded-full flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5 text-[#7C3AED]" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm text-[#0F172A]">Secure Payments</h4>
                        <p className="text-xs text-[#64748B]">Powered by Paystack</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#F0FDF4] rounded-full flex items-center justify-center">
                        <Clock className="w-5 h-5 text-[#22C55E]" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm text-[#0F172A]">Cancel Anytime</h4>
                        <p className="text-xs text-[#64748B]">No questions asked</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#EFF6FF] rounded-full flex items-center justify-center">
                        <LifeBuoy className="w-5 h-5 text-[#1D4ED8]" />
                    </div>
                    <div>
                        <h4 className="font-semibold text-sm text-[#0F172A]">24/7 Support</h4>
                        <p className="text-xs text-[#64748B]">We&apos;re here to help</p>
                    </div>
                </div>
            </div>
        </main>
    );
}
