import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import clientPromise from "@/lib/mongodb";
import {
  getTrialExperimentSettings,
  updateTrialExperimentSettings,
} from "@/lib/trialExperiment";
import type { TrialExperimentSettings } from "@/types/schemas";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const settings = await getTrialExperimentSettings();
    const db = (await clientPromise).db();
    const betaUsers = await db.collection("users")
      .find({ "trialExperiment.betaCohort": true, status: { $ne: "deleted" } }, { projection: { _id: 1, name: 1, email: 1, plan: 1, trialExperiment: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    return NextResponse.json({
      settings,
      betaUsers: betaUsers.map((user) => ({
        id: user._id.toString(),
        name: user.name || "",
        email: user.email || "",
        plan: user.plan || "free",
        variant: user.trialExperiment?.variant || null,
        createdAt: user.createdAt || null,
      })),
    });
  } catch (error) {
    console.error("[admin/activation-experiment] GET error:", error);
    return NextResponse.json({ error: "Could not load experiment settings" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const body = await req.json() as Record<string, unknown>;
    const updates: Partial<Omit<TrialExperimentSettings, "_id" | "updatedAt">> = {};
    if (typeof body.enabled === "boolean") updates.enabled = body.enabled;
    if (body.activatedTrialDurationDays !== undefined) updates.activatedTrialDurationDays = Number(body.activatedTrialDurationDays);
    if (body.controlTrialDurationDays !== undefined) updates.controlTrialDurationDays = Number(body.controlTrialDurationDays);
    if (body.betaTrialDurationDays !== undefined) updates.betaTrialDurationDays = Number(body.betaTrialDurationDays);
    if (body.activatedVariantAllocationPercent !== undefined) updates.activatedVariantAllocationPercent = Number(body.activatedVariantAllocationPercent);
    const settings = await updateTrialExperimentSettings(updates);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("[admin/activation-experiment] PUT error:", error);
    return NextResponse.json({ error: "Could not update experiment settings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin(req);
    if (!auth.ok) return auth.response;
    const body = await req.json() as { action?: string; email?: string };
    const email = normalizeEmail(body.email);
    if (!email || !["add_beta", "remove_beta"].includes(body.action || "")) {
      return NextResponse.json({ error: "action and email are required" }, { status: 400 });
    }

    const db = (await clientPromise).db();
    const user = await db.collection("users").findOne({ email }, { projection: { _id: 1, name: 1, email: 1, trialExperiment: 1 } });
    if (!user) return NextResponse.json({ error: "No user found with that email" }, { status: 404 });

    const enabled = body.action === "add_beta";
    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { "trialExperiment.betaCohort": enabled, "trialExperiment.betaMarkedAt": new Date().toISOString() } },
    );

    return NextResponse.json({
      success: true,
      email,
      betaCohort: enabled,
      note: user.trialExperiment?.variant
        ? "This user already has a sticky assignment; existing trial access was not changed."
        : "The beta assignment will apply when this user claims a new trial.",
    });
  } catch (error) {
    console.error("[admin/activation-experiment] POST error:", error);
    return NextResponse.json({ error: "Could not update beta cohort" }, { status: 500 });
  }
}
