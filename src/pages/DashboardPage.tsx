import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { obsService } from "../services/obsService";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { getDeviceId } from "../services/authService";
import { getUserScopedKey } from "../services/userScopedStorage";
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
    const raw = localStorage.getItem(getUserScopedKey(RECENT_KEY));
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
  localStorage.setItem(getUserScopedKey(RECENT_KEY), JSON.stringify(filtered.slice(0, MAX_RECENT)));
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [dockCopied, setDockCopied] = useState(false);
  const [obsConnected, setObsConnected] = useState(() => obsService.isConnected);

  // In dev, Vite serves the SPA at localhost:1420 (with SPA fallback routing)
  // so /dock works because Vite proxies it to dock.html via the multi-page config.
  // In production, the overlay HTTP server serves static files from dist/ —
  // we must use /dock.html explicitly because the server doesn't have Vite's
  // SPA-style routing for multi-page entries.
  const dockUrl = useMemo(() => {
    const isDev = window.location.protocol === "http:" && window.location.port === "1420";
    const base = isDev ? window.location.origin : getOverlayBaseUrlSync();
    const deviceId = getDeviceId();
    const deviceIdParam = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
    return (isDev ? `${base}/dock` : `${base}/dock.html`) + deviceIdParam;
  }, []);

  const lmDockUrl = useMemo(() => {
    const isDev = window.location.protocol === "http:" && window.location.port === "1420";
    const base = isDev ? window.location.origin : getOverlayBaseUrlSync();
    const deviceId = getDeviceId();
    const deviceIdParam = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
    return (isDev ? `${base}/lm-dock` : `${base}/lm-dock.html`) + deviceIdParam;
  }, []);

  const [lmDockCopied, setLmDockCopied] = useState(false);

  const handleCopyDockUrl = useCallback(() => {
    navigator.clipboard.writeText(dockUrl).then(() => {
      setDockCopied(true);
      setTimeout(() => setDockCopied(false), 2000);
    });
  }, [dockUrl]);

  const handleCopyLmDockUrl = useCallback(() => {
    navigator.clipboard.writeText(lmDockUrl).then(() => {
      setLmDockCopied(true);
      setTimeout(() => setLmDockCopied(false), 2000);
    });
  }, [lmDockUrl]);

  useEffect(() => {
    setObsConnected(obsService.isConnected);
    return obsService.onStatusChange((status) => {
      setObsConnected(status === "connected");
    });
  }, []);

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
        <div className="dash-glow" />
        <div className="dash-content">

          <section className="dash-hero-row">
            <div className="dash-hero-copy">
              <h1 className="dash-hero-title">MakeChurchEasy</h1>
              <p className="dash-hero-subtitle">
                Your church production command center — scripture display, worship lyrics, announcements, and AI-powered scripture recognition.
              </p>
            </div>
            <button
              className="dash-hero-cta"
              onClick={() => handleModuleNav("/speech-to-scripture", "AI Scripture", "auto_awesome")}
             title="Auto arrange">
              <Icon name="auto_awesome" size={16} />
              Try AI Scripture Recognition
            </button>
          </section>

          <section className="dash-modules-grid" aria-label="Service modules">
            <button
              className="dash-mod-card"
              onClick={() => handleModuleNav("/hub?mode=live&tab=bible", "Bible", "menu_book")}
             title="Book">
              <div className="dash-mod-icon dash-mod-icon--bible">
                <Icon name="menu_book" size={24} />
              </div>
              <div className="dash-mod-info">
                <h2>Display Scripture</h2>
                <p>Broadcast selected biblical texts to all active output displays with one click.</p>
              </div>
            </button>
            <button
              className="dash-mod-card"
              onClick={() => handleModuleNav("/hub?mode=live&tab=worship", "Worship", "music_note")}
             title="Start">
              <div className="dash-mod-icon dash-mod-icon--worship">
                <Icon name="music_note" size={10} style={{ width: '12px', height: '12px' }} />
              </div>
              <div className="dash-mod-info">
                <h2>Start Song</h2>
                <p>Initiate the current setlist item and synchronize lyrics across the production network.</p>
              </div>
            </button>
            <button
              className="dash-mod-card"
              onClick={() => handleModuleNav("/hub?mode=live&tab=graphics", "Announcements", "campaign")}
             title="Show">
              <div className="dash-mod-icon dash-mod-icon--announce">
                <Icon name="campaign" size={24} />
              </div>
              <div className="dash-mod-info">
                <h2>Show Announcement</h2>
                <p>Push automated event slides or custom message overlays to the live stream.</p>
              </div>
            </button>
            <button
              className="dash-mod-card dash-mod-card--ai"
              onClick={() => handleModuleNav("/speech-to-scripture", "AI Scripture", "auto_awesome")}
             title="Auto arrange">
              <div className="dash-mod-icon dash-mod-icon--ai">
                <Icon name="auto_awesome" size={24} />
              </div>
              <div className="dash-mod-info">
                <h2>AI Scripture</h2>
                <p>Speak naturally and watch as AI identifies and displays matching Bible verses in real time.</p>
              </div>
            </button>
          </section>

          <section className="dash-home-grid">
            <div className="dash-home-primary">
              <section className="dash-section">
                {/* <div className="dash-section-heading">
                  <span className="dash-section-rule" />
                  <h3>Quick Configuration</h3>
                </div> */}
                <div className="dash-action-list">
                  <button
                    className="dash-action-card"
                    onClick={() => handleModuleNav("/templates/studio", "Create New Layout", "grid_view")}
                   title="Create">
                    <div className="dash-action-copy">
                      <div className="dash-action-icon">
                        <Icon name="grid_view" size={18} />
                      </div>
                      <div>
                        <h4>Create New Layout</h4>
                        <p>Design a bespoke canvas for multi-screen projection.</p>
                      </div>
                    </div>
                    <Icon name="chevron_right" size={18} className="dash-action-chevron" />
                  </button>
                  <button
                    className="dash-action-card"
                    onClick={() => handleModuleNav("/hub/quick-merge", "Quick Merge", "merge_type")}
                   title="Open">
                    <div className="dash-action-copy">
                      <div className="dash-action-icon">
                        <Icon name="merge_type" size={18} />
                      </div>
                      <div>
                        <h4>Open Quick Merge</h4>
                        <p>Sync database updates with your local repository.</p>
                      </div>
                    </div>
                    <Icon name="chevron_right" size={18} className="dash-action-chevron" />
                  </button>
                </div>
              </section>
            </div>

            <aside className="dash-home-sidebar">
              <section className="dash-dock-card">
                <div className="dash-dock-backdrop">
                  <Icon name="dock" size={88} />
                </div>
                <div className="dash-dock-body">
                  <div className={`dash-dock-badge${obsConnected ? " is-live" : ""}`}>
                    <span className="dash-dock-badge-dot" />
                    <span>{obsConnected ? "Live Connection" : "Broadcast Offline"}</span>
                  </div>
                  <div className="dash-dock-copy">
                    <h3>MakeChurchEasy Dock</h3>
                    <p>
                      Integrate your service controls directly into OBS. Copy the local URL below and paste it into a new Browser Dock in OBS.
                    </p>
                  </div>
                  <div className="dash-dock-endpoint">
                    <label>Localhost Endpoint</label>
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
                      </button>
                    </div>
                  </div>
                  <div className="dash-dock-endpoint" style={{ marginTop: 8 }}>
                    <label>LM Dock (Speech-to-Bible)</label>
                    <div className="dash-dock-url-row">
                      <input
                        className="dash-dock-url-input"
                        type="text"
                        readOnly
                        value={lmDockUrl}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <button
                        className="dash-dock-copy-btn"
                        onClick={handleCopyLmDockUrl}
                        title="Copy LM dock URL"
                      >
                        <Icon name={lmDockCopied ? "check" : "content_copy"} size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </section>

            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}

