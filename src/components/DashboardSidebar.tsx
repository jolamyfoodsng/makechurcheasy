/**
 * DashboardSidebar.tsx — Shared sidebar used across all pages.
 *
 * Extracted from ProductionHomePage so every route gets the same
 * navigation chrome: nav links, OBS/Dock status, user profile.
 */

import { useCallback, useState } from "react";
import { AppLogo } from "./AppLogo";
import {
  LayoutDashboard,
  Mic,
  Palette,
  Settings,
  Images,
  BookOpen,
  Music,
  Copy,
  Check,
  Fingerprint,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  FileText,
  LayoutGrid,
} from "lucide-react";
import type { ConnectionStatus } from "../services/obsService";
import { track } from "../services/analytics";
import { useAuth } from "../contexts/AuthContext";

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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // ── App ID ──
  const [appIdCopied, setAppIdCopied] = useState(false);
  const appId = user?.appId || "—";

  const handleCopyAppId = useCallback(() => {
    navigator.clipboard.writeText(appId).then(() => {
      setAppIdCopied(true);
      track("app_id_copied", { appId, source: "sidebar" });
      setTimeout(() => setAppIdCopied(false), 2000);
    }).catch(() => { });
  }, [appId]);

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
    <nav className={`sidebar${collapsed ? " sidebar--collapsed" : ""}`}>
      <div className="sidebar-header">
        <AppLogo alt="MakeChurchEasy" className="sidebar-logo" />
        <div className="sidebar-header-text">
          {/* <h1 className="sidebar-title">MakeChurchEasy</h1> */}
        </div>
        <button
          className="sidebar-toggle"
          onClick={onToggleCollapse}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="sidebar-toggle-icon" /> : <PanelLeftClose className="sidebar-toggle-icon" />}
        </button>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-label">Navigation</p>
        <div className="sidebar-nav-list">
          {navItem("/", LayoutDashboard, "Dashboard")}
          {navItem("/speech-to-scripture", Mic, "Verse AI")}
          {navItem("/transcripts", FileText, "Transcripts")}
          {navItem("/production/themes", Palette, "Themes")}

          {navItem("/resources?tab=bible", BookOpen, "Bible")}
          {navItem("/resources?tab=worship", Music, "Worship")}
          {navItem("/resources?tab=media", Images, "Media")}
          {navItem("/gallery", LayoutGrid, "Multi-View")}
        </div>
      </div>

      <div className="sidebar-section-bottom">
        <div className="sidebar-nav-list sidebar-nav-list--bottom">
          {navItem("/settings", Settings, "Settings")}
        </div>

        <div className="sidebar-appid-section">
          <div className="sidebar-appid-header">
            <Fingerprint className="sidebar-appid-icon" />
            <span className="sidebar-appid-label">App ID</span>
          </div>
          <button
            className="sidebar-appid-copy"
            onClick={handleCopyAppId}
            title="Share this App ID when submitting bug reports."
          >
            <span className="sidebar-appid-value">{appId}</span>
            {appIdCopied ? (
              <Check className="sidebar-appid-check" />
            ) : (
              <Copy className="sidebar-appid-copy-icon" />
            )}
          </button>
          <p className="sidebar-appid-hint">
            Share when reporting bugs
          </p>
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
              title="Sign out"
            >
              <LogOut className="sidebar-user-signout-icon" />
            </button>
          </div>
        )}
      </div>

      {showLogoutConfirm && (
        <div className="end-confirm-backdrop" onClick={() => setShowLogoutConfirm(false)}>
          <div className="end-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Sign out?</h2>
            <p>You'll need to pair your device again to access your account.</p>
            <div className="end-confirm-actions">
              <button
                className="end-confirm-btn-cancel"
                onClick={() => setShowLogoutConfirm(false)}
               title="Cancel">
                Cancel
              </button>
              <button
                className="end-confirm-btn-end"
                onClick={() => { setShowLogoutConfirm(false); logout(); }}
               title="Sign out">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
