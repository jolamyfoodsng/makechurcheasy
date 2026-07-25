"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
    ChevronRight, Shield, CheckCircle2, Lock, Loader2, Calendar,
    ArrowDownRight, Check, RefreshCw, X, Timer, Clock, Users, Smartphone, Layout,
    Sparkles,
} from 'lucide-react';
import {
    getPlanConfig,
    type PricingPlanConfig,
    type PricingFeatureBanner,
    type BillingCycle as BillingCycleType,
} from '@/lib/planConfigService';
import { useCountryPricing, type CountryPricing } from '@/lib/useCountryPricing';
import { type User, type Subscription } from '@/lib/api';
import { useSubscription } from '@/lib/useSubscription';
import './small-style.css';

import { Gift, Leaf, Star, TrendingUp, Crown, Music, Monitor, Globe2 } from 'lucide-react';

const IconMap: Record<string, React.ElementType> = {
    gift: Gift, leaf: Leaf, star: Star, chart: TrendingUp,
    crown: Crown, music: Music, desktop: Monitor, language: Globe2, shield: Shield,
    clock: Clock, smartphone: Smartphone, layout: Layout,
};

type BillingCycle = BillingCycleType;

/**
 * Format a numeric price with the country's currency symbol.
 * E.g., formatCountryPrice(3500, "₦") → "₦3,500"
 * E.g., formatCountryPrice(5, "$") → "$5"
 */
function formatCountryPrice(amount: number, symbol: string): string {
    if (amount === 0) return `${symbol}0`;
    const formatted = amount.toLocaleString('en-US');
    return `${symbol}${formatted}`;
}

/**
 * Get the numeric price from country pricing for a plan and cycle.
 */
function getCountryPlanPrice(
    countryPricing: CountryPricing,
    planId: string,
    cycle: BillingCycle
): number {
    if (cycle === 'lifetime') return 0;
    const plans = countryPricing.plans as Record<string, { monthly: number; yearly: number; introductoryMonthly?: number }>;
    const plan = plans[planId];
    if (!plan) return 0;
    if (cycle === 'monthly') {
        return plan.introductoryMonthly ?? plan.monthly;
    }
    return plan.yearly;
}

interface EarlyAccessOffer {
    enabled: boolean;
    eligible: boolean;
    plan: string;
    offerName: string;
    description: string;
    price: number;
    currency: string;
    currencySymbol: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Breadcrumb() {
    const t = useTranslations();
    return (
        <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto mb-8 text-sm font-medium text-slate-500 pl-4 pr-4 lg:pl-0 lg:pr-0">
            <ol className="inline-flex items-center space-x-1 md:space-x-2">
                <li><a className="hover:text-slate-900 transition-colors" href="#">{t('subscription.plans.account')}</a></li>
                <li><div className="flex items-center"><ChevronRight className="w-3 h-3 mx-2" /><a className="hover:text-slate-900 transition-colors" href="#">{t('subscription.plans.subscription')}</a></div></li>
                <li aria-current="page"><div className="flex items-center"><ChevronRight className="w-3 h-3 mx-2" /><span className="text-blue-700 font-semibold">{t('subscription.plans.managePlan')}</span></div></li>
            </ol>
        </nav>
    );
}

// ─── Current Subscription Section ────────────────────────────────────────────

function CurrentSubscriptionSection({
    user,
    subscription,
    currentPlan,
    countryPricing,
    planConfig,
    onSwitchCycle,
    isOnTrial,
    trialDaysLeft,
    trialEndsAt,
}: {
    user: User | null;
    subscription: Subscription | null;
    currentPlan: PricingPlanConfig | null;
    countryPricing: CountryPricing;
    planConfig: any;
    onSwitchCycle: () => void;
    isOnTrial?: boolean;
    trialDaysLeft?: number;
    trialEndsAt?: Date | null;
}) {
    const t = useTranslations();
    const planName = isOnTrial ? t('trial.growthTrialActive') : (currentPlan?.name || t('subscription.data.plans.free.name'));
    const PlanIcon = currentPlan ? (IconMap[currentPlan.iconName] || Shield) : Shield;
    const isActive = subscription?.status === 'active';
    const billingCycle = subscription?.billingCycle || 'monthly';
    const creditPlanId = currentPlan?.id || user?.plan || 'free';
    const maxCredits = planConfig?.plans?.[creditPlanId]?.credits ?? 0;
    const isUnlimited = maxCredits === -1;

    const renewalDate = useMemo(() => {
        const dateStr = subscription?.nextBillingDate || subscription?.currentPeriodEnd;
        if (!dateStr) return null;
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return null;
            return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        } catch { return null; }
    }, [subscription]);

    // Use country pricing for display
    const planId = currentPlan?.id || 'free';
    const monthlyPrice = formatCountryPrice(
        getCountryPlanPrice(countryPricing, planId, 'monthly'),
        countryPricing.currencySymbol
    );
    const yearlyPrice = formatCountryPrice(
        getCountryPlanPrice(countryPricing, planId, 'yearly'),
        countryPricing.currencySymbol
    );
    const displayMonthlyPrice = isOnTrial ? t('subscription.data.plans.free.name') : monthlyPrice;
    const displayYearlyPrice = isOnTrial ? t('subscription.data.plans.free.name') : yearlyPrice;

    return (
        <div className="bg-white rounded-2xl border border-blue-200 p-6 md:p-8 shadow-sm mb-8">
            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: Plan info */}
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 rounded-lg bg-blue-50">
                            <Check className="w-5 h-5 text-blue-700" />
                        </div>
                        <h2 className="text-lg font-bold text-slate-900">{t('subscription.plans.currentSubscription')}</h2>
                    </div>

                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center">
                            <PlanIcon className="w-7 h-7 text-blue-700" />
                        </div>
                        <div>
                            <h3 className="text-2xl font-bold text-slate-900">{planName}</h3>
                            <div className={`inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${isOnTrial ? 'bg-amber-50 text-amber-700' : isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                }`}>
                                {isOnTrial ? (
                                    <>
                                        <Timer className="w-3 h-3" />
                                        {trialDaysLeft === 1 ? t('trial.dayRemaining') : t('trial.daysRemaining', { days: trialDaysLeft ?? 0 })}
                                    </>
                                ) : isActive ? (
                                    <>
                                        <CheckCircle2 className="w-3 h-3" />
                                        {t('common.active')}
                                    </>
                                ) : (
                                    subscription?.status || t('subscription.plans.noSubscription')
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs font-medium text-slate-500 mb-1">{t('subscription.plans.billingCycle')}</p>
                            <p className="text-sm font-bold text-slate-900 capitalize">{billingCycle}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs font-medium text-slate-500 mb-1">{t('common.price')}</p>
                            <p className="text-sm font-bold text-slate-900">
                                {billingCycle === 'monthly' ? displayMonthlyPrice : displayYearlyPrice}
                                {!isOnTrial ? <span className="text-slate-500 font-normal">/{billingCycle === 'monthly' ? 'mo' : 'yr'}</span> : null}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs font-medium text-slate-500 mb-1">{t('common.credits')}</p>
                            <p className="text-sm font-bold text-slate-900">
                                {isUnlimited ? t('subscription.plans.unlimited') : maxCredits.toLocaleString()}
                            </p>
                        </div>
                        {renewalDate && (
                            <div className="bg-gray-50 rounded-xl p-4">
                                <p className="text-xs font-medium text-slate-500 mb-1">{t('common.renews')}</p>
                                <p className="text-sm font-bold text-slate-900">{renewalDate}</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Actions & Both Prices */}
                <div className="lg:w-72 flex flex-col justify-between">
                    <div className="space-y-3 mb-6">
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs font-medium text-slate-500 mb-2">{t('subscription.plans.monthlyBilling')}</p>
                            <p className="text-lg font-bold text-slate-900">{displayMonthlyPrice}{!isOnTrial ? <span className="text-sm font-normal text-slate-500">/mo</span> : null}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs font-medium text-slate-500 mb-2">{t('subscription.plans.yearlyBilling')}</p>
                            <p className="text-lg font-bold text-slate-900">{displayYearlyPrice}{!isOnTrial ? <span className="text-sm font-normal text-slate-500">/yr</span> : null}</p>
                            {billingCycle === 'monthly' && !isOnTrial && (
                                <p className="text-xs text-emerald-600 font-medium mt-1">{t('subscription.plans.saveYearly')}</p>
                            )}
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5" />
                            {t('subscription.plans.currentBilling')} <span className="font-semibold text-slate-900 capitalize">{billingCycle}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {billingCycle === 'monthly' && (
                            <button
                                onClick={onSwitchCycle}
                                className="w-full h-11 py-2.5 px-4 rounded-xl font-semibold text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center justify-center gap-2"
                            >
                                <RefreshCw className="w-4 h-4" />
                                {t('subscription.plans.switchToYearly')}
                            </button>
                        )}
                        <a
                            href="/billing"
                            className="w-full h-11 py-2.5 px-4 rounded-xl font-semibold text-sm border border-slate-200 text-slate-500 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2"
                        >
                            {t('subscription.plans.manageSubscription')}
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Pricing Card ────────────────────────────────────────────────────────────

function PricingCard({
    plan,
    billingCycle,
    countryPricing,
    onUpgrade,
    planRelationship,
    subscriptionBillingCycle,
    currentPlanCredits,
}: {
    plan: PricingPlanConfig;
    billingCycle: BillingCycle;
    countryPricing: CountryPricing;
    onUpgrade: (plan: PricingPlanConfig) => void;
    planRelationship: 'current' | 'trial' | 'upgrade' | 'downgrade' | 'free';
    subscriptionBillingCycle?: string;
    currentPlanCredits?: number;
}) {
    const t = useTranslations();
    const Icon = IconMap[plan.iconName] || Shield;
    const isCurrent = planRelationship === 'current';
    const isTrial = planRelationship === 'trial';
    const isFree = planRelationship === 'free';
    const isUpgrade = planRelationship === 'upgrade';
    const isDisabled = isCurrent || isFree;

    // Use country pricing for the numeric amount
    const numericPrice = getCountryPlanPrice(countryPricing, plan.id, billingCycle);
    const priceDisplay = formatCountryPrice(numericPrice, countryPricing.currencySymbol);

    const buttonLabel = useMemo(() => {
        if (isCurrent) return t('subscription.plans.currentPlanBadge');
        if (isTrial) return t('subscription.plans.choosePlan', { plan: plan.name });
        if (isFree) return t('subscription.plans.freePlan');
        if (isUpgrade) return t('subscription.plans.upgradeTo', { plan: plan.name });
        return t('subscription.plans.downgradeTo', { plan: plan.name });
    }, [planRelationship, plan.name, isCurrent, isTrial, isFree, isUpgrade, t]);

    return (
        <div className={`bg-white rounded-2xl p-6 flex flex-col pricing-card w-[280px] lg:w-auto relative ${plan.styles.popular ? 'shadow-lg lg:-translate-y-2' : 'shadow-sm'
            } ${plan.styles.border} ${isCurrent ? 'ring-2 ring-blue-600 ring-offset-2' : ''}`}>
            {/* Popular badge */}
            {plan.styles.popular && (
                <div className="absolute -top-1 left-1/2 transform -translate-x-1/2">
                    <span className={`${plan.styles.popularBadgeBg} text-white text-xs font-bold px-4 py-1 rounded-full uppercase tracking-wider`}>
                        {t('subscription.plans.mostPopular')}
                    </span>
                </div>
            )}

            {/* Current plan badge — paid subscriber */}
            {isCurrent && (
                <div className="absolute top-3 right-3">
                    <span className="bg-blue-700 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Check className="w-3 h-3" />
                        {t('subscription.plans.currentPlanBadge')}
                    </span>
                </div>
            )}

            {/* Trial badge — free trial active */}
            {isTrial && (
                <div className="absolute top-3 right-3">
                    <span className="bg-amber-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Timer className="w-3 h-3" />
                        {t('subscription.plans.trialBadge')}
                    </span>
                </div>
            )}

            <div className="text-center mb-6 pt-2">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${plan.styles.iconBg} ${plan.styles.iconColor} ${plan.styles.popular ? 'border border-purple-100' : ''}`}>
                    <Icon className="w-5 h-5" />
                </div>
                <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="text-slate-500 text-sm mt-1 mb-4">{plan.target}</p>

                <div className="flex flex-col items-center justify-center mb-2 min-h-[60px]">
                    <span className="text-sm invisible">Spacer</span>
                    <div className="flex items-end justify-center gap-1 mt-1">
                        <span className="text-3xl font-bold leading-none">{priceDisplay}</span>
                        <span className="text-slate-500 text-sm">{billingCycle === 'yearly' ? t('subscription.plans.perYear') : t('subscription.plans.perMonth')}</span>
                    </div>
                </div>

                {/* Show both prices for current plan */}
                {isCurrent && (
                    <div className="bg-blue-50 rounded-lg p-3 mt-2 text-xs space-y-1">
                        <div className="flex justify-between">
                            <span className="text-slate-500">{t('subscription.plans.monthlyLabel')}</span>
                            <span className="font-semibold text-slate-900">{formatCountryPrice(getCountryPlanPrice(countryPricing, plan.id, 'monthly'), countryPricing.currencySymbol)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-500">{t('subscription.plans.yearlyLabel')}</span>
                            <span className="font-semibold text-slate-900">{formatCountryPrice(getCountryPlanPrice(countryPricing, plan.id, 'yearly'), countryPricing.currencySymbol)}</span>
                        </div>
                        <div className="flex justify-between pt-1 border-t border-blue-200">
                            <span className="text-slate-500">{t('subscription.plans.yourBilling')}</span>
                            <span className="font-bold text-blue-700 capitalize">{subscriptionBillingCycle || 'monthly'}</span>
                        </div>
                    </div>
                )}
            </div>

            <ul className="space-y-3 mb-8 flex-grow text-sm text-slate-500">
                {plan.features.map((feature, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className={`w-4 h-4 mt-0.5 flex-shrink-0 ${plan.styles.checkColor}`} />
                        <span>
                            {feature.prefixHighlight && <span className="font-medium text-slate-900">{feature.prefixHighlight} </span>}
                            {feature.text}
                        </span>
                    </li>
                ))}
            </ul>

            <button
                onClick={() => !isDisabled && onUpgrade(plan)}
                className={`w-full h-11 py-2.5 px-4 rounded-xl font-semibold mt-auto transition-colors ${isCurrent
                    ? 'bg-blue-50 text-blue-700 cursor-not-allowed opacity-80'
                    : isFree
                        ? `${plan.styles.button} ${plan.styles.buttonHover} cursor-default opacity-70`
                        : `${plan.styles.button} ${plan.styles.buttonHover} cursor-pointer`
                    }`}
                disabled={isDisabled}
            >
                {buttonLabel}
            </button>
        </div>
    );
}

// ─── Billing Cycle Switch Modal ──────────────────────────────────────────────

function BillingCycleModal({
    open,
    onClose,
    onConfirm,
    planName,
    monthlyPrice,
    yearlyPrice,
    currencySymbol,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    planName: string;
    monthlyPrice: string;
    yearlyPrice: string;
    currencySymbol: string;
}) {
    const t = useTranslations();
    if (!open) return null;

    // Calculate savings: 12 * monthly - yearly
    const monthlyNum = parseFloat(monthlyPrice.replace(/[^0-9.]/g, '')) || 0;
    const yearlyNum = parseFloat(yearlyPrice.replace(/[^0-9.]/g, '')) || 0;
    const annualIfMonthly = monthlyNum * 12;
    const savings = annualIfMonthly - yearlyNum;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl mx-4">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-slate-900">{t('subscription.plans.switchBillingCycle')}</h3>
                    <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
                        <X className="w-5 h-5 text-slate-500" />
                    </button>
                </div>

                <div className="space-y-4 mb-6">
                    <div className="bg-gray-50 rounded-xl p-4">
                        <p className="text-xs font-medium text-slate-500 mb-1">{t('subscription.plans.current')}</p>
                        <p className="text-sm font-bold text-slate-900">{planName} {t('subscription.plans.monthlyBilling')}</p>
                        <p className="text-sm text-slate-500">{monthlyPrice}/month</p>
                    </div>

                    <div className="flex justify-center">
                        <ArrowDownRight className="w-5 h-5 text-blue-700" />
                    </div>

                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
                        <p className="text-xs font-medium text-blue-700 mb-1">{t('subscription.plans.new')}</p>
                        <p className="text-sm font-bold text-slate-900">{planName} {t('subscription.plans.yearlyBilling')}</p>
                        <p className="text-sm text-slate-500">{yearlyPrice}/year</p>
                    </div>

                    {savings > 0 && (
                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
                            <p className="text-xs font-medium text-emerald-700 mb-1">{t('subscription.plans.savings')}</p>
                            <p className="text-lg font-bold text-emerald-700">{currencySymbol}{savings.toLocaleString()}/year</p>
                        </div>
                    )}

                    <p className="text-xs text-slate-500 text-center">
                        {t('subscription.plans.proratedNote')}
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 h-11 py-2.5 rounded-xl font-semibold border border-slate-200 text-slate-500 hover:bg-gray-50 transition-colors"
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 h-11 py-2.5 rounded-xl font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors"
                    >
                        {t('subscription.plans.confirmSwitch')}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Features Banner ─────────────────────────────────────────────────────────

function FeaturesBanner({ banners }: { banners: PricingFeatureBanner[] }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 mt-4 md:mt-8 mb-6 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                {banners.map((feature, idx) => {
                    const Icon = IconMap[feature.iconName] || Shield;
                    return (
                        <div key={feature.id} className={`flex items-start gap-4 pt-4 md:pt-0 pl-0 md:pl-4 ${idx === 0 ? 'first:pt-0 first:pl-0' : ''}`}>
                            <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center ${feature.bg} ${feature.color}`}>
                                <Icon className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-slate-900 mb-1">{feature.title}</h4>
                                <p className="text-xs text-slate-500">{feature.description}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Why Churches Upgrade ────────────────────────────────────────────────────

const WHY_UPGRADE_REASONS = [
    {
        icon: Clock,
        headline: 'You\'re spending 4+ hours a week on sermon prep',
        before: 'Manually typing scriptures, formatting lower thirds, importing media one by one.',
        after: 'Speech-to-Scripture auto-detects every verse. Media imports in bulk. Lower thirds update live.',
    },
    {
        icon: Users,
        headline: 'Your congregation speaks multiple languages',
        before: 'Running a separate service or providing printed translations for non-English speakers.',
        after: 'Live Translation lets everyone hear the sermon in their own language — in real time.',
    },
    {
        icon: Smartphone,
        headline: 'Your media team is stuck behind a desk',
        before: 'Only one person can control the media, and they have to stay at the computer.',
        after: 'Any team member can control slides, songs, and countdowns from their phone — from anywhere in the building.',
    },
    {
        icon: Layout,
        headline: 'Your broadcast looks like a slideshow',
        before: 'Basic text overlays with no camera switching, no tickers, no professional polish.',
        after: 'Multi-view layouts, animated tickers, countdown timers — broadcast-quality production without a production degree.',
    },
];

function WhyChurchesUpgrade() {
    return (
        <div className="mt-4 md:mt-8 mb-6">
            <div className="text-center mb-8">
                <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-3">Why Churches Upgrade</h2>
                <p className="text-slate-500 text-base max-w-lg mx-auto">
                    Most churches hit a ceiling with their current setup. Here's what changes when you level up.
                </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {WHY_UPGRADE_REASONS.map((reason, idx) => {
                    const Icon = reason.icon;
                    return (
                        <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                                    <Icon className="w-5 h-5 text-blue-600" />
                                </div>
                                <h3 className="font-bold text-sm text-slate-900 leading-snug">{reason.headline}</h3>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-start gap-2">
                                    <span className="text-red-400 text-xs font-bold mt-0.5">BEFORE</span>
                                    <p className="text-xs text-slate-500 leading-relaxed">{reason.before}</p>
                                </div>
                                <div className="flex items-start gap-2">
                                    <span className="text-emerald-500 text-xs font-bold mt-0.5">AFTER</span>
                                    <p className="text-xs text-slate-700 font-medium leading-relaxed">{reason.after}</p>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function NewPlansPage() {
    const t = useTranslations();
    const { plan: authPlan, planLabel, planConfig, user, mongoUser, subscription, isOnTrial, trialDaysLeft, trialEndsAt, loading: subLoading } = useSubscription();
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('yearly');
    const { pricing: countryPricing, loading: pricingLoading, currency: countryCurrency, currencySymbol, setRegion, manualRegion, detectedCountry } = useCountryPricing();
    const [pricingPlans, setPricingPlans] = useState<PricingPlanConfig[]>([]);
    const [featureBanners, setFeatureBanners] = useState<PricingFeatureBanner[]>([]);
    const [loading, setLoading] = useState(true);

    // Billing cycle switch modal
    const [switchModal, setSwitchModal] = useState(false);

    // Payment state
    const [emailModal, setEmailModal] = useState<{ open: boolean; plan: PricingPlanConfig | null; amountInSubunit: number; billingCycle?: BillingCycle }>({ open: false, plan: null, amountInSubunit: 0 });
    const [emailInput, setEmailInput] = useState('');
    const [paymentStatus, setPaymentStatus] = useState<'idle' | 'verifying' | 'success' | 'error'>('idle');
    const [paymentError, setPaymentError] = useState('');
    const [purchasedPlan, setPurchasedPlan] = useState<PricingPlanConfig | null>(null);
    const [earlyAccessOffer, setEarlyAccessOffer] = useState<EarlyAccessOffer | null>(null);
    const autoCheckoutStartedRef = useRef(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const config = await getPlanConfig();
                if (!cancelled) {
                    setPricingPlans(config.pricingPlans || []);
                    setFeatureBanners(config.featureBanners || []);
                }
            } catch { /* empty */ } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch('/api/payments/early-access-offer', { credentials: 'include' });
                if (!res.ok) return;
                const offer = await res.json();
                if (!cancelled) setEarlyAccessOffer(offer);
            } catch { /* empty */ }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleUpgrade = useCallback((plan: PricingPlanConfig) => {
        const amount = getCountryPlanPrice(countryPricing, plan.id, billingCycle);
        if (isNaN(amount) || amount <= 0) {
            setPaymentStatus('error');
            setPaymentError(t('subscription.plans.invalidPricing'));
            return;
        }
        const amountInSubunit = Math.round(amount * 100);
        if (!user?.email) {
            setEmailModal({ open: true, plan, amountInSubunit, billingCycle });
            setEmailInput('');
            setPaymentStatus('idle');
            setPaymentError('');
            return;
        }
        proceedToPayment(plan, amountInSubunit, user.email, billingCycle);
    }, [billingCycle, countryPricing, user]);

    const proceedToPayment = useCallback(async (plan: PricingPlanConfig, _amountInSubunit: number, email: string, cycle: BillingCycle = billingCycle) => {
        try {
            setPaymentStatus('verifying');
            setPaymentError('');
            const res = await fetch('/api/payments/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: plan.id, billingCycle: cycle, email }),
            });
            const data = await res.json();

            if (!res.ok || !data?.authorization_url || !data?.reference) {
                setPaymentStatus('error');
                setPaymentError(data?.error || t('subscription.plans.couldNotVerify'));
                return;
            }

            try {
                localStorage.setItem('mce_pending_payment', JSON.stringify({
                    reference: data.reference,
                    planId: plan.id,
                    billingCycle: cycle,
                }));
            } catch { /* best-effort */ }

            window.location.href = data.authorization_url;
        } catch {
            setPaymentStatus('error');
            setPaymentError(t('subscription.plans.couldNotVerify'));
        }
    }, [billingCycle, t]);

    useEffect(() => {
        if (autoCheckoutStartedRef.current) return;
        if (loading || subLoading || pricingLoading || pricingPlans.length === 0) return;
        if (typeof window === 'undefined') return;

        const params = new URLSearchParams(window.location.search);
        const checkoutPlanId = params.get('checkout')?.trim().toLowerCase();
        if (!checkoutPlanId) return;

        const currentPaidPlan = (mongoUser?.plan || user?.plan || 'free').toLowerCase();
        if (subscription?.status === 'active' && currentPaidPlan !== 'free') return;

        const cycleParam = params.get('billingCycle')?.trim().toLowerCase();
        const checkoutCycle: BillingCycle =
            cycleParam === 'yearly' || cycleParam === 'monthly' || cycleParam === 'lifetime'
                ? cycleParam
                : 'monthly';

        const checkoutPlan =
            pricingPlans.find((plan) => plan.id.toLowerCase() === checkoutPlanId) ||
            pricingPlans.find((plan) => plan.id === 'growth');

        if (!checkoutPlan) return;

        autoCheckoutStartedRef.current = true;
        setBillingCycle(checkoutCycle);

        const amount = getCountryPlanPrice(countryPricing, checkoutPlan.id, checkoutCycle);
        if (isNaN(amount) || amount <= 0) {
            setPaymentStatus('error');
            setPaymentError(t('subscription.plans.invalidPricing'));
            return;
        }

        const amountInSubunit = Math.round(amount * 100);
        if (!user?.email) {
            setEmailModal({ open: true, plan: checkoutPlan, amountInSubunit, billingCycle: checkoutCycle });
            setEmailInput('');
            setPaymentStatus('idle');
            setPaymentError('');
            return;
        }

        proceedToPayment(checkoutPlan, amountInSubunit, user.email, checkoutCycle);
    }, [
        countryPricing,
        loading,
        mongoUser?.plan,
        pricingLoading,
        pricingPlans,
        proceedToPayment,
        subLoading,
        subscription?.status,
        t,
        user?.email,
        user?.plan,
    ]);

    const handleEmailSubmit = useCallback(() => {
        const email = emailInput.trim();
        if (!email || !emailModal.plan) return;
        proceedToPayment(emailModal.plan, emailModal.amountInSubunit, email, emailModal.billingCycle || billingCycle);
        setEmailModal({ open: false, plan: null, amountInSubunit: 0 });
    }, [emailInput, emailModal, proceedToPayment]);

    const handleEarlyAccessPayment = useCallback(() => {
        const proPlan = pricingPlans.find((plan) => plan.id === 'pro');
        if (!proPlan || !earlyAccessOffer?.eligible || !earlyAccessOffer.enabled) return;
        const amountInSubunit = Math.round(earlyAccessOffer.price * 100);
        if (!user?.email) {
            setEmailModal({ open: true, plan: proPlan, amountInSubunit, billingCycle: 'lifetime' });
            setEmailInput('');
            return;
        }
        proceedToPayment(proPlan, amountInSubunit, user.email, 'lifetime');
    }, [earlyAccessOffer, pricingPlans, proceedToPayment, user]);

    const currentPlan = pricingPlans.find(p => p.id === authPlan) || null;
    const purchasedPlanId = (mongoUser?.plan || user?.plan || 'free').toLowerCase();
    const trialPlanId = isOnTrial
        ? (subscription?.plan || authPlan || 'growth').toLowerCase()
        : null;
    const hasActivePaidSubscription = subscription?.status === 'active' && purchasedPlanId !== 'free';

    const comparisonPlanId = hasActivePaidSubscription
        ? purchasedPlanId
        : (trialPlanId || purchasedPlanId);

    const comparisonIndex = useMemo(() => {
        return pricingPlans.findIndex(p => p.id === comparisonPlanId);
    }, [pricingPlans, comparisonPlanId]);

    const currentPlanTierCredits = planConfig?.plans?.[authPlan || 'free']?.credits ?? 0;

    if (loading || subLoading || pricingLoading) {
        return (
            <div className="text-slate-900 min-h-screen pt-4 pb-16 md:py-8 font-sans flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
            </div>
        );
    }

    if (pricingPlans.length === 0) {
        return (
            <div className="text-slate-900 min-h-screen pt-4 pb-16 md:py-8 font-sans flex items-center justify-center">
                <p className="text-slate-500">{t('subscription.plans.noPricingPlans')}</p>
            </div>
        );
    }

    return (
        <div className="text-slate-900 min-h-screen pt-4 px-4 md:px-16 pb-16 md:py-8 font-sans">
            <Breadcrumb />
            <main className="max-w-7xl mx-auto px-4 md:px-0">

                {/* ─── Current Subscription (first thing users see) ─── */}


                {/* ─── Comparison Header ─── */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl md:text-4xl font-bold mb-3">
                        {t('subscription.plans.comparePlans')}
                    </h1>
                    <p className="text-slate-500 text-base max-w-lg mx-auto">
                        {t('subscription.plans.compareDescription')}
                    </p>
                </div>

                {/* ─── Billing Cycle Toggle ─── */}
                <div className="flex flex-wrap items-center justify-center gap-6 mb-4">
                    <div className="inline-flex bg-white rounded-full p-1 border border-slate-200 items-center shadow-sm">
                        <button
                            onClick={() => setBillingCycle('monthly')}
                            className={`px-6 h-11 py-2 rounded-full font-medium text-sm transition-colors ${billingCycle === 'monthly' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            {t('subscription.plans.monthlyBilling')}
                        </button>
                        <button
                            onClick={() => setBillingCycle('yearly')}
                            className={`px-6 h-11 py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-2 ${billingCycle === 'yearly' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-500 hover:text-slate-900'}`}
                        >
                            {t('subscription.plans.yearlyBilling')} <span className="bg-green-100 text-emerald-600 text-xs font-bold px-2 py-0.5 rounded-full">{t('subscription.plans.save20')}</span>
                        </button>
                    </div>

                    {/* Region selector */}
                    <div className="inline-flex items-center gap-2">
                      <select
                        value={countryPricing.region || 'global'}
                        onChange={(e) => setRegion(e.target.value)}
                        className="h-11 px-4 rounded-full bg-white border border-slate-200 shadow-sm text-sm font-medium text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        aria-label="Pricing region"
                      >
                        <option value="nigeria">Nigeria · ₦</option>
                        <option value="africa">Africa · $</option>
                        <option value="global">Global · $</option>
                      </select>
                      {countryPricing.detectedCountry && !manualRegion && (
                        <span className="text-[11px] text-slate-400 font-medium">
                          Detected: {countryPricing.detectedCountry}
                        </span>
                      )}
                    </div>
                </div>

                {/* Toggle helper text */}
                <p className="text-center text-xs text-slate-500 mb-8">
                    {t('subscription.plans.priceComparisonOnly', { plan: subscription?.billingCycle || 'monthly' })}
                </p>

                {earlyAccessOffer?.enabled && earlyAccessOffer.eligible && (
                    <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                                <Sparkles className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-base font-bold text-slate-900">{earlyAccessOffer.offerName}</h2>
                                <p className="text-sm text-slate-600 mt-1">{earlyAccessOffer.description}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 md:shrink-0">
                            <div className="text-right">
                                <p className="text-2xl font-bold text-slate-900">
                                    {formatCountryPrice(earlyAccessOffer.price, earlyAccessOffer.currencySymbol)}
                                </p>
                                <p className="text-xs text-slate-500">one-time payment</p>
                            </div>
                            <button
                                onClick={handleEarlyAccessPayment}
                                className="h-11 px-5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition-colors"
                            >
                                Get Lifetime
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── Pricing Grid ─── */}
                <div className="pricing-grid-wrapper overflow-x-auto pb-8 -mx-4 px-4 sm:mx-0 sm:px-0">
                    <div className="flex flex-nowrap lg:grid lg:grid-cols-3 gap-4 md:gap-6 min-w-max lg:min-w-0 md:px-0 px-2 pt-4">
                        {pricingPlans.map((plan, idx) => (
                            <PricingCard
                                key={plan.id}
                                plan={plan}
                                billingCycle={billingCycle}
                                countryPricing={countryPricing}
                                onUpgrade={handleUpgrade}
                                subscriptionBillingCycle={subscription?.billingCycle}
                                currentPlanCredits={currentPlanTierCredits}
                                planRelationship={
                                    plan.id === 'free'
                                        ? 'free'
                                        : isOnTrial && plan.id === trialPlanId
                                            ? 'trial'
                                            : hasActivePaidSubscription && plan.id === purchasedPlanId
                                                ? 'current'
                                                : isOnTrial
                                                    ? 'upgrade'
                                                    : comparisonIndex === -1
                                                        ? 'upgrade'
                                                        : idx === comparisonIndex
                                                            ? 'current'
                                                            : idx > comparisonIndex
                                                                ? 'upgrade'
                                                                : 'downgrade'
                                }
                            />
                        ))}
                    </div>
                </div>

                {/* Features Banner */}
                {featureBanners.length > 0 && <FeaturesBanner banners={featureBanners} />}

                {/* Why Churches Upgrade */}
                <WhyChurchesUpgrade />

                {/* Footer */}
                <div className="text-center text-slate-500 text-sm font-medium pb-12 flex items-center justify-center gap-2 mt-8">
                    <Lock className="w-4 h-4" />
                    {t('subscription.plans.cancelAnytime')}
                </div>
            </main>

            {/* ─── Billing Cycle Switch Modal ─── */}
            <BillingCycleModal
                open={switchModal}
                onClose={() => setSwitchModal(false)}
                onConfirm={() => {
                    setSwitchModal(false);
                    // TODO: integrate with billing cycle change API
                }}
                planName={planLabel}
                monthlyPrice={currentPlan ? formatCountryPrice(getCountryPlanPrice(countryPricing, currentPlan.id, 'monthly'), countryPricing.currencySymbol) : `${countryPricing.currencySymbol}0`}
                yearlyPrice={currentPlan ? formatCountryPrice(getCountryPlanPrice(countryPricing, currentPlan.id, 'yearly'), countryPricing.currencySymbol) : `${countryPricing.currencySymbol}0`}
                currencySymbol={countryPricing.currencySymbol}
            />

            {/* ─── Email prompt modal ─── */}
            {emailModal.open && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-xl mx-4">
                        <h3 className="text-xl font-bold text-slate-900 mb-2">{t('subscription.plans.emailPrompt')}</h3>
                        <p className="text-slate-500 text-sm mb-6">
                            {t('subscription.plans.emailDescription', { plan: emailModal.plan?.name || '' })}
                        </p>
                        <input
                            type="email"
                            value={emailInput}
                            onChange={e => setEmailInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleEmailSubmit()}
                            placeholder={t('subscription.plans.emailPlaceholder')}
                            autoFocus
                            className="w-full h-11 px-4 py-2.5 text-sm rounded-lg border border-slate-200 text-slate-900 placeholder:text-slate-500/50 focus:outline-none focus:ring-2 focus:ring-blue-600/25 focus:border-blue-600 mb-4"
                        />
                        {paymentError && <p className="text-red-500 text-sm mb-4">{paymentError}</p>}
                        <div className="flex gap-3">
                            <button
                                onClick={() => setEmailModal({ open: false, plan: null, amountInSubunit: 0 })}
                                className="flex-1 h-11 py-2.5 rounded-xl font-semibold border border-slate-200 text-slate-500 hover:bg-gray-50 transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleEmailSubmit}
                                disabled={!emailInput.trim()}
                                className="flex-1 h-11 py-2.5 rounded-xl font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {t('subscription.plans.continueToPayment')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── Verifying overlay ─── */}
            {paymentStatus === 'verifying' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white">
                    <div className="text-center">
                        <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-6">
                            <Loader2 className="w-8 h-8 text-blue-700 animate-spin" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">{t('subscription.plans.verifyingPayment')}</h2>
                        <p className="text-slate-500 text-sm">{t('subscription.plans.verifyingDescription')}</p>
                    </div>
                </div>
            )}

            {/* ─── Success page ─── */}
            {paymentStatus === 'success' && purchasedPlan && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white">
                    <div className="text-center max-w-lg mx-4">
                        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-8 success-check">
                            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                        </div>
                        <p className="text-blue-700 text-sm font-semibold uppercase tracking-wider mb-3">{t('subscription.plans.paymentConfirmed')}</p>
                        <h1 className="text-4xl font-bold text-slate-900 mb-3">
                            {t('subscription.plans.welcomeToPlan', { plan: purchasedPlan.name })}
                        </h1>
                        <p className="text-slate-500 text-base mb-8 max-w-sm mx-auto">
                            {t('subscription.plans.ministryLeveledUp')}
                        </p>
                        <div className="bg-gray-50 rounded-2xl p-6 mb-8 text-left">
                            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
                                {t('subscription.plans.whatYouUnlocked', { defaultValue: "What you've unlocked" })}
                            </h3>
                            <ul className="space-y-3">
                                {purchasedPlan.features.slice(0, 8).map((feature, idx) => (
                                    <li key={idx} className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                        </div>
                                        <span className="text-sm text-slate-700">
                                            {feature.prefixHighlight && <span className="font-semibold">{feature.prefixHighlight} </span>}
                                            {feature.text}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="flex items-center justify-center gap-6 text-sm text-slate-500 mb-8">
                            <div className="text-center">
                                <p className="font-bold text-slate-900 text-lg">{formatCountryPrice(getCountryPlanPrice(countryPricing, purchasedPlan.id, billingCycle), countryPricing.currencySymbol)}</p>
                                <p className="text-xs">{billingCycle === 'yearly' ? t('subscription.plans.perYear') : t('subscription.plans.perMonth')}</p>
                            </div>
                            <div className="w-px h-8 bg-gray-200" />
                            <div className="text-center">
                                <p className="font-bold text-slate-900 text-lg">{billingCycle === 'yearly' ? t('subscription.plans.yearlyBilling') : t('subscription.plans.monthlyBilling')}</p>
                                <p className="text-xs">{t('subscription.plans.billingCycle')}</p>
                            </div>
                        </div>
                        <button
                            onClick={() => { setPaymentStatus('idle'); setPurchasedPlan(null); window.location.href = '/'; }}
                            className="px-8 h-11 py-2.5 rounded-xl font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors text-sm"
                        >
                            {t('subscription.plans.goToDashboard')}
                        </button>
                    </div>
                </div>
            )}

            {/* ─── Error overlay ─── */}
            {paymentStatus === 'error' && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-white">
                    <div className="text-center max-w-md mx-4">
                        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-6">
                            <Shield className="w-8 h-8 text-red-500" />
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 mb-2">Payment verification failed</h2>
                        <p className="text-slate-500 text-sm mb-8">
                            {paymentError || 'Something went wrong while verifying your payment. Your card was not charged.'}
                        </p>
                        <div className="flex gap-3 justify-center">
                            <button
                                onClick={() => { setPaymentStatus('idle'); setPaymentError(''); setPurchasedPlan(null); }}
                                className="px-6 h-11 py-2.5 rounded-xl font-semibold border border-slate-200 text-slate-500 hover:bg-gray-50 transition-colors text-sm"
                            >
                                Go Back
                            </button>
                            <button
                                onClick={() => {
                                    const plan = purchasedPlan;
                                    setPaymentStatus('idle'); setPaymentError(''); setPurchasedPlan(null);
                                    if (plan) handleUpgrade(plan);
                                }}
                                className="px-6 h-11 py-2.5 rounded-xl font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors text-sm"
                            >
                                Try Again
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
