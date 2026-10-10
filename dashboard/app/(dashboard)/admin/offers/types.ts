export type OfferPlan = "basic" | "growth";
export type OfferBillingCycle = "monthly" | "yearly";

export interface OfferRung {
  id: string;
  label: string;
  waitDays: number;
  openDays: number;
  trialExtensionDays: number;
  freeDays: number;
  percentOff: number;
  discountMonths: number;
  plans: OfferPlan[];
  billingCycle: OfferBillingCycle;
  emailEnabled: boolean;
  emailSubject: string;
  title: string;
  message: string;
  ctaLabel: string;
}

export interface OfferLadder {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: "light_use_trial" | "trial_expired";
  codePrefix: string;
  lightUseMaxDays: number;
  idleDays: number;
  rungs: OfferRung[];
}

export interface OfferSettings {
  enabled: boolean;
  holdoutPercent: number;
  maxFreeDaysPerUser: number;
  maxOffersPer90Days: number;
  weeklyFreeGrantBudget: number;
  maxEmailsPer7Days: number;
  maxNewOffersPerRun: number;
}

export interface RungResults {
  rungId: string;
  label: string;
  issued: number;
  emailed: number;
  seen: number;
  clicked: number;
  claimed: number;
  redeemed: number;
  expired: number;
  suppressed: number;
}

export interface CohortResults {
  people: number;
  converted: number;
}

export interface LadderResults {
  ladderId: string;
  open: number;
  waiting: number;
  sunset: number;
  closed: number;
  rungs: RungResults[];
  offered: CohortResults;
  holdout: CohortResults;
}

export interface OffersPayload {
  settings: OfferSettings;
  ladders: OfferLadder[];
  results: LadderResults[];
  openOffers: number;
  freePeriodPlan: string;
}

export interface RunReport {
  dryRun: boolean;
  ran: boolean;
  skippedReason?: string;
  evaluated: number;
  issued: number;
  eligibleNow: number;
  deferredByRunLimit: number;
  emailed: number;
  emailsSkipped: number;
  skippedRungs: number;
  waiting: number;
  holdout: number;
  closed: number;
  sunset: number;
  blocked: number;
  errors: number;
  byRung: Record<string, number>;
  samples: Array<{ userId: string; email: string | null; ladderId: string; rungId: string; label: string }>;
}

export interface UserOfferRow {
  _id: string;
  ladderId: string;
  rungId: string;
  rungIndex: number;
  kind: "percent_off" | "free_period" | "trial_extension";
  status: string;
  code: string | null;
  issuedAt: string;
  closesAt: string;
  seenAt?: string | null;
  clickedAt?: string | null;
  claimedAt?: string | null;
  redeemedAt?: string | null;
  freeUntil?: string | null;
  channels?: { email?: { sentAt: string | null; skippedReason?: string | null } };
  note?: string | null;
}

export interface UserJourneyRow {
  _id: string;
  ladderId: string;
  state: "open" | "closed" | "sunset" | "holdout";
  holdout: boolean;
  nextEvaluateAt: string | null;
  lastOfferAt: string | null;
  closedReason?: string | null;
  convertedAt?: string | null;
}

export type RewardMode = "discount" | "free" | "free_then_discount" | "trial";

export function rewardModeOf(rung: OfferRung): RewardMode {
  if (rung.trialExtensionDays > 0) return "trial";
  if (rung.freeDays > 0 && rung.percentOff > 0) return "free_then_discount";
  if (rung.freeDays > 0) return "free";
  return "discount";
}

export function withRewardMode(rung: OfferRung, mode: RewardMode): OfferRung {
  switch (mode) {
    case "trial":
      return { ...rung, trialExtensionDays: rung.trialExtensionDays || 21, freeDays: 0, percentOff: 0 };
    case "free":
      return { ...rung, trialExtensionDays: 0, freeDays: rung.freeDays || 14, percentOff: 0 };
    case "free_then_discount":
      return { ...rung, trialExtensionDays: 0, freeDays: rung.freeDays || 14, percentOff: rung.percentOff || 50, discountMonths: rung.discountMonths || 2 };
    default:
      return { ...rung, trialExtensionDays: 0, freeDays: 0, percentOff: rung.percentOff || 50, discountMonths: rung.discountMonths || 1 };
  }
}

export function describeRung(rung: Pick<OfferRung, "trialExtensionDays" | "freeDays" | "percentOff" | "discountMonths">): string {
  const months = (n: number) => `${n} month${n === 1 ? "" : "s"}`;
  if (rung.trialExtensionDays > 0) return `+${rung.trialExtensionDays} days on the trial`;
  const discount = rung.percentOff > 0 ? `${rung.percentOff}% off for ${months(rung.discountMonths)}` : "";
  if (rung.freeDays > 0) {
    const free = `${rung.freeDays} days of Basic free`;
    return discount ? `${free}, then ${discount}` : free;
  }
  return discount || "No offer";
}

export function newRung(index: number): OfferRung {
  return {
    id: `r${index + 1}`,
    label: `Offer ${index + 1}`,
    waitDays: 14,
    openDays: 7,
    trialExtensionDays: 0,
    freeDays: 0,
    percentOff: 50,
    discountMonths: 1,
    plans: ["basic"],
    billingCycle: "monthly",
    emailEnabled: true,
    emailSubject: "A new offer from MakeChurchEasy",
    title: "A special offer for your church",
    message: "We'd love to have your church back. Here's an offer to make it easy.",
    ctaLabel: "See the offer",
  };
}
