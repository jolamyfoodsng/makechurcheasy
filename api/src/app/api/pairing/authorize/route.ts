import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rateLimit";
import { checkDeviceLimit } from "@/lib/deviceLimits";
import { resolveEffectivePlan, isInTrialRaw } from "@/lib/trial";
import {
  claimTrialForUserIfEligible,
  TRIAL_ALREADY_CLAIMED_MESSAGE,
} from "@/lib/trialAbuse";
import { normalizePairingCode } from "@/lib/pairingUtils";
import { findMatchingDesktopDevice } from "@/lib/desktopDeviceRegistration";

const authorizeLimiter = rateLimit({ windowMs: 60_000, max: 10 });

export async function POST(req: NextRequest) {
  try {
    const rl = authorizeLimiter.check(req);
    if (!rl.ok) {
      return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
    }

    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { code: rawCode } = (await req.json()) as { code?: string };
    if (!rawCode) {
      return NextResponse.json({ error: "Code required" }, { status: 400 });
    }

    const code = normalizePairingCode(rawCode);
    if (code.length !== 8) {
      return NextResponse.json({ error: "Invalid code format" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // First check if the code exists at all
    // Match both normalized (ABCD1234) and legacy hyphenated (ABCD-1234) forms
    const pairing = await db.collection("pairingCodes").findOne({
      $or: [{ code }, { code: `${code.slice(0, 4)}-${code.slice(4)}` }],
    });

    if (!pairing) {
      return NextResponse.json({ error: "Invalid code" }, { status: 404 });
    }

    if (pairing.used) {
      return NextResponse.json({ error: "Code already used" }, { status: 410 });
    }

    if (new Date(pairing.expiresAt) <= new Date()) {
      return NextResponse.json({ error: "Code expired" }, { status: 410 });
    }

    const userId = authUser.mongoUser._id.toString();

    // Attach userId early so resend-verification can always find the user
    await db.collection("pairingCodes").updateOne(
      { _id: pairing._id },
      { $set: { userId } }
    );

    // Gate: email must be verified before authorizing a device pairing
    if (authUser.mongoUser.emailVerified !== true) {
      // Mark the pairing code so the SSE stream can notify the desktop app
      await db.collection("pairingCodes").updateOne(
        { _id: pairing._id },
        { $set: { rejected: true, rejectReason: "email_not_verified" } }
      );
      return NextResponse.json(
        {
          error: "email_not_verified",
          message: "Please verify your email address before authorizing a device.",
        },
        { status: 403 }
      );
    }

    let userForPlan = authUser.mongoUser;
    // Always run the claim check for free users, including users that already
    // have a trial. Existing trials are used to bind this machine's durable
    // fingerprint; new accounts are rejected when that fingerprint already
    // belongs to another trial claim.
    if (!userForPlan.plan || userForPlan.plan === "free") {
      try {
        const trialClaim = await claimTrialForUserIfEligible({
          userId,
          email: userForPlan.email,
          req,
          source: "pairing_authorize",
          deviceFingerprintHash: pairing.fingerprintHash,
          installationId: pairing.installationId,
        });
        if (trialClaim.trialRecord) {
          userForPlan = await db.collection("users").findOne({ _id: authUser.mongoUser._id }) || userForPlan;
        } else if (!trialClaim.eligible) {
          console.warn("[pairing/authorize] Trial not granted:", {
            userId,
            reason: trialClaim.reason,
            matchedSignalTypes: trialClaim.matchedSignalTypes,
          });
          if (trialClaim.reason === "trial_already_claimed") {
            await db.collection("pairingCodes").updateOne(
              { _id: pairing._id },
              { $set: { rejected: true, rejectReason: "trial_already_claimed" } },
            );
            return NextResponse.json(
              {
                error: "trial_already_claimed",
                message: TRIAL_ALREADY_CLAIMED_MESSAGE,
              },
              { status: 403 },
            );
          }
        }
      } catch (trialErr) {
        console.error("[pairing/authorize] Failed to auto-provision trial:", trialErr);
      }
    }

    const effectivePlan = resolveEffectivePlan(userForPlan);

    // Enforce device limit before authorizing. Re-pairing is allowed only
    // when this pairing carries an identity matching an existing device;
    // otherwise this is a new device and must consume a plan slot.
    const isOnTrial = isInTrialRaw(userForPlan);
    const existingDevice = await findMatchingDesktopDevice(
      db,
      userId,
      pairing.installationId,
      pairing.fingerprintHash,
    );
    const limitResult = await checkDeviceLimit(
      userId,
      existingDevice?.deviceId || null,
      effectivePlan,
      isOnTrial,
    );
    if (!limitResult.allowed) {
      return NextResponse.json(
        {
          error: "device_limit_reached",
          message: `Your ${effectivePlan} plan allows ${limitResult.limit} device${limitResult.limit === 1 ? "" : "s"}. You currently have ${limitResult.currentCount}/${limitResult.limit}.`,
          currentCount: limitResult.currentCount,
          limit: limitResult.limit,
        },
        { status: 403 }
      );
    }

    await db.collection("pairingCodes").updateOne(
      { _id: pairing._id },
      {
        $set: {
          used: true,
          userId,
        },
        $unset: {
          rejected: "",
          rejectReason: "",
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Pairing authorize error:", err);
    return NextResponse.json({ error: "Failed to authorize device" }, { status: 500 });
  }
}
