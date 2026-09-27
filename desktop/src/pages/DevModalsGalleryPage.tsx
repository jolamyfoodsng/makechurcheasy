/**
 * DevModalsGalleryPage.tsx — Modals & Announcements Design Gallery
 *
 * EXCLUSIVE TO LOCAL DEVELOPMENT FOR ADMINS (NEVER INCLUDED OR ACCESSIBLE IN PROD).
 * Provides an interactive testbed to trigger, preview, and verify all dialogs,
 * confirmations, paywalls, updates, and promotional announcements in MakeChurchEasy.
 */

import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import {
  FlaskConical,
  Globe,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Tag,
  Clock,
  Eye,
  Lock,
  X,
  Undo,
  RotateCcw,
  Trash2,
  Monitor,
  Bell,
  Check,
  Copy,
  ExternalLink,
  ShieldAlert,
  Flame,
  HelpCircle,
} from "lucide-react";
import { INTERFACE_LOCALES } from "../i18n/localeCatalog";
import { getInterfaceLanguageLabel } from "../services/interfaceLanguage";
import { UpgradeModal } from "../components/UpgradeModal";
import ForceUpdateModal from "../components/ForceUpdateModal";
import TrialModal from "../components/TrialModal";
import DockPresentationLinkModal from "../dock/components/DockPresentationLinkModal";
import type { DesktopAnnouncement } from "../services/announcementService";
import "./dev-modals.css";

// ── Sample Data for Live Previews ──────────────────────────────────────────

const SAMPLE_UPDATE_INFO = {
  available: true,
  currentVersion: "3.30.0",
  latestVersion: "3.31.0",
  releaseNotes: "• Redesigned modern modals with glassmorphic backdrop blur\n• Real-time high-speed device sync\n• Enhanced worship lyrics auto-alignment",
  mandatory: false,
  releaseDate: new Date().toISOString(),
  downloadUrl: "https://makechurcheasy.com/downloads",
};

const SAMPLE_ANNOUNCEMENTS: Record<string, DesktopAnnouncement> = {
  blackFriday: {
    id: "promo-black-friday-preview",
    deliveryId: "del-bf-preview",
    title: "Annual Ministry Celebration Sale!",
    message: "Get 40% OFF the MakeChurchEasy Growth Plan for your entire media team. Includes unlimited AI transcription, 4K multi-screen dock, and priority support.",
    tone: "offer",
    tags: ["promo", "growth"],
    ctaLabel: "Claim 40% Discount",
    ctaUrl: "https://makechurcheasy.com/subscription/plans?promo=CELEBRATE40",
    offerCode: "CELEBRATE40",
    offerDiscountPercent: 40,
    expiresAt: new Date(Date.now() + 86400000 * 3).toISOString(),
    offerApplicablePlans: ["growth"],
    offerApplicableBillingCycles: ["yearly"],
  },
  newFeature: {
    id: "feature-verse-ai-preview",
    deliveryId: "del-verse-ai-preview",
    title: "Introducing Speech-to-Scripture 2.0",
    message: "Experience near-instant offline Bible verse detection as pastors speak. Automatic citation overlays and zero cloud lag.",
    tone: "upgrade",
    tags: ["feature", "speech"],
    ctaLabel: "Explore Features",
    ctaUrl: "https://makechurcheasy.com/features",
  },
  maintenance: {
    id: "system-notice-preview",
    deliveryId: "del-maintenance-preview",
    title: "Scheduled Cloud Sync Maintenance",
    message: "Cloud song backup and online sync will undergo scheduled maintenance this Sunday between 02:00 UTC and 04:00 UTC. Local dock & OBS features will continue working uninterrupted.",
    tone: "warning",
    tags: ["maintenance", "system"],
    ctaLabel: "View Status Page",
    ctaUrl: "https://status.makechurcheasy.com",
  },
};

type ActiveModalId =
  | null
  | "language"
  | "announcement_offer"
  | "announcement_feature"
  | "announcement_warning"
  | "upgrade_growth"
  | "upgrade_mobile"
  | "trial_welcome"
  | "trial_expired"
  | "update_optional"
  | "update_force"
  | "update_bg_notice"
  | "update_close_warning"
  | "confirm_reset_canvas"
  | "confirm_undo"
  | "confirm_delete"
  | "confirm_replace_slot"
  | "confirm_live_scene"
  | "dock_presentation_link"
  | "shortcuts";

export default function DevModalsGalleryPage() {
  // ── Absolute Safety Gate: Local dev environment ONLY ──
  if (!import.meta.env.DEV) {
    return <Navigate to="/" replace />;
  }

  const [activeModal, setActiveModal] = useState<ActiveModalId>(null);
  const [selectedLanguageCode, setSelectedLanguageCode] = useState("ak");
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "system" | "announcements" | "updates" | "plans" | "studio">("all");
  const [copiedCode, setCopiedCode] = useState(false);

  // Close on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && activeModal) {
        setActiveModal(null);
        setLastAction("Closed via ESC key");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeModal]);

  const handleAction = (msg: string) => {
    setLastAction(msg);
    setActiveModal(null);
  };

  const copyPromoCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="dev-modals-page">
      {/* Top Banner */}
      <header className="dev-modals-header">
        <div className="dev-modals-header__top">
          <span className="dev-modals-badge">
            <FlaskConical size={14} />
            LOCAL DEV ADMIN ONLY
          </span>
          <span className="dev-modals-scope-tag">
            Never visible in production
          </span>
        </div>
        <h1 className="dev-modals-title">Modals & Announcements Gallery</h1>
        <p className="dev-modals-subtitle">
          Interactive testbench to preview, test keyboard shortcuts (ESC), and audit the visual design of every dialog and announcement banner across MakeChurchEasy.
        </p>

        {lastAction && (
          <div className="dev-modals-toast" role="status">
            <CheckCircle size={15} />
            <span>Last trigger result: <strong>{lastAction}</strong></span>
            <button type="button" onClick={() => setLastAction(null)}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* Tab Filters */}
        <div className="dev-modals-filter-tabs">
          <button
            type="button"
            className={`dev-filter-tab${activeTab === "all" ? " is-active" : ""}`}
            onClick={() => setActiveTab("all")}
          >
            All Modals
          </button>
          <button
            type="button"
            className={`dev-filter-tab${activeTab === "system" ? " is-active" : ""}`}
            onClick={() => setActiveTab("system")}
          >
            System & Language
          </button>
          <button
            type="button"
            className={`dev-filter-tab${activeTab === "announcements" ? " is-active" : ""}`}
            onClick={() => setActiveTab("announcements")}
          >
            Announcements & Offers
          </button>
          <button
            type="button"
            className={`dev-filter-tab${activeTab === "updates" ? " is-active" : ""}`}
            onClick={() => setActiveTab("updates")}
          >
            App Updates
          </button>
          <button
            type="button"
            className={`dev-filter-tab${activeTab === "plans" ? " is-active" : ""}`}
            onClick={() => setActiveTab("plans")}
          >
            Plans, Trials & Paywalls
          </button>
          <button
            type="button"
            className={`dev-filter-tab${activeTab === "studio" ? " is-active" : ""}`}
            onClick={() => setActiveTab("studio")}
          >
            Studio & Confirmations
          </button>
        </div>
      </header>

      {/* Grid of Preview Cards */}
      <div className="dev-modals-grid">
        {/* 1. Language Change Modal */}
        {(activeTab === "all" || activeTab === "system") && (
          <article className="dev-modal-card dev-modal-card--highlight">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--indigo">
                <Globe size={20} />
              </span>
              <span className="dev-card-category">Settings Dialog</span>
            </div>
            <h3>Change Language Confirmation</h3>
            <p>
              The redesigned confirmation dialog triggered when selecting a new language in Settings &gt; General. Features a glowing Globe icon, backdrop blur, and modern dark design.
            </p>
            <div className="dev-modal-card__config">
              <label>Test language target:</label>
              <select
                value={selectedLanguageCode}
                onChange={(e) => setSelectedLanguageCode(e.target.value)}
                className="dev-modal-select"
              >
                {INTERFACE_LOCALES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.nativeName} ({l.code})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="dev-launch-btn dev-launch-btn--primary"
              onClick={() => setActiveModal("language")}
            >
              <Eye size={16} />
              Preview Redesigned Modal
            </button>
          </article>
        )}

        {/* 2. Announcement - Offer Promo */}
        {(activeTab === "all" || activeTab === "announcements") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--amber">
                <Tag size={20} />
              </span>
              <span className="dev-card-category">Promotional Banner</span>
            </div>
            <h3>Special Offer Announcement</h3>
            <p>
              Server-delivered promotional announcement with a discount badge (-40%), countdown timer, coupon code with one-click copy, and upgrade CTA.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("announcement_offer")}
            >
              <Eye size={16} />
              Preview Offer Announcement
            </button>
          </article>
        )}

        {/* 3. Announcement - New Feature */}
        {(activeTab === "all" || activeTab === "announcements") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--emerald">
                <Sparkles size={20} />
              </span>
              <span className="dev-card-category">Product Update</span>
            </div>
            <h3>Feature Announcement</h3>
            <p>
              Product update announcement broadcast to desktop users announcing new capabilities (e.g. Speech-to-Scripture 2.0).
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("announcement_feature")}
            >
              <Eye size={16} />
              Preview Feature Notice
            </button>
          </article>
        )}

        {/* 4. Announcement - System Warning */}
        {(activeTab === "all" || activeTab === "announcements") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--red">
                <AlertTriangle size={20} />
              </span>
              <span className="dev-card-category">System Advisory</span>
            </div>
            <h3>Maintenance / Warning Notice</h3>
            <p>
              Warning/advisory announcement modal notifying production teams about upcoming cloud maintenance or network alerts.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("announcement_warning")}
            >
              <Eye size={16} />
              Preview Warning Notice
            </button>
          </article>
        )}

        {/* 5. Optional Update Dialog */}
        {(activeTab === "all" || activeTab === "updates") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--indigo">
                <RefreshCw size={20} />
              </span>
              <span className="dev-card-category">Software Lifecycle</span>
            </div>
            <h3>Optional App Update Dialog</h3>
            <p>
              Shows when a new release is detected. Displays current version, new version, release notes, &quot;Update Now&quot;, and &quot;Remind Me Later&quot;.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("update_optional")}
            >
              <Eye size={16} />
              Preview Update Dialog
            </button>
          </article>
        )}

        {/* 6. Mandatory Force Update */}
        {(activeTab === "all" || activeTab === "updates") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--red">
                <Lock size={20} />
              </span>
              <span className="dev-card-category">Security Gate</span>
            </div>
            <h3>Mandatory Force Update</h3>
            <p>
              Locked modal displayed when the app version is too old to safely communicate with the server. Unclosable until updated.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("update_force")}
            >
              <Eye size={16} />
              Preview Force Update
            </button>
          </article>
        )}

        {/* 7. Background Update Download Notice */}
        {(activeTab === "all" || activeTab === "updates") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--indigo">
                <Bell size={20} />
              </span>
              <span className="dev-card-category">Background Task</span>
            </div>
            <h3>Update Downloading in Background</h3>
            <p>
              Modal notifying the user that the installer is downloading in the background while they continue using the software.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("update_bg_notice")}
            >
              <Eye size={16} />
              Preview Background Notice
            </button>
          </article>
        )}

        {/* 8. Update Close Warning */}
        {(activeTab === "all" || activeTab === "updates") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--amber">
                <ShieldAlert size={20} />
              </span>
              <span className="dev-card-category">App Exit Guard</span>
            </div>
            <h3>Close App Update Warning</h3>
            <p>
              Modal warning when user attempts to quit MakeChurchEasy while an update download is actively writing to disk.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("update_close_warning")}
            >
              <Eye size={16} />
              Preview Close Warning
            </button>
          </article>
        )}

        {/* 9. Trial Welcome Modal */}
        {(activeTab === "all" || activeTab === "plans") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--amber">
                <Flame size={20} />
              </span>
              <span className="dev-card-category">Onboarding</span>
            </div>
            <h3>Trial Welcome Celebration</h3>
            <p>
              Warm welcome modal for new churches entering their 14-day free trial of Growth plan features.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("trial_welcome")}
            >
              <Eye size={16} />
              Preview Trial Welcome
            </button>
          </article>
        )}

        {/* 10. Trial Expired Upgrade */}
        {(activeTab === "all" || activeTab === "plans") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--red">
                <Clock size={20} />
              </span>
              <span className="dev-card-category">Paywall</span>
            </div>
            <h3>Trial Expired Paywall</h3>
            <p>
              Shows when 14-day trial concludes, detailing Pro vs Growth plans and direct checkout options.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("trial_expired")}
            >
              <Eye size={16} />
              Preview Trial Expired Modal
            </button>
          </article>
        )}

        {/* 11. Feature Upgrade Gate */}
        {(activeTab === "all" || activeTab === "plans") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--indigo">
                <Sparkles size={20} />
              </span>
              <span className="dev-card-category">Paywall</span>
            </div>
            <h3>Feature Gate Upgrade Modal</h3>
            <p>
              Modal triggered when clicking a feature locked to Growth (e.g. Mobile Remote, 4K Multiview, Unlimited AI).
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("upgrade_growth")}
            >
              <Eye size={16} />
              Preview Upgrade Modal
            </button>
          </article>
        )}

        {/* 12. OBS Presentation Link Modal */}
        {(activeTab === "all" || activeTab === "system") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--emerald">
                <Monitor size={20} />
              </span>
              <span className="dev-card-category">OBS Integration</span>
            </div>
            <h3>Free Plan Presentation Setup</h3>
            <p>
              Dialog explaining how Free plan users can easily configure OBS Browser Source without native WebSocket controls.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("dock_presentation_link")}
            >
              <Eye size={16} />
              Preview Link Modal
            </button>
          </article>
        )}

        {/* 13. Studio - Reset Canvas */}
        {(activeTab === "all" || activeTab === "studio") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--amber">
                <RotateCcw size={20} />
              </span>
              <span className="dev-card-category">Studio Confirmation</span>
            </div>
            <h3>Reset Canvas Confirmation</h3>
            <p>
              Confirmation dialog shown in Multiview / Canvas when wiping layout regions to starting defaults.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("confirm_reset_canvas")}
            >
              <Eye size={16} />
              Preview Reset Modal
            </button>
          </article>
        )}

        {/* 14. Studio - Delete Confirmation */}
        {(activeTab === "all" || activeTab === "studio") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--red">
                <Trash2 size={20} />
              </span>
              <span className="dev-card-category">Destructive Action</span>
            </div>
            <h3>Delete Theme / Scene Modal</h3>
            <p>
              Destructive confirmation dialog warning user before permanently removing custom scene templates or theme assets.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("confirm_delete")}
            >
              <Eye size={16} />
              Preview Delete Modal
            </button>
          </article>
        )}

        {/* 15. Studio - Undo Confirmation */}
        {(activeTab === "all" || activeTab === "studio") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--indigo">
                <Undo size={20} />
              </span>
              <span className="dev-card-category">Studio Action</span>
            </div>
            <h3>Undo Changes Confirmation</h3>
            <p>
              Confirms restoring an unpushed scene back to its active OBS state, discarding local edits.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("confirm_undo")}
            >
              <Eye size={16} />
              Preview Undo Modal
            </button>
          </article>
        )}

        {/* 16. Studio - Keyboard Shortcuts */}
        {(activeTab === "all" || activeTab === "studio") && (
          <article className="dev-modal-card">
            <div className="dev-modal-card__header">
              <span className="dev-card-icon dev-card-icon--indigo">
                <HelpCircle size={20} />
              </span>
              <span className="dev-card-category">Reference</span>
            </div>
            <h3>Keyboard Shortcuts Modal</h3>
            <p>
              Shows full list of keyboard hotkeys for live switching, slide navigation, and audio/scene controls.
            </p>
            <button
              type="button"
              className="dev-launch-btn"
              onClick={() => setActiveModal("shortcuts")}
            >
              <Eye size={16} />
              Preview Shortcuts
            </button>
          </article>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          LIVE MODAL PREVIEWS (MOUNTED CONDITIONALLY)
          ══════════════════════════════════════════════════════════════════════ */}

      {/* 1. Redesigned Language Change Confirmation Modal */}
      {activeModal === "language" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Cancelled Language Modal")}>
          <div className="mv-modal mv-modal--language" onClick={(e) => e.stopPropagation()}>
            <div className="mv-modal-icon-badge mv-modal-icon-badge--indigo">
              <Globe size={28} />
            </div>
            <h3 className="mv-modal-title">Change Language</h3>
            <p className="mv-modal-prompt">
              Switch interface language to <strong>{getInterfaceLanguageLabel(selectedLanguageCode)}</strong>?
            </p>
            <p className="mv-modal-hint">
              The interface will update immediately.
            </p>
            <div className="mv-modal-actions mv-modal-actions--modern">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Cancelled Language Change")}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--primary"
                onClick={() => handleAction(`Confirmed language: ${getInterfaceLanguageLabel(selectedLanguageCode)}`)}
              >
                Change Language
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Announcement Modal: Special Offer */}
      {activeModal === "announcement_offer" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Dismissed Offer Announcement")}>
          <div className="dev-announcement-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dev-announcement-header">
              <div className="dev-announcement-tag">
                <Tag size={14} />
                <span>Special Ministry Offer</span>
              </div>
              <button
                type="button"
                className="dev-announcement-close"
                onClick={() => handleAction("Closed Offer Announcement")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="dev-announcement-content">
              <div className="dev-discount-badge">40% OFF</div>
              <h3>{SAMPLE_ANNOUNCEMENTS.blackFriday.title}</h3>
              <p>{SAMPLE_ANNOUNCEMENTS.blackFriday.message}</p>

              <div className="dev-coupon-box">
                <span className="dev-coupon-label">Coupon Code:</span>
                <code className="dev-coupon-code">{SAMPLE_ANNOUNCEMENTS.blackFriday.offerCode}</code>
                <button
                  type="button"
                  className="dev-copy-code-btn"
                  onClick={() => copyPromoCode(SAMPLE_ANNOUNCEMENTS.blackFriday.offerCode!)}
                >
                  {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedCode ? "Copied" : "Copy"}</span>
                </button>
              </div>

              <div className="dev-announcement-timer">
                <Clock size={15} />
                <span>Offer expires in: <strong>2 days, 14 hours</strong></span>
              </div>
            </div>

            <div className="dev-announcement-footer">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Later clicked")}
              >
                Maybe Later
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--primary"
                onClick={() => handleAction("Claim Offer Clicked")}
              >
                <span>{SAMPLE_ANNOUNCEMENTS.blackFriday.ctaLabel}</span>
                <ExternalLink size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Announcement Modal: Feature Update */}
      {activeModal === "announcement_feature" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Dismissed Feature Announcement")}>
          <div className="dev-announcement-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dev-announcement-header">
              <div className="dev-announcement-tag dev-announcement-tag--emerald">
                <Sparkles size={14} />
                <span>What&apos;s New</span>
              </div>
              <button
                type="button"
                className="dev-announcement-close"
                onClick={() => handleAction("Closed Feature Announcement")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="dev-announcement-content">
              <div className="mv-modal-icon-badge mv-modal-icon-badge--emerald" style={{ margin: "8px auto 14px" }}>
                <Sparkles size={28} />
              </div>
              <h3>{SAMPLE_ANNOUNCEMENTS.newFeature.title}</h3>
              <p>{SAMPLE_ANNOUNCEMENTS.newFeature.message}</p>
            </div>

            <div className="dev-announcement-footer">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Got it clicked")}
              >
                Got It
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--primary"
                onClick={() => handleAction("Explore Features Clicked")}
              >
                <span>{SAMPLE_ANNOUNCEMENTS.newFeature.ctaLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Announcement Modal: Warning / Maintenance */}
      {activeModal === "announcement_warning" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Dismissed Warning Notice")}>
          <div className="dev-announcement-modal" onClick={(e) => e.stopPropagation()}>
            <div className="dev-announcement-header">
              <div className="dev-announcement-tag dev-announcement-tag--amber">
                <AlertTriangle size={14} />
                <span>Notice</span>
              </div>
              <button
                type="button"
                className="dev-announcement-close"
                onClick={() => handleAction("Closed Warning Notice")}
              >
                <X size={16} />
              </button>
            </div>

            <div className="dev-announcement-content">
              <div className="mv-modal-icon-badge mv-modal-icon-badge--amber" style={{ margin: "8px auto 14px" }}>
                <AlertTriangle size={28} />
              </div>
              <h3>{SAMPLE_ANNOUNCEMENTS.maintenance.title}</h3>
              <p>{SAMPLE_ANNOUNCEMENTS.maintenance.message}</p>
            </div>

            <div className="dev-announcement-footer">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Dismissed Warning")}
              >
                Dismiss
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--primary"
                onClick={() => handleAction("Status Page Clicked")}
              >
                <span>View Status Page</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Optional Update Dialog */}
      {activeModal === "update_optional" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Dismissed Update Dialog")}>
          <div className="mv-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
            <div className="mv-modal-icon-badge mv-modal-icon-badge--indigo">
              <RefreshCw size={26} />
            </div>
            <h3 className="mv-modal-title">New Version Available!</h3>
            <p className="mv-modal-prompt">
              MakeChurchEasy <strong>v3.31.0</strong> is ready to install (current: v3.30.0).
            </p>
            <div className="dev-release-notes-box">
              <p className="dev-release-notes-heading">What&apos;s new:</p>
              <pre className="dev-release-notes-pre">{SAMPLE_UPDATE_INFO.releaseNotes}</pre>
            </div>
            <div className="mv-modal-actions mv-modal-actions--modern">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Remind Me Later")}
              >
                Remind Me Later
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--primary"
                onClick={() => handleAction("Started Update Download")}
              >
                Update Now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Mandatory Force Update */}
      {activeModal === "update_force" && (
        <ForceUpdateModal
          result={SAMPLE_UPDATE_INFO as any}
          daysOld={45}
          locked={false} // Allow testing dismissal
        />
      )}

      {/* 7. Background Update Notice */}
      {activeModal === "update_bg_notice" && (
        <div className="update-modal-backdrop" onClick={() => setActiveModal(null)}>
          <div className="update-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="update-modal-header">
              <div className="update-modal-header__title update-modal-header__title--info">
                <Sparkles size={16} />
                <span>Downloading in Background</span>
              </div>
              <button
                type="button"
                className="update-modal-header__close"
                onClick={() => { setActiveModal(null); handleAction("Closed Background Notice"); }}
                aria-label="Dismiss notice"
              >
                <X size={16} />
              </button>
            </div>
            <div className="update-modal-body">
              <h3>Your update will continue downloading</h3>
              <p>
                MakeChurchEasy is downloading the update in the background so you can continue
                working without disruption. We will let you know as soon as the installation is ready.
              </p>
              <div className="update-modal-preview">
                <div className="update-modal-preview__row">
                  <span className="update-modal-preview__label">MakeChurchEasy v3.31.0</span>
                  <span className="update-modal-preview__val">68% · 42.1 MB / 61.8 MB</span>
                </div>
                <div className="update-modal-preview__track">
                  <div className="update-modal-preview__fill" style={{ width: "68%" }} />
                </div>
              </div>
            </div>
            <div className="update-modal-actions">
              <button
                type="button"
                className="update-modal-btn update-modal-btn--primary"
                onClick={() => { setActiveModal(null); handleAction("Acknowledged Background Notice"); }}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Close Warning Modal */}
      {activeModal === "update_close_warning" && (
        <div className="update-modal-backdrop" style={{ zIndex: 100001 }} onClick={() => setActiveModal(null)}>
          <div className="update-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="update-modal-header">
              <div className="update-modal-header__title update-modal-header__title--warning">
                <AlertTriangle size={16} />
                <span>Update In Progress</span>
              </div>
              <button
                type="button"
                className="update-modal-header__close"
                onClick={() => { setActiveModal(null); handleAction("Cancelled Quit"); }}
                aria-label="Cancel"
              >
                <X size={16} />
              </button>
            </div>
            <div className="update-modal-body">
              <h3>Download is still in progress</h3>
              <p>
                MakeChurchEasy is currently downloading the latest update (v3.31.0).
                If you close the application now, the download will be interrupted and you will need to restart it later.
              </p>
              <div className="update-modal-preview">
                <div className="update-modal-preview__row">
                  <span className="update-modal-preview__label">Current Progress</span>
                  <span className="update-modal-preview__val">45% · 28.4 MB / 61.8 MB</span>
                </div>
                <div className="update-modal-preview__track">
                  <div className="update-modal-preview__fill" style={{ width: "45%" }} />
                </div>
              </div>
            </div>
            <div className="update-modal-actions">
              <button
                type="button"
                className="update-modal-btn update-modal-btn--ghost"
                onClick={() => { setActiveModal(null); handleAction("Cancelled Quit"); }}
              >
                Keep Downloading
              </button>
              <button
                type="button"
                className="update-modal-btn update-modal-btn--danger"
                onClick={() => { setActiveModal(null); handleAction("Confirmed Quit During Update"); }}
              >
                Close Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Trial Welcome Modal */}
      {activeModal === "trial_welcome" && (
        <TrialModal
          trialDays={14}
          trialEndsAt={new Date(Date.now() + 14 * 86400000).toISOString()}
          isExistingUser={false}
          onDismiss={() => {
            setActiveModal(null);
            handleAction("Dismissed Trial Welcome");
          }}
        />
      )}

      {/* 10. Trial Expired Modal */}
      {activeModal === "trial_expired" && (
        <div className="trial-expired-upgrade" onClick={() => setActiveModal(null)}>
          <div className="trial-expired-upgrade__card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="trial-expired-upgrade__close"
              onClick={() => { setActiveModal(null); handleAction("Closed Trial Expired Modal"); }}
              aria-label="Close"
            >
              <X size={18} />
            </button>
            <div className="trial-expired-upgrade__badge">
              <Clock size={16} />
              <span>Trial Period Concluded</span>
            </div>
            <h3 className="trial-expired-upgrade__title">Your 14-Day Free Trial Has Ended</h3>
            <p className="trial-expired-upgrade__desc">
              Upgrade to the Growth Plan today to continue accessing all premium features including
              Multiview, 4K Display, Speech-to-Scripture AI, and Unlimited Media Library.
            </p>
            <div className="trial-expired-upgrade__actions">
              <button
                type="button"
                className="trial-expired-upgrade__btn-secondary"
                onClick={() => { setActiveModal(null); handleAction("Continue on Free Plan"); }}
              >
                Continue Free
              </button>
              <button
                type="button"
                className="trial-expired-upgrade__btn-primary"
                onClick={() => { setActiveModal(null); handleAction("Clicked Upgrade to Growth"); }}
              >
                Upgrade to Growth
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. Feature Upgrade Modal */}
      {activeModal === "upgrade_growth" && (
        <UpgradeModal
          open={true}
          onClose={() => handleAction("Closed Upgrade Modal")}
          feature="Mobile Remote & Multi-Screen 4K"
          requiredPlan="growth"
          currentPlan="basic"
          message="Mobile Remote and 4K outputs are available on the Growth plan."
        />
      )}

      {/* 12. OBS Presentation Link Modal */}
      {activeModal === "dock_presentation_link" && (
        <DockPresentationLinkModal
          open={true}
          onClose={() => handleAction("Closed OBS Link Modal")}
        />
      )}

      {/* 13. Studio - Reset Canvas */}
      {activeModal === "confirm_reset_canvas" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Cancelled Reset")}>
          <div className="mv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mv-modal-icon-badge mv-modal-icon-badge--amber">
              <RotateCcw size={26} />
            </div>
            <h3 className="mv-modal-title">Reset Canvas Layout?</h3>
            <p className="mv-modal-text">
              This will clear all current regions and restore the starter grid. Unsaved region edits will be lost.
            </p>
            <div className="mv-modal-actions mv-modal-actions--modern">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Cancelled Reset")}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--danger"
                onClick={() => handleAction("Confirmed Canvas Reset")}
              >
                Reset Canvas
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 14. Studio - Delete Scene / Theme */}
      {activeModal === "confirm_delete" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Cancelled Delete")}>
          <div className="mv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mv-modal-icon-badge mv-modal-icon-badge--red">
              <Trash2 size={26} />
            </div>
            <h3 className="mv-modal-title">Remove Scene &ldquo;Sunday Main&rdquo;?</h3>
            <p className="mv-modal-text">
              Are you sure you want to permanently delete this scene? This cannot be undone.
            </p>
            <div className="mv-modal-actions mv-modal-actions--modern">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Cancelled Delete")}
              >
                Keep Scene
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--danger"
                onClick={() => handleAction("Confirmed Scene Deleted")}
              >
                Delete Scene
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 15. Studio - Undo Changes */}
      {activeModal === "confirm_undo" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Cancelled Undo")}>
          <div className="mv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mv-modal-icon-badge mv-modal-icon-badge--indigo">
              <Undo size={26} />
            </div>
            <h3 className="mv-modal-title">Undo Canvas Edits?</h3>
            <p className="mv-modal-text">
              Revert all changes made since the last save to the active OBS output?
            </p>
            <div className="mv-modal-actions mv-modal-actions--modern">
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--ghost"
                onClick={() => handleAction("Cancelled Undo")}
              >
                Cancel
              </button>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--primary"
                onClick={() => handleAction("Confirmed Undo")}
              >
                Revert Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 16. Studio - Keyboard Shortcuts */}
      {activeModal === "shortcuts" && (
        <div className="mv-modal-backdrop" onClick={() => handleAction("Closed Shortcuts")}>
          <div className="mv-modal mv-shortcuts-modal" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
            <div className="mv-modal-icon-badge mv-modal-icon-badge--indigo">
              <HelpCircle size={26} />
            </div>
            <h3 className="mv-modal-title">Keyboard Shortcuts</h3>
            <div className="dev-shortcuts-table">
              <div className="dev-shortcut-row">
                <span>Next Slide</span>
                <kbd>Space / Right Arrow</kbd>
              </div>
              <div className="dev-shortcut-row">
                <span>Previous Slide</span>
                <kbd>Left Arrow</kbd>
              </div>
              <div className="dev-shortcut-row">
                <span>Clear / Black Screen</span>
                <kbd>B</kbd>
              </div>
              <div className="dev-shortcut-row">
                <span>Toggle Output</span>
                <kbd>Ctrl + O / ⌘ + O</kbd>
              </div>
              <div className="dev-shortcut-row">
                <span>Quick Bible Search</span>
                <kbd>Ctrl + B / ⌘ + B</kbd>
              </div>
              <div className="dev-shortcut-row">
                <span>Dismiss Dialog</span>
                <kbd>Esc</kbd>
              </div>
            </div>
            <div className="mv-modal-actions mv-modal-actions--modern" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="mv-modal-btn mv-modal-btn--primary"
                onClick={() => handleAction("Closed Shortcuts")}
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
