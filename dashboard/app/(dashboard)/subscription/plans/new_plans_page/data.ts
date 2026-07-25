import React from 'react';
import { Gift, Leaf, Star, TrendingUp, Crown, Music, Monitor, Globe2, Shield } from 'lucide-react';

export type TranslationFunction = (key: string, values?: Record<string, any>) => string;

export type Currency = 'NGN' | 'USD';
export type BillingCycle = 'monthly' | 'yearly';

export interface PlanFeature {
    text: string;
    prefixHighlight?: string;
}

export interface PricingPlan {
    id: string;
    name: string;
    target: string;
    iconName: string;
    styles: {
        iconBg: string;
        iconColor: string;
        border: string;
        button: string;
        buttonHover: string;
        popular?: boolean;
        popularBadgeBg?: string;
        checkColor: string;
    };
    pricing: {
        NGN: { monthly: string; originalMonthly?: string; yearly: string; originalYearly?: string };
        USD: { monthly: string; originalMonthly?: string; yearly: string; originalYearly?: string };
    };
    features: PlanFeature[];
    buttonText: string;
}

export const IconMap: Record<string, React.ElementType> = {
    gift: Gift,
    leaf: Leaf,
    star: Star,
    chart: TrendingUp,
    crown: Crown,
    music: Music,
    desktop: Monitor,
    language: Globe2,
    shield: Shield,
};

export function getPlansData(t: TranslationFunction): PricingPlan[] {
    return [
        {
            id: 'free',
            name: t('subscription.data.plans.free.name'),
            target: t('subscription.data.plans.free.target'),
            iconName: 'gift',
            styles: {
                iconBg: 'bg-brand-lightBlue',
                iconColor: 'text-brand-purple',
                border: 'border-brand-border',
                button: 'text-brand-purple bg-brand-lightBlue',
                buttonHover: 'hover:bg-indigo-100',
                checkColor: 'text-brand-purple'
            },
            pricing: {
                NGN: { monthly: '₦0', yearly: '₦0' },
                USD: { monthly: '$0', yearly: '$0' }
            },
            features: [
                { text: 'Try basic features with 3 songs and 1 theme' },
                { text: '10 AI credits to test Speech-to-Scripture' },
                { text: 'Run on 1 device with 4 Bible versions' },
                { text: 'No credit card required' },
            ],
            buttonText: t('subscription.plans.currentPlanBadge')
        },
        {
            id: 'basic',
            name: t('subscription.data.plans.basic.name'),
            target: t('subscription.data.plans.basic.target'),
            iconName: 'leaf',
            styles: {
                iconBg: 'bg-blue-50',
                iconColor: 'text-brand-blue',
                border: 'border-brand-border',
                button: 'text-brand-blue border border-brand-blue',
                buttonHover: 'hover:bg-blue-50',
                checkColor: 'text-brand-blue'
            },
            pricing: {
                NGN: { monthly: '₦3,000', originalMonthly: '₦4,000', yearly: '₦30,000', originalYearly: '₦40,000' },
                USD: { monthly: '$1.67', yearly: '$16.67' }
            },
            features: [
                { text: 'Add Lower Thirds & Tickers to your sermon' },
                { text: 'Upload 30 songs, 20 images, and 10 videos' },
                { text: 'Run on 1 device with 4 Bible versions' },
                { text: '50 AI credits per month for Speech-to-Scripture' },
                { text: 'Community support to get you started' },
            ],
            buttonText: t('subscription.plans.choosePlan', { plan: t('subscription.data.plans.basic.name') })
        },
        {
            id: 'growth',
            name: t('subscription.data.plans.growth.name'),
            target: t('subscription.data.plans.growth.target'),
            iconName: 'chart',
            styles: {
                iconBg: 'bg-green-50',
                iconColor: 'text-brand-green',
                border: 'border-brand-purple border-2',
                button: 'text-white bg-brand-green shadow-md',
                buttonHover: 'hover:bg-green-600',
                popular: true,
                popularBadgeBg: 'bg-brand-purple',
                checkColor: 'text-brand-green'
            },
            pricing: {
                NGN: { monthly: '₦15,000', yearly: '₦150,000' },
                USD: { monthly: '$10.00', yearly: '$100.00' }
            },
            features: [
                { text: 'Everything in Basic, plus:' },
                { text: 'Unlimited devices and multi-view layouts' },
                { text: 'Advanced analytics and custom reports' },
                { text: 'Cloud storage for your entire media library' },
                { text: 'Priority support for your team' },
            ],
            buttonText: t('subscription.plans.choosePlan', { plan: t('subscription.data.plans.growth.name') })
        },
        {
            id: 'pro',
            name: t('subscription.data.plans.pro.name'),
            target: t('subscription.data.plans.pro.target'),
            iconName: 'crown',
            styles: {
                iconBg: 'bg-yellow-50',
                iconColor: 'text-brand-yellow',
                border: 'border-brand-border border',
                button: 'text-brand-yellow border border-brand-yellow',
                buttonHover: 'hover:bg-yellow-50',
                checkColor: 'text-brand-yellow'
            },
            pricing: {
                NGN: { monthly: '₦34,000', yearly: '₦340,000' },
                USD: { monthly: '$22.67', yearly: '$226.67' }
            },
            features: [
                { text: 'Everything in Growth, plus:' },
                { text: 'Unlimited AI credits — never hit a limit' },
                { text: '200 GB cloud storage for your media library' },
                { text: 'Custom reports and full API access' },
                { text: 'Team & multi-campus management' },
                { text: 'Dedicated onboarding and priority support' },
            ],
            buttonText: t('subscription.plans.choosePlan', { plan: t('subscription.data.plans.pro.name') })
        }
    ];
}

export function getFeaturesBannerData(t: TranslationFunction) {
    return [
        {
            id: 'time',
            title: 'Save Hours Every Week',
            description: 'Automate sermon prep with AI transcription, scripture lookup, and media import.',
            iconName: 'clock',
            bg: 'bg-purple-50',
            color: 'text-purple-600'
        },
        {
            id: 'production',
            title: 'Broadcast-Quality Production',
            description: 'Lower thirds, tickers, countdowns, and multi-view — without the learning curve.',
            iconName: 'desktop',
            bg: 'bg-blue-50',
            color: 'text-blue-600'
        },
        {
            id: 'reach',
            title: 'Reach Every Language',
            description: 'Live translation turns one sermon into a multilingual experience for your whole congregation.',
            iconName: 'language',
            bg: 'bg-green-50',
            color: 'text-green-600'
        },
        {
            id: 'control',
            title: 'Control From Anywhere',
            description: 'Run your media from your phone, tablet, or any device — no desk required.',
            iconName: 'shield',
            bg: 'bg-amber-50',
            color: 'text-amber-600'
        }
    ];
}
