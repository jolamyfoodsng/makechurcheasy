/**
 * DashboardSidebar.tsx — Shared sidebar used across all pages.
 *
 * Extracted from ProductionHomePage so every route gets the same
 * navigation chrome: nav links, OBS/Dock status, user profile.
 */

import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppLogo } from "./AppLogo";
import {
  LayoutDashboard,
  Mic,
  Palette,
  Settings,
  Images,
  BookOpen,
  Music,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  FileText,
  LayoutGrid,
  LayoutTemplate,
  Tv,
  Zap,
  GraduationCap,
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



  const navItem = useCallback(
    (to: string, Icon: typeof Mic, label: string) => {
      const full = to.split("?")[0];
      const query = to.includes("?") ? to.split("?")[1] : "";
      const isActive =
        to === "/"
          ? currentPath === "/"
          : currentPath.startsWith(full) &&
          (query ? currentPath.includes(query) : full === "/templates" || !currentPath.includes("?"));
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
          {navItem("/speech-to-scripture", Mic, t("sidebar.verseAi"))}
          {navItem("/transcripts", FileText, t("sidebar.transcripts"))}
          {navItem("/production/themes", Palette, t("sidebar.themes"))}
          {navItem("/templates", LayoutTemplate, t("sidebar.templates", { defaultValue: "Templates" }))}

          {navItem("/resources?tab=bible", BookOpen, t("sidebar.bible"))}
          {navItem("/resources?tab=worship", Music, t("sidebar.worship"))}
          {navItem("/resources?tab=media", Images, t("sidebar.media"))}
          {navItem("/gallery", LayoutGrid, t("sidebar.multiView"))}
          {navItem("/presentation", Tv, t("sidebar.presentation"))}
        </div>
      </div>

      <div className="sidebar-section-bottom">
        <div className="sidebar-nav-list sidebar-nav-list--bottom">
          {navItem("/tutorials", GraduationCap, "Tutorials")}
          {navItem("/credits", Zap, t("sidebar.credits", { defaultValue: "Credits" }))}
          {navItem("/settings", Settings, t("sidebar.settings"))}
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

      {showLogoutConfirm && (
        <div className="end-confirm-backdrop" onClick={() => setShowLogoutConfirm(false)}>
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
        </div>
      )}
    </nav>
  );
}
