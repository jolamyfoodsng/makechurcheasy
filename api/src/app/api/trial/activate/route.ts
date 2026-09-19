import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { activateDeferredTrial } from "@/lib/trialActivation";
import { recordActivationEvent } from "@/lib/activation";

const ALLOWED_EVENTS = new Set(["obs_connected", "first_use_started", "first_presentation", "first_use"]);

/**
 * POST /api/trial/activate
 *
 * Starts a deferred activated-trial assignment after a real desktop action.
 * Existing active trials simply return their current state.
 */
export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as { event?: unknown };
    const event = typeof body?.event === "string" && ALLOWED_EVENTS.has(body.event)
      ? body.event
      : "first_use";
    const userId = authUser.mongoUser._id.toString();

    await recordActivationEvent(userId, event, { source: "trial_activation" });
    const result = await activateDeferredTrial(userId, event);

    return NextResponse.json({
      success: true,
      activated: result.activated,
      reason: result.reason,
      trial: result.trialRecord
        ? {
          status: result.trialRecord.status,
          endsAt: result.trialRecord.endsAt,
          durationDays: result.trialRecord.durationDays,
        }
        : null,
    });
  } catch (error) {
    console.error("[trial/activate] Error:", error);
    return NextResponse.json({ error: "Could not activate trial" }, { status: 500 });
  }
}
