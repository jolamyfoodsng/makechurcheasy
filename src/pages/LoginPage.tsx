import { AppLogo } from "@/components/AppLogo";
import { useAuth } from "@/contexts/AuthContext";
import {
  createPairingCode,
  watchPairingStatus
} from "@/services/authService";
import { DEFAULT_DESKTOP_CONFIG, readDesktopConfigCache } from "@/services/desktopConfig";
import { trackDevicePaired, trackLogin } from "@/services/tracking";
import QRCode from "qrcode";
import { useEffect, useRef, useState } from "react";

const AUTH_API = import.meta.env.VITE_AUTH_API_URL || "https://api.makechurcheasy.creatorstudioslabs.stream";
console.log('AUTH_API :', AUTH_API);


function detectOS(): string {
  const ua = navigator.userAgent;
  if (/mac os/i.test(ua)) return "macOS";
  if (/windows/i.test(ua)) return "Windows";
  if (/linux/i.test(ua)) return "Linux";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  return "Unknown OS";
}

type View = "initial" | "pairing" | "manual" | "qr";

export default function LoginPage() {
  const { setUser } = useAuth();
  const [view, setView] = useState<View>("initial");
  const [code, setCode] = useState("");
  const [manualCode, setManualCode] = useState("");
  const [countdown, setCountdown] = useState(300);
  const [error, setError] = useState("");
  const [welcomeBack, setWelcomeBack] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  // Email verification modal state
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState("");
  const [verificationName, setVerificationName] = useState("");
  const [verificationMessage, setVerificationMessage] = useState("");
  const [resendStatus, setResendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [checkStatus, setCheckStatus] = useState<"idle" | "checking" | "verified" | "not_verified" | "error">("idle");

  const cleanupRef = useRef<(() => void) | null>(null);

  const PAIRING_BASE = AUTH_API.startsWith("http://localhost")
    ? "http://localhost:4000"
    : "https://makechurcheasy.creatorstudioslabs.stream";

  const DASHBOARD_URL = AUTH_API.startsWith("http://localhost")
    ? "http://localhost:3000"
    : "https://makechurcheasy.creatorstudioslabs.stream";

  async function generateQrDataUrl(pairCode: string): Promise<string> {
    const pairUrl = `${DASHBOARD_URL}/pair/mobile?code=${pairCode}`;
    return QRCode.toDataURL(pairUrl, {
      width: 240,
      margin: 2,
      color: { dark: "#FFFFFF", light: "#00000000" },
    });
  }

  async function startQrLogin() {
    setError("");
    const result = await createPairingCode("MakeChurchEasy");
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setCode(result.code);
    const dataUrl = await generateQrDataUrl(result.code);
    setQrDataUrl(dataUrl);
    setCountdown(300);
    setView("qr");
    startWatching(result.code);
  }

  async function openPairingInBrowser(targetCode: string) {
    const os = detectOS();
    const params = new URLSearchParams();
    if (targetCode) params.set("code", targetCode);
    params.set("os", os);
    const url = `${PAIRING_BASE}/device?${params.toString()}`;
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank");
    }
  }

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if ((view !== "pairing" && view !== "qr") || countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [view, countdown]);

  function startWatching(pairingCode: string) {
    cleanupRef.current?.();

    cleanupRef.current = watchPairingStatus(pairingCode, {
      onAuthorized(user) {
        cleanupRef.current = null;
        trackLogin("pairing");
        trackDevicePaired();
        const hasVisited = localStorage.getItem("mce_has_visited");
        if (hasVisited) {
          setWelcomeBack(true);
          setTimeout(() => setWelcomeBack(false), 3000);
        }
        localStorage.setItem("mce_has_visited", "1");
        setUser(user);
      },
      onExpired() {
        cleanupRef.current = null;
        setError("Code expired. Please generate a new one.");
        setView("initial");
      },
      onError(msg) {
        cleanupRef.current = null;
        setError(msg);
        setView("initial");
      },
      onVerificationRequired(email, name, message) {
        cleanupRef.current = null;
        setVerificationEmail(email);
        setVerificationName(name);
        setVerificationMessage(message);
        setResendStatus("idle");
        setCheckStatus("idle");
        setShowVerificationModal(true);
      },
    });
  }



  async function handleManualSubmit() {
    if (!manualCode || manualCode.length < 8) {
      setError("Please enter a valid pairing code");
      return;
    }

    setError("");
    setCode(manualCode.toUpperCase());
    setView("pairing");
    startWatching(manualCode.toUpperCase());
  }

  function formatCountdown(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0f",
        padding: "24px",
      }}
    >
      {/* Maintenance Mode Overlay */}
      {(readDesktopConfigCache() || DEFAULT_DESKTOP_CONFIG).security.maintenanceMode && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0,0,0,0.9)",
          zIndex: 9999,
        }}>
          <div style={{
            textAlign: "center",
            padding: "48px",
            maxWidth: "400px",
          }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>🔧</div>
            <h1 style={{ fontSize: "24px", fontWeight: 600, color: "#f0f0f5", marginBottom: "12px" }}>
              Maintenance Mode
            </h1>
            <p style={{ fontSize: "16px", color: "#a0a0b0", lineHeight: 1.6 }}>
              We'll be back shortly!
            </p>
          </div>
        </div>
      )}

      <div style={{ width: "100%", maxWidth: "360px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <AppLogo
            alt="MakeChurchEasy"
            mode="dark"
            style={{ height: "130px", width: "130px" }}
          />
          <h1
            style={{
              fontSize: "20px",
              fontWeight: 600,
              color: "#f0f0f5",
              marginBottom: "6px",
            }}
          >
            MakeChurchEasy
          </h1>
          <p style={{ fontSize: "13px", color: "#9898a8" }}>
            Church Presentation Software for OBS
          </p>
        </div>

        {/* Initial View */}
        {view === "initial" && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  background: "rgba(239, 68, 68, 0.1)",
                  fontSize: "12px",
                  color: "#ef4444",
                }}
              >
                {error}
              </div>
            )}

            <button
              onClick={async () => {
                setError("");
                const result = await createPairingCode("MakeChurchEasy");
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                setCode(result.code);
                setCountdown(300);
                setView("pairing");

                const os = detectOS();
                const googlePairUrl = `${PAIRING_BASE}/pair/google?code=${result.code}&os=${encodeURIComponent(os)}`;
                startWatching(result.code);
                try {
                  const { openUrl } = await import("@tauri-apps/plugin-opener");
                  await openUrl(googlePairUrl);
                } catch {
                  window.open(googlePairUrl, "_blank");
                }
              }}
              style={{
                width: "100%",
                height: "42px",
                borderRadius: "4px",
                border: "none",
                background: "#fff",
                fontSize: "13px",
                fontWeight: 600,
                color: "#1f1f1f",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Login with Google
            </button>

            <button
              onClick={startQrLogin}
              style={{
                width: "100%",
                height: "42px",
                borderRadius: "4px",
                border: "1px solid #2a2a3a",
                background: "#16161f",
                fontSize: "13px",
                fontWeight: 500,
                color: "#f0f0f5",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="3" height="3" />
                <line x1="21" y1="14" x2="21" y2="14.01" />
                <line x1="14" y1="21" x2="14" y2="21.01" />
                <line x1="21" y1="17" x2="21" y2="21" />
                <line x1="17" y1="21" x2="21" y2="21" />
              </svg>
              Scan QR Code
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                margin: "4px 0",
              }}
            >
              <div style={{ flex: 1, height: "1px", background: "#2a2a3a" }} />
              <span style={{ fontSize: "11px", color: "#6a6a7a" }}>or</span>
              <div style={{ flex: 1, height: "1px", background: "#2a2a3a" }} />
            </div>

            <button
              onClick={async () => {
                setError("");
                const result = await createPairingCode("MakeChurchEasy");
                if ("error" in result) {
                  setError(result.error);
                  return;
                }
                setCode(result.code);
                setCountdown(300);
                setView("pairing");
                startWatching(result.code);
                await openPairingInBrowser(result.code);
              }}
              style={{
                width: "100%",
                height: "42px",
                borderRadius: "4px",
                border: "1px solid #2a2a3a",
                background: "#16161f",
                fontSize: "13px",
                fontWeight: 500,
                color: "#f0f0f5",
                cursor: "pointer",
              }}
            >
              Continue in Browser
            </button>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                margin: "4px 0",
              }}
            >
              <div style={{ flex: 1, height: "1px", background: "#2a2a3a" }} />
              <span style={{ fontSize: "11px", color: "#6a6a7a" }}>or</span>
              <div style={{ flex: 1, height: "1px", background: "#2a2a3a" }} />
            </div>

            <button
              onClick={() => {
                setView("manual");
                setError("");
              }}
              style={{
                width: "100%",
                height: "42px",
                borderRadius: "4px",
                border: "1px solid #2a2a3a",
                background: "#16161f",
                fontSize: "13px",
                fontWeight: 500,
                color: "#f0f0f5",
                cursor: "pointer",
              }}
            >
              Enter Pairing Code
            </button>

            <p
              style={{
                fontSize: "11px",
                color: "#6a6a7a",
                marginTop: "12px",
                lineHeight: 1.5,
              }}
            >
              Get a pairing code from{" "}
              <span style={{ color: "#9898a8" }}>makechurcheasy.creatorstudioslabs.stream/devices</span>
            </p>

          </div>
        )}

        {/* Pairing View — waiting for authorization */}
        {view === "pairing" && (
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                marginBottom: "20px",
                fontFamily: "monospace",
                fontSize: "32px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "#1D4ED8",
              }}
            >
              {code}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: countdown > 0 ? "#22c55e" : "#ef4444",
                  animation: countdown > 0 ? "pulse 2s infinite" : "none",
                }}
              />
              <span style={{ fontSize: "13px", color: "#9898a8" }}>
                {countdown > 0
                  ? `Waiting for authorization... ${formatCountdown(countdown)}`
                  : "Code expired"}
              </span>
            </div>

            <p style={{ fontSize: "12px", color: "#6a6a7a", marginBottom: "12px" }}>
              Check your browser to authorize this device.
            </p>
            <div
              style={{
                marginBottom: "24px",
              }}
            >
              <div style={{ display: "flex", gap: "6px" }}>
                <button
                  onClick={() => openPairingInBrowser(code)}
                  style={{
                    flex: 1,
                    height: "32px",
                    borderRadius: "4px",
                    border: "1px solid #1D4ED8",
                    background: "#1D4ED8",
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  Open in Browser
                </button>
                <button
                  onClick={() => {
                    const url = `https://makechurcheasy.creatorstudioslabs.stream/device?code=${code}`;
                    navigator.clipboard.writeText(url).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    });
                  }}
                  style={{
                    flex: 1,
                    height: "32px",
                    borderRadius: "4px",
                    border: "1px solid #2a2a3a",
                    background: copied ? "#22c55e" : "#16161f",
                    fontSize: "12px",
                    fontWeight: 500,
                    color: copied ? "#fff" : "#9898a8",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {copied ? "✓ Copied" : "Copy Link"}
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                cleanupRef.current?.();
                cleanupRef.current = null;
                setView("initial");
                setCode("");
                setError("");
              }}
              style={{
                width: "100%",
                height: "38px",
                borderRadius: "4px",
                border: "1px solid #2a2a3a",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 500,
                color: "#9898a8",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
              }
            `}</style>
          </div>
        )}

        {/* Manual Code Entry */}
        {view === "manual" && (
          <div>
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  background: "rgba(239, 68, 68, 0.1)",
                  fontSize: "12px",
                  color: "#ef4444",
                  marginBottom: "12px",
                }}
              >
                {error}
              </div>
            )}

            <label
              style={{
                display: "block",
                fontSize: "12px",
                fontWeight: 500,
                color: "#9898a8",
                marginBottom: "6px",
              }}
            >
              Enter pairing code from your browser
            </label>
            <p
              style={{
                fontSize: "11px",
                color: "#6a6a7a",
                marginBottom: "10px",
                lineHeight: "1.5",
              }}
            >
              Go to{" "}
              <span style={{ color: "#9898a8" }}>
                MakeChurchEasy
              </span>{" "}
              in your browser, sign in, then copy the code shown on the Devices page.
            </p>
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value.toUpperCase())}
              placeholder="ABCD-1234"
              maxLength={9}
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
              style={{
                width: "100%",
                height: "42px",
                borderRadius: "4px",
                border: "1px solid #2a2a3a",
                background: "#12121a",
                padding: "0 14px",
                fontSize: "18px",
                fontFamily: "monospace",
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "#f0f0f5",
                outline: "none",
                textAlign: "center",
                marginBottom: "12px",
              }}
            />

            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={() => {
                  setView("initial");
                  setManualCode("");
                  setError("");
                }}
                style={{
                  flex: 1,
                  height: "38px",
                  borderRadius: "4px",
                  border: "1px solid #2a2a3a",
                  background: "transparent",
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "#9898a8",
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <button
                onClick={handleManualSubmit}
                disabled={!manualCode || manualCode.length < 8}
                style={{
                  flex: 2,
                  height: "38px",
                  borderRadius: "4px",
                  border: "none",
                  background: "#1D4ED8",
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#fff",
                  cursor: "pointer",
                  opacity: !manualCode || manualCode.length < 8 ? 0.5 : 1,
                }}
              >
                Authorize
              </button>
            </div>

            {manualCode && manualCode.length >= 8 && (
              <button
                onClick={() => openPairingInBrowser(manualCode.toUpperCase())}
                style={{
                  width: "100%",
                  height: "36px",
                  borderRadius: "4px",
                  border: "none",
                  background: "transparent",
                  fontSize: "12px",
                  fontWeight: 400,
                  color: "#6a6a7a",
                  cursor: "pointer",
                  marginTop: "8px",
                  transition: "color 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#9898a8")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#6a6a7a")}
              >
                Open pairing page in browser ↗
              </button>
            )}
          </div>
        )}

        {/* QR Code View */}
        {view === "qr" && (
          <div style={{ textAlign: "center" }}>
            {error && (
              <div
                style={{
                  padding: "8px 12px",
                  borderRadius: "4px",
                  background: "rgba(239, 68, 68, 0.1)",
                  fontSize: "12px",
                  color: "#ef4444",
                  marginBottom: "12px",
                }}
              >
                {error}
              </div>
            )}

            <p style={{ fontSize: "13px", color: "#9898a8", marginBottom: "16px" }}>
              Scan this QR code with your phone to log in
            </p>

            {qrDataUrl && (
              <div
                style={{
                  display: "inline-block",
                  padding: "16px",
                  borderRadius: "12px",
                  background: "#000",
                  marginBottom: "16px",
                }}
              >
                <img
                  src={qrDataUrl}
                  alt="QR Code"
                  style={{ width: "240px", height: "240px", display: "block" }}
                />
              </div>
            )}

            {!qrDataUrl && (
              <div
                style={{
                  display: "inline-flex",
                  width: "240px",
                  height: "240px",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "12px",
                  background: "#16161f",
                  border: "1px solid #2a2a3a",
                  marginBottom: "16px",
                }}
              >
                <span style={{ color: "#6a6a7a", fontSize: "13px" }}>Generating...</span>
              </div>
            )}

            <div
              style={{
                fontFamily: "monospace",
                fontSize: "20px",
                fontWeight: 700,
                letterSpacing: "0.15em",
                color: "#f0f0f5",
                marginBottom: "8px",
              }}
            >
              {code}
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                marginBottom: "20px",
              }}
            >
              <div
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  background: countdown > 0 ? "#22c55e" : "#ef4444",
                  animation: countdown > 0 ? "pulse 2s infinite" : "none",
                }}
              />
              <span style={{ fontSize: "13px", color: "#9898a8" }}>
                {countdown > 0
                  ? `Expires in ${formatCountdown(countdown)}`
                  : "Code expired"}
              </span>
            </div>

            <button
              onClick={() => {
                cleanupRef.current?.();
                cleanupRef.current = null;
                setView("initial");
                setCode("");
                setQrDataUrl("");
                setError("");
              }}
              style={{
                width: "100%",
                height: "38px",
                borderRadius: "4px",
                border: "1px solid #2a2a3a",
                background: "transparent",
                fontSize: "13px",
                fontWeight: 500,
                color: "#9898a8",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>

            <style>{`
              @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
              }
            `}</style>
          </div>
        )}
      </div>

      {/* Email Verification Modal */}
      {showVerificationModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.8)",
            zIndex: 9999,
            padding: "24px",
          }}
          onClick={(e) => {
            // Only close on backdrop click if not actively processing
            if (e.target === e.currentTarget && resendStatus !== "sending" && checkStatus !== "checking") {
              setShowVerificationModal(false);
              setView("initial");
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "380px",
              background: "#16161f",
              borderRadius: "8px",
              border: "1px solid #2a2a3a",
              padding: "28px",
              boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            }}
          >
            {/* Icon */}
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <div
                style={{
                  width: "48px",
                  height: "48px",
                  borderRadius: "50%",
                  background: "rgba(239, 68, 68, 0.1)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: "12px",
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <polyline points="3 7 12 13 21 7" />
                </svg>
              </div>
              <h2 style={{ fontSize: "16px", fontWeight: 600, color: "#f0f0f5", margin: "0 0 6px" }}>
                Email Verification Required
              </h2>
              <p style={{ fontSize: "13px", color: "#9898a8", margin: 0, lineHeight: 1.5 }}>
                {verificationMessage}
              </p>
              {verificationEmail && (
                <p style={{ fontSize: "12px", color: "#6a6a7a", margin: "8px 0 0", wordBreak: "break-all" }}>
                  {verificationName ? `${verificationName} — ` : ""}{verificationEmail}
                </p>
              )}
            </div>

            {/* Close / cancel */}
            <button
              onClick={() => {
                setShowVerificationModal(false);
                setView("initial");
                setCode("");
                setError("");
              }}
              style={{
                width: "100%",
                height: "36px",
                borderRadius: "4px",
                border: "none",
                background: "transparent",
                fontSize: "12px",
                fontWeight: 500,
                color: "#6a6a7a",
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Welcome back toast */}
      {welcomeBack && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            zIndex: 100,
            animation: "slideIn 0.3s ease-out",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "#16161f",
              border: "1px solid #2a2a3a",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}
          >
            <div
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "#1D4ED8",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "14px",
                fontWeight: 700,
                color: "#fff",
              }}
            >
              ✓
            </div>
            <div>
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#f0f0f5", margin: 0 }}>
                Welcome back
              </p>
              <p style={{ fontSize: "11px", color: "#9898a8", margin: 0 }}>
                Good to see you again.
              </p>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
