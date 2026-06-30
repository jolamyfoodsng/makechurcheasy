/**
 * MobileCompanionModal.tsx — QR pairing + connection status for the mobile companion.
 *
 * Generates a pairing token via the Tauri backend, renders a QR code
 * containing ws://ip:port?token=XXXX, and shows connection status.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { X, Smartphone, Wifi, WifiOff, RefreshCw } from "lucide-react";

interface PairingInfo {
  ip: string;
  port: number;
  pairingToken: string;
}

interface MobileServerStatus {
  running: boolean;
  port: number;
  hasToken: boolean;
  obsConnected: boolean;
  currentSong: string | null;
  currentScripture: string | null;
}

/** Simple QR code generator using a pure CSS/HTML approach (no library needed for MVP). */
function QrCodeDisplay({ value, size = 200 }: { value: string; size?: number }) {
  const { t } = useTranslation();
  const [qrSvg, setQrSvg] = useState<string>("");

  useEffect(() => {
    // Use a minimal QR code implementation via the qr-code API
    // For MVP, we encode the pairing info as a simple text display
    // and show the connection details for manual entry as fallback
    generateQrSvg(value, size).then(setQrSvg);
  }, [value, size]);

  return (
    <div className="mc-qr-container" style={{ width: size, height: size }}>
      {qrSvg ? (
        <div dangerouslySetInnerHTML={{ __html: qrSvg }} />
      ) : (
        <div className="mc-qr-loading">{t("dock.mobileCompanion.generatingQr")}</div>
      )}
    </div>
  );
}

/**
 * Minimal QR Code SVG generator.
 * Uses a deterministic encoding for the pairing string.
 * For production, replace with a proper QR library.
 */
async function generateQrSvg(text: string, size: number): Promise<string> {
  // Use the qrserver.com API for reliable QR generation
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&bgcolor=0F172A&color=F8FAFC&format=svg`;
  try {
    const resp = await fetch(url);
    if (resp.ok) return await resp.text();
  } catch {
    // Offline fallback: show text-based placeholder
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="#0F172A"/>
    <text x="${size / 2}" y="${size / 2}" text-anchor="middle" dominant-baseline="middle" fill="#F8FAFC" font-size="12" font-family="monospace">
      ${text.slice(0, 30)}
    </text>
  </svg>`;
}

interface MobileCompanionModalProps {
  onClose: () => void;
}

export default function MobileCompanionModal({ onClose }: MobileCompanionModalProps) {
  const { t } = useTranslation();
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [status, setStatus] = useState<MobileServerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPairingInfo = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const info = await invoke<PairingInfo>("get_mobile_pairing_info");
      setPairing(info);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const s = await invoke<MobileServerStatus>("get_mobile_server_status");
      setStatus(s);
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    void fetchPairingInfo();
    void fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, [fetchPairingInfo, fetchStatus]);

  const wsUrl = pairing ? `ws://${pairing.ip}:${pairing.port}` : "";
  const pairingUrl = pairing ? `${wsUrl}?token=${pairing.pairingToken}` : "";

  return (
    <div className="mc-modal-backdrop" onMouseDown={onClose}>
      <div
        className="mc-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t("dock.mobileCompanion.mobileCompanion")}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="mc-modal-header">
          <div className="mc-modal-header-left">
            <div className="mc-modal-header-icon">
              <Smartphone size={14} />
            </div>
            <h2 className="mc-modal-title">{t("dock.mobileCompanion.mobileCompanion")}</h2>
          </div>
          <button className="mc-modal-close" onClick={onClose} aria-label={t("dock.mobileCompanion.close")} title="Close">
            <X size={16} />
          </button>
        </header>

        {/* Body */}
        <div className="mc-modal-body">
          {loading ? (
            <div className="mc-loading">
              <RefreshCw size={20} className="mc-spin" />
              <span>{t("dock.mobileCompanion.generatingPairingCode")}</span>
            </div>
          ) : error ? (
            <div className="mc-error">
              <p>{error}</p>
              <button className="mc-btn-secondary" onClick={fetchPairingInfo} title="Retry pairing">
                {t("dock.mobileCompanion.retry")}
              </button>
            </div>
          ) : pairing ? (
            <>
              {/* QR Code */}
              <div className="mc-qr-section">
                <p className="mc-qr-instruction">
                  {t("dock.mobileCompanion.scanQrInstruction")}
                </p>
                <QrCodeDisplay value={pairingUrl} size={180} />
                <button className="mc-btn-refresh" onClick={fetchPairingInfo} title={t("dock.mobileCompanion.generateNewCode")}>
                  <RefreshCw size={14} />
                  {t("dock.mobileCompanion.newCode")}
                </button>
              </div>

              {/* Connection Details */}
              <div className="mc-details">
                <div className="mc-detail-row">
                  <span className="mc-detail-label">Server</span>
                  <span className="mc-detail-value mc-mono">{wsUrl}</span>
                </div>
                <div className="mc-detail-row">
                  <span className="mc-detail-label">Token</span>
                  <span className="mc-detail-value mc-mono">{pairing.pairingToken}</span>
                </div>
              </div>

              {/* Status */}
              <div className="mc-status-section">
                <h3 className="mc-status-heading">Connection Status</h3>
                {status ? (
                  <div className="mc-status-grid">
                    <div className="mc-status-item">
                      {status.obsConnected ? <Wifi size={14} className="mc-green" /> : <WifiOff size={14} className="mc-red" />}
                      <span>OBS {status.obsConnected ? "Connected" : "Disconnected"}</span>
                    </div>
                    <div className="mc-status-item">
                      <span className="mc-dot" />
                      <span>Server {status.running ? "Running" : "Stopped"}</span>
                    </div>
                    {status.currentSong && (
                      <div className="mc-status-item">
                        <span className="mc-label">Song:</span>
                        <span>{status.currentSong}</span>
                      </div>
                    )}
                    {status.currentScripture && (
                      <div className="mc-status-item">
                        <span className="mc-label">Scripture:</span>
                        <span>{status.currentScripture}</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mc-muted">Checking status…</p>
                )}
              </div>

              {/* Instructions */}
              <div className="mc-instructions">
                <h3 className="mc-instructions-title">How to pair</h3>
                <ol>
                  <li>Install the MakeChurchEasy mobile app</li>
                  <li>Open the app and tap <strong>Scan QR Code</strong></li>
                  <li>Point your camera at the QR code above</li>
                  <li>Done — your phone is now connected</li>
                </ol>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
