/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { useLocalizedPricing } from '@/lib/useLocalizedPricing';

// ==========================================
// TYPES & INTERFACES
// ==========================================
export type CurrencyRegion = 'ngn' | 'africa' | 'global';
export type BillingCycle = 'monthly' | 'yearly';
export type ActiveTab = 'overview' | 'compare' | 'billing' | 'history' | 'settings' | 'support';

export interface FeatureComparisonRow {
    name: string;
    basic: string | boolean;
    growth: string | boolean;
    pro: string | boolean;
}

export interface FeatureGroup {
    category: string;
    rows: FeatureComparisonRow[];
}

export interface Invoice {
    id: string;
    date: string;
    planName: string;
    amount: string;
    status: 'Paid' | 'Processing' | 'Refunded';
    pdfUrl: string;
}

export interface CaseStudy {
    title: string;
    churchName: string;
    location: string;
    attendance: string;
    summary: string;
    quote: string;
    quoteAuthor: string;
    stats: { label: string; value: string }[];
}

// ==========================================
// DATA & CONSTANTS
// ==========================================
export const REGION_CURRENCIES = {
    ngn: {
        code: 'NGN',
        symbol: '₦',
        label: 'Nigeria · NGN',
        basic: {
            monthly: { main: '₦3,500', sub: '₦3,500 first month, then ₦4,000/mo', raw: 3500, introRaw: 3500 },
            yearly: { main: '₦40,000', sub: 'Billed ₦40,000 annually (Save 2 months)', raw: 40000 },
        },
        growth: {
            monthly: { main: '₦7,500', sub: '₦7,500 first month, then ₦8,000/mo', raw: 7500, introRaw: 7500 },
            yearly: { main: '₦80,000', sub: 'Billed ₦80,000 annually (Save 2 months)', raw: 80000 },
        },
        pro: {
            monthly: { main: '₦12,000', sub: 'Recurring monthly billing', raw: 12000 },
            yearly: { main: '₦120,000', sub: 'Billed ₦120,000 annually (Save 2 months)', raw: 120000 },
        }
    },
    africa: {
        code: 'USD',
        symbol: '$',
        label: 'Africa · USD',
        basic: {
            monthly: { main: '$3', sub: '$3 first month, then $4/mo', raw: 3, introRaw: 3 },
            yearly: { main: '$40', sub: 'Billed $40 annually (Save 2 months)', raw: 40 },
        },
        growth: {
            monthly: { main: '$6', sub: '$6 first month, then $8/mo', raw: 6, introRaw: 6 },
            yearly: { main: '$80', sub: 'Billed $80 annually (Save 2 months)', raw: 80 },
        },
        pro: {
            monthly: { main: '$12', sub: '$12/month', raw: 12 },
            yearly: { main: '$120', sub: 'Billed $120 annually (Save 2 months)', raw: 120 },
        }
    },
    global: {
        code: 'USD',
        symbol: '$',
        label: 'Global · USD',
        basic: {
            monthly: { main: '$4', sub: '$4 first month, then $5/mo', raw: 4, introRaw: 4 },
            yearly: { main: '$50', sub: 'Billed $50 annually (Save 2 months)', raw: 50 },
        },
        growth: {
            monthly: { main: '$8', sub: '$8 first month, then $10/mo', raw: 8, introRaw: 8 },
            yearly: { main: '$100', sub: 'Billed $100 annually (Save 2 months)', raw: 100 },
        },
        pro: {
            monthly: { main: '$15', sub: '$15/month', raw: 15 },
            yearly: { main: '$150', sub: 'Billed $150 annually (Save 2 months)', raw: 150 },
        }
    }
};

export const COMPARISON_FEATURES: FeatureGroup[] = [
    {
        category: 'Core Production',
        rows: [
            { name: 'Bibles & Scripture (10+ versions)', basic: true, growth: true, pro: true },
            { name: 'Worship Lyrics Search & Auto-Sync', basic: true, growth: true, pro: true },
            { name: 'Custom Background Media Library', basic: true, growth: true, pro: true },
            { name: 'Stage Display & Lower Thirds', basic: true, growth: true, pro: true },
            { name: 'Slideshow & Countdowns', basic: true, growth: true, pro: true },
        ]
    },
    {
        category: 'AI & Credits',
        rows: [
            { name: 'Monthly AI Credits', basic: '300/mo', growth: '1,000/mo', pro: '3,000/mo' },
            { name: 'Speech-to-Scripture', basic: false, growth: '1 credit/min', pro: '1 credit/min' },
            { name: 'Live Translation', basic: false, growth: '2 credits/min', pro: '2 credits/min' },
            { name: 'AI Sermon Summary', basic: false, growth: '5 credits', pro: '5 credits' },
        ]
    },
    {
        category: 'Content & Storage',
        rows: [
            { name: 'Songs', basic: '50', growth: 'Unlimited', pro: 'Unlimited' },
            { name: 'Images', basic: '50', growth: 'Unlimited', pro: 'Unlimited' },
            { name: 'Videos', basic: '50', growth: 'Unlimited', pro: 'Unlimited' },
            { name: 'Bible Versions', basic: '10', growth: 'Unlimited', pro: 'Unlimited' },
            { name: 'Cloud Sync', basic: false, growth: true, pro: true },
            { name: 'Cloud Storage', basic: 'None', growth: '20 GB', pro: '200 GB' },
        ]
    },
    {
        category: 'Import & Export',
        rows: [
            { name: 'Bulk / Mass Import', basic: false, growth: true, pro: true },
            { name: 'EasyWorship Import', basic: false, growth: true, pro: true },
            { name: 'ProPresenter Import', basic: false, growth: true, pro: true },
            { name: 'Sermon Export', basic: false, growth: true, pro: true },
        ]
    },
    {
        category: 'Mobile & Presentation',
        rows: [
            { name: 'Android App Control', basic: false, growth: 'Basic', pro: 'Full Remote' },
            { name: 'Presentation Mode', basic: false, growth: '2-Laptop Mode', pro: 'Multi-Display' },
            { name: 'Devices', basic: '3', growth: '10', pro: '10' },
            { name: 'Team Members', basic: '5', growth: '20', pro: '20' },
        ]
    },
    {
        category: 'Support & Advanced',
        rows: [
            { name: 'Priority Support', basic: false, growth: false, pro: true },
            { name: 'Advanced Analytics', basic: false, growth: false, pro: true },
            { name: 'API Access', basic: false, growth: false, pro: true },
            { name: 'Campus Management', basic: false, growth: false, pro: true },
            { name: 'Early Access Features', basic: false, growth: false, pro: true },
        ]
    }
];

export const SAMPLE_INVOICES: Invoice[] = [
    {
        id: 'INV-2026-004',
        date: 'Jul 01, 2026',
        planName: 'Basic Plan (Monthly)',
        amount: '₦3,500',
        status: 'Paid',
        pdfUrl: '#'
    },
    {
        id: 'INV-2026-003',
        date: 'Jun 01, 2026',
        planName: 'Basic Plan (Monthly)',
        amount: '₦3,500',
        status: 'Paid',
        pdfUrl: '#'
    },
    {
        id: 'INV-2026-002',
        date: 'May 01, 2026',
        planName: 'Basic Plan (Monthly)',
        amount: '₦3,500',
        status: 'Paid',
        pdfUrl: '#'
    },
    {
        id: 'INV-2026-001',
        date: 'Apr 01, 2026',
        planName: 'Trial Credits Top-up',
        amount: '₦1,000',
        status: 'Paid',
        pdfUrl: '#'
    }
];

export const CASE_STUDIES: CaseStudy[] = [
    {
        title: 'Scaling Multi-Campus Sunday Worship Across 5 Locations',
        churchName: 'Grace City Church',
        location: 'Lagos, Nigeria',
        attendance: '12,000+ Weekly Members',
        summary: 'By upgrading to ChurchFlow Pro Ambassador tier, Grace City seamless synchronized 18 laptops and live translated 3 languages in real-time during Sunday services.',
        quote: 'ChurchFlow Pro eliminated our presentation lag and simplified worship lyrics transitions across all our satellite campuses.',
        quoteAuthor: 'Pastor David O. - Executive Media Director',
        stats: [
            { label: 'Latency Reduction', value: '85%' },
            { label: 'Media Production Time Saved', value: '14 hrs/wk' },
            { label: 'Live Translation Accuracy', value: '98.4%' }
        ]
    },
    {
        title: 'Streamlining Broadcast Graphics for Television Ministry',
        churchName: 'Redeemed Heritage Ministry',
        location: 'Accra, Ghana',
        attendance: '5,000+ In-person & Online',
        summary: 'Using Pro Android remote controllers and NDI integration, the media team cut setup time down from 2 hours to 15 minutes before broadcast.',
        quote: 'The Android remote control allows our lead operator to switch scriptures and lyrics from anywhere in the auditorium.',
        quoteAuthor: 'Sarah A. - Lead Media Specialist',
        stats: [
            { label: 'Setup Speedup', value: '8x Faster' },
            { label: 'Volunteer Onboarding Time', value: '10 Mins' }
        ]
    }
];

// ==========================================
// HEADER COMPONENT
// ==========================================
const Header: React.FC<{
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
    churchName?: string;
    adminName?: string;
}> = ({
    activeTab,
    setActiveTab,
    churchName = 'Grace Cathedral',
    adminName = 'Admin Console'
}) => {
        const [profileOpen, setProfileOpen] = useState(false);

        const navItems: { id: ActiveTab; label: string }[] = [
            { id: 'overview', label: 'Overview' },
            { id: 'compare', label: 'Compare Plans' },
            { id: 'billing', label: 'Billing' },
            { id: 'history', label: 'History' },
            { id: 'settings', label: 'Settings' }
        ];

        return (
            <header className="w-full top-0 bg-[#0F172A] border-b border-[#334155] z-50 fixed shadow-xs" id="main-header">
                <div className="flex justify-between items-center w-full px-4 sm:px-6 max-w-[1000px] mx-auto h-16">
                    {/* Brand Logo */}
                    <div
                        onClick={() => setActiveTab('overview')}
                        className="flex items-center gap-2 cursor-pointer active:opacity-80 transition-opacity"
                        id="brand-logo"
                    >
                        <span className="material-symbols-outlined text-[#F8FAFC] text-[32px] font-semibold">church</span>
                        <span className="font-['Geist'] text-[22px] sm:text-[24px] font-bold text-[#F8FAFC] tracking-tight">
                            ChurchFlow Pro
                        </span>
                    </div>

                    {/* Desktop Nav Tabs */}
                    <nav className="hidden md:flex items-center gap-8 h-full" id="desktop-nav">
                        {navItems.map((item) => {
                            const isActive = activeTab === item.id;
                            return (
                                <button
                                    key={item.id}
                                    id={`nav-tab-${item.id}`}
                                    onClick={() => setActiveTab(item.id)}
                                    className={`h-full flex items-center px-1 text-sm font-medium transition-colors duration-200 relative cursor-pointer ${isActive
                                        ? 'text-[#F8FAFC] font-bold border-b-2 border-[#1D4ED8]'
                                        : 'text-[#CBD5E1] hover:text-[#1D4ED8]'
                                        }`}
                                >
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>

                    {/* Admin Profile & Organization */}
                    <div className="relative flex items-center gap-3">
                        <div className="hidden sm:block text-right">
                            <p className="font-bold text-sm leading-none text-[#F8FAFC]">{churchName}</p>
                            <p className="text-xs text-[#CBD5E1] mt-0.5">{adminName}</p>
                        </div>

                        <button
                            id="profile-avatar-btn"
                            onClick={() => setProfileOpen(!profileOpen)}
                            className="w-10 h-10 rounded-full bg-[#1E293B] border border-[#334155] overflow-hidden focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 transition-shadow cursor-pointer"
                            title="Account Menu"
                        >
                            <img
                                alt="Admin Profile Avatar"
                                className="w-full h-full object-cover"
                                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBrTYapLGrDdV49Py_PTY4xtOMymfZIVM-iMabqQdk4okEXJ-jB7yUMmp96UBX_We2prRYbhUbdo9FOInFjE_MgGQIZYB29_-fWcGtzObkaK6q09rhnxY6O1Pqj6Zq9cGs0kWzAYilCiO6mjpOyI374fX229MyWLutX43RjnBXaL3dEhQ3r71fXIigXHCqrp9L1CT1FrtmIceaZKONwton3dJVUVNNwv7Jj-LKxLxulxP1vd0WZsIjgiMZznbFi5VfzDPIdPb0MFtke"
                            />
                        </button>

                        {/* Profile Dropdown */}
                        {profileOpen && (
                            <div className="absolute right-0 top-14 w-64 bg-white border border-[#334155] rounded-xl shadow-lg py-2 z-50 text-sm" id="profile-dropdown">
                                <div className="px-4 py-2 border-b border-[rgba(29,78,216,0.04)]">
                                    <p className="font-bold text-[#F8FAFC]">{churchName}</p>
                                    <p className="text-xs text-[#94A3B8]">admin@gracecathedral.org</p>
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-[rgba(29,78,216,0.06)] text-[#1D4ED8] text-[10px] font-bold rounded-full font-['JetBrains_Mono']">
                                        BASIC PLAN ACTIVE
                                    </span>
                                </div>

                                <div className="py-1">
                                    <button
                                        id="profile-link-overview"
                                        onClick={() => { setActiveTab('overview'); setProfileOpen(false); }}
                                        className="w-full px-4 py-2 text-left text-[#F8FAFC] hover:bg-[rgba(29,78,216,0.06)] flex items-center gap-2 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">dashboard</span>
                                        Dashboard Overview
                                    </button>
                                    <button
                                        id="profile-link-settings"
                                        onClick={() => { setActiveTab('settings'); setProfileOpen(false); }}
                                        className="w-full px-4 py-2 text-left text-[#F8FAFC] hover:bg-[rgba(29,78,216,0.06)] flex items-center gap-2 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">manage_accounts</span>
                                        Ministry Profile & Team
                                    </button>
                                    <button
                                        id="profile-link-billing"
                                        onClick={() => { setActiveTab('billing'); setProfileOpen(false); }}
                                        className="w-full px-4 py-2 text-left text-[#F8FAFC] hover:bg-[rgba(29,78,216,0.06)] flex items-center gap-2 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                                        Invoices & Payment
                                    </button>
                                </div>

                                <div className="border-t border-[rgba(29,78,216,0.04)] pt-1">
                                    <button
                                        id="profile-link-logout"
                                        onClick={() => { alert('Logged out of Grace Cathedral Admin Console.'); setProfileOpen(false); }}
                                        className="w-full px-4 py-2 text-left text-[#EF4444] hover:bg-[rgba(239,68,68,0.1)]/40 flex items-center gap-2 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">logout</span>
                                        Sign Out
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
        );
    };

// ==========================================
// MOBILE NAV COMPONENT
// ==========================================
const MobileNav: React.FC<{
    activeTab: ActiveTab;
    setActiveTab: (tab: ActiveTab) => void;
}> = ({ activeTab, setActiveTab }) => {
    return (
        <div className="md:hidden fixed bottom-0 left-0 w-full flex justify-around items-center px-4 py-2 bg-[#0F172A] shadow-md border-t border-[#334155] z-50" id="mobile-bottom-nav">
            <button
                id="mobile-tab-overview"
                onClick={() => setActiveTab('overview')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 cursor-pointer ${activeTab === 'overview'
                    ? 'bg-[#2563EB] text-[#F8FAFC]'
                    : 'text-[#CBD5E1] active:bg-[#1E293B]'
                    }`}
            >
                <span className="material-symbols-outlined text-[22px]">home</span>
                <span className="text-[12px] font-medium leading-none mt-1">Home</span>
            </button>

            <button
                id="mobile-tab-compare"
                onClick={() => setActiveTab('compare')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 cursor-pointer ${activeTab === 'compare'
                    ? 'bg-[#2563EB] text-[#F8FAFC]'
                    : 'text-[#CBD5E1] active:bg-[#1E293B]'
                    }`}
            >
                <span className="material-symbols-outlined fill-icon text-[22px]">account_balance_wallet</span>
                <span className="text-[12px] font-medium leading-none mt-1">Plans</span>
            </button>

            <button
                id="mobile-tab-billing"
                onClick={() => setActiveTab('billing')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 cursor-pointer ${activeTab === 'billing'
                    ? 'bg-[#2563EB] text-[#F8FAFC]'
                    : 'text-[#CBD5E1] active:bg-[#1E293B]'
                    }`}
            >
                <span className="material-symbols-outlined text-[22px]">payments</span>
                <span className="text-[12px] font-medium leading-none mt-1">Billing</span>
            </button>

            <button
                id="mobile-tab-support"
                onClick={() => setActiveTab('support')}
                className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-150 cursor-pointer ${activeTab === 'support'
                    ? 'bg-[#2563EB] text-[#F8FAFC]'
                    : 'text-[#CBD5E1] active:bg-[#1E293B]'
                    }`}
            >
                <span className="material-symbols-outlined text-[22px]">support_agent</span>
                <span className="text-[12px] font-medium leading-none mt-1">Support</span>
            </button>
        </div>
    );
};

// ==========================================
// FOOTER COMPONENT
// ==========================================
const Footer: React.FC<{
    setActiveTab?: (tab: ActiveTab) => void;
    onOpenRegionalModal?: () => void;
}> = ({ setActiveTab, onOpenRegionalModal }) => {
    return (
        <footer className="w-full mt-20 border-t border-[#334155] bg-[#1E293B]" id="main-footer">
            <div className="max-w-[1200px] mx-auto py-8 px-4 sm:px-6 flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="flex flex-col items-center md:items-start gap-2">
                    <span className="font-['JetBrains_Mono'] text-[12px] font-medium uppercase tracking-widest text-[#CBD5E1]">
                        ChurchFlow Systems
                    </span>
                    <p className="font-['JetBrains_Mono'] text-[10px] text-[#94A3B8] text-center md:text-left">
                        © 2026 ChurchFlow Systems. Built for Ministry Excellence.
                    </p>
                </div>

                <div className="flex flex-wrap justify-center gap-6">
                    <button
                        id="footer-terms-btn"
                        onClick={() => alert('ChurchFlow Pro Terms of Service: All plans include church presentation rights.')}
                        className="font-['JetBrains_Mono'] text-[12px] font-medium text-[#CBD5E1] hover:text-[#1D4ED8] transition-colors cursor-pointer"
                    >
                        Terms of Service
                    </button>
                    <button
                        id="footer-privacy-btn"
                        onClick={() => alert('Privacy Policy: End-to-end media encryption for all church assets.')}
                        className="font-['JetBrains_Mono'] text-[12px] font-medium text-[#CBD5E1] hover:text-[#1D4ED8] transition-colors cursor-pointer"
                    >
                        Privacy Policy
                    </button>
                    <button
                        id="footer-regional-btn"
                        onClick={onOpenRegionalModal}
                        className="font-['JetBrains_Mono'] text-[12px] font-medium text-[#CBD5E1] hover:text-[#1D4ED8] transition-colors cursor-pointer"
                    >
                        Regional Settings
                    </button>
                    <button
                        id="footer-help-btn"
                        onClick={() => setActiveTab && setActiveTab('support')}
                        className="font-['JetBrains_Mono'] text-[12px] font-medium text-[#CBD5E1] hover:text-[#1D4ED8] transition-colors cursor-pointer"
                    >
                        Help Center
                    </button>
                </div>
            </div>
        </footer>
    );
};

// ==========================================
// UPGRADE MODAL COMPONENT
// ==========================================
const UpgradeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    targetPlan: 'growth' | 'pro' | 'free' | 'ambassador' | null;
    region: CurrencyRegion;
    billingCycle: BillingCycle;
    onSuccessUpgrade: (planName: string) => void;
}> = ({
    isOpen,
    onClose,
    targetPlan,
    region,
    billingCycle,
    onSuccessUpgrade
}) => {
        if (!isOpen || !targetPlan) return null;

        const [step, setStep] = useState<'summary' | 'payment' | 'complete'>('summary');
        const [paymentMethod, setPaymentMethod] = useState<'card' | 'paystack' | 'transfer'>('card');
        const [isProcessing, setIsProcessing] = useState(false);

        const regionData = REGION_CURRENCIES[region];

        let planTitle = '';
        let priceMain = '';
        let subText = '';

        if (targetPlan === 'growth') {
            planTitle = 'Growth Plan';
            priceMain = regionData.growth[billingCycle].main;
            subText = regionData.growth[billingCycle].sub;
        } else if (targetPlan === 'pro') {
            planTitle = 'Pro Plan';
            priceMain = regionData.pro[billingCycle].main;
            subText = regionData.pro[billingCycle].sub;
        } else if (targetPlan === 'free') {
            planTitle = 'Free Plan Downgrade';
            priceMain = `${regionData.symbol}0`;
            subText = 'Basic non-commercial ministry usage';
        } else if (targetPlan === 'ambassador') {
            planTitle = 'Ambassador & Unlimited Enterprise Plan';
            priceMain = 'Custom Ministry Quote';
            subText = 'Dedicated cluster & multi-campus sync';
        }

        const handleConfirm = () => {
            setIsProcessing(true);
            setTimeout(() => {
                setIsProcessing(false);
                setStep('complete');
                onSuccessUpgrade(planTitle);
            }, 1200);
        };

        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs" id="upgrade-modal-backdrop">
                <div className="bg-white border border-[#334155] rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative animate-in fade-in zoom-in duration-200" id="upgrade-modal-card">
                    {/* Close Button */}
                    <button
                        id="modal-close-btn"
                        onClick={onClose}
                        className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#F8FAFC] p-1 rounded-full hover:bg-[rgba(29,78,216,0.04)] cursor-pointer"
                    >
                        <span className="material-symbols-outlined">close</span>
                    </button>

                    {step === 'summary' && (
                        <div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="material-symbols-outlined text-[#1D4ED8] text-[28px]">verified</span>
                                <span className="font-['JetBrains_Mono'] text-xs uppercase tracking-widest text-[#1D4ED8] font-bold">
                                    Subscription Plan Update
                                </span>
                            </div>

                            <h3 className="text-2xl font-bold font-['Geist'] text-[#F8FAFC] mb-1">
                                Confirm {planTitle}
                            </h3>
                            <p className="text-sm text-[#CBD5E1] mb-6">
                                Grace Cathedral · Admin Console Subscription
                            </p>

                            <div className="bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-xl p-4 mb-6 space-y-3">
                                <div className="flex justify-between items-baseline">
                                    <span className="text-sm font-medium text-[#F8FAFC]">Selected Plan</span>
                                    <span className="font-bold text-lg text-[#1D4ED8]">{planTitle}</span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-sm font-medium text-[#F8FAFC]">Billing Cycle</span>
                                    <span className="text-sm capitalize font-semibold">{billingCycle} Billed</span>
                                </div>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-sm font-medium text-[#F8FAFC]">Region / Currency</span>
                                    <span className="text-sm font-['JetBrains_Mono']">{regionData.label}</span>
                                </div>
                                <div className="pt-2 border-t border-[#334155] flex justify-between items-baseline">
                                    <span className="font-bold text-[#F8FAFC]">Total Due Today</span>
                                    <span className="text-2xl font-bold font-['Inter'] text-[#F8FAFC]">
                                        {priceMain}
                                    </span>
                                </div>
                                <p className="text-xs text-[#1D4ED8] font-medium text-right">{subText}</p>
                            </div>

                            {targetPlan === 'ambassador' ? (
                                <div className="space-y-4">
                                    <p className="text-xs text-[#CBD5E1]">
                                        Our enterprise ministry relations manager will contact your executive staff at{' '}
                                        <strong className="text-[#F8FAFC]">admin@gracecathedral.org</strong> within 2 business hours.
                                    </p>
                                    <button
                                        id="submit-inquiry-btn"
                                        onClick={handleConfirm}
                                        disabled={isProcessing}
                                        className="w-full py-3.5 bg-[#F8FAFC] text-white font-bold rounded-lg hover:opacity-90 transition-all flex justify-center items-center gap-2 cursor-pointer"
                                    >
                                        {isProcessing ? 'Submitting Request...' : 'Submit Enterprise Inquiry'}
                                    </button>
                                </div>
                            ) : targetPlan === 'free' ? (
                                <div className="space-y-4">
                                    <p className="text-xs text-[#EF4444]">
                                        Warning: Downgrading to Free will restrict AI credit limits to 10 credits/month and disable Android Scene Remote control.
                                    </p>
                                    <div className="flex gap-3">
                                        <button
                                            id="cancel-downgrade-btn"
                                            onClick={onClose}
                                            className="flex-1 py-3 border border-[#334155] text-[#F8FAFC] font-semibold rounded-lg hover:bg-[rgba(29,78,216,0.04)] cursor-pointer"
                                        >
                                            Keep Current Plan
                                        </button>
                                        <button
                                            id="confirm-downgrade-btn"
                                            onClick={handleConfirm}
                                            disabled={isProcessing}
                                            className="flex-1 py-3 bg-[#EF4444] text-white font-bold rounded-lg hover:opacity-90 cursor-pointer"
                                        >
                                            {isProcessing ? 'Processing...' : 'Confirm Downgrade'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider font-['JetBrains_Mono']">
                                            Select Payment Method
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            <button
                                                id="pay-method-card"
                                                onClick={() => setPaymentMethod('card')}
                                                className={`p-3 border rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${paymentMethod === 'card'
                                                    ? 'border-[#1D4ED8] bg-[rgba(29,78,216,0.06)] text-[#1D4ED8]'
                                                    : 'border-[#334155] hover:border-[#F8FAFC]'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">credit_card</span>
                                                Card
                                            </button>
                                            <button
                                                id="pay-method-paystack"
                                                onClick={() => setPaymentMethod('paystack')}
                                                className={`p-3 border rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${paymentMethod === 'paystack'
                                                    ? 'border-[#1D4ED8] bg-[rgba(29,78,216,0.06)] text-[#1D4ED8]'
                                                    : 'border-[#334155] hover:border-[#F8FAFC]'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">payments</span>
                                                Paystack
                                            </button>
                                            <button
                                                id="pay-method-transfer"
                                                onClick={() => setPaymentMethod('transfer')}
                                                className={`p-3 border rounded-xl flex flex-col items-center justify-center gap-1 text-xs font-bold transition-all cursor-pointer ${paymentMethod === 'transfer'
                                                    ? 'border-[#1D4ED8] bg-[rgba(29,78,216,0.06)] text-[#1D4ED8]'
                                                    : 'border-[#334155] hover:border-[#F8FAFC]'
                                                    }`}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">account_balance</span>
                                                Bank Transfer
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        id="pay-now-btn"
                                        onClick={handleConfirm}
                                        disabled={isProcessing}
                                        className="w-full py-4 bg-[#1D4ED8] text-white font-bold rounded-xl hover:bg-[#2563EB] shadow-lg shadow-[#1D4ED8]/20 transition-all flex items-center justify-center gap-2 text-base cursor-pointer"
                                    >
                                        {isProcessing ? (
                                            <>
                                                <span className="material-symbols-outlined animate-spin">sync</span>
                                                Securing Authorization...
                                            </>
                                        ) : (
                                            <>
                                                <span className="material-symbols-outlined">lock</span>
                                                Pay {priceMain} & Activate Plan
                                            </>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 'complete' && (
                        <div className="text-center py-4 space-y-4" id="upgrade-success-view">
                            <div className="w-16 h-16 bg-[#1D4ED8]/10 text-[#1D4ED8] rounded-full flex items-center justify-center mx-auto">
                                <span className="material-symbols-outlined text-[36px]">check_circle</span>
                            </div>
                            <h3 className="text-2xl font-bold font-['Geist'] text-[#F8FAFC]">
                                {targetPlan === 'ambassador' ? 'Inquiry Submitted!' : 'Plan Upgraded Successfully!'}
                            </h3>
                            <p className="text-sm text-[#CBD5E1]">
                                Grace Cathedral is now configured for <strong className="text-[#F8FAFC]">{planTitle}</strong>. An updated receipt has been generated and sent to admin@gracecathedral.org.
                            </p>

                            <button
                                id="return-dashboard-btn"
                                onClick={onClose}
                                className="w-full py-3.5 bg-[#F8FAFC] text-white font-bold rounded-xl hover:opacity-90 cursor-pointer"
                            >
                                Return to Subscription Dashboard
                            </button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

// ==========================================
// CASE STUDIES MODAL COMPONENT
// ==========================================
const CaseStudiesModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onContactUs: () => void;
}> = ({ isOpen, onClose, onContactUs }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs" id="case-studies-backdrop">
            <div className="bg-white border border-[#334155] rounded-2xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl relative max-h-[90vh] overflow-y-auto" id="case-studies-card">
                {/* Close Button */}
                <button
                    id="case-studies-close-btn"
                    onClick={onClose}
                    className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#F8FAFC] p-1 rounded-full hover:bg-[rgba(29,78,216,0.04)] cursor-pointer"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>

                <div className="mb-6">
                    <span className="inline-block px-3 py-1 bg-[rgba(29,78,216,0.04)] text-[#1D4ED8] rounded-full text-[10px] font-bold uppercase tracking-widest font-['JetBrains_Mono'] mb-2">
                        Ministry Case Studies
                    </span>
                    <h2 className="text-2xl sm:text-3xl font-bold font-['Geist'] text-[#F8FAFC]">
                        How Leading Ministries Production Teams Rely on ChurchFlow Pro
                    </h2>
                    <p className="text-sm text-[#CBD5E1] mt-1">
                        Real impact metrics from regional cathedrals, mega-churches, and broadcasting networks.
                    </p>
                </div>

                <div className="space-y-6 mb-8">
                    {CASE_STUDIES.map((cs, idx) => (
                        <div
                            key={idx}
                            className="p-6 border border-[#334155] rounded-xl bg-[rgba(29,78,216,0.06)] space-y-4"
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#334155]/60 pb-3">
                                <div>
                                    <h3 className="font-bold text-lg text-[#F8FAFC]">{cs.churchName}</h3>
                                    <p className="text-xs text-[#94A3B8]">{cs.location} · {cs.attendance}</p>
                                </div>
                                <span className="px-3 py-1 bg-[#1D4ED8] text-white text-xs font-bold rounded-full font-['JetBrains_Mono'] self-start sm:self-auto">
                                    Ambassador Deployment
                                </span>
                            </div>

                            <h4 className="font-bold text-base text-[#1D4ED8]">{cs.title}</h4>
                            <p className="text-sm text-[#CBD5E1] leading-relaxed">{cs.summary}</p>

                            <blockquote className="p-4 bg-white border-l-4 border-[#1D4ED8] rounded-r-lg italic text-sm text-[#F8FAFC]">
                                "{cs.quote}"
                                <footer className="mt-2 text-xs font-bold text-[#94A3B8] not-italic">
                                    — {cs.quoteAuthor}
                                </footer>
                            </blockquote>

                            <div className="grid grid-cols-3 gap-3 pt-2">
                                {cs.stats.map((st, i) => (
                                    <div key={i} className="bg-white p-3 rounded-lg border border-[#334155]/50 text-center">
                                        <p className="text-lg sm:text-2xl font-bold font-['Inter'] text-[#1D4ED8]">{st.value}</p>
                                        <p className="text-[10px] sm:text-xs text-[#94A3B8] font-medium mt-0.5">{st.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-[#1E293B] text-white rounded-xl">
                    <div>
                        <h4 className="font-bold text-base">Ready for Enterprise Ministry Scale?</h4>
                        <p className="text-xs text-[#94A3B8]">Get a tailored deployment estimate for your campuses.</p>
                    </div>
                    <button
                        id="contact-ministry-team-btn"
                        onClick={() => {
                            onClose();
                            onContactUs();
                        }}
                        className="w-full sm:w-auto px-6 py-2.5 bg-[#1D4ED8] text-white font-bold rounded-lg hover:bg-[#2563EB] transition-colors cursor-pointer text-sm whitespace-nowrap"
                    >
                        Contact Ministry Team
                    </button>
                </div>
            </div>
        </div>
    );
};

// ==========================================
// COMPARE PLANS VIEW COMPONENT
// ==========================================
const ComparePlansView: React.FC<{
    setActiveTab: (tab: ActiveTab) => void;
    onSelectUpgrade: (plan: 'growth' | 'pro' | 'free' | 'ambassador') => void;
    onOpenCaseStudies: () => void;
    region: CurrencyRegion;
    setRegion: (region: CurrencyRegion) => void;
    billingCycle: BillingCycle;
    setBillingCycle: (cycle: BillingCycle) => void;
    formatPrice: (amount: number) => string;
    getPlanPrice: (plan: "basic" | "growth" | "pro", cycle: "monthly" | "yearly") => number;
    getIntroPrice: (plan: "basic" | "growth" | "pro") => number | undefined;
    pricing: any;
}> = ({
    setActiveTab,
    onSelectUpgrade,
    onOpenCaseStudies,
    region,
    setRegion,
    billingCycle,
    setBillingCycle,
    formatPrice: fmtPrice,
    getPlanPrice,
    getIntroPrice,
    pricing: pricingData,
}) => {
        const [filterSearch, setFilterSearch] = useState('');

        // Build pricing-compatible object from hook data
        const makeCard = (plan: 'basic' | 'growth' | 'pro') => {
            const monthly = getPlanPrice(plan, 'monthly');
            const yearly = getPlanPrice(plan, 'yearly');
            const intro = getIntroPrice(plan);
            const sym = pricingData?.currency === 'NGN' ? '₦' : (pricingData?.region === 'africa' || pricingData?.region === 'global' ? '$' : '$');
            const currencyCode = pricingData?.currency || 'USD';
            const monthlyMain = fmtPrice(monthly);
            const yearlyMain = fmtPrice(yearly);
            const monthlySub = intro ? `${fmtPrice(intro)} first month, then ${monthlyMain}/mo` : `${monthlyMain}/month`;
            const yearlySub = `Billed ${yearlyMain} annually (Save 2 months)`;
            return {
                code: currencyCode,
                symbol: sym,
                monthly: { main: monthlyMain, sub: monthlySub, raw: monthly },
                yearly: { main: yearlyMain, sub: yearlySub, raw: yearly },
            };
        };

        const pricing = {
            code: pricingData?.currency || 'USD',
            symbol: pricingData?.currency === 'NGN' ? '₦' : '$',
            label: `${pricingData?.countryName || pricingData?.region || 'Global'} · ${pricingData?.currency || 'USD'}`,
            basic: makeCard('basic'),
            growth: makeCard('growth'),
            pro: makeCard('pro'),
        };

        return (
            <main className="pt-10 pb-32 max-w-[1200px] mx-auto px-4 sm:px-6" id="compare-plans-page">
                {/* Top Title Section */}
                <div className="mb-8">
                    <h1 className="font-['Geist'] text-2xl md:text-3xl font-semibold text-[#F8FAFC] mb-2">
                        Subscription
                    </h1>
                    <p className="text-[#CBD5E1] text-base">
                        Manage your plan, billing and included features.
                    </p>
                </div>

                {/* Mobile Tab Navigation bar */}
                <div className="flex md:hidden border-b border-[#334155] mb-8" id="mobile-top-tabs">
                    <button
                        onClick={() => setActiveTab('overview')}
                        className="flex-1 py-3 text-[#CBD5E1] font-medium border-b-2 border-transparent text-center cursor-pointer"
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setActiveTab('compare')}
                        className="flex-1 py-3 text-[#F8FAFC] font-bold border-b-2 border-[#1D4ED8] text-center cursor-pointer"
                    >
                        Compare Plans
                    </button>
                    <button
                        onClick={() => setActiveTab('billing')}
                        className="flex-1 py-3 text-[#CBD5E1] font-medium border-b-2 border-transparent text-center cursor-pointer"
                    >
                        Billing
                    </button>
                </div>

                {/* Sub-Header & Controls Row */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                    <div className="max-w-2xl">
                        <h2 className="font-['Geist'] text-2xl md:text-3xl font-semibold text-[#F8FAFC] mb-2">
                            Compare plans
                        </h2>
                        <p className="text-[#CBD5E1] text-sm sm:text-base">
                            Find the plan that matches your church’s production needs.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-3">
                        {/* Regional Selector */}
                        <div className="relative w-full sm:w-auto">
                            <select
                                id="region-selector"
                                value={region}
                                onChange={(e) => setRegion(e.target.value as CurrencyRegion)}
                                className="w-full sm:w-auto appearance-none pl-10 pr-10 py-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-medium focus:ring-2 focus:ring-[#1D4ED8]/20 focus:border-[#1D4ED8] outline-none cursor-pointer"
                            >
                                <option value="ngn">Nigeria · NGN</option>
                                <option value="africa">Africa · USD</option>
                                <option value="global">Global · USD</option>
                            </select>
                            <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#F8FAFC]">
                                <span className="material-symbols-outlined text-[18px]">public</span>
                            </div>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#F8FAFC]">
                                <span className="material-symbols-outlined text-[18px]">expand_more</span>
                            </div>
                        </div>

                        {/* Billing Cycle Toggle Switch */}
                        <div className="relative w-full sm:w-auto p-1 bg-[rgba(29,78,216,0.04)] border border-[#334155] rounded-full flex items-center" id="billing-toggle-container">
                            <button
                                id="billing-toggle-monthly"
                                onClick={() => setBillingCycle('monthly')}
                                className={`flex-1 sm:px-6 py-2 rounded-full text-sm font-bold z-10 transition-colors duration-200 cursor-pointer ${billingCycle === 'monthly'
                                    ? 'bg-[#2563EB] text-[#F8FAFC] shadow-xs'
                                    : 'text-[#CBD5E1] hover:text-[#F8FAFC]'
                                    }`}
                            >
                                Monthly
                            </button>
                            <button
                                id="billing-toggle-yearly"
                                onClick={() => setBillingCycle('yearly')}
                                className={`flex-1 sm:px-6 py-2 rounded-full text-sm font-medium z-10 transition-colors duration-200 cursor-pointer ${billingCycle === 'yearly'
                                    ? 'bg-[#2563EB] text-[#F8FAFC] shadow-xs'
                                    : 'text-[#CBD5E1] hover:text-[#F8FAFC]'
                                    }`}
                            >
                                Yearly
                            </button>

                            {/* Discount Badge */}
                            <div className="absolute right-2 -top-3 pointer-events-none">
                                <span className="bg-[#1D4ED8] text-white text-[10px] px-2 py-0.5 rounded-full font-['JetBrains_Mono'] uppercase font-bold tracking-wider shadow-xs">
                                    20% Off
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Pricing Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20" id="pricing-cards">
                    {/* Basic Plan Card */}
                    <div
                        className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0px_4px_12px_rgba(0,0,0,0.03)]"
                        id="card-basic-plan"
                    >
                        <div>
                            <div className="mb-4">
                                <h3 className="font-bold text-xl mb-1 text-[#F8FAFC]">Basic</h3>
                                <p className="text-sm text-[#CBD5E1] min-h-[40px]">
                                    Everything you need to run a complete church presentation workflow.
                                </p>
                            </div>

                            <div className="mb-6">
                                <div className="flex items-baseline gap-1">
                                    <span className="font-['Inter'] text-[40px] font-bold leading-none tracking-tight text-[#F8FAFC]">
                                        {pricing.basic[billingCycle].main}
                                    </span>
                                    <span className="text-[#CBD5E1] text-sm font-['Inter']">{billingCycle === 'yearly' ? '/yr' : '/mo'}</span>
                                </div>
                                <p className="text-xs text-[#1D4ED8] font-medium mt-1">
                                    {pricing.basic[billingCycle].sub}
                                </p>
                            </div>

                            <button
                                id="basic-current-btn"
                                disabled
                                className="w-full py-3 px-4 rounded-lg bg-[#334155] text-[#CBD5E1] font-bold text-sm cursor-not-allowed mb-6 text-center"
                            >
                                Current Plan
                            </button>

                            <div className="space-y-4">
                                <p className="font-['JetBrains_Mono'] text-[12px] font-medium text-[#94A3B8] uppercase tracking-wider">
                                    Plan Highlights
                                </p>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">check_circle</span>
                                        Bible & Scripture
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">check_circle</span>
                                        Worship Lyrics
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">check_circle</span>
                                        Media Library (50 songs/images/videos)
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">check_circle</span>
                                        Lower Thirds & Countdowns
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">check_circle</span>
                                        300 AI credits / month
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Growth Plan Card (RECOMMENDED) */}
                    <div
                        className="bg-[#1E293B] border-2 border-[#1D4ED8] rounded-xl p-6 sm:p-8 flex flex-col justify-between relative transition-all duration-300 shadow-xl"
                        id="card-growth-plan"
                    >
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-[#1D4ED8] text-white px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest shadow-xs">
                            Recommended
                        </div>

                        <div>
                            <div className="mb-4">
                                <h3 className="font-bold text-xl mb-1 text-[#F8FAFC]">Growth</h3>
                                <p className="text-sm text-[#CBD5E1] min-h-[40px]">
                                    Faster workflows, advanced imports, AI tools and cloud sync for active media teams.
                                </p>
                            </div>

                            <div className="mb-6">
                                <div className="flex items-baseline gap-1">
                                    <span className="font-['Inter'] text-[40px] font-bold leading-none tracking-tight text-[#1D4ED8]">
                                        {pricing.growth[billingCycle].main}
                                    </span>
                                    <span className="text-[#CBD5E1] text-sm font-['Inter']">{billingCycle === 'yearly' ? '/yr' : '/mo'}</span>
                                </div>
                                <p className="text-xs text-[#1D4ED8] font-medium mt-1">
                                    {pricing.growth[billingCycle].sub}
                                </p>
                            </div>

                            <button
                                id="upgrade-growth-btn"
                                onClick={() => onSelectUpgrade('growth')}
                                className="w-full py-4 px-4 rounded-lg bg-[#1D4ED8] text-white font-bold text-sm mb-6 active:scale-[0.98] transition-all shadow-lg shadow-[#1D4ED8]/20 hover:bg-[#2563EB] cursor-pointer"
                            >
                                Upgrade to Growth
                            </button>

                            <div className="space-y-4">
                                <p className="font-['JetBrains_Mono'] text-[12px] font-bold text-[#1D4ED8] uppercase tracking-wider">
                                    Everything in Basic, plus:
                                </p>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm font-medium text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg fill-icon">bolt</span>
                                        Unlimited Songs, Images & Videos
                                    </li>
                                    <li className="flex items-center gap-3 text-sm font-medium text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg fill-icon">smartphone</span>
                                        Mobile Control & Android Remote
                                    </li>
                                    <li className="flex items-center gap-3 text-sm font-medium text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg fill-icon">laptop_windows</span>
                                        Presentation Mode (2-Laptop)
                                    </li>
                                    <li className="flex items-center gap-3 text-sm font-medium text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg fill-icon">translate</span>
                                        Speech-to-Scripture & Translation
                                    </li>
                                    <li className="flex items-center gap-3 text-sm font-medium text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg fill-icon">cloud_sync</span>
                                        Cloud Sync & Bulk Import
                                    </li>
                                    <li className="flex items-center gap-3 text-sm font-medium text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg fill-icon">auto_awesome</span>
                                        1,000 AI credits / month
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Pro Plan Card */}
                    <div
                        className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-[0px_4px_12px_rgba(0,0,0,0.03)]"
                        id="card-pro-plan"
                    >
                        <div>
                            <div className="mb-4">
                                <h3 className="font-bold text-xl mb-1 text-[#F8FAFC]">Pro</h3>
                                <p className="text-sm text-[#CBD5E1] min-h-[40px]">
                                    Advanced automation, live translation and remote control for demanding productions.
                                </p>
                            </div>

                            <div className="mb-6">
                                <div className="flex items-baseline gap-1">
                                    <span className="font-['Inter'] text-[40px] font-bold leading-none tracking-tight text-[#F8FAFC]">
                                        {pricing.pro[billingCycle].main}
                                    </span>
                                    <span className="text-[#CBD5E1] text-sm font-['Inter']">{billingCycle === 'yearly' ? '/yr' : '/mo'}</span>
                                </div>
                                <p className="text-xs text-[#CBD5E1] mt-1">
                                    {pricing.pro[billingCycle].sub}
                                </p>
                            </div>

                            <button
                                id="upgrade-pro-btn"
                                onClick={() => onSelectUpgrade('pro')}
                                className="w-full py-3.5 px-4 rounded-lg bg-[#F8FAFC] text-white font-bold text-sm mb-6 active:scale-[0.98] transition-all hover:bg-[#F8FAFC] cursor-pointer"
                            >
                                Upgrade to Pro
                            </button>

                            <div className="space-y-4">
                                <p className="font-['JetBrains_Mono'] text-[12px] font-medium text-[#94A3B8] uppercase tracking-wider">
                                    Everything in Growth, plus:
                                </p>
                                <ul className="space-y-3">
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">smartphone</span>
                                        Full Android Remote Control
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">analytics</span>
                                        Advanced Analytics & Reports
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">api</span>
                                        API Access
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">corporate_fare</span>
                                        Campus Management
                                    </li>
                                    <li className="flex items-center gap-3 text-sm text-[#F8FAFC]">
                                        <span className="material-symbols-outlined text-[#1D4ED8] text-lg">auto_awesome</span>
                                        3,000 AI credits / month
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Detailed Feature Comparison Table Section */}
                <section className="mb-20" id="feature-comparison-section">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                            <h2 className="font-['Geist'] text-2xl md:text-3xl font-semibold text-[#F8FAFC] mb-1">
                                Detailed Comparison
                            </h2>
                            <p className="text-[#CBD5E1] text-sm">
                                Compare every feature across our plans to find the perfect fit.
                            </p>
                        </div>

                        <div className="relative w-full sm:w-64">
                            <input
                                type="text"
                                id="feature-search-input"
                                placeholder="Search features..."
                                value={filterSearch}
                                onChange={(e) => setFilterSearch(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#1E293B] border border-[#334155] rounded-lg focus:outline-none focus:border-[#1D4ED8]"
                            />
                            <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-[#94A3B8]">
                                search
                            </span>
                        </div>
                    </div>

                    <div className="overflow-x-auto hide-scrollbar border border-[#334155] rounded-xl bg-[#1E293B]">
                        <table className="w-full min-w-[800px] border-collapse">
                            <thead>
                                <tr className="bg-[rgba(29,78,216,0.04)] text-left border-b border-[#334155]">
                                    <th className="p-6 font-['JetBrains_Mono'] text-[12px] uppercase tracking-widest text-[#F8FAFC] w-1/3">
                                        Features
                                    </th>
                                    <th className="p-6 font-['JetBrains_Mono'] text-[12px] uppercase tracking-widest text-center text-[#F8FAFC]">
                                        Basic
                                    </th>
                                    <th className="p-6 font-['JetBrains_Mono'] text-[12px] uppercase tracking-widest text-center text-[#1D4ED8]">
                                        Growth
                                    </th>
                                    <th className="p-6 font-['JetBrains_Mono'] text-[12px] uppercase tracking-widest text-center text-[#F8FAFC]">
                                        Pro
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#334155]/30">
                                {COMPARISON_FEATURES.map((group, groupIdx) => {
                                    const matchingRows = group.rows.filter(row =>
                                        row.name.toLowerCase().includes(filterSearch.toLowerCase())
                                    );

                                    if (matchingRows.length === 0) return null;

                                    return (
                                        <React.Fragment key={groupIdx}>
                                            <tr className="bg-[rgba(29,78,216,0.06)]/60">
                                                <td className="px-6 py-3 font-bold text-sm text-[#F8FAFC]" colSpan={4}>
                                                    {group.category}
                                                </td>
                                            </tr>
                                            {matchingRows.map((row, rowIdx) => (
                                                <tr key={rowIdx} className="hover:bg-[#0F172A]">
                                                    <td className="px-6 py-4 text-sm font-medium text-[#F8FAFC]">
                                                        {row.name}
                                                    </td>
                                                    <td className="text-center py-4">
                                                        {typeof row.basic === 'boolean' ? (
                                                            row.basic ? (
                                                                <span className="material-symbols-outlined text-[#1D4ED8]">check</span>
                                                            ) : (
                                                                <span className="text-[#334155]">—</span>
                                                            )
                                                        ) : (
                                                            <span className="text-xs font-['JetBrains_Mono'] text-[#CBD5E1]">{row.basic}</span>
                                                        )}
                                                    </td>
                                                    <td className="text-center py-4 bg-[rgba(29,78,216,0.06)]/30">
                                                        {typeof row.growth === 'boolean' ? (
                                                            row.growth ? (
                                                                <span className="material-symbols-outlined text-[#1D4ED8]">check</span>
                                                            ) : (
                                                                <span className="text-[#334155]">—</span>
                                                            )
                                                        ) : (
                                                            <span className="text-xs font-['JetBrains_Mono'] font-bold text-[#1D4ED8]">{row.growth}</span>
                                                        )}
                                                    </td>
                                                    <td className="text-center py-4">
                                                        {typeof row.pro === 'boolean' ? (
                                                            row.pro ? (
                                                                <span className="material-symbols-outlined text-[#1D4ED8]">check</span>
                                                            ) : (
                                                                <span className="text-[#334155]">—</span>
                                                            )
                                                        ) : (
                                                            <span className="text-xs font-['JetBrains_Mono'] font-bold text-[#F8FAFC]">{row.pro}</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* Bottom Cards Row: Free Plan & Enterprise */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8" id="bottom-options-row">
                    {/* Free Plan Card */}
                    <div className="p-8 border border-[#334155] rounded-xl bg-[rgba(29,78,216,0.06)] flex flex-col justify-between" id="card-free-plan">
                        <div>
                            <span className="inline-block px-3 py-1 bg-[#334155] rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 font-['JetBrains_Mono'] text-[#F8FAFC]">
                                Just exploring?
                            </span>
                            <h3 className="font-['Geist'] text-xl font-bold mb-2 text-[#F8FAFC]">Free Plan</h3>
                            <p className="text-[#CBD5E1] mb-6 text-sm leading-relaxed">
                                Perfect for small house fellowships or hobbyists starting their digital ministry journey.
                            </p>
                        </div>
                        <button
                            id="downgrade-free-btn"
                            onClick={() => onSelectUpgrade('free')}
                            className="w-full sm:w-auto px-8 py-3 border border-[#F8FAFC] text-[#F8FAFC] font-bold rounded-lg hover:bg-[#F8FAFC] hover:text-white transition-colors cursor-pointer text-center text-sm"
                        >
                            Downgrade to Free
                        </button>
                    </div>

                    {/* Ambassador & Unlimited Enterprise Card */}
                    <div className="p-8 border border-[#334155] rounded-xl bg-[#1E293B] flex flex-col justify-between" id="card-ambassador-plan">
                        <div>
                            <span className="inline-block px-3 py-1 bg-[#334155] rounded-full text-[10px] font-bold uppercase tracking-widest mb-4 font-['JetBrains_Mono'] text-[#F8FAFC]">
                                Plans for larger organisations
                            </span>
                            <h3 className="font-['Geist'] text-xl font-bold mb-2 text-[#F8FAFC]">Ambassador & Unlimited</h3>
                            <p className="text-[#CBD5E1] mb-6 text-sm leading-relaxed">
                                Custom solutions for mega-churches, television networks, and international ministries with high demand.
                            </p>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                id="contact-ambassador-btn"
                                onClick={() => onSelectUpgrade('ambassador')}
                                className="flex-1 py-3 bg-[#F8FAFC] text-white font-bold rounded-lg hover:opacity-90 transition-opacity cursor-pointer text-sm text-center"
                            >
                                Contact Us
                            </button>
                            <button
                                id="see-case-studies-btn"
                                onClick={onOpenCaseStudies}
                                className="flex-1 py-3 border border-[#94A3B8] text-[#CBD5E1] font-bold rounded-lg bg-[#0F172A] hover:bg-[#334155] transition-colors cursor-pointer text-sm text-center"
                            >
                                See Case Studies
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        );
    };

// ==========================================
// OVERVIEW VIEW COMPONENT
// ==========================================
const OverviewView: React.FC<{
    setActiveTab: (tab: ActiveTab) => void;
    onSelectUpgrade: (plan: 'growth' | 'pro') => void;
    activePlanName: string;
}> = ({ setActiveTab, onSelectUpgrade, activePlanName }) => {
    const [quickScripture, setQuickScripture] = useState('John 3:16');
    const [selectedBibleVersion, setSelectedBibleVersion] = useState('KJV');
    const [projectedVerse, setProjectedVerse] = useState<string | null>(null);

    const sampleBibles = [
        { verse: 'John 3:16', text: 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.' },
        { verse: 'Psalm 23:1', text: 'The LORD is my shepherd; I shall not want.' },
        { verse: 'Philippians 4:13', text: 'I can do all things through Christ which strengtheneth me.' }
    ];

    return (
        <main className="pt-24 pb-32 max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8" id="overview-page">
            {/* Welcome Banner */}
            <div className="bg-[#1E293B] border border-[#334155] rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 shadow-xs">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="px-2.5 py-1 bg-[rgba(29,78,216,0.06)] text-[#1D4ED8] text-xs font-bold rounded-full font-['JetBrains_Mono']">
                            ACTIVE CHURCH CONSOLE
                        </span>
                        <span className="text-xs text-[#94A3B8]">Grace Cathedral · Primary Display Server</span>
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold font-['Geist'] text-[#F8FAFC]">
                        Welcome, Admin Console
                    </h1>
                    <p className="text-sm text-[#CBD5E1] mt-1">
                        Current Active Plan: <strong className="text-[#1D4ED8]">{activePlanName}</strong>. 1 Presentation Laptop Connected.
                    </p>
                </div>

                <div className="flex flex-wrap gap-3">
                    <button
                        id="overview-manage-plan-btn"
                        onClick={() => setActiveTab('compare')}
                        className="px-5 py-2.5 bg-[#1D4ED8] text-white font-bold rounded-xl text-sm hover:bg-[#2563EB] shadow-sm flex items-center gap-2 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[18px]">upgrade</span>
                        Manage / Upgrade Plan
                    </button>
                </div>
            </div>

            {/* Grid Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-xl border border-[#334155] space-y-2">
                    <div className="flex justify-between items-center text-[#94A3B8]">
                        <span className="text-xs font-['JetBrains_Mono'] font-bold uppercase">AI Credits Balance</span>
                        <span className="material-symbols-outlined text-[20px] text-[#1D4ED8]">auto_awesome</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold font-['Inter'] text-[#F8FAFC]">50 / 50</span>
                        <span className="text-xs text-[#1D4ED8] font-medium">Basic Tier</span>
                    </div>
                    <div className="w-full bg-[rgba(29,78,216,0.04)] h-2 rounded-full overflow-hidden">
                        <div className="bg-[#1D4ED8] h-full w-[100%]" />
                    </div>
                    <p className="text-[11px] text-[#94A3B8]">Resets in 8 days. Need more? Upgrade plan.</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-[#334155] space-y-2">
                    <div className="flex justify-between items-center text-[#94A3B8]">
                        <span className="text-xs font-['JetBrains_Mono'] font-bold uppercase">Scripture Versions</span>
                        <span className="material-symbols-outlined text-[20px] text-[#1D4ED8]">auto_stories</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold font-['Inter'] text-[#F8FAFC]">32 Available</span>
                        <span className="text-xs text-[#1D4ED8] font-medium">Offline Ready</span>
                    </div>
                    <p className="text-xs text-[#CBD5E1]">KJV, NIV, NLT, AMP, MSG, Yoruba, Igbo, Hausa.</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-[#334155] space-y-2">
                    <div className="flex justify-between items-center text-[#94A3B8]">
                        <span className="text-xs font-['JetBrains_Mono'] font-bold uppercase">Connected Display</span>
                        <span className="material-symbols-outlined text-[20px] text-[#1D4ED8]">monitor</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold font-['Inter'] text-[#F8FAFC]">1 Laptop</span>
                        <span className="text-xs bg-[rgba(29,78,216,0.04)] px-2 py-0.5 rounded text-[#1D4ED8] font-bold">LIVE</span>
                    </div>
                    <p className="text-xs text-[#CBD5E1]">Main Sanctuary Stage LED (1080p @ 60fps)</p>
                </div>

                <div className="bg-white p-5 rounded-xl border border-[#334155] space-y-2">
                    <div className="flex justify-between items-center text-[#94A3B8]">
                        <span className="text-xs font-['JetBrains_Mono'] font-bold uppercase">Android Remote</span>
                        <span className="material-symbols-outlined text-[20px] text-[#94A3B8]">smartphone</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold font-['Inter'] text-[#94A3B8]">Disabled</span>
                        <button
                            id="unlock-remote-btn"
                            onClick={() => onSelectUpgrade('growth')}
                            className="text-xs text-[#1D4ED8] font-bold underline cursor-pointer"
                        >
                            Unlock
                        </button>
                    </div>
                    <p className="text-xs text-[#94A3B8]">Requires Growth or Pro plan tier.</p>
                </div>
            </div>

            {/* Main Workflow Sandbox & Live Projection Test */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white border border-[#334155] rounded-xl p-6 space-y-6">
                    <div>
                        <h3 className="text-lg font-bold font-['Geist'] text-[#F8FAFC] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#1D4ED8]">menu_book</span>
                            Live Presentation & Scripture Search
                        </h3>
                        <p className="text-xs text-[#CBD5E1]">
                            Search verses and project directly to connected Sanctuary displays.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="flex-1 relative">
                            <input
                                type="text"
                                id="scripture-search-input"
                                value={quickScripture}
                                onChange={(e) => setQuickScripture(e.target.value)}
                                placeholder="Enter Scripture (e.g. John 3:16)..."
                                className="w-full px-4 py-2.5 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-medium focus:outline-none focus:border-[#1D4ED8]"
                            />
                        </div>
                        <select
                            id="bible-version-select"
                            value={selectedBibleVersion}
                            onChange={(e) => setSelectedBibleVersion(e.target.value)}
                            className="px-4 py-2.5 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-bold text-[#F8FAFC] focus:outline-none cursor-pointer"
                        >
                            <option value="KJV">KJV - King James</option>
                            <option value="NIV">NIV - New Int.</option>
                            <option value="NLT">NLT - Living</option>
                            <option value="YOR">YOR - Yoruba</option>
                        </select>
                    </div>

                    {/* Preset Verses */}
                    <div className="space-y-3">
                        <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] uppercase">
                            Quick Verses Queue
                        </label>
                        <div className="space-y-2">
                            {sampleBibles.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="p-3 border border-[#334155]/60 rounded-lg bg-[#0F172A] flex items-center justify-between gap-4 hover:border-[#1D4ED8] transition-colors"
                                >
                                    <div>
                                        <span className="font-bold text-sm text-[#1D4ED8] block">{item.verse} ({selectedBibleVersion})</span>
                                        <p className="text-xs text-[#CBD5E1] line-clamp-1">{item.text}</p>
                                    </div>
                                    <button
                                        id={`project-verse-btn-${idx}`}
                                        onClick={() => setProjectedVerse(`[${item.verse} - ${selectedBibleVersion}] ${item.text}`)}
                                        className="px-3 py-1.5 bg-[#F8FAFC] text-white text-xs font-bold rounded-lg hover:bg-[#1D4ED8] transition-colors whitespace-nowrap cursor-pointer"
                                    >
                                        Project Live
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Live Stage Monitor Output Simulation */}
                    <div className="border border-[#334155] rounded-xl bg-[#F8FAFC] text-white p-6 text-center space-y-3 relative overflow-hidden min-h-[160px] flex flex-col justify-center items-center" id="stage-simulator">
                        <span className="absolute top-2 left-3 text-[10px] font-['JetBrains_Mono'] text-[#1D4ED8] uppercase tracking-widest font-bold bg-white/10 px-2 py-0.5 rounded">
                            STAGE OUTPUT SIMULATOR
                        </span>
                        {projectedVerse ? (
                            <p className="text-lg sm:text-xl font-bold font-['Geist'] text-white max-w-lg leading-relaxed animate-in fade-in duration-300">
                                "{projectedVerse}"
                            </p>
                        ) : (
                            <p className="text-sm text-[#94A3B8]">
                                Click "Project Live" above to broadcast verse to sanctuary output screen.
                            </p>
                        )}
                    </div>
                </div>

                {/* Side Panel - Plan Highlights & Church Service Checklist */}
                <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-6">
                    <h3 className="text-lg font-bold font-['Geist'] text-[#F8FAFC] flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#1D4ED8]">church</span>
                        Sunday Service Readiness
                    </h3>

                    <div className="space-y-3 text-xs">
                        <div className="flex items-center justify-between p-2.5 bg-[rgba(29,78,216,0.06)] rounded-lg">
                            <span className="font-medium text-[#F8FAFC]">Worship Lyrics Sync</span>
                            <span className="text-[#1D4ED8] font-bold">READY (12 Songs)</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-[rgba(29,78,216,0.06)] rounded-lg">
                            <span className="font-medium text-[#F8FAFC]">Bible Versions</span>
                            <span className="text-[#1D4ED8] font-bold">DOWNLOADED</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-[rgba(29,78,216,0.06)] rounded-lg">
                            <span className="font-medium text-[#F8FAFC]">Multi-Laptop Sync</span>
                            <span className="text-[#94A3B8]">Growth Plan Needed</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-[rgba(29,78,216,0.06)] rounded-lg">
                            <span className="font-medium text-[#F8FAFC]">AI Translation</span>
                            <span className="text-[#94A3B8]">Pro Plan Needed</span>
                        </div>
                    </div>

                    <div className="p-4 bg-[rgba(29,78,216,0.04)] rounded-xl space-y-3">
                        <h4 className="font-bold text-sm text-[#F8FAFC]">Upgrade Church Presentation Capability</h4>
                        <p className="text-xs text-[#CBD5E1]">
                            Unlock 2,000 AI credits, 2-Laptop presentation failover, and Android wireless remote controller.
                        </p>
                        <button
                            id="sidebar-upgrade-growth-btn"
                            onClick={() => onSelectUpgrade('growth')}
                            className="w-full py-2.5 bg-[#1D4ED8] text-white font-bold rounded-lg text-xs hover:bg-[#2563EB] transition-colors cursor-pointer"
                        >
                            Upgrade to Growth Plan (₦7,500/mo)
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
};

// ==========================================
// BILLING VIEW COMPONENT
// ==========================================
const BillingView: React.FC<{
    setActiveTab: (tab: ActiveTab) => void;
    onSelectUpgrade: (plan: 'growth' | 'pro') => void;
    activePlanName: string;
}> = ({ setActiveTab, activePlanName }) => {
    const [autoRenew, setAutoRenew] = useState(true);
    const [savedCard] = useState({
        last4: '4242',
        exp: '08/28',
        holder: 'Grace Cathedral Media Trust'
    });
    const [vatId, setVatId] = useState('NG-TIN-8890214-001');

    return (
        <main className="pt-24 pb-32 max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8" id="billing-page">
            <div>
                <h1 className="font-['Geist'] text-2xl md:text-3xl font-semibold text-[#F8FAFC] mb-1">
                    Billing & Invoices
                </h1>
                <p className="text-[#CBD5E1] text-sm sm:text-base">
                    Manage payment details, tax info, auto-renewal preferences and download past receipts.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[rgba(29,78,216,0.04)] pb-4">
                            <div>
                                <span className="text-xs font-['JetBrains_Mono'] text-[#1D4ED8] font-bold uppercase">
                                    Active Subscription
                                </span>
                                <h3 className="text-xl font-bold font-['Geist'] text-[#F8FAFC]">
                                    {activePlanName}
                                </h3>
                            </div>
                            <span className="px-3 py-1 bg-[rgba(29,78,216,0.06)] text-[#1D4ED8] text-xs font-bold rounded-full font-['JetBrains_Mono'] self-start sm:self-auto">
                                RECURRING MONTHLY
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-sm">
                            <div>
                                <span className="text-xs text-[#94A3B8] block">Monthly Amount</span>
                                <span className="font-bold text-[#F8FAFC]">₦3,500 / month</span>
                            </div>
                            <div>
                                <span className="text-xs text-[#94A3B8] block">Next Renewal Date</span>
                                <span className="font-bold text-[#F8FAFC]">August 01, 2026</span>
                            </div>
                            <div>
                                <span className="text-xs text-[#94A3B8] block">Auto-Renewal</span>
                                <div className="flex items-center gap-2 mt-1">
                                    <button
                                        id="autorenew-toggle-btn"
                                        onClick={() => setAutoRenew(!autoRenew)}
                                        className={`w-10 h-5 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${autoRenew ? 'bg-[#1D4ED8]' : 'bg-[#334155]'
                                            }`}
                                    >
                                        <div
                                            className={`w-4 h-4 bg-white rounded-full transform transition-transform ${autoRenew ? 'translate-x-5' : 'translate-x-0'
                                                }`}
                                        />
                                    </button>
                                    <span className="text-xs font-semibold">
                                        {autoRenew ? 'Enabled' : 'Disabled'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-2 flex flex-wrap gap-3">
                            <button
                                id="billing-change-plan-btn"
                                onClick={() => setActiveTab('compare')}
                                className="px-4 py-2 bg-[#1D4ED8] text-white font-bold rounded-lg text-xs hover:bg-[#2563EB] cursor-pointer"
                            >
                                Change Plan Tier
                            </button>
                            <button
                                id="billing-pause-sub-btn"
                                onClick={() => alert('Subscription paused for next month.')}
                                className="px-4 py-2 border border-[#334155] text-[#CBD5E1] font-semibold rounded-lg text-xs hover:bg-[rgba(29,78,216,0.04)] cursor-pointer"
                            >
                                Pause Subscription
                            </button>
                        </div>
                    </div>

                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <div className="flex justify-between items-center border-b border-[rgba(29,78,216,0.04)] pb-4">
                            <h3 className="text-lg font-bold font-['Geist'] text-[#F8FAFC] flex items-center gap-2">
                                <span className="material-symbols-outlined text-[#1D4ED8]">credit_card</span>
                                Payment Method
                            </h3>
                            <button
                                id="update-card-btn"
                                onClick={() => alert('Update payment method dialog.')}
                                className="text-xs text-[#1D4ED8] font-bold hover:underline cursor-pointer"
                            >
                                + Add / Update Card
                            </button>
                        </div>

                        <div className="p-4 border border-[#334155] rounded-xl bg-[rgba(29,78,216,0.06)] flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-8 bg-[#F8FAFC] text-white rounded flex items-center justify-center font-bold text-xs font-['JetBrains_Mono']">
                                    VISA
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-[#F8FAFC]">
                                        •••• •••• •••• {savedCard.last4}
                                    </p>
                                    <p className="text-xs text-[#94A3B8]">
                                        Expires {savedCard.exp} · {savedCard.holder}
                                    </p>
                                </div>
                            </div>
                            <span className="px-2.5 py-1 bg-[#1E293B] border border-[#334155] text-[10px] font-bold rounded font-['JetBrains_Mono']">
                                DEFAULT
                            </span>
                        </div>
                    </div>

                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <h3 className="text-lg font-bold font-['Geist'] text-[#F8FAFC] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#1D4ED8]">history</span>
                            Past Receipts & Invoices
                        </h3>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse">
                                <thead>
                                    <tr className="border-b border-[#334155] text-xs font-['JetBrains_Mono'] text-[#94A3B8] uppercase">
                                        <th className="py-2 px-3">Invoice ID</th>
                                        <th className="py-2 px-3">Date</th>
                                        <th className="py-2 px-3">Description</th>
                                        <th className="py-2 px-3">Amount</th>
                                        <th className="py-2 px-3">Status</th>
                                        <th className="py-2 px-3 text-right">Receipt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[rgba(29,78,216,0.04)]">
                                    {SAMPLE_INVOICES.map((inv) => (
                                        <tr key={inv.id} className="hover:bg-[#0F172A]">
                                            <td className="py-3 px-3 font-['JetBrains_Mono'] font-bold text-xs text-[#1D4ED8]">
                                                {inv.id}
                                            </td>
                                            <td className="py-3 px-3 text-xs text-[#CBD5E1]">{inv.date}</td>
                                            <td className="py-3 px-3 font-medium text-xs text-[#F8FAFC]">{inv.planName}</td>
                                            <td className="py-3 px-3 font-bold text-xs text-[#F8FAFC]">{inv.amount}</td>
                                            <td className="py-3 px-3">
                                                <span className="px-2 py-0.5 bg-[rgba(29,78,216,0.06)] text-[#1D4ED8] text-[10px] font-bold rounded-full font-['JetBrains_Mono']">
                                                    {inv.status}
                                                </span>
                                            </td>
                                            <td className="py-3 px-3 text-right">
                                                <button
                                                    id={`download-inv-${inv.id}`}
                                                    onClick={() => alert(`Downloading PDF Invoice ${inv.id}...`)}
                                                    className="text-xs text-[#1D4ED8] font-bold hover:underline flex items-center gap-1 justify-end ml-auto cursor-pointer"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">download</span>
                                                    PDF
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <h3 className="text-base font-bold font-['Geist'] text-[#F8FAFC]">
                            Tax & Ministry Information
                        </h3>

                        <div className="space-y-3">
                            <div>
                                <label className="text-xs text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    MINISTRY LEGAL NAME
                                </label>
                                <input
                                    type="text"
                                    id="ministry-legal-name-input"
                                    defaultValue="Grace Cathedral International Ltd"
                                    className="w-full px-3 py-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-xs font-semibold"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    TAX IDENTIFICATION NUMBER (TIN / VAT)
                                </label>
                                <input
                                    type="text"
                                    id="tin-vat-input"
                                    value={vatId}
                                    onChange={(e) => setVatId(e.target.value)}
                                    className="w-full px-3 py-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-xs font-semibold"
                                />
                            </div>

                            <div>
                                <label className="text-xs text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    BILLING EMAIL RECEIVER
                                </label>
                                <input
                                    type="email"
                                    id="billing-email-input"
                                    defaultValue="finance@gracecathedral.org"
                                    className="w-full px-3 py-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-xs font-semibold"
                                />
                            </div>

                            <button
                                id="save-billing-details-btn"
                                onClick={() => alert('Billing settings updated.')}
                                className="w-full py-2 bg-[#F8FAFC] text-white font-bold rounded-lg text-xs hover:opacity-90 cursor-pointer"
                            >
                                Save Billing Details
                            </button>
                        </div>
                    </div>

                    <div className="bg-[#1E293B] border border-[#334155] rounded-xl p-6 space-y-3">
                        <h4 className="font-bold text-sm text-[#F8FAFC]">Need Enterprise Invoicing?</h4>
                        <p className="text-xs text-[#CBD5E1]">
                            We issue official Tax/VAT invoices for Nigerian churches & international non-profit organizations.
                        </p>
                        <button
                            id="contact-billing-support-btn"
                            onClick={() => alert('Connecting to ChurchFlow Financial Billing Support...')}
                            className="w-full py-2 bg-[#1D4ED8] text-white font-bold rounded-lg text-xs hover:bg-[#2563EB] cursor-pointer"
                        >
                            Contact Billing Support
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
};

// ==========================================
// HISTORY VIEW COMPONENT
// ==========================================
const HistoryView: React.FC = () => {
    const historyLogs = [
        {
            id: 'LOG-1092',
            event: 'AI Credits Top-up',
            detail: '+50 Monthly AI Credits provisioned for July',
            user: 'System Automated',
            date: 'Jul 24, 2026, 08:00 AM'
        },
        {
            id: 'LOG-1088',
            event: 'Bible Offline Version Downloaded',
            detail: 'Downloaded Yoruba Bibeli Mimo (YOR) version',
            user: 'Media Lead (David O.)',
            date: 'Jul 20, 2026, 04:15 PM'
        },
        {
            id: 'LOG-1076',
            event: 'Subscription Renewal',
            detail: 'Basic Monthly Subscription renewed (₦3,500 NGN)',
            user: 'Auto-Pay Visa ••••4242',
            date: 'Jul 01, 2026, 12:01 AM'
        },
        {
            id: 'LOG-1050',
            event: 'Presentation Session Ended',
            detail: 'Sunday Morning Worship Session - 12 Song Lyrics & 14 Verses Projected',
            user: 'Display Server 01',
            date: 'Jun 28, 2026, 01:30 PM'
        }
    ];

    return (
        <main className="pt-24 pb-32 max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8" id="history-page">
            <div>
                <h1 className="font-['Geist'] text-2xl md:text-3xl font-semibold text-[#F8FAFC] mb-1">
                    Activity & Plan History
                </h1>
                <p className="text-[#CBD5E1] text-sm sm:text-base">
                    Audit trail of plan modifications, AI credit usage, and Sunday presentation session logs.
                </p>
            </div>

            <div className="bg-white border border-[#334155] rounded-xl p-6 shadow-xs space-y-4">
                <div className="flex justify-between items-center border-b border-[rgba(29,78,216,0.04)] pb-3">
                    <span className="text-xs font-['JetBrains_Mono'] text-[#94A3B8] font-bold uppercase">
                        RECENT ACTIVITY LOGS
                    </span>
                    <button
                        id="export-csv-btn"
                        onClick={() => alert('Exported CSV Audit Logs.')}
                        className="text-xs text-[#1D4ED8] font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                        <span className="material-symbols-outlined text-[16px]">download</span>
                        Export CSV
                    </button>
                </div>

                <div className="space-y-3">
                    {historyLogs.map((log) => (
                        <div
                            key={log.id}
                            className="p-4 border border-[#334155]/60 rounded-xl bg-[rgba(29,78,216,0.06)]/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[rgba(29,78,216,0.06)] transition-colors"
                        >
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-['JetBrains_Mono'] font-bold text-[#1D4ED8]">
                                        {log.id}
                                    </span>
                                    <span className="font-bold text-sm text-[#F8FAFC]">{log.event}</span>
                                </div>
                                <p className="text-xs text-[#CBD5E1]">{log.detail}</p>
                            </div>

                            <div className="text-right text-xs text-[#94A3B8] self-start sm:self-auto">
                                <p className="font-medium text-[#F8FAFC]">{log.user}</p>
                                <p className="font-['JetBrains_Mono'] text-[10px] mt-0.5">{log.date}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
};

// ==========================================
// SETTINGS VIEW COMPONENT
// ==========================================
const SettingsView: React.FC = () => {
    const [churchName, setChurchName] = useState('Grace Cathedral');
    const [motto, setMotto] = useState('Built for Ministry Excellence');
    const [primaryLang, setPrimaryLang] = useState('English / Yoruba');

    return (
        <main className="pt-24 pb-32 max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8" id="settings-page">
            <div>
                <h1 className="font-['Geist'] text-2xl md:text-3xl font-semibold text-[#F8FAFC] mb-1">
                    Ministry & System Settings
                </h1>
                <p className="text-[#CBD5E1] text-sm sm:text-base">
                    Configure church organization branding, admin permissions, display resolutions, and regional localization defaults.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <h3 className="text-lg font-bold font-['Geist'] text-[#F8FAFC] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#1D4ED8]">church</span>
                            Church Organization Branding
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    CHURCH / MINISTRY NAME
                                </label>
                                <input
                                    type="text"
                                    id="settings-church-name-input"
                                    value={churchName}
                                    onChange={(e) => setChurchName(e.target.value)}
                                    className="w-full px-4 py-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-semibold"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    TAGLINE / MINISTRY MOTTO
                                </label>
                                <input
                                    type="text"
                                    id="settings-motto-input"
                                    value={motto}
                                    onChange={(e) => setMotto(e.target.value)}
                                    className="w-full px-4 py-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-semibold"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    PRIMARY WORSHIP LANGUAGES
                                </label>
                                <input
                                    type="text"
                                    id="settings-lang-input"
                                    value={primaryLang}
                                    onChange={(e) => setPrimaryLang(e.target.value)}
                                    className="w-full px-4 py-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-semibold"
                                />
                            </div>

                            <button
                                id="save-branding-btn"
                                onClick={() => alert('Church profile settings updated successfully!')}
                                className="py-2.5 px-6 bg-[#1D4ED8] text-white font-bold rounded-lg text-xs hover:bg-[#2563EB] cursor-pointer"
                            >
                                Save Branding Settings
                            </button>
                        </div>
                    </div>

                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <h3 className="text-lg font-bold font-['Geist'] text-[#F8FAFC] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#1D4ED8]">aspect_ratio</span>
                            Sanctuary Display Defaults
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    STAGE DISPLAY ASPECT RATIO
                                </label>
                                <select className="w-full p-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg font-semibold cursor-pointer">
                                    <option>16:9 Widescreen (1080p / 4K)</option>
                                    <option>16:10 LED Wall Custom Ratio</option>
                                    <option>4:3 Legacy Projector</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    DEFAULT BIBLE TEXT SIZE
                                </label>
                                <select className="w-full p-2 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg font-semibold cursor-pointer">
                                    <option>Large (48pt) - High Visibility</option>
                                    <option>Medium (36pt)</option>
                                    <option>Extra Large (60pt)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <h3 className="text-base font-bold font-['Geist'] text-[#F8FAFC]">
                            Media Operators & Admins
                        </h3>

                        <div className="space-y-3 text-xs">
                            <div className="p-3 bg-[rgba(29,78,216,0.06)] rounded-lg flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-[#F8FAFC]">David O. (Lead Admin)</p>
                                    <p className="text-[10px] text-[#94A3B8]">david@gracecathedral.org</p>
                                </div>
                                <span className="text-[10px] font-bold text-[#1D4ED8] uppercase font-['JetBrains_Mono']">OWNER</span>
                            </div>

                            <div className="p-3 bg-[rgba(29,78,216,0.06)] rounded-lg flex items-center justify-between">
                                <div>
                                    <p className="font-bold text-[#F8FAFC]">Sarah A. (Operator)</p>
                                    <p className="text-[10px] text-[#94A3B8]">sarah@gracecathedral.org</p>
                                </div>
                                <span className="text-[10px] font-bold text-[#94A3B8] uppercase font-['JetBrains_Mono']">EDITOR</span>
                            </div>
                        </div>

                        <button
                            id="invite-operator-btn"
                            onClick={() => alert('Invite member modal.')}
                            className="w-full py-2 bg-[#F8FAFC] text-white font-bold rounded-lg text-xs hover:opacity-90 cursor-pointer"
                        >
                            + Invite Media Operator
                        </button>
                    </div>
                </div>
            </div>
        </main>
    );
};

// ==========================================
// SUPPORT VIEW COMPONENT
// ==========================================
const SupportView: React.FC = () => {
    const [ticketSubject, setTicketSubject] = useState('');
    const [ticketMsg, setTicketMsg] = useState('');
    const [submitted, setSubmitted] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!ticketSubject || !ticketMsg) return;
        setSubmitted(true);
    };

    return (
        <main className="pt-24 pb-32 max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8" id="support-page">
            <div>
                <h1 className="font-['Geist'] text-2xl md:text-3xl font-semibold text-[#F8FAFC] mb-1">
                    Ministry Technical Support Desk
                </h1>
                <p className="text-[#CBD5E1] text-sm sm:text-base">
                    Get priority help for live Sunday service setup, NDI streaming issues, or remote controllers.
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white border border-[#334155] rounded-xl p-6 sm:p-8 space-y-6">
                    <h3 className="text-xl font-bold font-['Geist'] text-[#F8FAFC]">
                        Submit Urgent Support Ticket
                    </h3>

                    {submitted ? (
                        <div className="p-6 bg-[rgba(29,78,216,0.06)] border border-[#1D4ED8] rounded-xl text-center space-y-3">
                            <span className="material-symbols-outlined text-[#1D4ED8] text-[40px]">check_circle</span>
                            <h4 className="font-bold text-lg text-[#F8FAFC]">Support Ticket #TKT-8841 Opened</h4>
                            <p className="text-xs text-[#CBD5E1]">
                                Our church systems engineer team has been alerted. Your response SLA is <strong className="text-[#1D4ED8]">within 12 hours</strong>.
                            </p>
                            <button
                                id="another-ticket-btn"
                                onClick={() => { setSubmitted(false); setTicketSubject(''); setTicketMsg(''); }}
                                className="px-4 py-2 bg-[#F8FAFC] text-white font-bold rounded-lg text-xs cursor-pointer"
                            >
                                Submit Another Inquiry
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    ISSUE CATEGORY
                                </label>
                                <select className="w-full px-4 py-2.5 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-semibold cursor-pointer">
                                    <option>Display / Projection Output Lag</option>
                                    <option>Android Scene Remote Connection</option>
                                    <option>Billing / Plan Upgrade Assistance</option>
                                    <option>AI Lyrics & Bible Search</option>
                                    <option>Other Ministry Tech Inquiry</option>
                                </select>
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    SUBJECT
                                </label>
                                <input
                                    type="text"
                                    id="support-subject-input"
                                    placeholder="e.g. Cannot connect second presentation laptop..."
                                    value={ticketSubject}
                                    onChange={(e) => setTicketSubject(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-semibold"
                                    required
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-[#94A3B8] font-['JetBrains_Mono'] block mb-1">
                                    DESCRIPTION OF ISSUES BEFORE SUNDAY SERVICE
                                </label>
                                <textarea
                                    rows={4}
                                    id="support-message-input"
                                    placeholder="Describe what happened or error messages shown..."
                                    value={ticketMsg}
                                    onChange={(e) => setTicketMsg(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-[rgba(29,78,216,0.06)] border border-[#334155] rounded-lg text-sm font-semibold"
                                    required
                                />
                            </div>

                            <button
                                type="submit"
                                id="submit-support-ticket-btn"
                                className="w-full py-3 bg-[#1D4ED8] text-white font-bold rounded-xl hover:bg-[#2563EB] shadow-lg shadow-[#1D4ED8]/20 transition-colors text-sm cursor-pointer"
                            >
                                Submit High Priority Ticket
                            </button>
                        </form>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="bg-white border border-[#334155] rounded-xl p-6 space-y-4">
                        <h3 className="font-bold text-base text-[#F8FAFC]">Knowledge Base Quick Links</h3>
                        <ul className="space-y-2 text-xs">
                            <li>
                                <a href="#" onClick={(e) => { e.preventDefault(); alert('Opening Guide...'); }} className="text-[#1D4ED8] hover:underline font-medium flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px]">menu_book</span>
                                    How to setup 2-Laptop Failover Presentation
                                </a>
                            </li>
                            <li>
                                <a href="#" onClick={(e) => { e.preventDefault(); alert('Opening Guide...'); }} className="text-[#1D4ED8] hover:underline font-medium flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px]">smartphone</span>
                                    Connecting Android Scene Remote on Local Wi-Fi
                                </a>
                            </li>
                            <li>
                                <a href="#" onClick={(e) => { e.preventDefault(); alert('Opening Guide...'); }} className="text-[#1D4ED8] hover:underline font-medium flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[16px]">translate</span>
                                    Live AI Translation for Multilingual Services
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>
            </div>
        </main>
    );
};

// ==========================================
// MAIN APP ENTRY POINT
// ==========================================
export default function App() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('compare');
    const [activePlanName, setActivePlanName] = useState<string>('Basic Plan');
    const {
        pricing, loading: pricingLoading, formatPrice, getPlanPrice, getIntroPrice, rawCurrency,
    } = useLocalizedPricing();

    const [region, setRegionState] = useState<CurrencyRegion>(() => {
        const val = localStorage.getItem("pricingRegion");
        if (val === 'nigeria') return 'ngn';
        if (val === 'africa') return 'africa';
        if (val === 'global') return 'global';
        return 'global';
    });
    const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

    const setRegion = (r: CurrencyRegion) => {
        setRegionState(r);
        try {
            localStorage.setItem("pricingRegion", r === 'ngn' ? 'nigeria' : r);
            localStorage.setItem("pricingRegionManual", "true");
        } catch { }
    };

    const [caseStudiesOpen, setCaseStudiesOpen] = useState<boolean>(false);

    const handleSelectUpgrade = async (plan: 'growth' | 'pro' | 'free' | 'ambassador') => {
        if (plan === 'free' || plan === 'ambassador') return;
        const amount = getPlanPrice(plan, billingCycle);
        try {
            const res = await fetch('/api/payments/initialize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan, billingCycle, region: region === 'ngn' ? 'nigeria' : region }),
            });
            const data = await res.json();
            if (data?.authorization_url) {
                try {
                    const handler = (window as any).PaystackPop?.setup || (window as any).PaystackPop;
                    if (handler) {
                        handler({
                            key: data.publicKey || '',
                            email: data.email || '',
                            amount: Math.round(amount * 100),
                            ref: data.reference || '',
                            currency: rawCurrency,
                            channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
                            callback: () => window.location.reload(),
                            onClose: () => { },
                        });
                        return;
                    }
                } catch { }
                window.location.href = data.authorization_url;
            } else if (data?.error) {
                alert(data.error);
            }
        } catch { /* ignore */ }
    };

    const handleSuccessUpgrade = (newPlanName: string) => {
        setActivePlanName(newPlanName);
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#0F172A] text-[#F8FAFC] font-['Inter'] selection:bg-[#1D4ED8] selection:text-[rgba(29,78,216,0.08)]" id="app-root">
            {/* Main Content Body — dashboard provides header/footer */}
            {pricingLoading ? (
                <div className="flex-1 pt-16 flex items-center justify-center">
                    <span className="animate-spin w-8 h-8 border-3 border-gray-300 border-t-blue-600 rounded-full" />
                    <span className="ml-3 text-gray-500 text-sm">Detecting your local pricing...</span>
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}} .animate-spin{animation:spin .8s linear infinite;border-style:solid}`}</style>
                </div>
            ) : (
                <div className="flex-1 pt-16 pb-8">
                    <ComparePlansView
                        setActiveTab={setActiveTab}
                        onSelectUpgrade={handleSelectUpgrade}
                        onOpenCaseStudies={() => setCaseStudiesOpen(true)}
                        region={region}
                        setRegion={setRegion}
                        billingCycle={billingCycle}
                        setBillingCycle={setBillingCycle}
                        formatPrice={formatPrice}
                        getPlanPrice={getPlanPrice}
                        getIntroPrice={getIntroPrice}
                        pricing={pricing}
                    />
                </div>
            )}

            <CaseStudiesModal
                isOpen={caseStudiesOpen}
                onClose={() => setCaseStudiesOpen(false)}
                onContactUs={() => {
                    setCaseStudiesOpen(false);
                    setActiveTab('support');
                }}
            />
        </div>
    );
}
