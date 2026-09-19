import { NextRequest, NextResponse } from "next/server";
import { getAuthUserFromRequest } from "@/lib/auth";
import {
  ANNOUNCEMENT_SURFACES,
  dismissAnnouncementDelivery,
  getNextAnnouncementForUser,
} from "@/lib/announcements";
import type { AnnouncementSurface } from "@/types/schemas";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, X-App-Version",
};

function corsJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...CORS_HEADERS,
      ...(init?.headers || {}),
    },
  });
}

function getSurface(req: NextRequest): AnnouncementSurface {
  const raw = req.nextUrl.searchParams.get("surface") || "dashboard";
  return ANNOUNCEMENT_SURFACES.includes(raw as AnnouncementSurface)
    ? raw as AnnouncementSurface
    : "dashboard";
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    if (!authUser?.mongoUser?._id) {
      return corsJson({ error: "Unauthorized" }, { status: 401 });
    }

    const surface = getSurface(req);
    const result = await getNextAnnouncementForUser(authUser.mongoUser, surface);
    return corsJson(result);
  } catch (error) {
    console.error("[UserAnnouncements] GET error:", error);
    return corsJson({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUserFromRequest(req);
    const userId = authUser?.mongoUser?._id?.toString?.();
    if (!userId) {
      return corsJson({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({})) as {
      deliveryId?: string;
      clicked?: boolean;
    };
    if (!body.deliveryId) {
      return corsJson({ error: "deliveryId is required" }, { status: 400 });
    }

    const success = await dismissAnnouncementDelivery(userId, body.deliveryId, Boolean(body.clicked));
    return corsJson({ success });
  } catch (error) {
    console.error("[UserAnnouncements] POST error:", error);
    return corsJson({ error: "Internal server error" }, { status: 500 });
  }
}

