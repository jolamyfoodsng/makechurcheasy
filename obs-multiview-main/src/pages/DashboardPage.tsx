/**
 * DashboardPage.tsx — Service Hub Dashboard
 *
 * Landing page:
 *   - "Open Service Hub" hero card with play button
 *   - Service Modules grid (Bible, Worship, Announcements)
 *   - Setup & Tools section
 */

import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import ServicePlanBuilder from "../components/ServicePlanBuilder";
import { serviceStore } from "../services/serviceStore";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import Icon from "../components/Icon";

/** Recently opened item */
interface RecentItem {
  path: string;
  label: string;
  icon: string;
  timestamp: number;
}

const RECENT_KEY = "obs-studio-recent-opened";
const MAX_RECENT = 6;

function getRecentItems(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
}

export function trackRecentOpen(path: string, label: string, icon: string) {
  const items = getRecentItems();
  const filtered = items.filter((i) => i.path !== path);
  filtered.unshift({ path, label, icon, timestamp: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dockCopied, setDockCopied] = useState(false);

  // In dev, Vite serves the SPA at localhost:1420 (with SPA fallback routing)
  // so /dock works because Vite proxies it to dock.html via the multi-page config.
  // In production, the overlay HTTP server serves static files from dist/ —
  // we must use /dock.html explicitly because the server doesn't have Vite's
  // SPA-style routing for multi-page entries.
  const dockUrl = useMemo(() => {
    const isDev = window.location.protocol === "http:" && window.location.port === "1420";
    const base = isDev ? window.location.origin : getOverlayBaseUrlSync();
    // Dev: /dock (Vite handles it). Prod: /dock.html (static file).
    return isDev ? `${base}/dock` : `${base}/dock.html`;
  }, []);

  const handleCopyDockUrl = useCallback(() => {
    navigator.clipboard.writeText(dockUrl).then(() => {
      setDockCopied(true);
      setTimeout(() => setDockCopied(false), 2000);
    });
  }, [dockUrl]);

  // Track whether a service is in progress (preparing/preservice/live)
  const [serviceActive, setServiceActive] = useState(
    () => serviceStore.status !== "idle" && serviceStore.status !== "ended"
  );

  useEffect(() => {
    return serviceStore.subscribe((state) => {
      setServiceActive(state.status !== "idle" && state.status !== "ended");
    });
  }, []);

  const heroLabel = serviceActive ? "Continue Service" : "Open Service Hub";

  const handleHeroClick = useCallback(() => {
    navigate("/hub?mode=live");
  }, [navigate]);

  const handleModuleNav = useCallback(
    (path: string, label: string, icon: string) => {
      trackRecentOpen(path, label, icon);
      navigate(path);
    },
    [navigate]
  );

  return (
    <div className="dash-page">
      <main className="dash-main">
        {/* Ambient glow */}
        <div className="dash-glow" />

        <div className="dash-content">
          {/* ── Hero: Open Service Hub ── */}
          <div className="dash-hero-wrap">
            <div className="dash-hero">
              <div className="dash-hero-inner">
                <div className="dash-hero-play-wrap">
                  <div className="dash-hero-play-glow" />
                  <button
                    className="dash-hero-play-btn"
                    onClick={handleHeroClick}
                    aria-label={heroLabel}
                  >
                    <Icon name="play_arrow" size={20} className="dash-hero-play-icon" />
                  </button>
                </div>
                <div className="dash-hero-text">
                  <h2 className="dash-hero-title">{heroLabel}</h2>
                  <p className="dash-hero-subtitle">Control your live broadcast and service modules.</p>
                  <div className="dash-hero-actions">
                    <button
                      className="dash-hero-start-btn"
                      onClick={handleHeroClick}
                    >
                      {heroLabel}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Service Modules ── */}
          <div className="dash-modules-section">
            <h3 className="dash-modules-heading">Service Modules</h3>
            <div className="dash-modules-grid">
              <button
                className="dash-mod-card"
                onClick={() => handleModuleNav("/hub?mode=live&tab=bible", "Bible", "auto_stories")}
              >
                <div className="dash-mod-icon dash-mod-icon--bible">
                  <Icon name="auto_stories" size={20} />
                </div>
                <div className="dash-mod-info">
                  <h4>Display Scripture</h4>
                  <p>Present Bible verses on the main screen.</p>
                </div>
              </button>
              <button
                className="dash-mod-card"
                onClick={() => handleModuleNav("/hub?mode=live&tab=worship", "Worship", "music_note")}
              >
                <div className="dash-mod-icon dash-mod-icon--worship">
                  <Icon name="music_note" size={20} />
                </div>
                <div className="dash-mod-info">
                  <h4>Start Song</h4>
                  <p>Launch lyric presentation for worship.</p>
                </div>
              </button>
              <button
                className="dash-mod-card"
                onClick={() => handleModuleNav("/hub?mode=live&tab=graphics", "Announcements", "campaign")}
              >
                <div className="dash-mod-icon dash-mod-icon--announce">
                  <Icon name="campaign" size={20} />
                </div>
                <div className="dash-mod-info">
                  <h4>Show Announcement</h4>
                  <p>Display notices and upcoming events.</p>
                </div>
              </button>
            </div>
          </div>

          {/* ── Setup & Tools ── */}
          <div className="dash-tools-section">
            <h3 className="dash-modules-heading">Setup &amp; Tools</h3>
            <div className="dash-tools-grid">
              <button
                className="dash-tools-add-btn"
                onClick={() => handleModuleNav("/templates/studio", "Create New Layout", "dashboard_customize")}
              >
                <Icon name="add_circle" size={20} />
                <span>Create New Layout</span>
              </button>
              <button
                className="dash-tools-add-btn"
                onClick={() => handleModuleNav("/hub/quick-merge", "Quick Merge", "merge_type")}
              >
                <Icon name="merge_type" size={20} />
                <span>Open Quick Merge</span>
              </button>
            </div>
          </div>

          {/* ── OBS Browser Dock ── */}
          <div className="dash-tools-section">
            <h3 className="dash-modules-heading">OBS Browser Dock</h3>
            <div className="dash-dock-card">
              <div className="dash-dock-info">
                <Icon name="dock" size={20} className="dash-dock-icon" />
                <div>
                  <p className="dash-dock-desc">
                    Control your service directly from an OBS docked panel. Copy the URL below and add it in
                    OBS&nbsp;→&nbsp;<strong>Docks</strong>&nbsp;→&nbsp;<strong>Custom Browser Docks</strong>.
                  </p>
                </div>
              </div>
              <div className="dash-dock-url-row">
                <input
                  className="dash-dock-url-input"
                  type="text"
                  readOnly
                  value={dockUrl}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  className="dash-dock-copy-btn"
                  onClick={handleCopyDockUrl}
                  title="Copy dock URL"
                >
                  <Icon name={dockCopied ? "check" : "content_copy"} size={16} />
                  {dockCopied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          </div>

          {/* ── Service Plans ── */}
          <ServicePlanBuilder />
        </div>
      </main>
    </div>
  );
}
