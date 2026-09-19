import { NextRequest, NextResponse } from "next/server";

import { getAuthUserFromRequest } from "@/lib/auth";
import {
  clearLocalDevPlanOverride,
  getLocalDevPlanOverride,
  isLocalDevPlanAdmin,
  isLocalDevPlanOverrideRequest,
  normalizeLocalDevPlan,
  setLocalDevPlanOverride,
} from "@/lib/localDevPlanOverride";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Device-Id, X-Device-Secret, X-App-Version",
  "Cache-Control": "no-store",
};

function error(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
}

async function authorize(req: NextRequest): Promise<{ userId: string } | NextResponse> {
  if (!isLocalDevPlanOverrideRequest(req)) return error("Not available outside local development", 404);

  const authUser = await getAuthUserFromRequest(req);
  const user = authUser?.mongoUser;
  if (!user?._id || !isLocalDevPlanAdmin(user)) {
    return error("Local plan simulation requires the designated development admin", 403);
  }

  return { userId: user._id.toString() };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(req: NextRequest) {
  const authorized = await authorize(req);
  if (authorized instanceof NextResponse) return authorized;
  return NextResponse.json(
    { plan: getLocalDevPlanOverride(authorized.userId) },
    { headers: CORS_HEADERS },
  );
}

export async function POST(req: NextRequest) {
  const authorized = await authorize(req);
  if (authorized instanceof NextResponse) return authorized;

  let body: { plan?: unknown } = {};
  try {
    body = await req.json() as { plan?: unknown };
  } catch {
    return error("A plan is required", 400);
  }

  const plan = normalizeLocalDevPlan(body.plan);
  if (!plan) return error("Plan must be free, basic, or growth", 400);

  setLocalDevPlanOverride(authorized.userId, plan);
  return NextResponse.json({ ok: true, plan }, { headers: CORS_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const authorized = await authorize(req);
  if (authorized instanceof NextResponse) return authorized;

  clearLocalDevPlanOverride(authorized.userId);
  return NextResponse.json({ ok: true, plan: null }, { headers: CORS_HEADERS });
}

