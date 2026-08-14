/**
 * OnboardingPage — Desktop onboarding wizard for MakeChurchEasy.
 *
 * Flow: Welcome → Connect OBS → Optional Move Transition →
 *       Install Dock → Run Diagnostics → Ready
 *
 * Every step fires a milestone to the backend.
 * Persisted in localStorage so future launches skip straight to dashboard.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Rocket,
  ArrowRight,
  ExternalLink,
  Copy,
  Check,
  Info,
  ChevronRight,
  CheckCircle,
  Loader2,
  AlertTriangle,
  ArrowUpRight,
  Maximize2,
  Minimize2,
  Play,
  Puzzle,
  RefreshCw,
  Download,
  LayoutDashboard,
  Library,
  ListMusic,
  Users,
} from "lucide-react";
import { obsService } from "../services/obsService";
import { getDockBaseUrl } from "../services/overlayUrl";
import {
  getObsMovePluginStatus,
  ensureMoveTransition,
  installObsMovePlugin,
  isMceBridgeLoaded,
  isMovePluginLoaded,
  MOVE_TRANSITION_RELEASE_URL,
  type ObsMovePluginStatus,
} from "../services/obsMovePlugin";

import { getDeviceId } from "../services/authService";
import { track } from "../services/analytics";
import {
  trackEvent as trackProductEvent,
  trackObsConnected as trackObsConnectedBackend,
  trackFirstUseStarted,
} from "../services/tracking";
import { getDefaultOBSPort } from "../services/desktopConfig";
import { persistOBSWebSocketConfig } from "../services/obsConnectionSettings";
import "./OnboardingPage.css";

/* ── Constants ── */
const STORAGE_KEY = "mce-onboarding-complete";
const STEP_KEY = "mce-onboarding-step";
const FLOW_VERSION_KEY = "mce-onboarding-flow-version";
const FLOW_VERSION = 2;
const TOTAL_STEPS = 6;

const API_BASE =
  import.meta.env.VITE_AUTH_API_URL ||
  "https://api.creatorstudioslabs.stream";

const STEP_NAMES = [
  "Welcome",
  "OBS",
  "Smooth Layouts",
  "Dock",
  "First Win",
  "Ready",
];

type OnboardingTutorial = {
  title: string;
  description: string;
  videoId: string;
  watchUrl: string;
};

/**
 * Keep onboarding videos in one place so they can be replaced without
 * changing the step components or the tutorial panel layout.
 */
const ONBOARDING_TUTORIALS: Record<number, OnboardingTutorial> = {
  1: {
    title: "MakeChurchEasy overview",
    description: "See how the full presentation workflow fits together.",
    videoId: "NmneQhxY2jQ",
    watchUrl: "https://www.youtube.com/watch?v=NmneQhxY2jQ",
  },
  2: {
    title: "Connect MakeChurchEasy to OBS",
    description: "Follow the OBS connection setup before moving on.",
    videoId: "i-WnFFnuCMA",
    watchUrl: "https://www.youtube.com/watch?v=i-WnFFnuCMA",
  },
  3: {
    title: "Install smooth OBS layouts",
    description: "Learn how to install the OBS plugin used for smooth layouts.",
    videoId: "MIPOasmFFxU",
    watchUrl: "https://www.youtube.com/watch?v=MIPOasmFFxU",
  },
  4: {
    title: "Use the MakeChurchEasy Dock",
    description: "See how the Dock brings your Bible, text, and media into OBS.",
    videoId: "08UjSYtjmLU",
    watchUrl: "https://www.youtube.com/watch?v=08UjSYtjmLU",
  },
  5: {
    title: "Display your first Bible verse",
    description: "Follow along and send your first verse to OBS.",
    videoId: "Qut6hGAs7mM",
    watchUrl: "https://www.youtube.com/watch?v=Qut6hGAs7mM",
  },
  6: {
    title: "Add more Bible versions",
    description: "Keep going with Bible resources after your setup is complete.",
    videoId: "tq_EAHKO-Q4",
    watchUrl: "https://www.youtube.com/watch?v=tq_EAHKO-Q4",
  },
};

/* ── Helpers ── */
function isOnboardingComplete(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "true";
}

function getSavedStep(): number {
  const raw = localStorage.getItem(STEP_KEY);
  let savedStep = 1;
  if (raw != null) {
    const n = parseInt(raw, 10);
    if (n >= 1) savedStep = n;
  }

  // The Move plugin step was inserted after OBS. Preserve the place where an
  // incomplete older onboarding flow stopped instead of showing the wrong page.
  const savedVersion = parseInt(
    localStorage.getItem(FLOW_VERSION_KEY) || "1",
    10,
  );
  if (savedVersion < FLOW_VERSION && raw != null && savedStep >= 3) {
    savedStep += 1;
  }

  const normalizedStep = Math.min(savedStep, TOTAL_STEPS);
  localStorage.setItem(FLOW_VERSION_KEY, String(FLOW_VERSION));
  localStorage.setItem(STEP_KEY, String(normalizedStep));
  return normalizedStep;
}

function saveStep(step: number) {
  localStorage.setItem(STEP_KEY, String(step));
  localStorage.setItem(FLOW_VERSION_KEY, String(FLOW_VERSION));
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

function OnboardingTutorialPanel({ step }: { step: number }) {
  const tutorial = ONBOARDING_TUTORIALS[step] ?? ONBOARDING_TUTORIALS[1];
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === iframeRef.current);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    setIsFullscreen(false);
  }, [tutorial.videoId]);

  const openTutorial = useCallback(() => {
    void openUrl(tutorial.watchUrl).catch(() => {
      window.open(tutorial.watchUrl, "_blank", "noopener,noreferrer");
    });
  }, [tutorial.watchUrl]);

  const toggleFullscreen = useCallback(async () => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await iframe.requestFullscreen();
    } catch {
      openTutorial();
    }
  }, [openTutorial]);

  const embedUrl =
    `https://www.youtube-nocookie.com/embed/${tutorial.videoId}` +
    "?autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1";

  return (
    <aside className="ob-tutorial-panel" aria-label={`Step ${step} tutorial`}>
      <div className="ob-tutorial-header">
        <div className="ob-tutorial-heading">
          <span className="ob-tutorial-kicker">
            <ArrowUpRight size={13} />
            Step {step} tutorial
          </span>
          <h2>{tutorial.title}</h2>
          <p>{tutorial.description}</p>
        </div>
        <button
          className="ob-tutorial-icon-btn"
          type="button"
          onClick={toggleFullscreen}
          title={isFullscreen ? "Exit full screen" : "Maximize tutorial"}
          aria-label={isFullscreen ? "Exit full screen" : "Maximize tutorial"}
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </div>

      <div className="ob-tutorial-video-shell">
        <iframe
          key={tutorial.videoId}
          ref={iframeRef}
          src={embedUrl}
          title={tutorial.title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>

      <div className="ob-tutorial-footer">
        <span className="ob-tutorial-playing">
          <span className="ob-tutorial-live-dot" />
          Playing for this step
        </span>
        <button
          className="ob-tutorial-watch-btn"
          type="button"
          onClick={openTutorial}
          title="Watch tutorial on YouTube"
        >
          Watch tutorial
          <ExternalLink size={13} />
        </button>
      </div>
      <p className="ob-tutorial-note">Autoplay starts muted. Turn sound on in the player.</p>
    </aside>
  );
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
      trackProductEvent("onboarding_step_completed", {
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
    trackProductEvent("onboarding_completed");
    completeOnboarding();
    window.location.href = "/";
  }, []);

  const skip = useCallback(() => {
    track("onboarding_skipped");
    trackProductEvent("onboarding_skipped");
    completeOnboarding();
    window.location.href = "/";
  }, []);

  useEffect(() => {
    track("onboarding_started");
    trackProductEvent("onboarding_started");
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
        <div className="ob-layout">
          <main className="ob-step-stage">
            {step === 1 && <StepWelcome onNext={goNext} />}
            {step === 2 && (
              <StepConnectOBS onNext={goNext} onBack={goPrev} />
            )}
            {step === 3 && (
              <StepInstallMovePlugin onNext={goNext} onBack={goPrev} />
            )}
            {step === 4 && (
              <StepInstallDock onNext={goNext} onBack={goPrev} />
            )}
            {step === 5 && <StepTest onFinish={finish} onBack={goPrev} />}
            {step === 6 && <StepReady onFinish={finish} />}
          </main>
          <OnboardingTutorialPanel step={step} />
        </div>
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
                title="Continue">
                Continue Setup
              </button>
              <button className="ob-btn ob-btn--primary" onClick={skip} title="Skip">
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
}: {
  onNext: () => void;
}) {
  return (
    <div className="ob-card ob-card--dock-install">
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

      <div className="ob-actions">
        <button className="ob-btn ob-btn--primary" onClick={onNext} title="Get started">
          Get Started
          <ArrowRight size={16} />
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
        await persistOBSWebSocketConfig(url, password || undefined, true);
        setStatus("connected");
        trackObsConnectedBackend();
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
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left", position: "relative" }}>
        <h1>Connect OBS</h1>
        <p>
          Verify that OBS Studio is running with WebSocket support enabled.
        </p>

        {/* Status — top right */}
        <div className="ob-obs-status" style={{ position: "absolute", top: 0, right: 0 }}>
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
      </div>

      {/* Instructions */}
      <div className="ob-instructions">
        <h4>If OBS is not connected</h4>
        <ol style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", padding: 0, margin: 0, listStyle: "none", counterReset: "step" }}>
          <li style={{ counterIncrement: "step" }}><strong>1.</strong> Open OBS Studio</li>
          <li style={{ counterIncrement: "step" }}><strong>2.</strong> Go to <strong>Tools → WebSocket Server Settings</strong></li>
          <li style={{ counterIncrement: "step" }}><strong>3.</strong> Enable WebSocket Server</li>
          <li style={{ counterIncrement: "step" }}><strong>4.</strong> Note the <strong>Port</strong> (default: <code>4455</code>)</li>
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
          <button className="ob-btn ob-btn--ghost" onClick={onBack} title="Go back">
            Back
          </button>
          <button
            className="ob-btn ob-btn--secondary"
            onClick={testConnection}
            title="Play">
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
          title="Continue">
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 3 — Install Move Transition
   ══════════════════════════════════════════════════════════════ */

type MoveSetupState =
  | "checking"
  | "not-installed"
  | "installed"
  | "installing"
  | "ready"
  | "error";

function StepInstallMovePlugin({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [plugin, setPlugin] = useState<ObsMovePluginStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bridgeLoaded, setBridgeLoaded] = useState(false);
  const [state, setState] = useState<MoveSetupState>("checking");

  const checkPlugin = useCallback(async () => {
    setState("checking");

    try {
      const status = await getObsMovePluginStatus();
      let runtimeLoaded = await isMovePluginLoaded();
      let runtimeBridgeLoaded = await isMceBridgeLoaded();

      // OBS normally reconnects automatically after a restart. If the socket
      // has not reconnected yet, give the saved connection one explicit try.
      if (!runtimeLoaded && status.installed && !obsService.isConnected) {
        try {
          await obsService.connect();
          runtimeLoaded = await isMovePluginLoaded();
          runtimeBridgeLoaded = await isMceBridgeLoaded();
        } catch {
          // The file check still lets the user continue with the fallback.
        }
      }

      setPlugin(status);
      setLoaded(runtimeLoaded);
      setBridgeLoaded(runtimeBridgeLoaded);
      if (runtimeLoaded && runtimeBridgeLoaded) {
        void ensureMoveTransition();
      }
      const installed = status.installed && status.bridgeInstalled;
      setState(
        installed
          ? runtimeLoaded && runtimeBridgeLoaded
            ? "ready"
            : "installed"
          : "not-installed",
      );
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void checkPlugin();
  }, [checkPlugin]);

  const install = useCallback(async () => {
    setState("installing");
    if (!window.confirm("Install Move Transition and the MakeChurchEasy OBS Bridge for this user?")) {
      setState(plugin?.installed && plugin.bridgeInstalled ? "installed" : "not-installed");
      return;
    }
    try {
      const status = await installObsMovePlugin();
      setPlugin(status);
      setLoaded(false);
      setBridgeLoaded(false);
      setState("installed");
      fireMilestone("moveTransitionInstalledAt");
    } catch {
      setState("error");
    }
  }, [plugin]);

  const openMoveTransitionRelease = useCallback(() => {
    void openUrl(MOVE_TRANSITION_RELEASE_URL);
  }, []);

  const allInstalled = plugin?.installed === true && plugin.bridgeInstalled === true;
  const allBundled = plugin?.bundled === true && plugin.bridgeBundled === true;
  const statusLabel = loaded && bridgeLoaded
    ? "Ready"
    : allInstalled
      ? "Restart OBS"
      : "Optional";

  return (
    <div className="ob-card">
      <div className="ob-hero" style={{ alignItems: "flex-start", textAlign: "left" }}>
        <div className="ob-hero-icon">
          <Puzzle size={24} />
        </div>
        <h1>Optional: Enable smooth OBS layouts</h1>
        <p>
          Move Transition lets MakeChurchEasy animate layout changes smoothly
          inside OBS. MakeChurchEasy installs Move Transition and its small
          bridge for this user without requiring an administrator password. You
          can skip this step and continue with the built-in layout fallback.
        </p>
      </div>

      <div className="ob-plugin-card">
        <div className="ob-plugin-card__header">
          <div>
            <div className="ob-url-card-title">OBS motion support</div>
            <div className="ob-plugin-card__version">
              Move {plugin?.version || "3.2.1"} · Bridge {plugin?.bridgeVersion || "1.0.0"} · {plugin?.platform || "Desktop"}
            </div>
          </div>
          <span className={`ob-plugin-state ob-plugin-state--${loaded && bridgeLoaded ? "ready" : allInstalled ? "pending" : "idle"}`}>
            {state === "checking" || state === "installing" ? "Checking" : statusLabel}
          </span>
        </div>

        <p className="ob-url-desc">
          {allInstalled
            ? plugin?.message || "OBS motion support is installed."
            : "Optional: install motion support for smoother OBS layouts, or continue without it."}
        </p>

        <div className="ob-plugin-card__detail">
          <CheckCircle size={15} />
          <span>
            After installation, restart OBS once. Then choose <strong>Check again</strong> so
            the app can confirm that OBS loaded the plugin.
          </span>
        </div>
      </div>

      {allInstalled && (!loaded || !bridgeLoaded) && (
        <div className="ob-info-banner">
          <RefreshCw size={16} />
          <span>
            Restart OBS now, leave MakeChurchEasy open, then click Check again.
            The existing frame-by-frame fallback remains available if you continue
            before OBS reloads.
          </span>
        </div>
      )}

      <div className="ob-actions">
        <div className="ob-actions-row">
          <button className="ob-btn ob-btn--ghost" onClick={onBack} title="Go back">
            Back
          </button>
          {allInstalled && (
            <button
              className="ob-btn ob-btn--secondary"
              onClick={() => void checkPlugin()}
              disabled={state === "checking" || state === "installing"}
              title="Check plugin status">
              <RefreshCw size={14} />
              Check again
            </button>
          )}
          {!allInstalled && (
            <button
              className="ob-btn ob-btn--secondary"
              onClick={() => {
                if (allBundled) void install();
                else openMoveTransitionRelease();
              }}
              disabled={state === "checking" || state === "installing"}
              title={allBundled ? "Install OBS motion support" : "Open Move Transition download"}>
              {state === "installing" ? (
                <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              ) : allBundled ? (
                <Download size={14} />
              ) : (
                <ExternalLink size={14} />
              )}
              {allBundled ? "Install motion support" : "Open Move Transition"}
            </button>
          )}
        </div>
        <button className="ob-btn ob-btn--primary" onClick={onNext} title="Continue">
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
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState<"dock" | "ai" | null>(null);
  const base = getDockBaseUrl();
  const dockUrl = `${base}/dock`;
  const aiUrl = `${base}/lm-dock`;

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

      <div className="ob-url-cards-row">
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
              className="ob-btn ob-btn--primary ob-url-copy-btn"
              onClick={() => copyUrl(dockUrl, "dock")}
              title="Copy">
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
              Scripture Assistant
            </span>
            {copied === "ai" && (
              <Check size={14} style={{ color: "var(--success)" }} />
            )}
          </div>
          <div className="ob-url-input-row">
            <input className="ob-url-input" readOnly value={aiUrl} />
            <button
              className="ob-btn ob-btn--primary ob-url-copy-btn"
              onClick={() => copyUrl(aiUrl, "ai")}
              title="Copy">
              <Copy size={14} />
              {copied === "ai" ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="ob-url-desc">
            Automatically detects and displays Bible references as the preacher speaks.
          </p>
        </div>
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
          <button className="ob-btn ob-btn--ghost" onClick={onBack} title="Go back">
            Back
          </button>
          <button className="ob-btn ob-btn--primary" onClick={onNext} title="Continue">
            Continue
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 5 — Confirm Your First Win
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
    { label: "Move Transition", status: "pending", detail: "" },
    { label: "MCE OBS Bridge", status: "pending", detail: "" },
    { label: "MakeChurchEasy Dock", status: "pending", detail: "" },
    { label: "AI Dock", status: "pending", detail: "" },
    { label: "Voice Bible", status: "pending", detail: "" },
  ]);
  const [running, setRunning] = useState(false);

  const runDiagnostics = useCallback(async () => {
    setRunning(true);
    const results: DiagItem[] = [];
    const base = getDockBaseUrl();

    // 1. OBS
    results.push({
      label: "OBS Connected",
      status: obsService.isConnected ? "ok" : "fail",
      detail: obsService.isConnected ? "Connected" : "Not connected",
    });
    setDiags([...results]);

    // 2. Move Transition — file installed is useful, but the runtime check
    // confirms that OBS loaded it after the restart.
    try {
      const plugin = await getObsMovePluginStatus();
      const loaded = await isMovePluginLoaded();
      const bridgeLoaded = await isMceBridgeLoaded();
      results.push({
        label: "Move Transition",
        status: loaded ? "ok" : "warn",
        detail: loaded
          ? "Loaded in OBS"
          : plugin.installed
            ? "Optional — restart OBS to load"
            : "Optional — using built-in fallback",
      });
      results.push({
        label: "MCE OBS Bridge",
        status: bridgeLoaded ? "ok" : "warn",
        detail: bridgeLoaded
          ? "Loaded in OBS"
          : plugin.bridgeInstalled
            ? "Optional — restart OBS to load"
            : "Optional — using built-in fallback",
      });
    } catch {
      results.push({
        label: "Move Transition",
        status: "warn",
        detail: "Could not verify",
      });
    }
    setDiags([...results]);

    // 3. MakeChurchEasy Dock
    try {
      const dockUrl = `${base}/dock`;
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
        <h1>Confirm Your First Win</h1>
        <p>
          Run a quick check, then present your first Bible verse to OBS from the Ready step.
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
          <button className="ob-btn ob-btn--ghost" onClick={onBack} title="Go back">
            Back
          </button>

          <button
            className="ob-btn ob-btn--secondary"
            onClick={runDiagnostics}
            disabled={running}
            title="Play">
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
        <button className="ob-btn ob-btn--primary" onClick={onFinish} title="Continue">
          Continue
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   Step 6 — Ready
   ══════════════════════════════════════════════════════════════ */

function StepReady({ onFinish }: { onFinish: () => void }) {
  const openFirstWin = useCallback(() => {
    trackFirstUseStarted();
    completeOnboarding();
    window.location.href = "/resources?tab=bible";
  }, []);

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

      <div className="ob-info-banner" style={{ alignItems: "flex-start" }}>
        <Play size={16} />
        <span>
          <strong>Get your first win now:</strong> open Bible, choose a verse, and
          push it to OBS. This is the fastest way to confirm the setup works.
          <button
            className="ob-btn ob-btn--primary"
            onClick={openFirstWin}
            title="Try your first Bible presentation"
            style={{ marginTop: 10 }}
          >
            Try a Bible presentation
            <ArrowRight size={16} />
          </button>
        </span>
      </div>

      <div className="ob-quick-actions">
        <button className="ob-quick-btn" onClick={onFinish} title="Open">
          <LayoutDashboard size={16} />
          Open Dashboard
        </button>
        <button
          className="ob-quick-btn"
          onClick={() => {
            completeOnboarding();
            window.location.href = "/resources?tab=bible";
          }}
          title="Open">
          <Library size={16} />
          Open Bible
        </button>
        <button
          className="ob-quick-btn"
          onClick={() => {
            completeOnboarding();
            window.location.href = "/resources?tab=worship";
          }}
          title="Open">
          <ListMusic size={16} />
          Open Worship
        </button>
        <button
          className="ob-quick-btn"
          onClick={() => openUrl("https://discord.gg/makechurcheasy")}
          title="People">
          <Users size={16} />
          Join Community
        </button>
      </div>
    </div>
  );
}
