/**
 * useSubscription.ts — Single source of truth for plan, entitlements, usage, and credits.
 *
 * Every dashboard page MUST use this hook instead of independently calling
 * getSubscription(), getPlanConfig(), or getUserUsage().
 *
 * Data flow:
 *   1. mongoUser.plan from /api/auth/status → AUTHORITATIVE plan key
 *   2. getSubscription() → billing details (dates, status, price, currency)
 *   3. getPlanConfig() → plan limits, credits, pricing, entitlements
 *   4. getUserUsage() → current resource usage counts
 *
 * If subscription.plan disagrees with the effective entitlement plan, the
 * subscription payload is normalized for UI consistency.
 */

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  getSubscription,
  getUser,
  getUserUsage,
  type Subscription,
  type User,
  type UserUsage,
} from "./api";
import {
  getPlanConfig,
  type PlanConfig,
  type PlanTierConfig,
} from "./planConfigService";
import { getUserId } from "./userId";
import { getSubscriptionState, type TrialState } from "./trialState";
import {
  getEffectivePlan as resolveEffectivePlan,
  isActiveTrial as isCanonicalTrialActive,
} from "@/lib/subscriptionSourceOfTruth";

interface SubscriptionSnapshot {
  subscription: Subscription | null;
  user: User | null;
  planConfig: PlanConfig | null;
  usage: UserUsage | null;
  fetchedAt: number;
}

const SUBSCRIPTION_CACHE_TTL_MS = 60_000;
const subscriptionCache = new Map<string, SubscriptionSnapshot>();
const inflightSnapshots = new Map<string, Promise<SubscriptionSnapshot>>();

function readSubscriptionSnapshot(userId: string): SubscriptionSnapshot | null {
  const cached = subscriptionCache.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > SUBSCRIPTION_CACHE_TTL_MS) {
    return null;
  }
  return cached;
}

async function fetchSubscriptionSnapshot(userId: string): Promise<SubscriptionSnapshot> {
  const [userData, subData, config, usageData] = await Promise.all([
    getUser(userId),
    getSubscription(userId),
    getPlanConfig(),
    getUserUsage(userId).catch(() => null),
  ]);

  return {
    user: userData,
    subscription: subData,
    planConfig: config,
    usage: usageData,
    fetchedAt: Date.now(),
  };
}

async function loadSubscriptionSnapshot(userId: string, force = false): Promise<SubscriptionSnapshot> {
  const cached = !force ? readSubscriptionSnapshot(userId) : null;
  if (cached) {
    return cached;
  }

  const existing = inflightSnapshots.get(userId);
  if (existing) {
    return existing;
  }

  const promise = fetchSubscriptionSnapshot(userId)
    .then((snapshot) => {
      subscriptionCache.set(userId, snapshot);
      return snapshot;
    })
    .finally(() => {
      inflightSnapshots.delete(userId);
    });

  inflightSnapshots.set(userId, promise);
  return promise;
}

function applySubscriptionSnapshot(
  snapshot: SubscriptionSnapshot,
  setUser: (value: User | null) => void,
  setSubscription: (value: Subscription | null) => void,
  setPlanConfig: (value: PlanConfig | null) => void,
  setUsage: (value: UserUsage | null) => void,
) {
  setUser(snapshot.user);
  setSubscription(snapshot.subscription);
  setPlanConfig(snapshot.planConfig);
  setUsage(snapshot.usage);
}

export interface SubscriptionState {
  /** Authoritative plan key (from mongoUser.plan) */
  plan: string;
  /** Plan tier config (credits, label, price, entitlements) */
  planTier: PlanTierConfig | null;
  /** Full plan config */
  planConfig: PlanConfig | null;
  /** Subscription billing details (may have stale plan — use `plan` instead) */
  subscription: Subscription | null;
  /** User object (credits, profile) */
  user: User | null;
  /** MongoUser from auth context (authoritative plan) */
  mongoUser: { _id: string; name: string; email: string; plan: string; credits: number; planAllocation: number; adminGranted: number; totalConsumed: number; totalAvailable: number; trial?: { active?: boolean; status?: "active" | "expired" | "stopped" | "cancelled"; startedAt?: string | null; endsAt?: string | null; durationDays?: number | null; stoppedAt?: string | null; stoppedReason?: string; restartedAt?: string | null; grantedBy?: string; lastModifiedBy?: string } | null; ambassador?: { active?: boolean; grantedBy?: string; grantedAt?: string; expiresAt?: string; creditsGranted?: number; previousPlan?: string; notes?: string } | null; onboarding?: { downloadedStudio?: boolean; pairedFirstDevice?: boolean; completedWelcome?: boolean } | null } | null;
  /** Current resource usage */
  usage: UserUsage | null;
  /** Total credits for current plan */
  maxCredits: number;
  /** Whether credits are unlimited */
  isUnlimited: boolean;
  /** Whether plan is free */
  isFreePlan: boolean;
  /** Plan display label */
  planLabel: string;
  /** Whether user is currently on a trial */
  isOnTrial: boolean;
  /** Days remaining in trial (0 if expired or no trial) */
  trialDaysLeft: number;
  /** Trial end date */
  trialEndsAt: Date | null;
  /** Trial start date */
  trialStartedAt: Date | null;
  /** Trial duration in days */
  trialDurationDays: number;
  /** Derived trial state — use this for all trial-aware UI */
  trialState: TrialState;
  /** Whether user has active ambassador access */
  isAmbassador: boolean;
  /** Ambassador expiry date */
  ambassadorExpiresAt: Date | null;
  /** Days remaining in ambassador access (0 if expired or not ambassador) */
  ambassadorDaysLeft: number;
  /** Loading state */
  loading: boolean;
}

export function useSubscription(): SubscriptionState {
  const { mongoUser } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [planConfig, setPlanConfig] = useState<PlanConfig | null>(null);
  const [usage, setUsage] = useState<UserUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      setUser(null);
      setSubscription(null);
      setPlanConfig(null);
      setUsage(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    const cached = readSubscriptionSnapshot(userId);

    if (cached) {
      applySubscriptionSnapshot(cached, setUser, setSubscription, setPlanConfig, setUsage);
      setLoading(false);
    } else {
      setLoading(true);
    }

    loadSubscriptionSnapshot(userId, !cached)
      .then((snapshot) => {
        if (cancelled) return;
        applySubscriptionSnapshot(snapshot, setUser, setSubscription, setPlanConfig, setUsage);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mongoUser?._id]);

  // ── Authoritative plan: ALWAYS from mongoUser (/api/auth/status) ──
  const basePlan = (mongoUser?.plan || user?.plan || "free").toLowerCase();

  // ── Trial state (supports both nested trial object and legacy flat fields) ──
  const trialEndsAtStr = mongoUser?.trial?.endsAt || null;
  const trialEndsAt = trialEndsAtStr ? new Date(trialEndsAtStr) : null;
  const trialStartedAtStr = mongoUser?.trial?.startedAt || null;
  const trialStartedAt = trialStartedAtStr ? new Date(trialStartedAtStr) : null;
  const trialDurationDays = mongoUser?.trial?.durationDays ?? 20;
  const now = new Date();
  const trialDaysLeft = trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  // Check trial status (new format) or fall back to active flag / date comparison (legacy)
  const trialActive = isCanonicalTrialActive(mongoUser as any);
  const isOnTrial = trialActive && basePlan === "free";

  // ── Ambassador state ──
  const ambassadorObj = (mongoUser as any)?.ambassador;
  const isAmbassador = !!(ambassadorObj?.active);
  const ambassadorExpiresAtStr = ambassadorObj?.expiresAt || null;
  const ambassadorExpiresAt = ambassadorExpiresAtStr ? new Date(ambassadorExpiresAtStr) : null;
  const ambassadorDaysLeft = ambassadorExpiresAt
    ? Math.max(0, Math.ceil((ambassadorExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  // ── Effective plan: canonical source-of-truth for all gating ──
  const plan = resolveEffectivePlan(mongoUser as any);

  // ── Detect and override stale subscription.plan ──
  const resolvedSubscription = useMemo(() => {
    if (!subscription) return null;
    const subPlan = (subscription.plan || "free").toLowerCase();
    if (subPlan !== plan) {
      console.warn(
        "[useSubscription] Plan mismatch detected — subscription has",
        JSON.stringify(subPlan),
        "but effective plan is",
        JSON.stringify(plan),
        ". Overriding for UI consistency."
      );
      return { ...subscription, plan };
    }
    return subscription;
  }, [subscription, plan]);

  // ── Plan tier from config ──
  const planTier = planConfig?.plans[plan] || planConfig?.plans.free || null;
  const maxCredits = planTier?.credits ?? 0;
  const isUnlimited = maxCredits === -1;
  const isFreePlan = basePlan === "free";

  // ── Derived subscription state (single source of truth for trial UI) ──
  const trialState = getSubscriptionState(mongoUser, planTier?.label);

  // ── Plan label: trial-aware ──
  const planLabel = trialState.planLabel;

  return {
    plan,
    planTier,
    planConfig,
    subscription: resolvedSubscription,
    user,
    mongoUser,
    usage,
    maxCredits,
    isUnlimited,
    isFreePlan,
    planLabel,
    isOnTrial,
    trialDaysLeft,
    trialEndsAt,
    trialStartedAt,
    trialDurationDays,
    trialState,
    isAmbassador,
    ambassadorExpiresAt,
    ambassadorDaysLeft,
    loading,
  };
}
