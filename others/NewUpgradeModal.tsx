/**
 * NewUpgradeModal — Exact structure & class names from original.
 * Only changes: props for dynamic data, no hardcoded plan names/quantities.
 */
import './NewUpgradeModal.css'

import {
    X,
    Star,
    User,
    Music,
    Image as ImageIcon,
    Video,
    Monitor,
    Check,
    Zap,
    Menu,
    Smartphone,
    Send,
    ShieldCheck,
} from 'lucide-react';

import type { PlanTier } from '../src/services/licenseService';

/* ── Plan metadata ── */

const PLAN_DISPLAY: Record<PlanTier, { label: string; color: string; price: string; period: string }> = {
    free: { label: "Free", color: "#8a8a8a", price: "", period: "" },
    trial: { label: "Trial", color: "#7b68ee", price: "", period: "" },
    basic: { label: "Basic", color: "#5b9bd5", price: "₦3,500", period: "/month" },
    growth: { label: "Growth", color: "#c55a11", price: "₦7,500", period: "/month" },
    pro: { label: "Pro", color: "#7b68ee", price: "₦12,000", period: "/month" },
    ambassador: { label: "Ambassador", color: "#d4af37", price: "", period: "" },
    unlimited: { label: "Unlimited", color: "#d4af37", price: "", period: "" },
};

const PLAN_FEATURES: Record<string, Record<PlanTier, string>> = {
    songs: { free: "3", trial: "∞", basic: "70", growth: "∞", pro: "∞", ambassador: "∞", unlimited: "∞" },
    images: { free: "3", trial: "∞", basic: "70", growth: "∞", pro: "∞", ambassador: "∞", unlimited: "∞" },
    videos: { free: "3", trial: "∞", basic: "70", growth: "∞", pro: "∞", ambassador: "∞", unlimited: "∞" },
    themes: { free: "2", trial: "∞", basic: "3", growth: "∞", pro: "∞", ambassador: "∞", unlimited: "∞" },
    devices: { free: "1", trial: "∞", basic: "5", growth: "∞", pro: "∞", ambassador: "∞", unlimited: "∞" },
    aiFeatures: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓", unlimited: "✓" },
    multiview: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓", unlimited: "✓" },
    mobileControl: { free: "—", trial: "✓", basic: "—", growth: "✓", pro: "✓", ambassador: "✓", unlimited: "✓" },
};

function getQuantityText(value: string, singular: string, plural: string): string {
    if (value === "∞") return `Unlimited ${plural}`;
    const n = Number(value);
    return `${value} ${n > 1 || n === 0 ? plural : singular}`;
}

/* ── Props ── */

export interface NewUpgradeModalProps {
    open: boolean;
    onClose: () => void;
    feature?: string;
    requiredPlan?: PlanTier;
    currentPlan?: PlanTier;
    message?: string;
}

/* ── Component ── */

export default function NewUpgradeModal({
    open,
    onClose,
    feature: _feature,
    requiredPlan = "basic",
    currentPlan = "free",
    message,
}: NewUpgradeModalProps) {
    if (!open) return null;

    const req = PLAN_DISPLAY[requiredPlan];
    const cur = PLAN_DISPLAY[currentPlan];
    const F = PLAN_FEATURES;

    return (
        <div className="ssm-backdrop" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>

                {/* Close Button */}
                <button
                    aria-label="Close"
                    className="close-btn"
                    onClick={onClose}
                >
                    <X />
                </button>

                {/* Header Section */}
                <div className="header-section">
                    <div className="header-icon-wrapper">
                        <div className="star-container">
                            <Star className="star-icon" />
                            <div className="sparkle left">✦</div>
                            <div className="sparkle right">✦</div>
                        </div>
                    </div>
                    <h1 className="header-title">Upgrade to Unlock More</h1>
                    <p className="header-desc">
                        {message || `Your ${cur.label} plan is limited. Upgrade to store more media, connect more devices and access powerful features.`}
                    </p>
                </div>

                {/* Plans Section */}
                <div className="plans-section">

                    {/* Free Plan Card */}
                    <div className="plan-card free-plan">
                        <div>
                            <div className="plan-header">
                                <div className="plan-icon-box">
                                    <User />
                                </div>
                                <div className="plan-title-wrapper">
                                    <h3 className="plan-title">{cur.label} Plan</h3>
                                    <span className="current-plan-badge">
                                        Current Plan
                                    </span>
                                </div>
                            </div>
                            <ul className="plan-features-list">
                                <li className="plan-feature-item">
                                    <span className="feature-icon icon-purple">
                                        <Music />
                                    </span>
                                    <span>{getQuantityText(F.songs[currentPlan], "Song", "Songs")}</span>
                                </li>
                                <li className="plan-feature-item">
                                    <span className="feature-icon icon-blue">
                                        <ImageIcon />
                                    </span>
                                    <span>{getQuantityText(F.images[currentPlan], "Image", "Images")}</span>
                                </li>
                                <li className="plan-feature-item">
                                    <span className="feature-icon icon-green">
                                        <Video />
                                    </span>
                                    <span>{getQuantityText(F.videos[currentPlan], "Video", "Videos")}</span>
                                </li>
                                <li className="plan-feature-item">
                                    <span className="feature-icon icon-yellow">
                                        <Monitor />
                                    </span>
                                    <span>{getQuantityText(F.devices[currentPlan], "Device", "Devices")}</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    {/* Basic Plan Card (Featured) */}
                    <div className="plan-card basic-plan">
                        {/* Most Popular Badge */}
                        <div className="popular-badge">
                            Most Popular
                        </div>

                        <div>
                            <div className="plan-header">
                                <div className="plan-icon-box">
                                    <Star />
                                </div>
                                <div className="plan-title-wrapper">
                                    <h3 className="plan-title">{req.label} Plan</h3>
                                    <div className="price-container">
                                        <span className="price-amount">{req.price}</span>
                                        <span className="price-period">{req.period}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="basic-features-grid">
                                {/* Left Column Basic Features */}
                                <ul className="plan-features-list">
                                    <li className="plan-feature-item">
                                        <span className="feature-icon icon-purple">
                                            <Music />
                                        </span>
                                        <span>{getQuantityText(F.songs[requiredPlan], "Song", "Songs")}</span>
                                    </li>
                                    <li className="plan-feature-item">
                                        <span className="feature-icon icon-blue">
                                            <ImageIcon />
                                        </span>
                                        <span>{getQuantityText(F.images[requiredPlan], "Image", "Images")}</span>
                                    </li>
                                    <li className="plan-feature-item">
                                        <span className="feature-icon icon-green">
                                            <Video />
                                        </span>
                                        <span>{getQuantityText(F.videos[requiredPlan], "Video", "Videos")}</span>
                                    </li>
                                    <li className="plan-feature-item">
                                        <span className="feature-icon icon-yellow">
                                            <Monitor />
                                        </span>
                                        <span>{getQuantityText(F.devices[requiredPlan], "Device", "Devices")}</span>
                                    </li>
                                </ul>

                                {/* Right Column Advanced Features */}
                                <ul className="plan-features-list advanced-features-list">
                                    {F.aiFeatures[requiredPlan] === "✓" && (
                                        <li className="plan-feature-item">
                                            <span className="feature-icon icon-purple">
                                                <Check strokeWidth={3} />
                                            </span>
                                            <span>AI Features</span>
                                        </li>
                                    )}
                                    {F.multiview[requiredPlan] === "✓" && (
                                        <li className="plan-feature-item">
                                            <span className="feature-icon icon-purple">
                                                <Check strokeWidth={3} />
                                            </span>
                                            <span>MultiView</span>
                                        </li>
                                    )}
                                    {F.mobileControl[requiredPlan] === "✓" && (
                                        <li className="plan-feature-item">
                                            <span className="feature-icon icon-purple">
                                                <Check strokeWidth={3} />
                                            </span>
                                            <span>Mobile Control</span>
                                        </li>
                                    )}
                                    <li className="plan-feature-item">
                                        <span className="feature-icon icon-purple">
                                            <Check strokeWidth={3} />
                                        </span>
                                        <span>Priority Support</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>

                </div>

                {/* Perks Section */}
                <div className="perks-section">
                    <h4 className="perks-title">What You'll Unlock</h4>
                    <div className="perks-grid">

                        {/* Perk 1: Songs */}
                        {PLAN_FEATURES.songs[requiredPlan] !== "—" && (
                            <div className="perk-item">
                                <div className="perk-icon-wrapper perk-purple">
                                    <Music />
                                </div>
                                <span className="perk-text">Store up to<br />{getQuantityText(F.songs[requiredPlan], "Song", "Songs")}</span>
                            </div>
                        )}

                        {/* Perk 2: Images */}
                        {PLAN_FEATURES.images[requiredPlan] !== "—" && (
                            <div className="perk-item">
                                <div className="perk-icon-wrapper perk-blue">
                                    <ImageIcon />
                                </div>
                                <span className="perk-text">Store up to<br />{getQuantityText(F.images[requiredPlan], "Image", "Images")}</span>
                            </div>
                        )}

                        {/* Perk 3: Videos */}
                        {PLAN_FEATURES.videos[requiredPlan] !== "—" && (
                            <div className="perk-item">
                                <div className="perk-icon-wrapper perk-green">
                                    <Video />
                                </div>
                                <span className="perk-text">Store up to<br />{getQuantityText(F.videos[requiredPlan], "Video", "Videos")}</span>
                            </div>
                        )}

                        {/* Perk 4: Devices */}
                        {PLAN_FEATURES.devices[requiredPlan] !== "—" && (
                            <div className="perk-item">
                                <div className="perk-icon-wrapper perk-yellow">
                                    <Monitor />
                                </div>
                                <span className="perk-text">Connect up to<br />{getQuantityText(F.devices[requiredPlan], "Device", "Devices")}</span>
                            </div>
                        )}

                        {/* Perk 5: AI */}
                        {PLAN_FEATURES.aiFeatures[requiredPlan] === "✓" && (
                            <div className="perk-item">
                                <div className="perk-icon-wrapper perk-purple">
                                    <Zap />
                                </div>
                                <span className="perk-text">Access<br />AI Features</span>
                            </div>
                        )}

                        {/* Perk 6: MultiView */}
                        {PLAN_FEATURES.multiview[requiredPlan] === "✓" && (
                            <div className="perk-item">
                                <div className="perk-icon-wrapper perk-blue">
                                    <Menu />
                                </div>
                                <span className="perk-text">Use<br />MultiView</span>
                            </div>
                        )}

                        {/* Perk 7: Mobile */}
                        {PLAN_FEATURES.mobileControl[requiredPlan] === "✓" && (
                            <div className="perk-item">
                                <div className="perk-icon-wrapper perk-green">
                                    <Smartphone />
                                </div>
                                <span className="perk-text">Control OBS<br />from Mobile</span>
                            </div>
                        )}

                    </div>
                </div>

                {/* Footer Action Section */}
                <div className="action-section">
                    <button className="btn btn-secondary" onClick={onClose}>
                        Maybe Later
                    </button>
                    <button className="btn btn-primary" onClick={() => window.open("https://makechurcheasy.creatorstudioslabs.stream/pricing", "_blank")}>
                        <Send />
                        Upgrade to {req.label}
                    </button>
                </div>

                <div className="footer-note">
                    <ShieldCheck />
                    Cancel anytime. No hidden fees.
                </div>

            </div>
        </div>
    );
}
