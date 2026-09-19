/**
 * POST /api/payments/retry
 *
 * Retries a failed payment. Takes the original billing transaction ID,
 * re-initializes a Paystack payment with the same plan/billing cycle,
 * and returns a new authorization URL.
 *
 * Body: { transactionId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getBillingTransactionById } from "@/lib/db";
import { getPricingVersion } from "@/lib/countryPricing";
import { DiscountCodeError, resolveDiscountCode } from "@/lib/discounts";
import { resolvePaymentPricing } from "@/lib/paymentPricing";
import { rateLimit } from "@/lib/rateLimit";
import crypto from "node:crypto";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_API = "https://api.paystack.co";

const limiter = rateLimit({ windowMs: 60_000, max: 10 });

const RETRYABLE_TYPES = [
  "subscription_purchase",
  "subscription_renewal",
  "plan_upgrade",
  "credit_purchase",
];

interface RetryPaymentBody {
  transactionId?: string;
}

interface PaystackInitializeResponse {
  status?: boolean;
  message?: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function POST(req: NextRequest) {
  try {
    const rateResult = limiter.check(req);
    if (!rateResult.ok) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Paystack not configured" },
        { status: 500 },
      );
    }

    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = authUser.mongoUser._id.toString();
    const email = authUser.mongoUser.email;

    const body = (await req.json()) as RetryPaymentBody;
    const { transactionId } = body;

    if (!transactionId) {
      return NextResponse.json(
        { error: "Missing required field: transactionId" },
        { status: 400 },
      );
    }

    const originalTxn = await getBillingTransactionById(transactionId);
    if (!originalTxn) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 },
      );
    }

    if (originalTxn.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (!RETRYABLE_TYPES.includes(originalTxn.type)) {
      return NextResponse.json(
        { error: "This transaction type cannot be retried" },
        { status: 400 },
      );
    }

    const plan = originalTxn.plan;
    const billingCycle = originalTxn.billingCycle || "monthly";

    const pricingResolution = await resolvePaymentPricing(
      req,
      authUser.mongoUser.country,
      "paystack",
    );
    const { countryCode: userCountry, countryPricing } = pricingResolution;
    if (pricingResolution.requiresCountrySelection) {
      return NextResponse.json(
        {
          error: "Please select your country in your profile before starting payment.",
          code: "COUNTRY_REQUIRED",
        },
        { status: 400 },
      );
    }
    if (userCountry !== "NG") {
      return NextResponse.json(
        { error: "Paystack checkout is available for Nigerian users only. Start checkout again with an available payment method." },
        { status: 400 },
      );
    }

    const planPricing =
      countryPricing.plans[plan as keyof typeof countryPricing.plans];
    if (!planPricing) {
      return NextResponse.json(
        {
          error: `No pricing found for plan "${plan}" in country "${userCountry}"`,
        },
        { status: 400 },
      );
    }

    const numericAmount =
      billingCycle === "yearly" ? planPricing.yearly : planPricing.monthly;
    let finalAmount = numericAmount;
    let appliedDiscount: Awaited<ReturnType<typeof resolveDiscountCode>> | null = null;

    if (!numericAmount || numericAmount <= 0) {
      return NextResponse.json(
        {
          error: `Invalid price for plan "${plan}" in country "${userCountry}"`,
        },
        { status: 400 },
      );
    }

    if (originalTxn.discountCode && (billingCycle === "monthly" || billingCycle === "yearly")) {
      appliedDiscount = await resolveDiscountCode({
        code: originalTxn.discountCode,
        user: authUser.mongoUser,
        plan,
        billingCycle,
        originalAmount: numericAmount,
      });
      finalAmount = appliedDiscount.finalAmount;
    }

    const pricingVersion = await getPricingVersion();
    const amountInSmallestUnit = Math.round(finalAmount * 100);
    const reference = `vc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountInSmallestUnit,
        currency: countryPricing.currency,
        reference,
        metadata: {
          userId,
          plan,
          billingCycle,
          country: userCountry,
          currency: countryPricing.currency,
          currencySymbol: countryPricing.currencySymbol,
          price: finalAmount,
          originalPrice: numericAmount,
          pricingVersion,
          discountCode: appliedDiscount?.code || undefined,
          discountPercent: appliedDiscount?.percentOff || undefined,
          discountDurationMonths: appliedDiscount?.durationMonths || undefined,
          discountMonthsRemaining: appliedDiscount?.monthsRemainingAfterCheckout || undefined,
          discountAmount: appliedDiscount?.discountAmount || undefined,
          discountOriginalPrice: appliedDiscount?.originalAmount || undefined,
          discountedPrice: appliedDiscount?.finalAmount || undefined,
          discountAnnouncementId: appliedDiscount?.announcementId || undefined,
          discountAnnouncementTitle: appliedDiscount?.announcementTitle || undefined,
          retryOf: transactionId,
        },
        callback_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000"}/billing/success?reference=${reference}`,
      }),
    });

    const result = (await res.json()) as PaystackInitializeResponse;

    if (!result.status || !result.data) {
      console.error("[Paystack Retry]", result.message);
      return NextResponse.json(
        { error: result.message || "Failed to initialize payment" },
        { status: 402 },
      );
    }

    return NextResponse.json({
      authorization_url: result.data.authorization_url,
      access_code: result.data.access_code,
      reference: result.data.reference,
      amount: amountInSmallestUnit,
      currency: countryPricing.currency,
      currencySymbol: countryPricing.currencySymbol,
      price: finalAmount,
      originalPrice: numericAmount,
      discount: appliedDiscount,
    });
  } catch (error) {
    if (error instanceof DiscountCodeError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[Paystack Retry] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
