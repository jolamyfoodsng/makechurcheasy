/**
 * DashboardSidebar.tsx — Shared sidebar used across all pages.
 *
 * Extracted from ProductionHomePage so every route gets the same
 * navigation chrome: nav links, OBS/Dock status, user profile.
 */

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./AppLogo";
import {
  LayoutDashboard,
  Mic,
  Palette,
  Settings,
  BookOpen,
  Music,
  Images,
  FolderClosed,
  FolderOpen,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  LayoutGrid,
  Tv,
  Zap,
  GraduationCap,
  HelpCircle,
  MessageCircle,
  Send,
  Mail,
  Phone,
  ExternalLink,
  X,
  FileText,
} from "lucide-react";
import type { ConnectionStatus } from "../services/obsService";

import { useAuth } from "../contexts/AuthContext";
import { getEnvConfig } from "../services/envConfig";

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardSidebarProps {
  currentPath: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (path: string) => void;
  /** @deprecated unused but kept for API compat */
  obsStatus?: ConnectionStatus;
  /** @deprecated unused but kept for API compat */
  dockAvailable?: boolean;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardSidebar({
  currentPath,
  collapsed,
  onToggleCollapse,
  onNavigate,
}: DashboardSidebarProps) {
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const { appName, isTest } = getEnvConfig();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [isResourcesOpen, setIsResourcesOpen] = useState(true);
  const [isTranscriptsOpen, setIsTranscriptsOpen] = useState(true);



  const navItem = useCallback(
    (to: string, Icon: typeof Mic, label: string) => {
      const full = to.split("?")[0];
      const query = to.includes("?") ? to.split("?")[1] : "";
      const isActive =
        to === "/"
          ? currentPath === "/"
          : currentPath.startsWith(full) &&
          (query ? currentPath.includes(query) : !currentPath.includes("?"));
      return (
        <a
          key={to}
          className={isActive ? "sidebar-nav-item-active" : "sidebar-nav-item"}
          href="#"
          title={collapsed ? label : undefined}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(to);
          }}
        >
          <Icon className="sidebar-nav-icon" />
          <span className="sidebar-nav-text">{label}</span>
        </a>
      );
    },
    [currentPath, onNavigate, collapsed],
  );

  return (
    <nav
      className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}
      aria-label={t("sidebar.navigation")}>
      <div className="sidebar-header">
        <AppLogo alt={appName} className="sidebar-logo" />
        <div className="sidebar-header-text">
          <p className="sidebar-subtitle">{appName}</p>
          {isTest ? (
            <p className="sidebar-subtitle" style={{ color: "var(--warning)", marginTop: 2 }}>
              Testing environment
            </p>
          ) : null}
        </div>
        <button
          className="sidebar-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}
          aria-label={collapsed ? t("sidebar.expandSidebar") : t("sidebar.collapseSidebar")}
        >
          {collapsed ? <PanelLeftOpen className="sidebar-toggle-icon" /> : <PanelLeftClose className="sidebar-toggle-icon" />}
        </button>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-label">{t("sidebar.navigation")}</p>
        <div className="sidebar-nav-list">
          {navItem("/", LayoutDashboard, t("sidebar.dashboard"))}

          {/* Transcripts & Verse AI collapsible parent item */}
          <div
            className={`sidebar-nav-item sidebar-nav-parent${currentPath.startsWith("/transcripts") || currentPath.startsWith("/speech-to-scripture") ? " sidebar-nav-item-active" : ""}`}
            title={collapsed ? t("sidebar.transcripts", { defaultValue: "Transcripts" }) : undefined}
            onClick={collapsed ? (e) => {
              e.preventDefault();
              onNavigate("/speech-to-scripture");
            } : undefined}
          >
            <a
              className="sidebar-nav-parent-link"
              href="#"
              title={collapsed ? t("sidebar.transcripts", { defaultValue: "Transcripts" }) : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate("/speech-to-scripture");
              }}
            >
              <FileText className="sidebar-nav-icon" />
              <span className="sidebar-nav-text">{t("sidebar.transcripts", { defaultValue: "Transcripts" })}</span>
            </a>
            {!collapsed && (
              <button
                type="button"
                className={`sidebar-nav-chevron-btn${isTranscriptsOpen ? " sidebar-nav-chevron-btn--open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTranscriptsOpen((prev) => !prev);
                }}
                title={isTranscriptsOpen ? "Collapse Transcripts" : "Expand Transcripts"}
                aria-label={isTranscriptsOpen ? "Collapse Transcripts" : "Expand Transcripts"}
              >
                <ChevronDown className="sidebar-nav-chevron" />
              </button>
            )}
          </div>

          {/* Subchildren under Transcripts (only visible when sidebar is expanded) */}
          {!collapsed && isTranscriptsOpen && (
            <div className="sidebar-subnav-list">
              <a
                className={`sidebar-subnav-item${currentPath.startsWith("/speech-to-scripture") ? " sidebar-subnav-item-active" : ""}`}
                href="#"
                title="Verse AI (Live Detection)"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("/speech-to-scripture");
                }}
              >
                <Mic className="sidebar-subnav-icon" />
                <span>Verse AI</span>
              </a>

              <a
                className={`sidebar-subnav-item${currentPath.startsWith("/transcripts") ? " sidebar-subnav-item-active" : ""}`}
                href="#"
                title="All Transcripts Library"
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("/transcripts");
                }}
              >
                <FileText className="sidebar-subnav-icon" />
                <span>All Transcripts</span>
              </a>
            </div>
          )}

          {navItem("/production/themes", Palette, t("sidebar.themes"))}

          {/* Resources collapsible parent item */}
          <div
            className={`sidebar-nav-item sidebar-nav-parent${currentPath.startsWith("/resources") ? " sidebar-nav-item-active" : ""}`}
            title={collapsed ? t("sidebar.resources", { defaultValue: "Resources" }) : undefined}
            onClick={collapsed ? (e) => {
              e.preventDefault();
              onNavigate("/resources?tab=bible");
            } : undefined}
          >
            <a
              className="sidebar-nav-parent-link"
              href="#"
              title={collapsed ? t("sidebar.resources", { defaultValue: "Resources" }) : undefined}
              onClick={(e) => {
                e.preventDefault();
                onNavigate("/resources?tab=bible");
              }}
            >
              {isResourcesOpen && !collapsed ? (
                <FolderOpen className="sidebar-nav-icon" />
              ) : (
                <FolderClosed className="sidebar-nav-icon" />
              )}
              <span className="sidebar-nav-text">{t("sidebar.resources", { defaultValue: "Resources" })}</span>
            </a>
            {!collapsed && (
              <button
                type="button"
                className={`sidebar-nav-chevron-btn${isResourcesOpen ? " sidebar-nav-chevron-btn--open" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsResourcesOpen((prev) => !prev);
                }}
                title={isResourcesOpen ? "Collapse Resources" : "Expand Resources"}
                aria-label={isResourcesOpen ? "Collapse Resources" : "Expand Resources"}
              >
                <ChevronDown className="sidebar-nav-chevron" />
              </button>
            )}
          </div>

          {/* Subchildren under Resources (only visible when sidebar is expanded) */}
          {!collapsed && isResourcesOpen && (
            <div className="sidebar-subnav-list">
              <a
                className={`sidebar-subnav-item${currentPath.includes("tab=bible") || currentPath === "/resources" ? " sidebar-subnav-item-active" : ""}`}
                href="#"
                title={t("sidebar.bible", { defaultValue: "Bible" })}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("/resources?tab=bible");
                }}
              >
                <BookOpen className="sidebar-subnav-icon" />
                <span>{t("sidebar.bible", { defaultValue: "Bible" })}</span>
              </a>

              <a
                className={`sidebar-subnav-item${currentPath.includes("tab=worship") ? " sidebar-subnav-item-active" : ""}`}
                href="#"
                title={t("sidebar.worship", { defaultValue: "Worship Songs" })}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("/resources?tab=worship");
                }}
              >
                <Music className="sidebar-subnav-icon" />
                <span>{t("sidebar.worship", { defaultValue: "Worship Songs" })}</span>
              </a>

              <a
                className={`sidebar-subnav-item${currentPath.includes("tab=media") ? " sidebar-subnav-item-active" : ""}`}
                href="#"
                title={t("sidebar.media", { defaultValue: "Media" })}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate("/resources?tab=media");
                }}
              >
                <Images className="sidebar-subnav-icon" />
                <span>{t("sidebar.media", { defaultValue: "Media" })}</span>
              </a>
            </div>
          )}
          {navItem("/gallery", LayoutGrid, t("sidebar.multiView"))}
          {navItem("/presentation", Tv, t("sidebar.presentation"))}
        </div>
      </div>

      <div className="sidebar-section-bottom">
        <div className="sidebar-nav-list sidebar-nav-list--bottom">
          {navItem("/tutorials", GraduationCap, "Tutorials")}
          {navItem("/credits", Zap, t("sidebar.credits", { defaultValue: "Credits" }))}
          {navItem("/settings", Settings, t("sidebar.settings"))}
          <a
            className="sidebar-nav-item"
            href="#"
            title={collapsed ? t("sidebar.support", { defaultValue: "Support" }) : undefined}
            onClick={(e) => {
              e.preventDefault();
              setShowSupportModal(true);
            }}
          >
            <HelpCircle className="sidebar-nav-icon" />
            <span className="sidebar-nav-text">{t("sidebar.support", { defaultValue: "Support" })}</span>
            <span className="sidebar-support-dot-container" title="Live support available">
              <span className="sidebar-support-ripple" />
              <span className="sidebar-support-dot" />
            </span>
          </a>
        </div>



        {/* User Profile */}
        {user && !collapsed && (
          <div className="sidebar-user-section">
            <div className="sidebar-user-info">
              <div className="sidebar-user-avatar">
                {user.avatar ? (
                  <img src={user.avatar} alt="" className="sidebar-user-avatar-img" />
                ) : (
                  <span>{user.name?.[0]?.toUpperCase() || "U"}</span>
                )}
              </div>
              <div className="sidebar-user-details">
                <p className="sidebar-user-name">{user.name}</p>
                <p className="sidebar-user-email">{user.email}</p>
              </div>
            </div>
            <button
              className="sidebar-user-signout"
              onClick={() => setShowLogoutConfirm(true)}
              title={t("sidebar.signOut")}
              aria-label={t("sidebar.signOut")}
            >
              <LogOut className="sidebar-user-signout-icon" />
            </button>
          </div>
        )}
      </div>

      {showLogoutConfirm && typeof document !== "undefined" && createPortal(
        <div
          className="end-confirm-backdrop"
          onClick={() => setShowLogoutConfirm(false)}
          onKeyDown={(event) => { if (event.key === "Escape") setShowLogoutConfirm(false); }}>
          <div
            className="end-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sidebar-signout-confirm-title"
            onClick={(e) => e.stopPropagation()}>
            <h2 id="sidebar-signout-confirm-title">{t("sidebar.signOutConfirm")}</h2>
            <p>{t("sidebar.signOutDesc")}</p>
            <div className="end-confirm-actions">
              <button
                className="end-confirm-btn-cancel"
                autoFocus
                onClick={() => setShowLogoutConfirm(false)}
                title={t("sidebar.cancel")}>
                {t("sidebar.cancel")}
              </button>
              <button
                className="end-confirm-btn-end"
                onClick={() => { setShowLogoutConfirm(false); logout(); }}
                title={t("sidebar.signOut")}>
                {t("sidebar.signOut")}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showSupportModal && typeof document !== "undefined" && createPortal(
        <div
          className="end-confirm-backdrop"
          onClick={() => setShowSupportModal(false)}
          onKeyDown={(e) => { if (e.key === "Escape") setShowSupportModal(false); }}
        >
          <div
            className="support-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="support-modal-title"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--surface, #1e293b)",
              border: "1px solid var(--border, #334155)",
              borderRadius: "16px",
              padding: "24px",
              maxWidth: "480px",
              width: "90%",
              color: "var(--text, #f8fafc)",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.5)",
              position: "relative",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "10px",
                  background: "rgba(16, 185, 129, 0.15)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#10b981",
                }}>
                  <HelpCircle size={20} />
                </div>
                <div>
                  <h3 id="support-modal-title" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
                    MakeChurchEasy Support
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-muted, #94a3b8)" }}>
                    We're here to help Sunday run smoothly
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSupportModal(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted, #94a3b8)",
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "6px",
                }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px", marginBottom: "20px" }}>
              {/* WhatsApp */}
              <a
                href="https://chat.whatsapp.com/EQIuXfpCTBOG7YOSf2nKqU?mode=gi_t"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  background: "rgba(37, 211, 102, 0.08)",
                  border: "1px solid rgba(37, 211, 102, 0.25)",
                  color: "inherit",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(37, 211, 102, 0.2)",
                  color: "#25D366",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <MessageCircle size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>WhatsApp Community & Chat</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted, #94a3b8)" }}>Get immediate assistance from our team</div>
                </div>
                <ExternalLink size={16} style={{ color: "var(--text-muted, #94a3b8)" }} />
              </a>

              {/* Telegram */}
              <a
                href="https://t.me/makechurcheasy"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  background: "rgba(0, 136, 204, 0.08)",
                  border: "1px solid rgba(0, 136, 204, 0.25)",
                  color: "inherit",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(0, 136, 204, 0.2)",
                  color: "#0088cc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Send size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Telegram Support</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted, #94a3b8)" }}>Direct chat @makechurcheasy</div>
                </div>
                <ExternalLink size={16} style={{ color: "var(--text-muted, #94a3b8)" }} />
              </a>

              {/* Email */}
              <a
                href="mailto:support@makechurcheazy.com"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  background: "rgba(99, 102, 241, 0.08)",
                  border: "1px solid rgba(99, 102, 241, 0.25)",
                  color: "inherit",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(99, 102, 241, 0.2)",
                  color: "#818cf8",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Mail size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Email Support</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted, #94a3b8)" }}>support@makechurcheazy.com</div>
                </div>
                <ExternalLink size={16} style={{ color: "var(--text-muted, #94a3b8)" }} />
              </a>

              {/* Emergency Hotline / Phone */}
              <a
                href="tel:+2348142740847"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  padding: "12px 16px",
                  borderRadius: "12px",
                  background: "rgba(245, 158, 11, 0.08)",
                  border: "1px solid rgba(245, 158, 11, 0.25)",
                  color: "inherit",
                  textDecoration: "none",
                  transition: "background 0.15s ease",
                }}
              >
                <div style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(245, 158, 11, 0.2)",
                  color: "#fbbf24",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <Phone size={18} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>Sunday Emergency Hotline</div>
                  <div style={{ fontSize: "0.78rem", color: "var(--text-muted, #94a3b8)" }}>+234 814 274 0847</div>
                </div>
                <ExternalLink size={16} style={{ color: "var(--text-muted, #94a3b8)" }} />
              </a>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="end-confirm-btn-cancel"
                onClick={() => setShowSupportModal(false)}
                style={{ width: "100%", justifyContent: "center" }}
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </nav>
  );
}
