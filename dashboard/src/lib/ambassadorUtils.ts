export interface AmbassadorInfo {
  isAmbassador: boolean;
  isAdmin: boolean;
  isNormalUser: boolean;
  active: boolean;
  grantedAt: Date | null;
  expiresAt: Date | null;
  totalMonths: number;
  monthsLeft: number;
  daysLeft: number;
  creditsGranted: number;
  previousPlan: string;
  formattedExpiry: string;
  tenureLabel: string;
  remainingLabel: string;
}

export function getAmbassadorInfo(
  ambassador?: {
    active?: boolean;
    grantedBy?: string;
    grantedAt?: string;
    expiresAt?: string;
    creditsGranted?: number;
    previousPlan?: string;
    notes?: string;
  } | null,
  role?: string | null
): AmbassadorInfo {
  const normRole = (role || "").toLowerCase().trim();
  const isAdmin = normRole === "admin" || normRole === "superadmin";

  const active = Boolean(ambassador?.active);
  const grantedAtStr = ambassador?.grantedAt;
  const expiresAtStr = ambassador?.expiresAt;

  const grantedAt = grantedAtStr ? new Date(grantedAtStr) : null;
  const expiresAt = expiresAtStr ? new Date(expiresAtStr) : null;

  const now = Date.now();
  const isExpired = expiresAt ? expiresAt.getTime() <= now : false;
  const isAmbassador = active && !isExpired && Boolean(expiresAt);

  let totalMonths = 1;
  let daysLeft = 0;
  let monthsLeft = 0;
  let formattedExpiry = "";

  if (expiresAt) {
    formattedExpiry = expiresAt.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    if (grantedAt && !isNaN(grantedAt.getTime()) && !isNaN(expiresAt.getTime())) {
      const durationMs = Math.max(0, expiresAt.getTime() - grantedAt.getTime());
      const approxMonths = Math.round(durationMs / (30 * 24 * 60 * 60 * 1000));
      totalMonths = Math.max(1, approxMonths);
    }

    const remainingMs = Math.max(0, expiresAt.getTime() - now);
    daysLeft = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
    monthsLeft = Math.ceil(daysLeft / 30);
  }

  const tenureLabel = `${totalMonths} Month${totalMonths === 1 ? "" : "s"}`;
  const remainingLabel =
    monthsLeft > 1
      ? `${monthsLeft} months left`
      : daysLeft > 0
      ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`
      : "Expiring soon";

  return {
    isAmbassador,
    isAdmin,
    isNormalUser: !isAmbassador && !isAdmin,
    active,
    grantedAt,
    expiresAt,
    totalMonths,
    monthsLeft,
    daysLeft,
    creditsGranted: ambassador?.creditsGranted ?? 0,
    previousPlan: ambassador?.previousPlan ?? "free",
    formattedExpiry,
    tenureLabel,
    remainingLabel,
  };
}
