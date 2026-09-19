import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import { COLLECTIONS } from "@/lib/db";
import { normalizeDiscountCode } from "@/lib/discounts";
import { userMatchesAnnouncement } from "@/lib/announcements";
import { sendEmail } from "@/lib/emailTemplates";
import type { Announcement, DiscountBillingCycle, PlanTier } from "@/types/schemas";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://makechurcheasy.com";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const client = await clientPromise;
    const db = client.db();

    const [discounts, redemptions] = await Promise.all([
      db
        .collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS)
        .find({ offerCode: { $exists: true, $ne: null } })
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
      db
        .collection(COLLECTIONS.DISCOUNT_REDEMPTIONS)
        .find()
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray(),
    ]);

    const serializedDiscounts = discounts.map((d) => ({
      ...d,
      _id: d._id?.toString?.() || String(d._id),
      claimUrl: `${APP_URL}/subscription/plans?promo=${encodeURIComponent(d.offerCode || "")}&plan=${encodeURIComponent(d.offerApplicablePlans?.[0] || "growth")}&billing=${encodeURIComponent(d.offerApplicableBillingCycles?.[0] || "monthly")}`,
    }));

    const serializedRedemptions = redemptions.map((r) => ({
      ...r,
      _id: r._id.toString(),
    }));

    const now = new Date().toISOString();
    const activeDiscounts = serializedDiscounts.filter(
      (d) => d.status === "active" && (!d.expiresAt || d.expiresAt > now)
    );

    return NextResponse.json({
      discounts: serializedDiscounts,
      redemptions: serializedRedemptions,
      stats: {
        totalDiscounts: serializedDiscounts.length,
        activeDiscounts: activeDiscounts.length,
        totalRedemptions: serializedRedemptions.length,
      },
    });
  } catch (error) {
    console.error("[AdminDiscounts GET] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch discounts" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;

    const body = (await req.json().catch(() => ({}))) as Record<string, any>;
    const code = normalizeDiscountCode(body.code);
    if (!code) {
      return NextResponse.json({ error: "Valid discount code is required" }, { status: 400 });
    }

    const discountPercent = Math.min(95, Math.max(1, Number(body.discountPercent) || 50));
    const durationMonths = Math.min(60, Math.max(1, Number(body.durationMonths) || 1));
    const maxRedemptions = Number(body.maxRedemptions) || null;
    const plans: PlanTier[] = Array.isArray(body.applicablePlans) && body.applicablePlans.length > 0
      ? body.applicablePlans
      : ["growth", "basic"];
    const billingCycles: DiscountBillingCycle[] = Array.isArray(body.applicableBillingCycles) && body.applicableBillingCycles.length > 0
      ? body.applicableBillingCycles
      : ["monthly"];
    const audience = body.audience || "all_users";
    const targetEmails: string[] = Array.isArray(body.targetEmails)
      ? body.targetEmails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];

    const expiresInDays = Number(body.expiresInDays);
    const now = new Date();
    const expiresAt = Number.isFinite(expiresInDays) && expiresInDays > 0
      ? new Date(now.getTime() + expiresInDays * 86400000).toISOString()
      : null;

    const claimUrl = `${APP_URL}/subscription/plans?promo=${encodeURIComponent(code)}&plan=${encodeURIComponent(plans[0] || "growth")}&billing=${encodeURIComponent(billingCycles[0] || "monthly")}`;

    const announcementDoc: Omit<Announcement, "_id"> = {
      title: body.title || `${discountPercent}% Off MakeChurchEasy`,
      message: body.message || `Use promo code ${code} to get ${discountPercent}% off for ${durationMonths} month(s).`,
      tone: "offer",
      status: "active",
      surfaces: ["dashboard", "desktop"],
      audience,
      targetEmails,
      ctaLabel: body.ctaLabel || "Claim Discount",
      ctaUrl: claimUrl,
      offerCode: code,
      offerDiscountPercent: discountPercent,
      offerDurationMonths: durationMonths,
      offerMaxRedemptions: maxRedemptions,
      offerRedemptionCount: 0,
      offerApplicablePlans: plans,
      offerApplicableBillingCycles: billingCycles,
      priority: 10,
      publishAt: now.toISOString(),
      expiresAt,
      deliverySpacingMinutes: 0,
      maxShowsPerUser: 10,
      tags: ["admin_generated"],
      metrics: { shown: 0, dismissed: 0, clicked: 0 },
      createdBy: auth.adminUserId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    const client = await clientPromise;
    const db = client.db();
    const result = await db.collection<Announcement>(COLLECTIONS.ANNOUNCEMENTS).insertOne(announcementDoc as any);

    // ── Email dispatch (fire-and-forget) ──
    let emailsSent = 0;
    if (body.sendEmail) {
      const savedAnnouncement = { ...announcementDoc, _id: result.insertedId } as Announcement;

      // Query candidate users – limit to 2000 to avoid overwhelming the email provider
      const usersCollection = db.collection("users");
      const users = await usersCollection
        .find({}, { projection: { _id: 1, email: 1, plan: 1, effectivePlan: 1, lastLogin: 1, lastActive: 1, trial: 1, ambassador: 1, subscriptionStatus: 1, paymentStatus: 1 } })
        .limit(2000)
        .toArray();

      // Filter by audience match and send emails
      const emailPromises: Promise<void>[] = [];
      for (const user of users) {
        if (!user.email) continue;

        const matches = await userMatchesAnnouncement(savedAnnouncement, user);
        if (!matches) continue;

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px;">
            <h2 style="color: #1e293b; font-size: 22px; margin: 0 0 12px;">🎉 ${announcementDoc.title}</h2>
            <p style="color: #475569; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
              ${announcementDoc.message}
            </p>
            <div style="background: #f1f5f9; border-radius: 12px; padding: 16px; text-align: center; margin: 0 0 20px;">
              <p style="color: #64748b; font-size: 12px; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 1px;">Your Promo Code</p>
              <p style="color: #4f46e5; font-size: 24px; font-weight: 800; margin: 0; letter-spacing: 2px;">${code}</p>
            </div>
            <a href="${claimUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 10px; font-weight: 600; font-size: 15px;">
              ${announcementDoc.ctaLabel || "Claim Discount"}
            </a>
            <p style="color: #94a3b8; font-size: 12px; margin: 24px 0 0;">
              ${expiresAt ? `This offer expires on ${new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.` : "Limited time offer."}
            </p>
          </div>
        `;

        emailPromises.push(
          sendEmail({
            to: user.email,
            subject: announcementDoc.title,
            html: emailHtml,
          }).then((sent) => {
            if (sent) emailsSent++;
          }).catch((err) => {
            console.error(`[AdminDiscounts] Email failed for ${user.email}:`, err);
          })
        );
      }

      // Don't await all – fire-and-forget but track count
      Promise.allSettled(emailPromises).then(() => {
        console.log(`[AdminDiscounts] Email dispatch complete: ${emailsSent} sent for code ${code}`);
      });
    }

    return NextResponse.json({
      success: true,
      discount: {
        ...announcementDoc,
        _id: result.insertedId.toString(),
        claimUrl,
      },
      emailsQueued: body.sendEmail ? true : false,
    }, { status: 201 });
  } catch (error) {
    console.error("[AdminDiscounts POST] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create discount" },
      { status: 500 }
    );
  }
}
