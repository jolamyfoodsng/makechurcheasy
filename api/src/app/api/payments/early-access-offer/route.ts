import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import { resolveEarlyAccessOffer } from "@/lib/earlyAccess";
import { getPlatformSettings } from "@/lib/platformSettings";
import { resolveRequestCountry } from "@/lib/requestCountry";

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const platformSettings = await getPlatformSettings();
    const { countryCode } = await resolveRequestCountry(req, authUser.mongoUser.country);
    const offer = await resolveEarlyAccessOffer(platformSettings, {
      ...authUser.mongoUser,
      country: countryCode,
    });
    return NextResponse.json(offer);
  } catch (error) {
    console.error("[EarlyAccessOffer] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
