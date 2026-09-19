import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/db";
import { normalizeDiscountCode } from "@/lib/discounts";
import { discountOfferEmail, sendEmail } from "@/lib/emailTemplates";
import { logTrialAction } from "@/lib/trialAudit";
import { getTrialForUser, updateTrialRecord, createTrialRecord } from "@/lib/trialRecords";
import type { Announcement, DiscountBillingCycle, PlanTier } from "@/types/schemas";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheasy.com";

interface DiscountPayload {
  preset?: "half_off_1m" | "half_off_2m" | "trial_extension_7d" | "intro_90_off_15d" | "annual_20_off" | "custom";
  code?: string;
  discountPercent?: number;
  durationMonths?: number;
  trialExtensionDays?: number;
  plan?: PlanTier;
  billingCycle?: DiscountBillingCycle;
  expiresInDays?: number;
  customNote?: string;
  sendEmail?: boolean;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const user = await db.collection("users").findOne({ _id: new ObjectId(id) });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as DiscountPayload;
    const preset = body.preset || "half_off_2m";
    const shouldSendEmail = body.sendEmail !== false;

    // ── Handle Trial Extension Preset ──
    if (preset === "trial_extension_7d") {
      const extensionDays = Math.min(90, Math.max(1, Number(body.trialExtensionDays) || 7));
      const existingTrial = await getTrialForUser(id);

      let newEndsAt: string;
      if (existingTrial && existingTrial.status === "active") {
        const currentEnd = new Date(existingTrial.endsAt).getTime();
        const baseTime = currentEnd > Date.now() ? currentEnd : Date.now();
        newEndsAt = new Date(baseTime + extensionDays * 86400000).toISOString();
      } else {
        newEndsAt = new Date(Date.now() + extensionDays * 86400000).toISOString();
      }

      const now = new Date().toISOString();
      if (existingTrial && existingTrial._id) {
        await updateTrialRecord(existingTrial._id.toString(), {
          endsAt: newEndsAt,
          status: "active",
        });
      } else {
        await createTrialRecord(id, {
          durationDays: extensionDays,
          grantedBy: auth.adminUserId,
        });
      }

      await db.collection("users").updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            "trial.active": true,
            "trial.status": "active",
            "trial.endsAt": newEndsAt,
            plan: "growth",
            updatedAt: now,
          },
        }
      );

      await logTrialAction({
        userId: id,
        action: "extended",
        previousExpiry: existingTrial?.endsAt,
        newExpiry: newEndsAt,
        performedBy: auth.adminUserId,
        notes: body.customNote || `Admin granted ${extensionDays}-day extension`,
      });

      let emailSent = false;
      if (shouldSendEmail && user.email) {
        const emailOpts = discountOfferEmail({
          toEmail: user.email,
          name: user.name || user.firstName,
          churchName: user.churchName,
          headline: `We've Extended Your Free Trial by ${extensionDays} Days!`,
          trialExtensionDays: extensionDays,
          claimUrl: `${APP_URL}/dashboard`,
          planName: "Growth (Full Access)",
          expiresAt: newEndsAt,
          customNote: body.customNote,
        });
        emailSent = await sendEmail(emailOpts);
      }

      return NextResponse.json({
        success: true,
        preset,
        trialExtensionDays: extensionDays,
        endsAt: newEndsAt,
        claimUrl: `${APP_URL}/dashboard`,
        emailSent,
      });
    }

    // ── Handle Discount Code Presets ──
    let discountPercent = 50;
    let durationMonths = 2;
    let plan: PlanTier = "growth";
    let billingCycle: DiscountBillingCycle = "monthly";
    let code = body.code?.trim() || "";

    if (preset === "half_off_1m") {
      discountPercent = 50;
      durationMonths = 1;
      billingCycle = "monthly";
      if (!code) code = `SAVE50-${id.slice(-4).toUpperCase()}`;
    } else if (preset === "half_off_2m") {
      discountPercent = 50;
      durationMonths = 2;
      billingCycle = "monthly";
      if (!code) code = `SAVE50-2M-${id.slice(-4).toUpperCase()}`;
    } else if (preset === "intro_90_off_15d") {
      discountPercent = 90;
      durationMonths = 1;
      billingCycle = "monthly";
      if (!code) code = `INTRO90-${id.slice(-4).toUpperCase()}`;
    } else if (preset === "annual_20_off") {
      discountPercent = 20;
      durationMonths = 12;
      billingCycle = "yearly";
      if (!code) code = `ANNUAL20-${id.slice(-4).toUpperCase()}`;
    } else {
      // custom
      discountPercent = Math.min(95, Math.max(1, Number(body.discountPercent) || 50));
      durationMonths = Math.min(60, Math.max(1, Number(body.durationMonths) || 1));
      plan = (body.plan === "basic" ? "basic" : "growth") as PlanTier;
      billingCycle = (body.billingCycle === "yearly" ? "yearly" : "monthly") as DiscountBillingCycle;
      if (!code) code = `DISCOUNT${discountPercent}-${id.slice(-4).toUpperCase()}`;
    }

    const normalizedCode = normalizeDiscountCode(code);
    if (!normalizedCode) {
      return NextResponse.json({ error: "Invalid discount code" }, { status: 400 });
    }

    const expiresInDays = Math.min(365, Math.max(1, Number(body.expiresInDays) || 7));
    const now = new Date();
    const expiresAt = new Date(now.getTime() + expiresInDays * 86400000).toISOString();

    const announcementDoc: Omit<Announcement, "_id"> = {
      title: `${discountPercent}% Off MakeChurchEasy`,
      message: `Exclusive offer: Get ${discountPercent}% off the ${plan} plan for ${durationMonths} month(s).`,
      tone: "offer",
      status: "active",
      surfaces: ["dashboard", "desktop"],
      audience: "all_users",
      tags: ["admin_generated", `preset:${preset}`, `user:${id}`],
      targetUserIds: [id],
      targetEmails: [String(user.email).toLowerCase()],
      offerCode: normalizedCode,
      offerDiscountPercent: discountPercent,
      offerDurationMonths: durationMonths,
      offerMaxRedemptions: 1,
      offerRedemptionCount: 0,
      offerApplicablePlans: [plan],
      offerApplicableBillingCycles: [billingCycle],
      priority: 15,
      publishAt: now.toISOString(),
      expiresAt,
      deliverySpacingMinutes: 0,
      maxShowsPerUser: 10,
      metrics: { shown: 0, dismissed: 0, clicked: 0 },
      createdBy: auth.adminUserId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).insertOne(announcementDoc as any);

    const claimUrl = `${APP_URL}/subscription/plans?promo=${encodeURIComponent(normalizedCode)}&plan=${encodeURIComponent(plan)}&billing=${encodeURIComponent(billingCycle)}`;

    let emailSent = false;
    if (shouldSendEmail && user.email) {
      const emailOpts = discountOfferEmail({
        toEmail: user.email,
        name: user.name || user.firstName,
        churchName: user.churchName,
        headline: `Special Offer: ${discountPercent}% Off MakeChurchEasy`,
        discountPercent,
        durationMonths,
        promoCode: normalizedCode,
        claimUrl,
        planName: plan === "growth" ? "Growth Plan" : "Basic Plan",
        billingCycle,
        expiresAt,
        customNote: body.customNote,
      });
      emailSent = await sendEmail(emailOpts);
    }

    return NextResponse.json({
      success: true,
      preset,
      code: normalizedCode,
      discountPercent,
      durationMonths,
      plan,
      billingCycle,
      expiresAt,
      claimUrl,
      emailSent,
    });
  } catch (error) {
    console.error("[AdminUserDiscount] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create discount" },
      { status: 500 }
    );
  }
}
