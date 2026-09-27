export interface ActivityScoreBreakdown {
  score: number;
  grade: "Champion" | "High Active" | "Moderate" | "Getting Started" | "Dormant";
  color: string;
  badgeBg: string;
  badgeBorder: string;
  barColor: string;
  breakdown: Array<{
    category: string;
    score: number;
    maxScore: number;
    detail: string;
  }>;
}

export interface UserActivityInput {
  lastLogin?: string | null;
  lastActive?: string | null;
  plan?: string | null;
  subscription?: { status?: string | null } | null;
  trial?: { active?: boolean } | null;
  ambassador?: { active?: boolean } | null;
  devices?: Array<unknown> | null;
  deviceIds?: string[] | null;
  activationMilestones?: {
    devicePaired?: boolean | null;
    obsConnected?: boolean | null;
    firstPresentation?: boolean | null;
    firstPresentationScreenshotUrl?: string | null;
    [key: string]: unknown;
  } | null;
  usage?: {
    bibleSearches?: number;
    songsCreated?: number;
    mediaUploaded?: number;
    transcriptCount?: number;
    aiHoursUsed?: number;
  } | null;
}

/**
 * Calculates a genuine activity score (0-100%) based on real user actions.
 *
 * Ground rules:
 * - A brand-new user with NO actions performed scores 0% (Dormant).
 * - Simply being on a Free Plan or having registered awards NO free points.
 * - Scores require actual actions: running presentations, OBS connections, content usage, or active usage recency.
 */
export function calculateUserActivityScore(user: UserActivityInput): ActivityScoreBreakdown {
  let score = 0;
  const breakdown: ActivityScoreBreakdown["breakdown"] = [];

  const usageCount =
    (user.usage?.bibleSearches || 0) +
    (user.usage?.songsCreated || 0) +
    (user.usage?.mediaUploaded || 0) +
    (user.usage?.transcriptCount || 0);

  const hasPresentation = Boolean(user.activationMilestones?.firstPresentation);
  const hasObs = Boolean(user.activationMilestones?.obsConnected);
  const hasScreenshot = Boolean(user.activationMilestones?.firstPresentationScreenshotUrl);

  const deviceCount = (user.devices?.length || user.deviceIds?.length || 0);
  const isPaired = Boolean(user.activationMilestones?.devicePaired) || deviceCount > 0;

  // Has the user engaged in ANY real action/presentation/content?
  const hasPerformedActions = usageCount > 0 || hasPresentation || hasObs;

  // 1. Live Presentation & OBS Milestones (max 35 pts)
  let presPoints = 0;
  let presDetail = "No presentation yet";
  if (hasPresentation) {
    presPoints += 20;
    presDetail = "First presentation completed";
  }
  if (hasScreenshot) {
    presPoints += 5;
    presDetail += " + OBS screenshot";
  }
  if (hasObs) {
    presPoints += 10;
    if (presDetail === "No presentation yet") presDetail = "OBS connected";
    else presDetail += " + OBS live";
  }
  score += presPoints;
  breakdown.push({
    category: "Live Presentation",
    score: presPoints,
    maxScore: 35,
    detail: presDetail,
  });

  // 2. Content Library & App Actions (max 30 pts)
  let contentPoints = 0;
  if (usageCount >= 30) {
    contentPoints = 30;
  } else if (usageCount >= 15) {
    contentPoints = 25;
  } else if (usageCount >= 5) {
    contentPoints = 15;
  } else if (usageCount >= 1) {
    contentPoints = 8;
  }
  score += contentPoints;
  breakdown.push({
    category: "Content Usage",
    score: contentPoints,
    maxScore: 30,
    detail: `${usageCount} action${usageCount === 1 ? "" : "s"} recorded`,
  });

  // 3. Activity Recency (max 20 pts)
  let recencyPoints = 0;
  let recencyDetail = "Never active";
  const activeTimestamp = user.lastActive || user.lastLogin;
  if (activeTimestamp) {
    const diffDays = Math.floor((Date.now() - new Date(activeTimestamp).getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays <= 1) {
      recencyPoints = hasPerformedActions ? 20 : 5;
      recencyDetail = "Active in last 24h";
    } else if (diffDays <= 3) {
      recencyPoints = hasPerformedActions ? 15 : 3;
      recencyDetail = "Active within 3 days";
    } else if (diffDays <= 7) {
      recencyPoints = hasPerformedActions ? 10 : 2;
      recencyDetail = "Active this week";
    } else if (diffDays <= 14) {
      recencyPoints = hasPerformedActions ? 5 : 0;
      recencyDetail = "Active in last 2 weeks";
    } else if (diffDays <= 30) {
      recencyPoints = hasPerformedActions ? 3 : 0;
      recencyDetail = "Active this month";
    } else {
      recencyPoints = 0;
      recencyDetail = "Inactive > 30 days";
    }
  }
  score += recencyPoints;
  breakdown.push({
    category: "Sign-in Recency",
    score: recencyPoints,
    maxScore: 20,
    detail: recencyDetail,
  });

  // 4. Connected Hardware / Device Pairing (max 10 pts)
  let devicePoints = 0;
  if (deviceCount >= 1 || isPaired) {
    devicePoints = hasPerformedActions ? 10 : 3;
  }
  score += devicePoints;
  breakdown.push({
    category: "Connected Hardware",
    score: devicePoints,
    maxScore: 10,
    detail: deviceCount > 0 ? `${deviceCount} device${deviceCount > 1 ? "s" : ""} connected` : (isPaired ? "Previously paired" : "No devices connected"),
  });

  // 5. Subscription Status (max 5 pts)
  let planPoints = 0;
  let planDetail = "Free Tier";
  const plan = (user.plan || "").toLowerCase();
  const isPaid = plan === "growth" || plan === "pro" || plan === "basic" || plan === "managed" || user.subscription?.status === "active";
  if (isPaid) {
    planPoints = 5;
    planDetail = `${(user.plan || "Paid").toUpperCase()} (Active)`;
  } else if (user.trial?.active) {
    planPoints = 3;
    planDetail = "Active Trial";
  } else if (user.ambassador?.active) {
    planPoints = 4;
    planDetail = "Active Ambassador";
  } else {
    planPoints = 0;
    planDetail = "Free Tier (0 pts)";
  }
  score += planPoints;
  breakdown.push({
    category: "Plan Status",
    score: planPoints,
    maxScore: 5,
    detail: planDetail,
  });

  // Hard clamp: If a user has 0 usage AND 0 presentations AND 0 OBS sessions,
  // cap their total score at a maximum of 8% (they cannot be considered active).
  if (!hasPerformedActions) {
    score = Math.min(score, 8);
  }

  const finalScore = Math.min(100, Math.max(0, score));
  let grade: ActivityScoreBreakdown["grade"] = "Dormant";
  let color = "text-rose-400";
  let badgeBg = "bg-rose-950/50 text-rose-300 border-rose-800/60";
  let badgeBorder = "border-rose-500/30";
  let barColor = "bg-rose-500";

  if (finalScore >= 75) {
    grade = "Champion";
    color = "text-emerald-400";
    badgeBg = "bg-emerald-950/60 text-emerald-300 border-emerald-700/60";
    badgeBorder = "border-emerald-500/40";
    barColor = "bg-emerald-500";
  } else if (finalScore >= 50) {
    grade = "High Active";
    color = "text-indigo-400";
    badgeBg = "bg-indigo-950/60 text-indigo-300 border-indigo-700/60";
    badgeBorder = "border-indigo-500/40";
    barColor = "bg-indigo-500";
  } else if (finalScore >= 25) {
    grade = "Moderate";
    color = "text-amber-400";
    badgeBg = "bg-amber-950/60 text-amber-300 border-amber-700/60";
    badgeBorder = "border-amber-500/40";
    barColor = "bg-amber-500";
  } else if (finalScore >= 10) {
    grade = "Getting Started";
    color = "text-blue-400";
    badgeBg = "bg-blue-950/60 text-blue-300 border-blue-700/60";
    badgeBorder = "border-blue-500/40";
    barColor = "bg-blue-500";
  }

  return {
    score: finalScore,
    grade,
    color,
    badgeBg,
    badgeBorder,
    barColor,
    breakdown,
  };
}
