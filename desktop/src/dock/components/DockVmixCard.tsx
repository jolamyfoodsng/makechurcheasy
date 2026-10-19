import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../DockIcon";
import { copyTextToClipboard } from "../bibleClipboard";
import { getPresentationSettings } from "../../services/presentationSettings";
import {
  MCE_VMIX_INPUT_NAME,
  VMIX_OVERLAY_CHANNELS,
  VmixClient,
  VmixError,
  describeVmixSetup,
  loadVmixSettings,
  saveVmixSettings,
  type VmixOverlayChannel,
  type VmixSettings,
  type VmixStatus,
} from "../../services/vmixClient";
import "./DockVmixCard.css";

const POLL_MS = 2000;

type Connection =
  | { state: "connecting" }
  | { state: "connected"; status: VmixStatus }
  | { state: "error"; error: VmixError };

function errorHint(error: VmixError, settings: VmixSettings): string {
  switch (error.code) {
    case "timeout":
    case "unreachable":
      return `Can't reach vMix at ${settings.host}:${settings.port}. In vMix open Settings → Web Controller, tick "Enable Web Controller" and check the port. If vMix runs on another PC, enter that PC's IP address.`;
    case "http":
      return `vMix answered with an error (${error.message}). Check the host and port.`;
    case "not_vmix":
      return `Something answered at ${settings.host}:${settings.port} but it doesn't look like vMix. Check the port in vMix → Settings → Web Controller.`;
  }
}

export default function DockVmixCard() {
  const [settings, setSettings] = useState<VmixSettings>(() => loadVmixSettings());
  const [showSettings, setShowSettings] = useState(false);
  const [connection, setConnection] = useState<Connection>({ state: "connecting" });
  const [presentationLink, setPresentationLink] = useState(() => getPresentationSettings().presentationLink);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // null = automatic: the setup steps are open until the Web Browser input
  // exists, then fold away so the card stays a one-line bar.
  const [guideOpen, setGuideOpen] = useState<boolean | null>(null);
  const copiedTimer = useRef<number | null>(null);

  const client = useMemo(() => new VmixClient(settings), [settings]);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await client.getStatus();
        if (!cancelled) setConnection({ state: "connected", status });
      } catch (err) {
        if (cancelled) return;
        const error = err instanceof VmixError ? err : new VmixError("unreachable", String(err));
        setConnection({ state: "error", error });
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [client]);

  useEffect(() => {
    const refresh = () => setPresentationLink(getPresentationSettings().presentationLink);
    refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => {
      window.clearInterval(timer);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    };
  }, []);

  const updateSettings = useCallback((patch: Partial<VmixSettings>) => {
    setSettings((current) => saveVmixSettings({ ...current, ...patch }));
    setConnection({ state: "connecting" });
  }, []);

  const handleCopy = useCallback(async () => {
    const link = getPresentationSettings().presentationLink || presentationLink;
    const ok = await copyTextToClipboard(link);
    setCopied(ok);
    if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    if (ok) {
      copiedTimer.current = window.setTimeout(() => {
        setCopied(false);
        copiedTimer.current = null;
      }, 1800);
    }
  }, [presentationLink]);

  const connected = connection.state === "connected" ? connection.status : null;
  const setup = connected ? describeVmixSetup(connected, settings) : null;

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setActionError(null);
    try {
      await action();
      setConnection({ state: "connected", status: await client.getStatus() });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [client]);

  const toggleOutput = useCallback(() => {
    if (!setup?.mceInput) return;
    const input = setup.mceInput;
    void run(async () => {
      if (setup.onOutput) await client.overlayOut(settings.overlayChannel);
      else await client.overlayIn(settings.overlayChannel, input.number);
    });
  }, [client, run, setup, settings.overlayChannel]);

  const refreshBrowserSource = useCallback(() => {
    if (!setup?.mceInput) return;
    const input = setup.mceInput;
    void run(() => client.navigateBrowser(input.number, presentationLink));
  }, [client, presentationLink, run, setup]);

  const stepsVisible = guideOpen ?? !setup?.mceInput;

  const dotClass =
    connection.state === "connected" ? "ok" : connection.state === "connecting" ? "wait" : "bad";

  return (
    <section className="dock-vmix-card" aria-label="vMix connection" data-testid="dock-vmix-card">
      <div className="dock-vmix-bar">
        <span className="dock-vmix-bar__tag">
          <span className={`dock-vmix-dot dock-vmix-dot--${dotClass}`} aria-hidden="true" />
          <strong>vMix</strong>
          <span className="dock-vmix-bar__status" data-testid="dock-vmix-status">
            {connection.state === "connected" &&
              `Connected · v${connection.status.version}${connection.status.edition ? ` ${connection.status.edition}` : ""}`}
            {connection.state === "connecting" && "Connecting…"}
            {connection.state === "error" && "Not connected"}
          </span>
        </span>

        <div className="dock-vmix-bar__actions">
          {setup?.mceInput && (
            <button
              type="button"
              className={`dock-btn dock-btn--sm ${setup.onOutput ? "dock-btn--danger" : "dock-btn--primary"}`}
              onClick={toggleOutput}
              disabled={busy}
              data-testid="dock-vmix-toggle-output"
            >
              <Icon name={setup.onOutput ? "visibility_off" : "visibility"} size={13} />
              <span>{setup.onOutput ? `Hide (Overlay ${settings.overlayChannel})` : `Show on output (Overlay ${settings.overlayChannel})`}</span>
            </button>
          )}
          <button
            type="button"
            className="dock-vmix-bar__icon-btn"
            onClick={() => setGuideOpen(!stepsVisible)}
            aria-expanded={stepsVisible}
            title="Setup steps"
            aria-label="Setup steps"
            data-testid="dock-vmix-toggle-steps"
          >
            <Icon name={stepsVisible ? "expand_less" : "expand_more"} size={14} />
          </button>
          <button
            type="button"
            className="dock-vmix-bar__icon-btn"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            title="vMix settings"
            aria-label="vMix settings"
          >
            <Icon name="settings" size={14} />
          </button>
        </div>
      </div>

      {connection.state === "error" && (
        <p className="dock-vmix-note dock-vmix-note--error" role="alert">
          {errorHint(connection.error, settings)}
        </p>
      )}
      {actionError && (
        <p className="dock-vmix-note dock-vmix-note--error" role="alert">{actionError}</p>
      )}

      {showSettings && (
        <div className="dock-vmix-settings" data-testid="dock-vmix-settings">
          <label>
            <span>Host</span>
            <input value={settings.host} onChange={(e) => updateSettings({ host: e.target.value })} spellCheck={false} />
          </label>
          <label>
            <span>Port</span>
            <input
              type="number"
              value={settings.port}
              onChange={(e) => updateSettings({ port: Number(e.target.value) || settings.port })}
            />
          </label>
          <label>
            <span>Input name</span>
            <input
              value={settings.inputName}
              onChange={(e) => updateSettings({ inputName: e.target.value })}
              placeholder={MCE_VMIX_INPUT_NAME}
              spellCheck={false}
            />
          </label>
          <label>
            <span>Overlay</span>
            <select
              value={settings.overlayChannel}
              onChange={(e) => updateSettings({ overlayChannel: Number(e.target.value) as VmixOverlayChannel })}
            >
              {VMIX_OVERLAY_CHANNELS.map((n) => (
                <option key={n} value={n}>Overlay {n}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      {stepsVisible && (
      <ol className="dock-vmix-steps" data-testid="dock-vmix-steps">
        <li className={`dock-vmix-step ${connected ? "is-done" : ""}`}>
          <span className="dock-vmix-step__mark">{connected ? <Icon name="check" size={12} /> : "1"}</span>
          <div className="dock-vmix-step__body">
            <div className="dock-vmix-step__title">vMix is reachable</div>
            {!connected && (
              <div className="dock-vmix-step__hint">Start vMix and enable Settings → Web Controller.</div>
            )}
          </div>
        </li>

        <li className={`dock-vmix-step ${setup?.mceInput ? "is-done" : ""}`}>
          <span className="dock-vmix-step__mark">{setup?.mceInput ? <Icon name="check" size={12} /> : "2"}</span>
          <div className="dock-vmix-step__body">
            <div className="dock-vmix-step__title">
              Web Browser input “{settings.inputName || MCE_VMIX_INPUT_NAME}”
            </div>
            {setup?.mceInput ? (
              <div className="dock-vmix-step__hint">
                Found as input {setup.mceInput.number}.
                <button type="button" className="dock-vmix-link" onClick={refreshBrowserSource} disabled={busy}>
                  Reload the link in vMix
                </button>
              </div>
            ) : (
              <div className="dock-vmix-step__hint">
                {setup?.wrongType
                  ? `An input named “${settings.inputName}” exists but isn't a Web Browser input. Remove it and add a Web Browser input.`
                  : "In vMix: Add Input → Web Browser → paste the link below → name it exactly as above. (vMix can't create Browser inputs from outside, so this is a one-time step.)"}
              </div>
            )}
            <div className="dock-vmix-linkrow">
              <code title={presentationLink}>{presentationLink}</code>
              <button
                type="button"
                className="dock-btn dock-btn--primary dock-btn--sm"
                onClick={() => void handleCopy()}
                disabled={!presentationLink}
                data-testid="dock-vmix-copy-link"
              >
                <Icon name={copied ? "check" : "content_copy"} size={13} />
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            </div>
          </div>
        </li>

        <li className={`dock-vmix-step ${setup?.onOutput ? "is-done" : ""}`}>
          <span className="dock-vmix-step__mark">{setup?.onOutput ? <Icon name="check" size={12} /> : "3"}</span>
          <div className="dock-vmix-step__body">
            <div className="dock-vmix-step__title">Shown on the vMix output</div>
            <div className="dock-vmix-step__hint">
              {setup?.onOutput
                ? `Live on Overlay ${settings.overlayChannel}. Content you send from the Dock appears now.`
                : setup?.overlayBusyWith
                  ? `Overlay ${settings.overlayChannel} is in use by “${setup.overlayBusyWith.title}”. Pick another overlay in settings, or it will be replaced.`
                  : `Use “Show on output” to put it on Overlay ${settings.overlayChannel} (transparent, over your camera/program).`}
            </div>
          </div>
        </li>
      </ol>
      )}
    </section>
  );
}
