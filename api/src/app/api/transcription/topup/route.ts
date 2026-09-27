import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { calculateTopupPricing } from "@/lib/transcriptionCredits";
import { getSubscription } from "@/lib/db";
import { createFlutterwavePayment, isFlutterwaveConfigured } from "@/lib/flutterwave";
import clientPromise from "@/lib/mongodb";
import * as crypto from "node:crypto";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";
const PAYSTACK_API = "https://api.paystack.co";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: CORS_HEADERS });
    }

    const userId = authUser.mongoUser._id.toString();
    const email = authUser.mongoUser.email;
    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const { packId, returnUrl } = body;

    if (!packId || typeof packId !== "string") {
      return NextResponse.json({ error: "Missing packId" }, { status: 400, headers: CORS_HEADERS });
    }

    const sub = await getSubscription(userId);
    const currency = sub?.currency || "NGN";

    const pricing = await calculateTopupPricing(currency);
    const selectedPack = pricing.packages.find((p) => p.id === packId);

    if (!selectedPack) {
      return NextResponse.json({ error: `Package ${packId} not found` }, { status: 404, headers: CORS_HEADERS });
    }

    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:4000").replace(/\/$/, "");

    // Prioritize Flutterwave
    if (isFlutterwaveConfigured()) {
      const reference = `topup_fw_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
      const callbackUrl = returnUrl || `${appUrl}/credits?topup=success&reference=${reference}`;

      const db = (await clientPromise).db();
      await db.collection("transcription_topup_intents").insertOne({
        _id: reference as any,
        reference,
        userId,
        email,
        packId: selectedPack.id,
        seconds: selectedPack.seconds,
        hours: selectedPack.hours,
        credits: selectedPack.credits,
        price: selectedPack.price,
        currency: selectedPack.currency,
        status: "PENDING",
        createdAt: new Date().toISOString(),
      });

      const payment = await createFlutterwavePayment({
        amount: selectedPack.price,
        currency: selectedPack.currency,
        txRef: reference,
        email,
        name: String((authUser.mongoUser as any)?.name || "").trim() || undefined,
        redirectUrl: callbackUrl,
        description: `MakeChurchEasy ${selectedPack.hours}h (${selectedPack.credits} credits) Top-up`,
        metadata: {
          type: "transcription_topup",
          userId,
          packId: selectedPack.id,
          hours: selectedPack.hours,
          credits: selectedPack.credits,
          seconds: selectedPack.seconds,
          price: selectedPack.price,
          currency: selectedPack.currency,
        },
      });

      const paymentUrl = String(payment.data?.link || "").trim();
      if (!paymentUrl) {
        throw new Error("Flutterwave did not return a payment link");
      }

      return NextResponse.json(
        {
          authorization_url: paymentUrl,
          reference,
          amount: Math.round(selectedPack.price * 100),
          package: selectedPack,
        },
        { headers: CORS_HEADERS },
      );
    }

    // Fallback to Paystack if legacy
    if (!PAYSTACK_SECRET_KEY) {
      return NextResponse.json(
        { error: "Payment gateway is currently unconfigured" },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    const amountInSmallestUnit = Math.round(selectedPack.price * 100);
    const reference = `topup_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const callbackUrl = returnUrl || `${appUrl}/credits?topup=success&reference=${reference}`;

    const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        amount: amountInSmallestUnit,
        currency: selectedPack.currency,
        reference,
        metadata: {
          type: "transcription_topup",
          userId,
          packId: selectedPack.id,
          hours: selectedPack.hours,
          credits: selectedPack.credits,
          seconds: selectedPack.seconds,
          price: selectedPack.price,
          currency: selectedPack.currency,
          custom_fields: [
            {
              display_name: "Top-up Package",
              variable_name: "topup_package",
              value: `${selectedPack.hours} Hours (${selectedPack.credits} Credits)`,
            },
          ],
        },
        callback_url: callbackUrl,
      }),
    });

    const result = (await res.json()) as any;
    if (!result.status || !result.data) {
      console.error("[Transcription Top-up Init]", result.message);
      return NextResponse.json(
        { error: result.message || "Failed to initialize payment" },
        { status: 402, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json(
      {
        authorization_url: result.data.authorization_url,
        access_code: result.data.access_code,
        reference: result.data.reference,
        amount: amountInSmallestUnit,
        package: selectedPack,
      },
      { headers: CORS_HEADERS }
    );
  } catch (error) {
    console.error("[api/transcription/topup] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500, headers: CORS_HEADERS });
  }
}
