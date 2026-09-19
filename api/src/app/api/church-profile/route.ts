import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { getChurchProfile, upsertChurchProfile } from "@/lib/db";
import { normalizeCountryCode } from "@/lib/countryNormalization";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const profile = await getChurchProfile(userId);
    return NextResponse.json(profile || null);
  } catch (error) {
    console.error("Get church profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const body = (await req.json()) as Record<string, unknown>;
    const { userId: _ignored, ...updates } = body;

    const allowedFields = [
      "churchName",
      "tagline",
      "website",
      "email",
      "phone",
      "address",
      "city",
      "state",
      "postalCode",
      "country",
      "timezone",
      "churchSize",
      "branding",
      "presentationDefaults",
      "speakers",
      "socialMedia",
    ];

    const sanitized: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        sanitized[key] = updates[key];
      }
    }
    if (sanitized.country !== undefined) {
      sanitized.country = await normalizeCountryCode(sanitized.country);
    }

    if (Object.keys(sanitized).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    const profile = await upsertChurchProfile(userId, sanitized);
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Update church profile error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
