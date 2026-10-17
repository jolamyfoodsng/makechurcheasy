/**
 * NdiOutSection.tsx — "Connect with NDI" in the Studio settings: send the Alternate output
 * (see-through, e.g. a Lower Third) or Program to vMix, OBS (DistroAV) and other NDI® receivers.
 */
import { useEffect, useState } from "react";
import { Lock, Radio, Square } from "../../components/icons/NativeIcons";
import { isMacPlatform } from "../shortcuts";
import { useAuth } from "../../contexts/AuthContext";
import { getEffectivePlan } from "../../services/licenseService";
import { isProUnlocked } from "../../services/proLicense";
import { openDashboardSubscriptionPlans } from "../../services/subscriptionNavigation";
import {
  getNdiOutStatus,
  onNdiOutChange,
  readSavedNdiFeed,
  refreshNdiOut,
  startNdiOut,
  stopNdiOut,
  type NdiOutFeed,
} from "../studioNdiOut";

export default function NdiOutSection() {
  const { user } = useAuth();
  const canUseAlternateOutput = getEffectivePlan(user) !== "free" || isProUnlocked();
  const [status, setStatus] = useState(getNdiOutStatus);
  const [feed, setFeed] = useState<NdiOutFeed>(() => canUseAlternateOutput && getNdiOutStatus().feed !== "program" ? readSavedNdiFeed() : "program");
  const [busy, setBusy] = useState(false);
  const mac = isMacPlatform();

  useEffect(() => {
    const off = onNdiOutChange(setStatus);
    void refreshNdiOut();
    return off;
  }, []);

  useEffect(() => {
    if (!canUseAlternateOutput && feed === "alt") setFeed("program");
    if (!canUseAlternateOutput && status.running && status.feed === "alt") void stopNdiOut();
  }, [canUseAlternateOutput, feed, status.running, status.feed]);

  const connect = async (next: NdiOutFeed) => {
    if (next === "alt" && !canUseAlternateOutput) {
      void openDashboardSubscriptionPlans();
      return;
    }
    setBusy(true);
    try { await startNdiOut(next); } finally { setBusy(false); }
  };
  const disconnect = async () => {
    setBusy(true);
    try { await stopNdiOut(); } finally { setBusy(false); }
  };
  const pickFeed = (next: NdiOutFeed) => {
    if (next === "alt" && !canUseAlternateOutput) {
      void openDashboardSubscriptionPlans();
      return;
    }
    setFeed(next);
    // Already sending: switch over straight away.
    if (status.running) void connect(next);
  };

  const watching = status.connections === 1 ? "1 receiver is watching" : `${status.connections} receivers are watching`;

  return (
    <section className="st-set">
      <h3><Radio size={14} /> Connect with NDI®</h3>
      <select value={feed} onChange={(e) => pickFeed(e.target.value as NdiOutFeed)} aria-label="What to send over NDI" disabled={!mac || busy}>
        <option value="alt" disabled={!canUseAlternateOutput}>Alternate output · see-through, to lay over a camera</option>
        <option value="program">Program · exactly what the screen shows</option>
      </select>
      {!canUseAlternateOutput && (
        <p className="st-set__hint">Alternate output over NDI is a Pro feature. <button type="button" className="st-linkbtn" onClick={() => void openDashboardSubscriptionPlans()}><Lock size={12} /> Unlock Pro</button></p>
      )}
      <div className="st-set__buttons">
        <button type="button" className="studio-btn studio-btn--primary" disabled={!mac || busy} onClick={() => void connect(feed)}>
          <Radio size={14} /> {status.running ? "Reconnect" : "Connect with NDI"}
        </button>
        {status.running && (
          <button type="button" className="studio-btn" disabled={busy} onClick={() => void disconnect()}><Square size={14} /> Stop NDI</button>
        )}
      </div>
      {!mac ? (
        <p className="st-set__hint">Sending over NDI works on Mac for now. Windows support is coming.</p>
      ) : status.error ? (
        <p className="st-set__hint" role="alert">{status.error}</p>
      ) : status.running ? (
        <p className="st-set__hint">
          Sending as <strong>{status.sourceName || "MakeChurchEazy"}</strong>. {status.connections > 0 ? `${watching}.` : "No receiver is watching yet."}
        </p>
      ) : (
        <p className="st-set__hint">Not sending. Install the free NDI Tools from ndi.video on this computer first.</p>
      )}
      <p className="st-set__hint">
        On the switcher (same network): in vMix, Add Input → NDI. In OBS, install the free DistroAV plugin, then add an NDI Source.
        Pick the “MakeChurchEazy” source and put it above your camera. The Alternate output uses the look chosen for the Alternate output.
      </p>
    </section>
  );
}
