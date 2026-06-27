/**
 * AppShell.tsx — Top-level navigation shell
 *
 * Wraps all non-editor routes with the shared DashboardSidebar and content area.
 * Full-screen routes (editor, multiview, standalone bible) bypass the shell.
 *
 * When a service is active (preservice), the normal
 * nav tabs are hidden and replaced with a service-mode bar:
 *   Logo circle + Cancel + End Service
 */

import { useState, useEffect, useCallback } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { obsService } from "./services/obsService";
import { serviceStore } from "./services/serviceStore";
import {
  SHORTCUTS,
  shortcutLabel,
  type ShortcutCategory,
} from "./multiview/shortcuts";
import { useServiceStore } from "./hooks/useServiceStore";
import { ServiceCompletedModal } from "./components/ServiceCompletedModal";
import BibleCommandPalette from "./components/BibleCommandPalette";
import { BibleProvider } from "./bible/bibleStore";
import Icon from "./components/Icon";
import DashboardSidebar from "./components/DashboardSidebar";
import LiveStatusBar from "./components/LiveStatusBar";
import { getOverlayBaseUrlSync } from "./services/overlayUrl";
import type { ConnectionStatus } from "./services/obsService";



export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const svc = useServiceStore();

  const isServiceEnded = svc.status === "ended";

  // ── Sidebar ──
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });
  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("sidebar-collapsed", String(next)); } catch { /* */ }
      return next;
    });
  }, []);

  const [obsStatus, setObsStatus] = useState<ConnectionStatus>(obsService.status);
  const [dockAvailable, setDockAvailable] = useState(false);

  // ── End-service confirmation modal ──
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  // ── Shortcuts modal ──
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Command Palette ──
  const [showCommandPalette, setShowCommandPalette] = useState(false);

  type ShortcutsTab = "dashboard" | "bible" | "graphics" | "ticker";
  const SHORTCUTS_TABS: { key: ShortcutsTab; label: string; icon: string; categories: ShortcutCategory[] }[] = [
    { key: "dashboard", label: "Dashboard", icon: "dashboard", categories: ["navigation", "file", "edit", "selection", "view", "canvas", "slots", "alignment"] },
    { key: "bible", label: "Bible", icon: "menu_book", categories: ["bible"] },
    { key: "graphics", label: "Graphics", icon: "palette", categories: ["lowerthirds", "quickmerge", "worship"] },
    { key: "ticker", label: "Ticker", icon: "text_rotation_none", categories: ["ticker"] },
  ];
  const [shortcutsTab, setShortcutsTab] = useState<ShortcutsTab>("dashboard");

  // ── Command Palette handlers ──
  const handleCommandPaletteSelectBibleVerse = useCallback((book: string, chapter: number, verse: number) => {
    navigate(`/resources?tab=bible&book=${encodeURIComponent(book)}&chapter=${chapter}&verse=${verse}`);
    setShowCommandPalette(false);
  }, [navigate]);

  const handleCommandPaletteSelectTemplate = useCallback((templateKind: "bible" | "lower-third", themeId: string) => {
    navigate(`/production/themes?templateKind=${templateKind}&themeId=${encodeURIComponent(themeId)}`);
    setShowCommandPalette(false);
  }, [navigate]);

  // ── Load settings + subscribe to services ──
  useEffect(() => {
    setObsStatus(obsService.status);

    const unsubObs = obsService.onStatusChange((status) => {
      setObsStatus(status);
    });

    const checkDock = () => {
      try {
        const url = getOverlayBaseUrlSync();
        setDockAvailable(Boolean(url));
      } catch {
        setDockAvailable(false);
      }
    };
    checkDock();
    const dockInterval = setInterval(checkDock, 10_000);

    return () => {
      unsubObs();
      clearInterval(dockInterval);
    };
  }, []);

  const handleNav = useCallback(
    (path: string) => {
      navigate(path);
    },
    [navigate],
  );

  // Full-screen routes (no sidebar): editor, new layout, standalone bible, multiview shell
  const isEditorRoute =
    location.pathname.startsWith("/edit/") ||
    location.pathname.startsWith("/multiview") ||
    location.pathname.startsWith("/bible") ||
    location.pathname === "/new";

  // ── Cancel confirmation modal ──
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleConfirmCancel = useCallback(() => {
    setShowCancelConfirm(false);
    serviceStore.reset();
    navigate("/");
  }, [navigate]);

  const handleEndServiceConfirm = useCallback(() => {
    serviceStore.endService();
    setShowEndConfirm(false);
  }, []);

  const handleStartNew = useCallback(() => {
    serviceStore.reset();
    navigate("/");
  }, [navigate]);

  const handleReturnDashboard = useCallback(() => {
    serviceStore.reset();
    navigate("/");
  }, [navigate]);

  if (isEditorRoute) {
    return <Outlet />;
  }

  return (
    <div className="app-container">
      <DashboardSidebar
        currentPath={location.pathname + location.search}
        obsStatus={obsStatus}
        dockAvailable={dockAvailable}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebar}
        onNavigate={handleNav}
      />

      <main className={`app-main${sidebarCollapsed ? " app-main--collapsed" : ""}`}>
        <LiveStatusBar />
        <div className="app-glow" />
        <div className="app-content">
          <Outlet />
        </div>
      </main>

      {/* ── End Service Confirmation ── */}
      {showEndConfirm && (
        <div className="end-confirm-backdrop" onClick={() => setShowEndConfirm(false)}>
          <div className="end-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>End Service?</h2>
            <p>Are you sure you want to end the current service? This cannot be undone.</p>
            <div className="end-confirm-actions">
              <button
                className="end-confirm-btn-cancel"
                onClick={() => setShowEndConfirm(false)}
              >
                Keep Going
              </button>
              <button className="end-confirm-btn-end" onClick={handleEndServiceConfirm}>
                End Service
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Cancel Service Confirmation ── */}
      {showCancelConfirm && (
        <div className="end-confirm-backdrop" onClick={() => setShowCancelConfirm(false)}>
          <div className="end-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Cancel Service?</h2>
            <p>Are you sure you want to cancel? All pre-service progress will be lost and you'll return to the dashboard.</p>
            <div className="end-confirm-actions">
              <button
                className="end-confirm-btn-cancel"
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep Going
              </button>
              <button className="end-confirm-btn-end" onClick={handleConfirmCancel}>
                Yes, Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Completed Modal ── */}
      <ServiceCompletedModal
        open={isServiceEnded}
        duration=""
        bibleVerses={svc.stats.bibleVersesDisplayed}
        songsPlayed={svc.stats.songsPlayed}
        lowerThirds={svc.stats.lowerThirdsShown}
        onStartNew={handleStartNew}
        onDashboard={handleReturnDashboard}
      />

      {/* ── Keyboard Shortcuts Modal (Tabbed) ── */}
      {showShortcuts && (
        <div className="end-confirm-backdrop" onClick={() => setShowShortcuts(false)}>
          <div className="shortcuts-modal" onClick={(e) => e.stopPropagation()}>
            <div className="shortcuts-modal-head">
              <h2>Keyboard Shortcuts</h2>
              <button className="shortcuts-modal-close" onClick={() => setShowShortcuts(false)}>
                <Icon name="close" size={20} />
              </button>
            </div>

            <div className="shortcuts-modal-tabs">
              {SHORTCUTS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  className={`shortcuts-modal-tab${shortcutsTab === tab.key ? " is-active" : ""}`}
                  onClick={() => setShortcutsTab(tab.key)}
                >
                  <Icon name={tab.icon} size={14} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            <div className="shortcuts-modal-body">
              {(() => {
                const activeTab = SHORTCUTS_TABS.find((t) => t.key === shortcutsTab)!;
                return activeTab.categories.map((cat) => {
                  const items = SHORTCUTS.filter((s) => s.category === cat && !s.editorOnly);
                  if (items.length === 0) return null;
                  return (
                    <div className="shortcuts-modal-section" key={cat}>
                      <h4>{
                        cat === "navigation" ? "Navigation" :
                          cat === "file" ? "File" :
                            cat === "edit" ? "Edit" :
                              cat === "selection" ? "Selection" :
                                cat === "view" ? "View & Zoom" :
                                  cat === "canvas" ? "Canvas & Grid" :
                                    cat === "slots" ? "Slots" :
                                      cat === "alignment" ? "Alignment" :
                                        cat === "bible" ? "Bible" :
                                          cat === "lowerthirds" ? "Lower Thirds" :
                                            cat === "quickmerge" ? "Quick Merge" :
                                              cat === "worship" ? "Speaker" :
                                                cat === "ticker" ? "Ticker" : cat
                      }</h4>
                      {items.map((s) => (
                        <div className="shortcuts-modal-row" key={s.id}>
                          <span>{s.label}</span>
                          <kbd>{shortcutLabel(s.keys)}</kbd>
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── Global Command Palette ── */}
      <BibleProvider>
        <BibleCommandPalette
          open={showCommandPalette}
          initialQuery=""
          onClose={() => setShowCommandPalette(false)}
          onSelectBibleVerse={handleCommandPaletteSelectBibleVerse}
          onSelectTemplate={handleCommandPaletteSelectTemplate}
          onNavigate={navigate}
        />
      </BibleProvider>
    </div>
  );
}
