/**
 * teamManagement.test.ts — Tests for team management logic.
 *
 * Validates role hierarchy, permission checks, member count limits,
 * and invite/update/remove authorization rules.
 */

import { describe, it, expect } from "vitest";

// ── Inline logic (mirrors /api/team/members route.ts) ──

const TEAM_ROLES = ["owner", "admin", "operator", "viewer"] as const;
type TeamRole = (typeof TEAM_ROLES)[number];

const ROLE_HIERARCHY: Record<TeamRole, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
  owner: 3,
};

function hasMinimumRole(userRole: TeamRole, requiredRole: TeamRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

interface TeamMember {
  _id: string;
  organizationId: string;
  userId: string;
  email: string;
  name: string;
  role: TeamRole;
  invitedBy: string;
  status: "active" | "pending" | "removed";
}

/** Check if caller can invite a member with the given role. */
function canInvite(callerRole: TeamRole, targetRole: TeamRole): { allowed: boolean; reason?: string } {
  if (!hasMinimumRole(callerRole, "admin")) {
    return { allowed: false, reason: "Only owners and admins can invite members" };
  }
  if (callerRole === "admin" && ROLE_HIERARCHY[targetRole] >= ROLE_HIERARCHY["admin"]) {
    return { allowed: false, reason: "Admins cannot assign admin or owner roles" };
  }
  return { allowed: true };
}

/** Check if caller outranks the target (strictly higher role, or is owner). */
function outranks(callerRole: TeamRole, targetRole: TeamRole): boolean {
  if (callerRole === "owner") return true;
  return ROLE_HIERARCHY[callerRole] > ROLE_HIERARCHY[targetRole];
}

/** Check if caller can update a member's role. */
function canUpdateRole(
  callerRole: TeamRole,
  targetRole: TeamRole,
  newRole: TeamRole,
): { allowed: boolean; reason?: string } {
  if (targetRole === "owner") {
    return { allowed: false, reason: "Cannot modify the owner" };
  }
  if (!outranks(callerRole, targetRole)) {
    return { allowed: false, reason: "Insufficient permissions to modify this member" };
  }
  if (callerRole === "admin" && ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY["admin"]) {
    return { allowed: false, reason: "Admins cannot assign admin or owner roles" };
  }
  if (ROLE_HIERARCHY[newRole] >= ROLE_HIERARCHY[callerRole] && callerRole !== "owner") {
    return { allowed: false, reason: "Cannot promote a member above your own role" };
  }
  return { allowed: true };
}

/** Check if caller can remove a member. */
function canRemove(callerRole: TeamRole, targetRole: TeamRole): { allowed: boolean; reason?: string } {
  if (targetRole === "owner") {
    return { allowed: false, reason: "Cannot remove the owner" };
  }
  if (!outranks(callerRole, targetRole)) {
    return { allowed: false, reason: "Insufficient permissions to remove this member" };
  }
  return { allowed: true };
}

/** Check member count against limit. */
function checkMemberLimit(currentCount: number, maxMembers: number): { allowed: boolean; reason?: string } {
  if (currentCount >= maxMembers) {
    return { allowed: false, reason: "Team member limit reached" };
  }
  return { allowed: true };
}

// ── Tests ──

describe("Team management — role hierarchy", () => {
  it("owner outranks all roles", () => {
    expect(hasMinimumRole("owner", "owner")).toBe(true);
    expect(hasMinimumRole("owner", "admin")).toBe(true);
    expect(hasMinimumRole("owner", "operator")).toBe(true);
    expect(hasMinimumRole("owner", "viewer")).toBe(true);
  });

  it("admin outranks operator and viewer", () => {
    expect(hasMinimumRole("admin", "admin")).toBe(true);
    expect(hasMinimumRole("admin", "operator")).toBe(true);
    expect(hasMinimumRole("admin", "viewer")).toBe(true);
  });

  it("admin does not outrank owner", () => {
    expect(hasMinimumRole("admin", "owner")).toBe(false);
  });

  it("operator outranks viewer", () => {
    expect(hasMinimumRole("operator", "operator")).toBe(true);
    expect(hasMinimumRole("operator", "viewer")).toBe(true);
  });

  it("operator does not outrank admin", () => {
    expect(hasMinimumRole("operator", "admin")).toBe(false);
  });

  it("viewer only outranks viewer", () => {
    expect(hasMinimumRole("viewer", "viewer")).toBe(true);
    expect(hasMinimumRole("viewer", "operator")).toBe(false);
  });
});

describe("Team management — invite permissions", () => {
  it("owner can invite any role", () => {
    for (const role of TEAM_ROLES) {
      expect(canInvite("owner", role).allowed).toBe(true);
    }
  });

  it("admin can invite operator and viewer", () => {
    expect(canInvite("admin", "operator").allowed).toBe(true);
    expect(canInvite("admin", "viewer").allowed).toBe(true);
  });

  it("admin cannot invite admin or owner", () => {
    expect(canInvite("admin", "admin").allowed).toBe(false);
    expect(canInvite("admin", "owner").allowed).toBe(false);
  });

  it("operator cannot invite anyone", () => {
    expect(canInvite("operator", "viewer").allowed).toBe(false);
  });

  it("viewer cannot invite anyone", () => {
    expect(canInvite("viewer", "viewer").allowed).toBe(false);
  });
});

describe("Team management — role update permissions", () => {
  it("owner can update any member", () => {
    for (const target of ["admin", "operator", "viewer"] as TeamRole[]) {
      for (const newRole of TEAM_ROLES) {
        expect(canUpdateRole("owner", target, newRole).allowed).toBe(true);
      }
    }
  });

  it("owner cannot modify another owner", () => {
    const result = canUpdateRole("owner", "owner", "admin");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Cannot modify the owner");
  });

  it("admin can update operators and viewers", () => {
    expect(canUpdateRole("admin", "operator", "viewer").allowed).toBe(true);
    expect(canUpdateRole("admin", "viewer", "operator").allowed).toBe(true);
  });

  it("admin cannot update other admins", () => {
    expect(canUpdateRole("admin", "admin", "viewer").allowed).toBe(false);
  });

  it("admin cannot promote to admin or owner", () => {
    expect(canUpdateRole("admin", "viewer", "admin").allowed).toBe(false);
    expect(canUpdateRole("admin", "viewer", "owner").allowed).toBe(false);
  });

  it("operator can update viewers but not operators or above", () => {
    expect(canUpdateRole("operator", "viewer", "viewer").allowed).toBe(true);
    expect(canUpdateRole("operator", "operator", "viewer").allowed).toBe(false);
    expect(canUpdateRole("operator", "admin", "viewer").allowed).toBe(false);
  });

  it("cannot promote above own role (non-owner)", () => {
    const result = canUpdateRole("admin", "viewer", "owner");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe("Team management — remove permissions", () => {
  it("owner can remove any member", () => {
    for (const target of ["admin", "operator", "viewer"] as TeamRole[]) {
      expect(canRemove("owner", target).allowed).toBe(true);
    }
  });

  it("owner cannot remove another owner", () => {
    expect(canRemove("owner", "owner").allowed).toBe(false);
  });

  it("admin can remove operators and viewers", () => {
    expect(canRemove("admin", "operator").allowed).toBe(true);
    expect(canRemove("admin", "viewer").allowed).toBe(true);
  });

  it("admin cannot remove other admins", () => {
    expect(canRemove("admin", "admin").allowed).toBe(false);
  });

  it("operator can remove viewers but not operators or above", () => {
    expect(canRemove("operator", "viewer").allowed).toBe(true);
    expect(canRemove("operator", "operator").allowed).toBe(false);
    expect(canRemove("operator", "admin").allowed).toBe(false);
  });

  it("viewer cannot remove anyone", () => {
    expect(canRemove("viewer", "viewer").allowed).toBe(false);
  });
});

describe("Team management — member limits", () => {
  it("allows adding when under limit", () => {
    expect(checkMemberLimit(5, 10).allowed).toBe(true);
  });

  it("blocks adding at limit", () => {
    expect(checkMemberLimit(10, 10).allowed).toBe(false);
    expect(checkMemberLimit(10, 10).reason).toContain("limit reached");
  });

  it("allows adding when empty", () => {
    expect(checkMemberLimit(0, 10).allowed).toBe(true);
  });

  it("allows adding when over limit (edge case — should not happen)", () => {
    expect(checkMemberLimit(11, 10).allowed).toBe(false);
  });
});

describe("Team management — duplicate detection", () => {
  function isDuplicateMember(members: TeamMember[], email: string): boolean {
    return members.some(
      (m) => m.email === email.toLowerCase() && (m.status === "active" || m.status === "pending")
    );
  }

  it("detects existing active member", () => {
    const members: TeamMember[] = [
      { _id: "1", organizationId: "org1", userId: "u1", email: "a@test.com", name: "A", role: "viewer", invitedBy: "owner", status: "active" },
    ];
    expect(isDuplicateMember(members, "a@test.com")).toBe(true);
  });

  it("detects existing pending member", () => {
    const members: TeamMember[] = [
      { _id: "1", organizationId: "org1", userId: "", email: "b@test.com", name: "B", role: "viewer", invitedBy: "owner", status: "pending" },
    ];
    expect(isDuplicateMember(members, "b@test.com")).toBe(true);
  });

  it("allows re-inviting removed member", () => {
    const members: TeamMember[] = [
      { _id: "1", organizationId: "org1", userId: "u1", email: "c@test.com", name: "C", role: "viewer", invitedBy: "owner", status: "removed" },
    ];
    expect(isDuplicateMember(members, "c@test.com")).toBe(false);
  });

  it("allows new member", () => {
    expect(isDuplicateMember([], "new@test.com")).toBe(false);
  });

  it("case-insensitive email check", () => {
    const members: TeamMember[] = [
      { _id: "1", organizationId: "org1", userId: "u1", email: "a@test.com", name: "A", role: "viewer", invitedBy: "owner", status: "active" },
    ];
    expect(isDuplicateMember(members, "A@TEST.COM")).toBe(true);
  });
});
