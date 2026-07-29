/**
 * MVShell.tsx — Multi-View Editor Shell
 *
 * Top-level layout for the /multiview/* routes.
 * Sidebar navigation + OBS status + routed content area.
 */

import { useState, useEffect, useMemo } from "react";
import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MVDashboard } from "./pages/MVDashboard";
import { MVEditor } from "./pages/MVEditor";
import { MVTemplates } from "./pages/MVTemplates";
import { MVSettings } from "./pages/MVSettings";
import { MVSceneSync } from "./pages/MVSceneSync";
import { obsService } from "../services/obsService";
import { ToastProvider } from "./components/MVToast";
import { useThemeSync } from "./components/MVThemeProvider";
import { BibleProvider } from "../bible/bibleStore";
import "./mv.css";
import Icon from "../components/Icon";

export function MVShell() {
  const { t } = useTranslation();
  const [obsConnected, setObsConnected] = useState(obsService.status === "connected");
  useThemeSync();

  const NAV_ITEMS = useMemo(() => [
    { to: "/multiview/dashboard", icon: "dashboard", label: t("mvShell.navDashboard") },
    { to: "/multiview/scenes", icon: "cast_connected", label: t("mvShell.navScenes") },
    { to: "/multiview/templates", icon: "auto_awesome_mosaic", label: t("mvShell.navTemplates") },
    { to: "/multiview/settings", icon: "settings", label: t("mvShell.navSettings") },
  ] as const, [t]);

  useEffect(() => {
    const unsub = obsService.onStatusChange((status) => {
      setObsConnected(status === "connected");
    });
    return unsub;
  }, []);

  return (
    <ToastProvider>
      <div className="mv-shell" role="application" aria-label={t("mvShell.multiView")}>
        {/* Skip navigation link for keyboard users */}
        <a className="mv-skip-link" href="#mv-main-content">{t("mvShell.skipToContent")}</a>

        {/* ── Sidebar ── */}
        <nav className="mv-sidebar" aria-label={t("mvShell.navigation")}>
          <div className="mv-sidebar-brand" aria-hidden="true">
            <Icon name="grid_view" size={24} />
            <span className="mv-sidebar-title">{t("mvShell.multiView")}</span>
          </div>

          {/* OBS Status */}
          <div className="mv-sidebar-obs-status" role="status" aria-live="polite" aria-label={obsConnected ? t("mvShell.broadcastConnected") : t("mvShell.broadcastDisconnected")}>
            <span
              className={`mv-obs-dot ${obsConnected ? "mv-obs-dot--connected" : ""}`}
              aria-hidden="true"
            />
            <span className="mv-obs-label">
              {obsConnected ? t("mvShell.broadcastConnected") : t("mvShell.broadcastDisconnected")}
            </span>
          </div>

          <div className="mv-sidebar-nav" role="list">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                role="listitem"
                className={({ isActive }) =>
                  `mv-nav-item ${isActive ? "mv-nav-item--active" : ""}`
                }
                aria-current={undefined} // react-router sets aria-current="page" automatically
              >
                <Icon name={item.icon} size={20} className="mv-nav-icon" />
                <span className="mv-nav-label">{item.label}</span>
              </NavLink>
            ))}
          </div>

          <div className="mv-sidebar-footer">
            <NavLink to="/" className="mv-nav-item mv-nav-item--back">
              <Icon name="arrow_back" size={20} className="mv-nav-icon" />
              <span className="mv-nav-label">{t("mvShell.backToSwitcher")}</span>
            </NavLink>
          </div>
        </nav>

        {/* ── Content Area ── */}
        <main id="mv-main-content" className="mv-content" role="main">
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<MVDashboard />} />
            <Route path="edit/:layoutId" element={<MVEditor />} />
            <Route path="new" element={<MVEditor />} />
            <Route path="scenes" element={<MVSceneSync />} />
            <Route path="templates" element={<MVTemplates />} />
            <Route path="settings" element={<BibleProvider><MVSettings /></BibleProvider>} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
