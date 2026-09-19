/**
 * GET/POST /api/team/members
 *
 * GET  — List all team members for the authenticated user's organization.
 * POST — Invite a new member by email (creates a pending invite).
 *
 * Auth: fb-token cookie (web dashboard) or X-Device-Id header (desktop app).
 * Entitlement: plan must include team management.
 *
 * Roles: owner | admin | operator | viewer
 *   owner   — full access (manage team, content, settings, billing)
 *   admin   — team management + content + settings (no billing)
 *   operator — content only (create, edit, present)
 *   viewer  — read-only access
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

interface TeamMemberDoc {
  _id?: ObjectId;
  organizationId: string; // owner's userId (1:1 with owner)
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  invitedBy: string;
  invitedAt: string;
  acceptedAt?: string;
  status: "active" | "pending" | "removed";
  createdAt: string;
  updatedAt: string;
}

// ── Role hierarchy (higher index = more permissions) ──

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

function hasMinimumRole(userRole: TeamRole, requiredRole: TeamRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

// ── GET — List team members ──

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

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

    // Find all active members where this user is the owner or a member
    const members = await db
      .collection("team_members")
      .find({
        organizationId: userId,
        status: { $in: ["active", "pending"] },
      })
      .sort({ createdAt: 1 })
      .toArray();

    return NextResponse.json({ members });
  } catch (error) {
    console.error("GET /api/team/members error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── POST — Invite a member ──

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser?.mongoUser?._id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = authUser.mongoUser._id.toString();

    const client = await clientPromise;
    const db = client.db();

    // Check entitlement
    const user = await db.collection("users").findOne(
      { _id: new ObjectId(userId) },
      { projection: { plan: 1, name: 1, email: 1 } }
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

    // Check that the caller is at least admin
    const callerMember = await db.collection("team_members").findOne({
      organizationId: userId,
      userId,
      status: "active",
    });
    const callerRole: TeamRole = (callerMember?.role as TeamRole) || "owner";
    if (!hasMinimumRole(callerRole, "admin")) {
      return NextResponse.json(
        { error: "Only owners and admins can invite members" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { email, name, role } = body;

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const memberRole: TeamRole = TEAM_ROLES.includes(role) ? role : "viewer";

    // Admins can only invite up to viewer/operator level
    if (callerRole === "admin" && ROLE_HIERARCHY[memberRole] >= ROLE_HIERARCHY["admin"]) {
      return NextResponse.json(
        { error: "Admins cannot assign admin or owner roles" },
        { status: 403 }
      );
    }

    // Check if already a member
    const existing = await db.collection("team_members").findOne({
      organizationId: userId,
      email: email.toLowerCase(),
      status: { $in: ["active", "pending"] },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User is already a team member" },
        { status: 409 }
      );
    }

    // Check member count limit.
    const memberCount = await db.collection("team_members").countDocuments({
      organizationId: userId,
      status: { $in: ["active", "pending"] },
    });
    if (memberCount >= 10) {
      return NextResponse.json(
        { error: "Team member limit reached (10 maximum)" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const memberDoc: Omit<TeamMemberDoc, "_id"> = {
      organizationId: userId,
      userId: "", // filled when they accept the invite
      email: email.toLowerCase(),
      name: name || email.split("@")[0],
      role: memberRole,
      invitedBy: userId,
      invitedAt: now,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("team_members").insertOne(memberDoc);

    return NextResponse.json(
      { member: { ...memberDoc, _id: result.insertedId } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/team/members error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
