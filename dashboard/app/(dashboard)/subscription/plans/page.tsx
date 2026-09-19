"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Coins, CreditCard, Gift, Globe2, Loader2, Star, X } from "lucide-react";
import { useSubscription } from "@/lib/useSubscription";
import { useLocalizedPricing } from "@/lib/useLocalizedPricing";
import { Card, Badge, Button } from "@/components/ui";
import { trackProductEvent } from "@/lib/productTracking";
import { requestCountrySelection } from "@/components/ProfileCompletionModal";

type BillingCycle = "monthly" | "yearly";
type PublicPlan = "free" | "basic" | "growth";
type PaidPlan = Exclude<PublicPlan, "free">;
type PaymentMethod = "paystack" | "nowpayments" | "flutterwave";

type EligibleSpecialOffer = {
  id: string;
  name: string;
  description: string;
  badgeText: string;
  ctaText: string;
  kind: "one_time" | "discounted_subscription";
  plan: PaidPlan;
  billingCycle: "monthly" | "yearly" | "lifetime";
  purchaseKind: "subscription" | "one_time";
  price: number;
  originalPrice: number;
  discountPercent: number | null;
  discountDurationMonths: number | null;
  discountAmount: number;
  currency: string;
  currencySymbol: string;
  endsAt: string | null;
  accountAgeDays: number | null;
};

const PLAN_NAMES: Record<PublicPlan, string> = {
  free: "Free",
  basic: "Basic",
  growth: "Growth",
};

const PLAN_COPY: Record<PublicPlan, { subtitle: string; features: string[] }> = {
  free: {
    subtitle: "Start with the essentials",
    features: [
      "3 songs, 3 images, and 2 videos",
      "3 Bible versions",
      "1 device",
      "50 credits",
      "Community support",
    ],
  },
  basic: {
    subtitle: "For small and medium churches",
    features: [
      "100 songs, 100 images, and 100 videos",
      "Unlimited Bible versions",
      "3 devices",
      "Bible, Worship, Media, and Countdowns",
      "Verse AI with 100 monthly credits",
      "No Tickers, Lower Thirds, Multiview, or transcript translation",
    ],
  },
  growth: {
    subtitle: "For active churches and media teams",
    features: [
      "Unlimited songs, images, videos, and Bible versions",
      "10 devices and 20 team members",
      "Presentation Mode and mobile control",
      "Bulk import, EasyWorship, and ProPresenter import",
      "Cloud Sync and 2,000 monthly credits",
      "Priority support and early feature access",
    ],
  },
};

function normalizePublicPlan(plan?: string | null): PublicPlan {
  const value = String(plan || "free").toLowerCase();
  if (value === "basic") return "basic";
  if (value === "growth") return "growth";
  if (value === "pro") return "growth";
  return "free";
}

function formatOfferAmount(amount: number, currency: string, symbol: string) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${symbol}${amount.toLocaleString()}`;
  }
}

export default function ComparePlansPage() {
  const pricing = useLocalizedPricing();
  const { plan: currentPlan, isOnTrial } = useSubscription();
  const [billing, setBilling] = useState<BillingCycle>("monthly");
  const [promoCode, setPromoCode] = useState("");
  const [upgrading, setUpgrading] = useState<PaidPlan | null>(null);
  const [offerCheckout, setOfferCheckout] = useState<string | null>(null);
  const [offers, setOffers] = useState<EligibleSpecialOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentMethodByPlan, setPaymentMethodByPlan] = useState<Record<PaidPlan, PaymentMethod>>({
    basic: "flutterwave",
    growth: "flutterwave",
  });
  const [nowPaymentsEnabled, setNowPaymentsEnabled] = useState(false);
  const [nowPaymentsConfigLoaded, setNowPaymentsConfigLoaded] = useState(false);
  const [flutterwaveEnabled, setFlutterwaveEnabled] = useState(false);
  const [flutterwaveConfigLoaded, setFlutterwaveConfigLoaded] = useState(false);
  const [validatedDiscount, setValidatedDiscount] = useState<{
    code: string;
    percentOff: number;
    durationMonths: number;
    discountAmount: number;
    finalAmount: number;
    originalAmount: number;
  } | null>(null);
  const [discountChecking, setDiscountChecking] = useState(false);
  const [discountError, setDiscountError] = useState("");

  const currentPlanKey = normalizePublicPlan(currentPlan);
  const plans: PaidPlan[] = ["basic", "growth"];
  const isNigerian = pricing.pricing?.country?.toUpperCase() === "NG";
  const paymentMethodsReady = isNigerian || (
    flutterwaveConfigLoaded &&
    nowPaymentsConfigLoaded &&
    (flutterwaveEnabled || nowPaymentsEnabled)
  );

  useEffect(() => {
    if (!flutterwaveConfigLoaded || !nowPaymentsConfigLoaded) return;
    setPaymentMethodByPlan((current) => ({
      basic: getAvailablePaymentMethod(current.basic, {
        isNigerian,
        flutterwaveEnabled,
        nowPaymentsEnabled,
      }),
      growth: getAvailablePaymentMethod(current.growth, {
        isNigerian,
        flutterwaveEnabled,
        nowPaymentsEnabled,
      }),
    }));
  }, [isNigerian, flutterwaveConfigLoaded, nowPaymentsConfigLoaded, flutterwaveEnabled, nowPaymentsEnabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("promo") || params.get("code") || params.get("discount") || "";
    if (code) setPromoCode(code.toUpperCase().replace(/[^A-Z0-9_-]/g, ""));
    const urlBilling = params.get("billing");
    if (urlBilling === "monthly" || urlBilling === "yearly") {
      setBilling(urlBilling);
    }
  }, []);

  useEffect(() => {
    if (!promoCode.trim()) {
      setValidatedDiscount(null);
      setDiscountError("");
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      setDiscountChecking(true);
      setDiscountError("");
      try {
        const res = await fetch("/api/discounts/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            code: promoCode.trim(),
            plan: "growth",
            billingCycle: billing,
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setDiscountError(data.error || "Invalid discount code");
          setValidatedDiscount(null);
        } else if (data.discount) {
          setValidatedDiscount(data.discount);
          setDiscountError("");
        }
      } catch {
        if (!cancelled) {
          setDiscountError("Could not validate discount code");
          setValidatedDiscount(null);
        }
      } finally {
        if (!cancelled) setDiscountChecking(false);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [promoCode, billing]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/flutterwave/config", { credentials: "include", cache: "no-store" })
      .then(async (res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        if (cancelled) return;
        setFlutterwaveEnabled(data?.enabled === true);
        setFlutterwaveConfigLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setFlutterwaveEnabled(false);
        setFlutterwaveConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    trackProductEvent("paywall_viewed", {
      surface: "subscription_plans",
      currentPlan: currentPlanKey,
      isOnTrial,
    });
  }, [currentPlanKey, isOnTrial]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/payments/nowpayments/config", { credentials: "include", cache: "no-store" })
      .then(async (res) => (res.ok ? res.json() : { enabled: false }))
      .then((data) => {
        if (cancelled) return;
        setNowPaymentsEnabled(data?.enabled === true);
        setNowPaymentsConfigLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setNowPaymentsEnabled(false);
        setNowPaymentsConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const initializePayment = async (body: Record<string, unknown>) => {
    let promptedForCountry = false;

    while (true) {
      const res = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok || data?.code !== "COUNTRY_REQUIRED" || promptedForCountry) {
        return { res, data };
      }

      promptedForCountry = true;
      setError("");
      await requestCountrySelection();
    }
  };

  const startNowPaymentsPayment = async (payload: {
    plan: PaidPlan;
    billingCycle: EligibleSpecialOffer["billingCycle"] | BillingCycle;
    offerId?: string;
  }) => {
    const { res, data } = await initializePayment({
      paymentMethod: "nowpayments",
      plan: payload.plan,
      billingCycle: payload.billingCycle,
      ...(payload.offerId ? { offerId: payload.offerId } : {}),
      ...(promoCode.trim() ? { discountCode: promoCode.trim() } : {}),
    });
    if (!res.ok || !data.authorization_url || data.paymentMethod !== "nowpayments") {
      throw new Error(data.error || "Could not start crypto checkout");
    }
    try {
      localStorage.setItem(
        "mce_pending_payment",
        JSON.stringify({
          type: "subscription",
          paymentMethod: "nowpayments",
          reference: data.reference,
          planId: data.plan || payload.plan,
          billingCycle: data.billingCycle || payload.billingCycle,
          offerId: payload.offerId,
          purchaseKind: data.purchaseKind,
        }),
      );
    } catch {
      // Best effort only.
    }
    window.location.href = data.authorization_url;
  };

  const startFlutterwavePayment = async (payload: {
    plan: PaidPlan;
    billingCycle: EligibleSpecialOffer["billingCycle"] | BillingCycle;
    offerId?: string;
  }) => {
    const { res, data } = await initializePayment({
      paymentMethod: "flutterwave",
      plan: payload.plan,
      billingCycle: payload.billingCycle,
      ...(payload.offerId ? { offerId: payload.offerId } : {}),
      ...(promoCode.trim() ? { discountCode: promoCode.trim() } : {}),
    });
    if (!res.ok || !data.authorization_url || data.paymentMethod !== "flutterwave") {
      throw new Error(data.error || "Could not start Flutterwave checkout");
    }
    try {
      localStorage.setItem(
        "mce_pending_payment",
        JSON.stringify({
          type: "subscription",
          paymentMethod: "flutterwave",
          reference: data.reference,
          planId: data.plan || payload.plan,
          billingCycle: data.billingCycle || payload.billingCycle,
          offerId: payload.offerId,
          purchaseKind: data.purchaseKind,
        }),
      );
    } catch {
      // Best effort only.
    }
    window.location.href = data.authorization_url;
  };

  useEffect(() => {
    let cancelled = false;
    async function loadOffers() {
      try {
        const res = await fetch("/api/special-offers/eligible", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setOffers(Array.isArray(data.offers) ? data.offers : []);
      } catch {
        // Normal pricing still works if offers cannot load.
      } finally {
        if (!cancelled) setOffersLoading(false);
      }
    }
    loadOffers();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPaymentMethodForPlan = (plan: PaidPlan): PaymentMethod => {
    return getAvailablePaymentMethod(paymentMethodByPlan[plan], {
      isNigerian,
      flutterwaveEnabled,
      nowPaymentsEnabled,
    });
  };

  const handleUpgrade = async (plan: PaidPlan) => {
    const paymentMethod = getPaymentMethodForPlan(plan);
    setError("");
    setUpgrading(plan);
    trackProductEvent("checkout_started", {
      plan,
      billingCycle: billing,
      paymentMethod,
      surface: "subscription_plans",
    });
    try {
      if (paymentMethod === "nowpayments") {
        await startNowPaymentsPayment({ plan, billingCycle: billing });
        return;
      }
      if (paymentMethod === "flutterwave") {
        await startFlutterwavePayment({ plan, billingCycle: billing });
        return;
      }
      const { res, data } = await initializePayment({
        plan,
        billingCycle: billing,
        ...(promoCode.trim() ? { discountCode: promoCode.trim() } : {}),
      });
      if (!res.ok || !data.authorization_url) {
        throw new Error(data.error || "Could not start checkout");
      }
      try {
        localStorage.setItem(
          "mce_pending_payment",
          JSON.stringify({ type: "subscription", reference: data.reference, planId: plan, billingCycle: billing, discountCode: promoCode.trim() || undefined }),
        );
      } catch {
        // Best effort only.
      }
      window.location.href = data.authorization_url;
    } catch (e) {
      trackProductEvent("payment_failed", {
        plan,
        billingCycle: billing,
        paymentMethod,
        surface: "subscription_plans",
      });
      setError(e instanceof Error ? e.message : "Failed to start payment");
      setUpgrading(null);
    }
  };

  const handleOfferCheckout = async (offer: EligibleSpecialOffer) => {
    const paymentMethod = getPaymentMethodForPlan(offer.plan);
    setError("");
    setOfferCheckout(offer.id);
    trackProductEvent("checkout_started", {
      plan: offer.plan,
      billingCycle: offer.billingCycle,
      paymentMethod,
      offerId: offer.id,
      surface: "special_offer",
    });
    try {
      if (paymentMethod === "nowpayments") {
        await startNowPaymentsPayment({ plan: offer.plan, billingCycle: offer.billingCycle, offerId: offer.id });
        return;
      }
      if (paymentMethod === "flutterwave") {
        await startFlutterwavePayment({ plan: offer.plan, billingCycle: offer.billingCycle, offerId: offer.id });
        return;
      }
      const { res, data } = await initializePayment({
        plan: offer.plan,
        billingCycle: offer.billingCycle,
        offerId: offer.id,
      });
      if (!res.ok || !data.authorization_url) {
        throw new Error(data.error || "Could not start checkout");
      }
      try {
        localStorage.setItem(
          "mce_pending_payment",
          JSON.stringify({
            type: "subscription",
            reference: data.reference,
            planId: data.plan || offer.plan,
            billingCycle: data.billingCycle || offer.billingCycle,
            offerId: offer.id,
            purchaseKind: data.purchaseKind || offer.purchaseKind,
          }),
        );
      } catch {
        // Best effort only.
      }
      window.location.href = data.authorization_url;
    } catch (e) {
      trackProductEvent("payment_failed", {
        plan: offer.plan,
        billingCycle: offer.billingCycle,
        paymentMethod,
        offerId: offer.id,
        surface: "special_offer",
      });
      setError(e instanceof Error ? e.message : "Failed to start payment");
      setOfferCheckout(null);
    }
  };

  if (pricing.loading) {
    return (
      <div className="flex w-full items-center justify-center px-6 py-24">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6 pb-16 md:p-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="mb-1 text-2xl font-bold text-slate-900">Compare Plans</h1>
          <p className="text-sm text-slate-500">
            Choose the plan that fits your church.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <label className="flex h-10 items-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 shadow-sm">
            <span className="mr-2 text-xs font-semibold uppercase text-slate-400">Code</span>
            <input
              value={promoCode}
              onChange={(event) => setPromoCode(event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}
              placeholder="DISCOUNT"
              className="w-28 bg-transparent text-sm font-semibold uppercase text-slate-900 outline-none placeholder:text-slate-300"
            />
          </label>
          <div className="flex items-center gap-3">
          <span className="text-sm text-slate-500">Billing:</span>
          <div className="flex rounded-lg bg-slate-100 p-0.5">
            {(["monthly", "yearly"] as BillingCycle[]).map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBilling(cycle)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                  billing === cycle
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
                type="button"
              >
                {cycle}
                {cycle === "yearly" && (
                  <span className="ml-1 text-[10px] font-semibold text-green-600">Save 2mo</span>
                )}
              </button>
            ))}
          </div>
          </div>
        </div>
      </div>

      {validatedDiscount && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white font-extrabold text-xs shadow-sm">
              %
            </span>
            <div>
              <p className="font-bold text-emerald-950">
                Promo Code Applied: <span className="font-mono bg-emerald-100 px-1.5 py-0.5 rounded text-emerald-800">{validatedDiscount.code}</span> ({validatedDiscount.percentOff}% off)
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                Enjoy {validatedDiscount.percentOff}% off for {validatedDiscount.durationMonths} month{validatedDiscount.durationMonths > 1 ? "s" : ""}. The discount is automatically applied to your checkout below.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setPromoCode("");
              setValidatedDiscount(null);
            }}
            className="text-xs text-emerald-700 hover:text-emerald-950 font-semibold underline shrink-0 px-2 py-1"
          >
            Remove
          </button>
        </div>
      )}

      {discountError && promoCode && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" /> {discountError}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <X className="h-4 w-4" /> {error}
        </div>
      )}

      {!offersLoading && offers.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Available Offers</h2>
            <p className="mt-1 text-sm text-slate-500">
              These offers are based on your account history and may not be available later.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {offers.map((offer) => {
              const original = offer.originalPrice > offer.price ? offer.originalPrice : 0;
              const billingLabel = offer.purchaseKind === "one_time"
                ? "one-time payment"
                : offer.billingCycle === "yearly"
                  ? "first yearly payment"
                  : "first monthly payment";
              return (
                <Card key={offer.id} padding="lg" className="border-blue-200 bg-blue-50/40">
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant="info" size="sm">
                          <Gift className="mr-1 h-3 w-3" />
                          {offer.badgeText}
                        </Badge>
                        {offer.discountPercent ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                            {offer.discountPercent}% off
                          </span>
                        ) : null}
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">{offer.name}</h3>
                      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{offer.description}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                        <span>{PLAN_NAMES[offer.plan]} access</span>
                        {offer.accountAgeDays != null && (
                          <span>{Math.floor(offer.accountAgeDays / 30)} months with MakeChurchEasy</span>
                        )}
                        {offer.endsAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="h-3.5 w-3.5" />
                            Ends {new Date(offer.endsAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="shrink-0 rounded-xl border border-blue-100 bg-white p-4 md:w-56">
                      <div className="mb-4">
                        {original ? (
                          <p className="text-sm font-semibold text-slate-400 line-through">
                            {formatOfferAmount(original, offer.currency, offer.currencySymbol)}
                          </p>
                        ) : null}
                        <p className="text-3xl font-bold text-slate-900">
                          {formatOfferAmount(offer.price, offer.currency, offer.currencySymbol)}
                        </p>
                        <p className="mt-1 text-xs font-medium text-slate-500">{billingLabel}</p>
                      </div>
                      <Button
                        variant="primary"
                        size="md"
                        loading={offerCheckout === offer.id}
                        disabled={!!offerCheckout || !!upgrading}
                        icon={<ArrowRight className="h-4 w-4" />}
                        onClick={() => handleOfferCheckout(offer)}
                        className="w-full"
                      >
                        {offer.ctaText}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {plans.map((planKey) => {
          const isCurrent = currentPlanKey === planKey;
          const isGrowth = planKey === "growth";
          const price = pricing.getPlanPrice(planKey, billing);
          const monthlyEquivalent = billing === "yearly" ? price / 12 : price;
          const introPrice = billing === "monthly" ? pricing.getIntroPrice(planKey) : undefined;
          const isDiscountApplicable = Boolean(validatedDiscount);
          const discountedPrice = isDiscountApplicable && validatedDiscount
            ? Math.max(1, Math.round(price * (100 - validatedDiscount.percentOff)) / 100)
            : price;
          const discountedMonthlyEquivalent = billing === "yearly" ? discountedPrice / 12 : discountedPrice;

          return (
            <Card
              key={planKey}
              padding="lg"
              className={`relative flex min-h-[420px] flex-col ${
                isGrowth ? "border-blue-300 ring-1 ring-blue-100" : ""
              }`}
            >
              {isGrowth && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <Badge variant="info" size="sm">
                    <Star className="mr-0.5 h-3 w-3" /> Recommended
                  </Badge>
                </div>
              )}

              {isCurrent && (
                <div className="absolute right-5 top-5">
                  <Badge variant={isOnTrial && isGrowth ? "warning" : "success"} size="sm">
                    {isOnTrial && isGrowth ? "Growth Trial" : "Current Plan"}
                  </Badge>
                </div>
              )}

              <div className="mb-5">
                <h3 className="text-xl font-bold text-slate-900">{PLAN_NAMES[planKey]}</h3>
                <p className="mt-1 text-sm text-slate-500">{PLAN_COPY[planKey].subtitle}</p>
              </div>

              <div className="mb-6">
                <div className="flex items-baseline gap-2">
                  {isDiscountApplicable ? (
                    <>
                      <span className="text-2xl font-bold text-slate-400 line-through">
                        {pricing.formatPrice(monthlyEquivalent)}
                      </span>
                      <span className="text-4xl font-extrabold text-emerald-600">
                        {pricing.formatPrice(discountedMonthlyEquivalent)}
                      </span>
                      <span className="text-sm text-slate-500">
                        /month
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-4xl font-bold text-slate-900">
                        {pricing.formatPrice(monthlyEquivalent)}
                      </span>
                      <span className="text-sm text-slate-500">
                        /month
                      </span>
                    </>
                  )}
                </div>
                {isDiscountApplicable && validatedDiscount ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-600">
                    🎉 {validatedDiscount.percentOff}% off for {validatedDiscount.durationMonths} month{validatedDiscount.durationMonths > 1 ? "s" : ""}
                  </p>
                ) : billing === "yearly" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {pricing.formatPrice(price)} billed annually
                  </p>
                ) : null}
                {!isDiscountApplicable && introPrice && introPrice < price && (
                  <p className="mt-1 text-xs font-semibold text-green-600">
                    {pricing.formatPrice(introPrice)} first month
                  </p>
                )}
              </div>

              <div className="mb-6 flex-1 space-y-2">
                {PLAN_COPY[planKey].features.map((feature) => (
                  <FeatureLine key={feature} included label={feature} />
                ))}
              </div>

              <PaymentMethodOptions
                selected={paymentMethodByPlan[planKey]}
                onChange={(method) => setPaymentMethodByPlan((current) => ({ ...current, [planKey]: method }))}
                isNigerian={isNigerian}
                countryCode={pricing.pricing?.country}
                currency={pricing.pricing?.currency}
                nowPaymentsEnabled={nowPaymentsEnabled}
                nowPaymentsConfigLoaded={nowPaymentsConfigLoaded}
                flutterwaveEnabled={flutterwaveEnabled}
                flutterwaveConfigLoaded={flutterwaveConfigLoaded}
              />

              <Button
                variant={isCurrent ? "secondary" : isGrowth ? "primary" : "secondary"}
                size="md"
                loading={upgrading === planKey}
                disabled={isCurrent || !!upgrading || currentPlanKey === "growth" || !paymentMethodsReady}
                icon={!isCurrent && currentPlanKey !== "growth" ? <ArrowRight className="h-4 w-4" /> : undefined}
                onClick={() => handleUpgrade(planKey)}
                className="w-full"
              >
                {isCurrent ? "Current Plan" : currentPlanKey === "growth" ? `${PLAN_NAMES[planKey]} Plan` : `Upgrade to ${PLAN_NAMES[planKey]}`}
              </Button>
            </Card>
          );
        })}
      </div>

      <section>
        <h2 className="mb-4 text-lg font-bold text-slate-900">Feature Comparison</h2>
        <Card padding="none" className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Feature
                  </th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Basic
                  </th>
                  <th className="bg-blue-50/50 px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Growth
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <CompareRow label="Songs" basic="100" growth="Unlimited" />
                <CompareRow label="Images" basic="100" growth="Unlimited" />
                <CompareRow label="Videos" basic="100" growth="Unlimited" />
                <CompareRow label="Bible Versions" basic="Unlimited" growth="Unlimited" />
                <CompareRow label="Devices" basic="3" growth="10" />
                <CompareRow label="AI Credits / month" basic="100" growth="2,000" />
                <CompareRow label="Verse AI / Speech-to-Scripture" basic={true} growth={true} />
                <CompareRow label="Transcript Translation" basic={false} growth={true} />
                <CompareRow label="Presentation Mode" basic={false} growth={true} />
                <CompareRow label="Multiview" basic={false} growth={true} />
                <CompareRow label="Lower Thirds" basic={false} growth={true} />
                <CompareRow label="Tickers" basic={false} growth={true} />
                <CompareRow label="Bulk Import" basic={false} growth={true} />
                <CompareRow label="EasyWorship / ProPresenter Import" basic={false} growth={true} />
                <CompareRow label="Cloud Sync" basic={false} growth={true} />
                <CompareRow label="Priority Support" basic={false} growth={true} />
              </tbody>
            </table>
          </div>
        </Card>
      </section>

    </div>
  );
}

function FeatureLine({ included, label }: { included: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2 text-sm text-slate-600">
      <CheckCircle2
        className={`mt-0.5 h-4 w-4 shrink-0 ${included ? "text-green-500" : "text-slate-300"}`}
      />
      <span>{label}</span>
    </div>
  );
}

function PaymentMethodOptions({
  selected,
  onChange,
  isNigerian,
  countryCode,
  currency,
  nowPaymentsEnabled,
  nowPaymentsConfigLoaded,
  flutterwaveEnabled,
  flutterwaveConfigLoaded,
}: {
  selected: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  isNigerian: boolean;
  countryCode?: string;
  currency?: string;
  nowPaymentsEnabled: boolean;
  nowPaymentsConfigLoaded: boolean;
  flutterwaveEnabled: boolean;
  flutterwaveConfigLoaded: boolean;
}) {
  const localMethods = getLocalPaymentMethods(countryCode, currency);
  const options: Array<{
    method: PaymentMethod;
    title: string;
    description: string;
    icon: ReactNode;
    enabled: boolean;
  }> = [
    { method: "flutterwave", title: "Local payment", description: `${localMethods} · Flutterwave`, icon: <Globe2 className="h-4 w-4" />, enabled: flutterwaveEnabled },
    ...(isNigerian
      ? [{ method: "paystack" as const, title: "Nigerian payment", description: "Cards, bank transfer, and USSD · Paystack", icon: <CreditCard className="h-4 w-4" />, enabled: true }]
      : []),
    { method: "nowpayments", title: "Pay with crypto", description: "BTC, ETH, USDT, and more · NOWPayments", icon: <Coins className="h-4 w-4" />, enabled: nowPaymentsEnabled },
  ];

  return (
    <div className="mb-5 border-t border-slate-100 pt-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Pay with</p>
      <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Payment method">
        {options.map((option) => {
          const checking = option.method === "flutterwave"
            ? !flutterwaveConfigLoaded
            : option.method === "nowpayments"
              ? !nowPaymentsConfigLoaded
              : false;
          const active = selected === option.method;
          return (
            <button
              key={option.method}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={!option.enabled}
              onClick={() => option.enabled && onChange(option.method)}
              className={`flex min-h-14 items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}
              >
                {active && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className={`shrink-0 ${active ? "text-blue-700" : "text-slate-500"}`}>{option.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{option.title}</span>
                <span className="block text-[11px] leading-4 text-slate-500">
                  {checking ? "Checking..." : option.enabled ? option.description : "Unavailable"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {selected === "flutterwave" && flutterwaveEnabled && (
        <p className="mt-2 text-xs leading-4 text-slate-500">
          {localMethods}. The available methods depend on your country and currency.
        </p>
      )}
      {selected === "paystack" && isNigerian && (
        <p className="mt-2 text-xs leading-4 text-slate-500">
          Nigerian cards, bank transfer, and USSD checkout.
        </p>
      )}
      {selected === "nowpayments" && nowPaymentsEnabled && (
        <p className="mt-2 text-xs leading-4 text-slate-500">
          NOWPayments lets you choose an available crypto asset for this invoice. The price is converted to USD at checkout.
        </p>
      )}
    </div>
  );
}

function getAvailablePaymentMethod(
  selected: PaymentMethod,
  availability: {
    isNigerian: boolean;
    flutterwaveEnabled: boolean;
    nowPaymentsEnabled: boolean;
  },
): PaymentMethod {
  if (selected === "flutterwave" && availability.flutterwaveEnabled) return selected;
  if (selected === "nowpayments" && availability.nowPaymentsEnabled) return selected;
  if (selected === "paystack" && availability.isNigerian) return selected;
  if (availability.flutterwaveEnabled) return "flutterwave";
  if (availability.isNigerian) return "paystack";
  if (availability.nowPaymentsEnabled) return "nowpayments";
  return selected;
}

function getLocalPaymentMethods(countryCode?: string, currency?: string) {
  const country = String(countryCode || "").toUpperCase();
  const code = String(currency || "").toUpperCase();
  if (country === "GH" || code === "GHS") return "Cards, bank transfer, and Ghana Mobile Money";
  if (country === "KE" || code === "KES") return "Cards and M-Pesa";
  if (country === "NG" || code === "NGN") return "Cards, bank transfer, and USSD";
  if (["UG", "TZ", "RW"].includes(country) || ["UGX", "TZS", "RWF"].includes(code)) {
    return "Cards and mobile money";
  }
  return "Cards and local payment methods";
}

function CompareRow({
  label,
  basic,
  growth,
}: {
  label: string;
  basic: string | boolean;
  growth: string | boolean;
}) {
  return (
    <tr>
      <td className="px-5 py-3 text-sm font-medium text-slate-700">{label}</td>
      <CompareCell value={basic} />
      <CompareCell value={growth} highlighted />
    </tr>
  );
}

function CompareCell({ value, highlighted = false }: { value: string | boolean; highlighted?: boolean }) {
  if (typeof value === "boolean") {
    return (
      <td className={`px-5 py-3 text-center ${highlighted ? "bg-blue-50/30" : ""}`}>
        {value ? (
          <CheckCircle2 className="mx-auto h-4 w-4 text-green-500" />
        ) : (
          <span className="text-slate-300">-</span>
        )}
      </td>
    );
  }

  return (
    <td
      className={`px-5 py-3 text-center text-sm font-medium ${
        highlighted ? "bg-blue-50/30 text-blue-700" : "text-slate-600"
      }`}
    >
      {value}
    </td>
  );
}
