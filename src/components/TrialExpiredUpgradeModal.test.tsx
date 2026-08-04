import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

let mockAuthState = {
  user: {
    id: "user-1",
    plan: "free",
    trial: { endsAt: "2026-07-01T00:00:00.000Z" },
  },
  authenticated: true,
  loading: false,
  isAdmin: false,
};

let mockEffectivePlan = "free";
let mockTrialExpired = true;

vi.mock("./Icon", () => ({
  default: ({ name }: { name: string }) => `<icon data-name="${name}"></icon>`,
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

vi.mock("../services/licenseService", () => ({
  getEffectivePlan: () => mockEffectivePlan,
  isTrialExpired: () => mockTrialExpired,
}));

import TrialExpiredUpgradeModal from "./TrialExpiredUpgradeModal";

describe("TrialExpiredUpgradeModal", () => {
  it("renders as a non-blocking, dismissible notice for expired trials", () => {
    const html = renderToStaticMarkup(<TrialExpiredUpgradeModal />);

    expect(html).toContain('role="status"');
    expect(html).toContain("Close trial ended notice");
    expect(html).toContain("You are now on the Free plan.");
    expect(html).toContain("View upgrade plans");
  });

  it("does not render for admins or users without an expired free trial", () => {
    mockAuthState = {
      ...mockAuthState,
      isAdmin: true,
    };

    expect(renderToStaticMarkup(<TrialExpiredUpgradeModal />)).toBe("");

    mockAuthState = {
      ...mockAuthState,
      isAdmin: false,
    };
    mockEffectivePlan = "growth";
    mockTrialExpired = false;

    expect(renderToStaticMarkup(<TrialExpiredUpgradeModal />)).toBe("");
  });
});
