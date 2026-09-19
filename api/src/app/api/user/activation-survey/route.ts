import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import clientPromise from "@/lib/mongodb";
import { ensureIndexes } from "@/lib/db";
import { CORE_USE_EVENTS } from "@/lib/activation";
import type { ActivationSurveyReason } from "@/types/schemas";

const REASONS = new Set<ActivationSurveyReason>([
  "could_not_connect",
  "did_not_understand",
  "did_not_need_it_yet",
  "missing_feature",
  "technical_problem",
  "already_use_something_else",
  "still_testing",
  "other",
]);

function asUserId(value: unknown): string | null {
  return value ? String(value) : null;
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    if (!auth?.mongoUser?._id) return NextResponse.json({ eligible: false, submitted: false });

    const user = auth.mongoUser;
    if (user.activationSurvey?.submittedAt || user.activationSurvey?.dismissedAt) {
      return NextResponse.json({ eligible: false, submitted: Boolean(user.activationSurvey.submittedAt) });
    }
    if (user.plan && !["free", "trial"].includes(String(user.plan).toLowerCase())) {
      return NextResponse.json({ eligible: false, submitted: false });
    }

    const createdAt = new Date(user.createdAt || user.signupDate || Date.now());
    const accountAgeMs = Date.now() - createdAt.getTime();
    if (!Number.isFinite(accountAgeMs) || accountAgeMs < 24 * 60 * 60 * 1000) {
      return NextResponse.json({ eligible: false, submitted: false });
    }

    const db = (await clientPromise).db();
    await ensureIndexes();
    const events = await db.collection("activity_events")
      .find({ userId: asUserId(user._id) }, { projection: { event: 1, timestamp: 1, createdAt: 1 } })
      .sort({ timestamp: -1, createdAt: -1 })
      .limit(200)
      .toArray();
    const usefulEvents = events.filter((event) => CORE_USE_EVENTS.has(String(event.event || "")));
    const latestUseful = usefulEvents[0]?.timestamp || usefulEvents[0]?.createdAt;
    const latestUsefulMs = latestUseful ? new Date(latestUseful).getTime() : 0;
    const staleUseful = latestUsefulMs === 0 || Date.now() - latestUsefulMs >= 7 * 24 * 60 * 60 * 1000;

    return NextResponse.json({
      eligible: staleUseful,
      submitted: false,
      kind: usefulEvents.length > 0 ? "used_then_stopped" : "never_activated",
    });
  } catch (error) {
    console.error("[user/activation-survey] GET error:", error);
    return NextResponse.json({ eligible: false, submitted: false });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthUserFromRequest(req);
    if (!auth?.mongoUser?._id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({})) as {
      action?: unknown;
      reason?: unknown;
      detail?: unknown;
    };
    const userId = auth.mongoUser._id.toString();
    await ensureIndexes();
    const db = (await clientPromise).db();
    const now = new Date().toISOString();

    if (body?.action === "dismiss") {
      await db.collection("users").updateOne(
        { _id: auth.mongoUser._id },
        { $set: { "activationSurvey.dismissedAt": now } },
      );
      return NextResponse.json({ success: true, dismissed: true });
    }

    const reason = typeof body?.reason === "string" ? body.reason as ActivationSurveyReason : null;
    if (!reason || !REASONS.has(reason)) {
      return NextResponse.json({ error: "Choose one reason" }, { status: 400 });
    }
    const detail = typeof body?.detail === "string" ? body.detail.trim().slice(0, 600) : "";
    await db.collection("activation_feedback").insertOne({
      userId,
      reason,
      detail: detail || null,
      source: "dashboard",
      createdAt: now,
    });
    await db.collection("users").updateOne(
      { _id: auth.mongoUser._id },
      { $set: { "activationSurvey.reason": reason, "activationSurvey.detail": detail || null, "activationSurvey.submittedAt": now } },
    );

    return NextResponse.json({ success: true, submitted: true });
  } catch (error) {
    console.error("[user/activation-survey] POST error:", error);
    return NextResponse.json({ error: "Could not save feedback" }, { status: 500 });
  }
}
