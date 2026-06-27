/**
 * OnboardingPage — Desktop onboarding wizard for MakeChurchEasy.
 *
 * Flow: Welcome → Connect OBS → Present First Verse →
 *       Create Theme → Install Dock → Run Diagnostics → Ready
 *
 * Every step fires a milestone to the backend.
 * Persisted in localStorage so future launches skip straight to dashboard.
 */

import { useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Rocket,
  Mic,
  BookOpen,
  Music,
  Images,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Info,
  ChevronRight,
  CheckCircle,
  Loader2,
  AlertTriangle,
  Play,
  LayoutDashboard,
  Library,
  ListMusic,
  Video,
  Users,
} from "lucide-react";
import { obsService } from "../services/obsService";
import { getOverlayBaseUrlSync } from "../services/overlayUrl";
import { getDeviceId } from "../services/authService";
import { track } from "../services/analytics";
import { getDefaultOBSPort } from "../services/desktopConfig";
import { getInstalledTranslations } from "../bible/bibleDb";
import "./OnboardingPage.css";

/* ── Constants ── */
const STORAGE_KEY = "mce-onboarding-complete";
const STEP_KEY = "mce-onboarding-step";
const TOTAL_STEPS = 6;
const YOUTUBE_URL = "https://www.youtube.com/@MakeChurchEasy";
const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.makechurcheasy.creatorstudioslabs.stream";

const STEP_NAMES = [
  "Welcome",
  "OBS",
  "Features",
  "Dock",
  "Test",
  "Ready",
];

/* ── Helpers ── */
function isOnboardingComplete(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function getSavedStep(): number {
  const raw = localStorage.getItem(STEP_KEY);
  if (raw != null) {
    const n = parseInt(raw, 10);
    if (n >= 1 && n <= TOTAL_STEPS) return n;
  }
  return 1;
}

function saveStep(step: number) {
  localStorage.setItem(STEP_KEY, String(step));
}

function completeOnboarding() {
  localStorage.setItem(STORAGE_KEY, "true");
  localStorage.removeItem(STORAGE_KEY + "-theme-id");

  try {
    const deviceId = getDeviceId();
    fetch(`${API_BASE}/api/onboarding/complete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(deviceId ? { "X-Device-Id": deviceId } : {}),
      },
      body: JSON.stringify({
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "(GMT+00:00) UTC",
      }),
    }).catch(() => { });
  } catch {
    // Not critical
  }
}

function fireMilestone(milestone: string) {
  try {
    const deviceId = getDeviceId();
    fetch(`${API_BASE}/api/onboarding/milestone`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(deviceId ? { "X-Device-Id": deviceId } : {}),
      },
      body: JSON.stringify({ milestone, timestamp: new Date().toISOString() }),
    }).catch(() => { });
  } catch {
    // Not critical
  }
}

/* ── Resume Banner (exported for dashboard) ── */
export function OnboardingResumeBanner() {
  const navigate = useNavigate();

  if (isOnboardingComplete()) return null;

  const step = getSavedStep();
  const remaining = TOTAL_STEPS - step + 1;

  return (
    <div
      className="ob-resume-banner"
      onClick={() => navigate("/onboarding")}
    >
      <AlertTriangle size={16} />
      <span className="ob-resume-text">Complete Setup</span>
      <span className="ob-resume-steps">
        {remaining} step{remaining !== 1 ? "s" : ""} remaining
      </span>
      <ChevronRight size={14} className="ob-resume-arrow" />
    </div>
  );
}

/* ── Main Component ── */
export default function OnboardingPage() {
  const [step, setStep] = useState(() => getSavedStep());
  const [showSkipModal, setShowSkipModal] = useState(false);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS) {
      const next = step + 1;
      setStep(next);
      saveStep(next);
      track("onboarding_step_completed", {
        step: STEP_NAMES[next - 1] ?? String(next),
      });
    }
  }, [step]);

  const goPrev = useCallback(() => {
    if (step > 1) {
      const prev = step - 1;
      setStep(prev);
      saveStep(prev);
    }
  }, [step]);

  const finish = useCallback(() => {
    fireMilestone("desktopOnboardingCompletedAt");
    track("onboarding_completed");
    completeOnboarding();
    window.location.href = "/";
  }, []);

  const skip = useCallback(() => {
    track("onboarding_skipped");
    completeOnboarding();
    window.location.href = "/";
  }, []);

  const openTutorial = useCallback(() => {
    openUrl(YOUTUBE_URL);
  }, []);

  useEffect(() => {
    track("onboarding_started");
    fireMilestone("desktopOnboardingStartedAt");
  }, []);

  return (
    <div className="ob-root">
      {/* Progress dots */}
      {/* <div className="ob-progress">
        {STEP_NAMES.map((_, i) => {
          const s = i + 1;
          const isDone = s < step;
          const isActive = s === step;
          return (
            <div className="ob-step-dot-wrap" key={i}>
              {i > 0 && (
                <div
                  className={`ob-step-line${isDone ? " is-done" : ""}`}
                />
              )}
              <div
                className={`ob-step-dot${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`}
              />
            </div>
          );
        })}
      </div> */}

      {/* Step labels */}
      <div className="ob-step-labels">
        {STEP_NAMES.map((name, i) => {
          const s = i + 1;
          const isDone = s < step;
          const isActive = s === step;
          return (
            <span
              key={i}
              className={`ob-step-label${isActive ? " is-active" : ""}${isDone ? " is-done" : ""}`}
            >
              {name}
            </span>
          );
        })}
      </div>

      {/* Content */}
      <div className="ob-content">
        {step === 1 && (
          <StepWelcome onNext={goNext} onTutorial={openTutorial} />
        )}
        {step === 2 && (
          <StepConnectOBS onNext={goNext} onBack={goPrev} />
        )}
        {step === 3 && (
          <StepFeatures onNext={goNext} onBack={goPrev} />
        )}
        {step === 4 && (
          <StepInstallDock
            onNext={goNext}
            onBack={goPrev}
            onTutorial={openTutorial}
          />
        )}
        {step === 5 && (
          <StepTest onFinish={finish} onBack={goPrev} />
        )}
        {step === 6 && <StepReady onFinish={finish} />}
      </div>

      {/* Skip modal */}
      {showSkipModal && (
        <div
          className="ob-modal-overlay"
          onClick={() => setShowSkipModal(false)}
        >
          <div className="ob-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Skip Setup?</h3>
            <p>
              Some features may not work until setup is completed. You can
              resume setup later from the dashboard.
            </p>
            <div className="ob-modal-actions">
              <button
                className="ob-btn ob-btn--ghost"
                onClick={() => setShowSkipModal(false)}
              >
                Continue Setup
              </button>
              <button className="ob-btn ob-btn--primary" onClick={skip}>
                Skip for Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 1 — Welcome
   ══════════════════════════════════════════════════════════════ */

function StepWelcome({
  onNext,
  onTutorial,
}: {
  onNext: () => void;
  onTutorial: () => void;
}) {
  return (
    <div className="ob-card">
      <div className="ob-hero">
        <div className="ob-hero-icon">
          <Rocket size={28} />
        </div>
        <h1>Welcome to MakeChurchEasy</h1>
        <p>
          Complete Church Presentation Studio for OBS. Present Bible verses,
          worship lyrics, media, and live scripture detection directly inside
          OBS.
        </p>
      </div>

      <div className="ob-features">
        <div className="ob-feature-card">
          <div className="ob-feature-icon ob-feature-icon--purple">
            <Mic size={16} />
          </div>
          <h3>Voice Bible</h3>
          <p>Detect scriptures while preaching</p>
        </div>
        <div className="ob-feature-card">
          <div className="ob-feature-icon ob-feature-icon--green">
            <BookOpen size={16} />
          </div>
          <h3>Bible Presentation</h3>
          <p>Display verses instantly</p>
        </div>
        <div className="ob-feature-card">
          <div className="ob-feature-icon ob-feature-icon--orange">
            <Music size={16} />
          </div>
          <h3>Worship Lyrics</h3>
          <p>Manage worship slides</p>
        </div>
        <div className="ob-feature-card">
          <div className="ob-feature-icon ob-feature-icon--blue">
            <Images size={16} />
          </div>
          <h3>Media</h3>
          <p>Images, videos and announcements</p>
        </div>
      </div>

      <div className="ob-actions">
        <button className="ob-btn ob-btn--primary" onClick={onNext}>
          Get Started
          <ArrowRight size={16} />
        </button>
        <button className="ob-btn ob-btn--secondary" onClick={onTutorial}>
          <Play size={14} />
          Watch Tutorial
          <ExternalLink size={12} style={{ marginLeft: "auto" }} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 2 — Connect OBS
   ══════════════════════════════════════════════════════════════ */

function StepConnectOBS({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(getDefaultOBSPort());
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<
    "idle" | "checking" | "connected" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const testConnection = useCallback(async () => {
    setStatus("checking");
    setErrorMsg("");
    try {
      const url = `ws://${host}:${port}`;
      await obsService.connect(url, password || undefined);
      await new Promise((r) => setTimeout(r, 500));
      if (obsService.isConnected) {
        setStatus("connected");
        fireMilestone("firstDesktopLoginAt");
      } else {
        setStatus("error");
        setErrorMsg(obsService.error || "Connection failed");
      }
    } catch (err: unknown) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error ? err.message : "Could not connect to OBS",
      );
    }
  }, [host, port, password]);

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Connect OBS</h1>
        <p>
          Verify that OBS Studio is running with WebSocket support enabled.
        </p>
      </div>

      {/* Status */}
      <div className="ob-obs-status">
        <div
          className={`ob-obs-dot${status === "connected" ? " ob-obs-dot--connected" : ""}${status === "error" ? " ob-obs-dot--disconnected" : ""}${status === "checking" ? " ob-obs-dot--checking" : ""}${status === "idle" ? " ob-obs-dot--disconnected" : ""}`}
        />
        <span className="ob-obs-status-text">
          {status === "connected"
            ? "Connected"
            : status === "checking"
              ? "Checking..."
              : "Not Connected"}
        </span>
        {status === "error" && (
          <span className="ob-obs-status-sub">{errorMsg}</span>
        )}
      </div>

      {/* Instructions */}
      <div className="ob-instructions">
        <h4>If OBS is not connected</h4>
        <ol>
          <li>Open OBS Studio</li>
          <li>
            Go to <strong>Tools → WebSocket Server Settings</strong>
          </li>
          <li>Enable WebSocket Server</li>
          <li>
            Note the <strong>Port</strong> (default: <code>4455</code>)
          </li>
        </ol>
      </div>

      {/* Connection form */}
      <div className="ob-form">
        <div className="ob-form-row">
          <div className="ob-field">
            <label>Host</label>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="localhost"
            />
          </div>
          <div className="ob-field">
            <label>Port</label>
            <input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="4455"
            />
          </div>
        </div>
        <div className="ob-field">
          <label>Password (optional)</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter OBS WebSocket password"
          />
        </div>
      </div>

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button
            className="ob-btn ob-btn--secondary"
            onClick={testConnection}
          >
            {status === "checking" ? (
              <Loader2
                size={14}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Play size={14} />
            )}
            Test Connection
          </button>
        </div>
        <button
          className="ob-btn ob-btn--primary"
          disabled={status !== "connected"}
          onClick={onNext}
        >
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 3 — Features Showcase (display only)
   ══════════════════════════════════════════════════════════════ */

function StepFeatures({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Powerful Features</h1>
        <p>
          MakeChurchEasy comes with everything you need for a modern church service.
        </p>
      </div>

      <div className="ob-features">
        <div className="ob-feature-card">
          <div className="ob-feature-icon ob-feature-icon--green">
            <BookOpen size={16} />
          </div>
          <h3>Bible Presentation</h3>
          <p>Display scripture verses live in OBS with beautiful themes</p>
        </div>
        <div className="ob-feature-card">
          <div className="ob-feature-icon ob-feature-icon--purple">
            <Mic size={16} />
          </div>
          <h3>Speech to Scripture</h3>
          <p>AI detects Bible references as you preach and auto-displays them</p>
        </div>
      </div>

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
        </div>
        <button className="ob-btn ob-btn--primary" onClick={onNext}>
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 4 — Install Dock
   ══════════════════════════════════════════════════════════════ */

function StepInstallDock({
  onNext,
  onBack,
  onTutorial,
}: {
  onNext: () => void;
  onBack: () => void;
  onTutorial: () => void;
}) {
  const [copied, setCopied] = useState<"dock" | "ai" | null>(null);
  const isDev =
    window.location.protocol === "http:" && window.location.port === "1420";
  const base = isDev ? window.location.origin : getOverlayBaseUrlSync();
  const deviceId = getDeviceId();
  const deviceIdParam = deviceId
    ? `?deviceId=${encodeURIComponent(deviceId)}`
    : "";
  const dockUrl =
    (isDev ? `${base}/dock` : `${base}/dock.html`) + deviceIdParam;
  const aiUrl =
    (isDev ? `${base}/lm-dock` : `${base}/lm-dock.html`) + deviceIdParam;

  const copyUrl = async (url: string, which: "dock" | "ai") => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback: select input
    }
  };

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Install MakeChurchEasy Dock</h1>
        <p>
          Copy these URLs — you'll paste them into OBS as Custom Browser
          Docks.
        </p>
      </div>

      <p className="ob-section-title">OBS Custom Browser Docks</p>

      {/* Bible Overlay Dock */}
      <div className="ob-url-card">
        <div className="ob-url-card-header">
          <span className="ob-url-card-title">Bible Overlay Dock</span>
          {copied === "dock" && (
            <Check size={14} style={{ color: "var(--success)" }} />
          )}
        </div>
        <div className="ob-url-input-row">
          <input className="ob-url-input" readOnly value={dockUrl} />
          <button
            className="ob-btn ob-btn--primary"
            style={{ flex: "none", padding: "0 16px" }}
            onClick={() => copyUrl(dockUrl, "dock")}
          >
            <Copy size={14} />
            {copied === "dock" ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="ob-url-desc">
          Scripture presentation and Bible controls inside OBS.
        </p>
      </div>

      {/* MakeChurchEasy Control Dock */}
      <div className="ob-url-card">
        <div className="ob-url-card-header">
          <span className="ob-url-card-title">
            MakeChurchEasy Control Dock
          </span>
          {copied === "ai" && (
            <Check size={14} style={{ color: "var(--success)" }} />
          )}
        </div>
        <div className="ob-url-input-row">
          <input className="ob-url-input" readOnly value={aiUrl} />
          <button
            className="ob-btn ob-btn--primary"
            style={{ flex: "none", padding: "0 16px" }}
            onClick={() => copyUrl(aiUrl, "ai")}
          >
            <Copy size={14} />
            {copied === "ai" ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="ob-url-desc">
          Full MakeChurchEasy control panel for live service management.
        </p>
      </div>

      <div className="ob-info-banner">
        <Info size={16} />
        <span>
          These are OBS Dock URLs, not Browser Sources. Add them under Docks
          → Custom Browser Docks.
        </span>
      </div>

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button className="ob-btn ob-btn--secondary" onClick={onTutorial}>
            <Play size={14} />
            Watch Tutorial
          </button>
        </div>
        <button className="ob-btn ob-btn--primary" onClick={onNext}>
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 6 — Run Diagnostics
   ══════════════════════════════════════════════════════════════ */

interface DiagItem {
  label: string;
  status: "ok" | "warn" | "fail" | "pending";
  detail: string;
}

function StepTest({
  onFinish,
  onBack,
}: {
  onFinish: () => void;
  onBack: () => void;
}) {
  const [diags, setDiags] = useState<DiagItem[]>([
    { label: "OBS Connected", status: "pending", detail: "" },
    { label: "Bible Resources", status: "pending", detail: "" },
    { label: "MakeChurchEasy Dock", status: "pending", detail: "" },
    { label: "AI Dock", status: "pending", detail: "" },
    { label: "Voice Bible", status: "pending", detail: "" },
  ]);
  const [running, setRunning] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    const results: DiagItem[] = [];
    const isDev =
      window.location.protocol === "http:" && window.location.port === "1420";
    const base = isDev ? window.location.origin : getOverlayBaseUrlSync();

    // 1. OBS
    results.push({
      label: "OBS Connected",
      status: obsService.isConnected ? "ok" : "fail",
      detail: obsService.isConnected ? "Connected" : "Not connected",
    });
    setDiags([...results]);

    // 2. Bible Resources
    try {
      const installed = await getInstalledTranslations();
      results.push({
        label: "Bible Resources",
        status: installed.length > 0 ? "ok" : "warn",
        detail:
          installed.length > 0
            ? `${installed.length} translation${installed.length !== 1 ? "s" : ""} installed`
            : "No translations downloaded",
      });
    } catch {
      results.push({
        label: "Bible Resources",
        status: "warn",
        detail: "Could not verify",
      });
    }
    setDiags([...results]);

    // 3. MakeChurchEasy Dock
    try {
      const dockUrl = isDev ? `${base}/dock` : `${base}/dock.html`;
      await fetch(dockUrl, { method: "HEAD", mode: "no-cors" });
      results.push({
        label: "MakeChurchEasy Dock",
        status: "ok",
        detail: "Reachable",
      });
    } catch {
      results.push({
        label: "MakeChurchEasy Dock",
        status: "warn",
        detail: "Could not verify",
      });
    }
    setDiags([...results]);

    // 4. AI Dock
    try {
      const aiUrl = `${base}/lm-dock.html`;
      await fetch(aiUrl, { method: "HEAD", mode: "no-cors" });
      results.push({ label: "AI Dock", status: "ok", detail: "Reachable" });
    } catch {
      results.push({
        label: "AI Dock",
        status: "warn",
        detail: "Could not verify",
      });
    }
    setDiags([...results]);

    // 5. Voice Bible (check if mic permission is available)
    try {
      if (navigator.mediaDevices) {
        results.push({
          label: "Voice Bible",
          status: "ok",
          detail: "Microphone available",
        });
      } else {
        results.push({
          label: "Voice Bible",
          status: "warn",
          detail: "Microphone API not available",
        });
      }
    } catch {
      results.push({
        label: "Voice Bible",
        status: "warn",
        detail: "Could not verify",
      });
    }
    setDiags([...results]);

    setRunning(false);
  }, []);

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <h1>Run Diagnostics</h1>
        <p>
          Run a quick check to make sure all components are working correctly.
        </p>
      </div>

      <div className="ob-diag-list">
        {diags.map((d, i) => (
          <div className="ob-diag-item" key={i}>
            <div className={`ob-diag-dot ob-diag-dot--${d.status}`} />
            <span className="ob-diag-label">{d.label}</span>
            <span className={`ob-diag-status ob-diag-status--${d.status}`}>
              {d.status === "pending"
                ? "—"
                : d.status === "ok"
                  ? `✓ ${d.detail}`
                  : d.status === "warn"
                    ? `⚠ ${d.detail}`
                    : `✕ ${d.detail}`}
            </span>
          </div>
        ))}
      </div>

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack}>
            Back
          </button>
          <button
            className="ob-btn ob-btn--secondary"
            onClick={runDiagnostics}
            disabled={running}
          >
            {running ? (
              <Loader2
                size={14}
                style={{ animation: "spin 1s linear infinite" }}
              />
            ) : (
              <Play size={14} />
            )}
            Run Diagnostics
          </button>
        </div>
        <button className="ob-btn ob-btn--primary" onClick={onFinish}>
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 7 — Ready
   ══════════════════════════════════════════════════════════════ */

function StepReady({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="ob-card">
      <div className="ob-success-hero">
        <div className="ob-success-icon">
          <CheckCircle size={32} />
        </div>
        <h1>MakeChurchEasy Is Ready</h1>
        <p>Everything is set up and ready to use.</p>
      </div>

      <div className="ob-summary">
        <div className="ob-summary-item">
          <CheckCircle size={16} className="ob-summary-check" />
          OBS Connected
        </div>
        <div className="ob-summary-item">
          <CheckCircle size={16} className="ob-summary-check" />
          Bible Resources Downloaded
        </div>
        <div className="ob-summary-item">
          <CheckCircle size={16} className="ob-summary-check" />
          Dock Installed
        </div>
        <div className="ob-summary-item">
          <CheckCircle size={16} className="ob-summary-check" />
          Voice Bible Ready
        </div>
      </div>

      <p className="ob-section-title">Quick Actions</p>

      <div className="ob-quick-actions">
        <button className="ob-quick-btn" onClick={onFinish}>
          <LayoutDashboard size={16} />
          Open Dashboard
        </button>
        <button
          className="ob-quick-btn"
          onClick={() => {
            completeOnboarding();
            window.location.href = "/resources?tab=bible";
          }}
        >
          <Library size={16} />
          Open Bible
        </button>
        <button
          className="ob-quick-btn"
          onClick={() => {
            completeOnboarding();
            window.location.href = "/resources?tab=worship";
          }}
        >
          <ListMusic size={16} />
          Open Worship
        </button>
        <button className="ob-quick-btn" onClick={() => openUrl(YOUTUBE_URL)}>
          <Video size={16} />
          Watch Tutorials
        </button>
        <button
          className="ob-quick-btn"
          onClick={() => openUrl("https://discord.gg/makechurcheasy")}
        >
          <Users size={16} />
          Join Community
        </button>
      </div>
    </div>
  );
}
