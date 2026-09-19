/**
 * PATCH/DELETE /api/team/members/[id]
 *
 * PATCH — Update a member's role.
 * DELETE — Remove a member from the team.
 *
 * Auth: fb-token cookie (web dashboard) or X-Device-Id header (desktop app).
 * Entitlement: plan must include team management.
 *
 * Role hierarchy: owner > admin > operator > viewer
 * - Only owners can promote to admin or remove admins
 * - Admins can manage operators and viewers
 * - Operators and viewers cannot manage other members
 */

import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { getAuthUser } from "@/lib/auth";
import { ObjectId } from "mongodb";

const TEAM_ROLES = ["owner", "admin", "operator", "viewer"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

function normalizePlanForLookup(plan?: string): string {
  return String(plan || "free").toLowerCase() === "pro" ? "growth" : String(plan || "free").toLowerCase();
}

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

function hasMinimumRole(userRole: TeamRole, requiredRole: TeamRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

function outranks(callerRole: TeamRole, targetRole: TeamRole): boolean {
  if (callerRole === "owner") return true;
  return ROLE_HIERARCHY[callerRole] > ROLE_HIERARCHY[targetRole];
}

// ── PATCH — Update member role ──

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();
    const { id: memberId } = await params;

    const client = await clientPromise;
    const db = client.db();

    // Check entitlement
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { plan: 1 } }
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { getPlanConfig } = await import("@/lib/db");
    const planConfig = await getPlanConfig();
    const plan = normalizePlanForLookup(user.plan as string | undefined);
    const entitlements = planConfig.plans[plan as keyof typeof planConfig.plans]?.entitlements;
    if (!entitlements?.teamManagement) {
      return NextResponse.json(
        { error: "Team Management requires Growth" },
        { status: 403 }
      );
    }

    // Get caller's role
    const callerMember = await db.collection("team_members").findOne({
      organizationId: userId,
      userId,
      status: "active",
    });
    const callerRole: TeamRole = (callerMember?.role as TeamRole) || "owner";

    // Get target member
    let targetMember;
    try {
      targetMember = await db.collection("team_members").findOne({
        _id: new ObjectId(memberId),
        organizationId: userId,
      });
    } catch {
      return NextResponse.json({ error: "Invalid member ID" }, { status: 400 });
    }

    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const targetRole = targetMember.role as TeamRole;

    // Cannot modify the owner
    if (targetRole === "owner") {
      return NextResponse.json(
        { error: "Cannot modify the owner" },
        { status: 403 }
      );
    }

    // Caller must outrank the target
    if (!outranks(callerRole, targetRole)) {
      return NextResponse.json(
        { error: "Insufficient permissions to modify this member" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { role } = body;

    if (!role || !TEAM_ROLES.includes(role)) {
      return NextResponse.json(
        { error: `Invalid role. Must be one of: ${TEAM_ROLES.join(", ")}` },
        { status: 400 }
      );
    }

    const newRole: TeamRole = role;

    // Admins cannot assign admin or owner roles
    if (callerRole === "admin" && ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY["admin"]) {
      return NextResponse.json(
        { error: "Admins cannot assign admin or owner roles" },
        { status: 403 }
      );
    }

    // Cannot promote above your own role
    if (ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY[callerRole] && callerRole !== "owner") {
      return NextResponse.json(
        { error: "Cannot promote a member above your own role" },
        { status: 403 }
      );
    }

    const now = new Date().toISOString();
    await db.collection("team_members").updateOne(
      { _id: new ObjectId(memberId) },
      { $set: { role: newRole, updatedAt: now } }
    );

    return NextResponse.json({ role: newRole });
  } catch (error) {
    console.error("PATCH /api/team/members/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE — Remove member ──

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();
    const { id: memberId } = await params;

    const client = await clientPromise;
    const db = client.db();

    // Check entitlement
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { plan: 1 } }
    );
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const { getPlanConfig } = await import("@/lib/db");
    const planConfig = await getPlanConfig();
    const plan = normalizePlanForLookup(user.plan as string | undefined);
    const entitlements = planConfig.plans[plan as keyof typeof planConfig.plans]?.entitlements;
    if (!entitlements?.teamManagement) {
      return NextResponse.json(
        { error: "Team Management requires Growth" },
        { status: 403 }
      );
    }

    // Get caller's role
    const callerMember = await db.collection("team_members").findOne({
      organizationId: userId,
      userId,
      status: "active",
    });
    const callerRole: TeamRole = (callerMember?.role as TeamRole) || "owner";

    // Get target member
    let targetMember;
    try {
      targetMember = await db.collection("team_members").findOne({
        _id: new ObjectId(memberId),
        organizationId: userId,
      });
    } catch {
      return NextResponse.json({ error: "Invalid member ID" }, { status: 400 });
    }

    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const targetRole = targetMember.role as TeamRole;

    // Cannot remove the owner
    if (targetRole === "owner") {
      return NextResponse.json(
        { error: "Cannot remove the owner" },
        { status: 403 }
      );
    }

    // Caller must outrank the target
    if (!outranks(callerRole, targetRole)) {
      return NextResponse.json(
        { error: "Insufficient permissions to remove this member" },
        { status: 403 }
      );
    }

    // Soft-delete: set status to "removed"
    const now = new Date().toISOString();
    await db.collection("team_members").updateOne(
      { _id: new ObjectId(memberId) },
      { $set: { status: "removed", updatedAt: now } }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/team/members/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
