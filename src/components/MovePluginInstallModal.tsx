import { useCallback, useEffect, useState } from "react";
import { CheckCircle, Download, ExternalLink, Loader2, Puzzle, RefreshCw, X } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  getObsMovePluginStatus,
  isMceBridgeLoaded,
  ensureMoveTransition,
  installObsMovePlugin,
  isMovePluginLoaded,
  MOVE_TRANSITION_RELEASE_URL,
  type ObsMovePluginStatus,
} from "../services/obsMovePlugin";
import "./MovePluginInstallModal.css";

interface Props {
  onClose: () => void;
}

type ModalState = "checking" | "ready" | "not-installed" | "installed" | "installing" | "error";

export default function MovePluginInstallModal({ onClose }: Props) {
  const [plugin, setPlugin] = useState<ObsMovePluginStatus | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [bridgeLoaded, setBridgeLoaded] = useState(false);
  const [state, setState] = useState<ModalState>("checking");

  const check = useCallback(async () => {
    setState("checking");
    try {
      const status = await getObsMovePluginStatus();
      const [runtimeLoaded, runtimeBridgeLoaded] = await Promise.all([
        isMovePluginLoaded(),
        isMceBridgeLoaded(),
      ]);
      setPlugin(status);
      setLoaded(runtimeLoaded);
      setBridgeLoaded(runtimeBridgeLoaded);
      if (runtimeLoaded && runtimeBridgeLoaded) {
        void ensureMoveTransition();
      }
      const installed = status.installed && status.bridgeInstalled;
      const available = status.bundled && status.bridgeBundled;
      setState(installed ? (runtimeLoaded && runtimeBridgeLoaded ? "ready" : "installed") : available ? "not-installed" : "error");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const install = async () => {
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
    } catch {
      setState("error");
    }
  };

  const canInstallInApp = Boolean(plugin?.bundled && plugin.bridgeBundled);
  const openMoveTransitionRelease = () => {
    void openUrl(MOVE_TRANSITION_RELEASE_URL);
  };

  return (
    <div className="move-plugin-modal__backdrop" role="presentation" onClick={onClose}>
      <section
        className="move-plugin-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-plugin-modal-title"
        onClick={(event) => event.stopPropagation()}>
        <button className="move-plugin-modal__close" onClick={onClose} title="Close" aria-label="Close">
          <X size={18} />
        </button>

        <div className="move-plugin-modal__icon">
          <Puzzle size={24} />
        </div>
        <h2 id="move-plugin-modal-title">Install OBS motion support</h2>
        <p>
          Add optional smooth scene movement to OBS. MakeChurchEasy downloads
          Move Transition and its small bridge, then places both in your user
          OBS folder. You can leave this disabled and use the built-in layout
          fallback.
        </p>

        <div className="move-plugin-modal__status">
          <div>
            <strong>OBS motion support</strong>
            <span>
              {plugin?.platform || "Desktop"} · Move {plugin?.version || "3.2.1"} · Bridge {plugin?.bridgeVersion || "1.0.0"}
            </span>
          </div>
          <span className={`move-plugin-modal__badge move-plugin-modal__badge--${loaded && bridgeLoaded ? "ready" : plugin?.installed && plugin.bridgeInstalled ? "pending" : "idle"}`}>
            {state === "checking" || state === "installing"
              ? "Checking"
              : loaded && bridgeLoaded
                ? "Ready"
                : plugin?.installed && plugin.bridgeInstalled
                  ? "Restart OBS"
                  : "Not installed"}
          </span>
        </div>

        {plugin?.installed && plugin.bridgeInstalled && (!loaded || !bridgeLoaded) && (
          <div className="move-plugin-modal__notice">
            <RefreshCw size={15} />
            <span>Restart OBS, then return here and choose Check again.</span>
          </div>
        )}
        <div className="move-plugin-modal__actions">
          <button className="move-plugin-modal__secondary" onClick={onClose} title="Not now">
            Not now
          </button>
          {plugin?.installed && plugin.bridgeInstalled ? (
            <button
              className="move-plugin-modal__primary"
              onClick={() => void check()}
              disabled={state === "checking" || state === "installing"}
              title="Check plugin status">
              <RefreshCw size={15} />
              Check again
            </button>
          ) : (
            <button
              className="move-plugin-modal__primary"
              onClick={() => {
                if (canInstallInApp) void install();
                else openMoveTransitionRelease();
              }}
              disabled={state === "checking" || state === "installing"}
              title={canInstallInApp ? "Install OBS motion support" : "Open Move Transition download"}>
              {state === "installing" ? (
                <Loader2 size={15} className="move-plugin-modal__spin" />
              ) : canInstallInApp ? (
                <Download size={15} />
              ) : (
                <ExternalLink size={15} />
              )}
              {canInstallInApp ? "Install motion support" : "Open Move Transition"}
            </button>
          )}
        </div>

        {loaded && bridgeLoaded && (
          <div className="move-plugin-modal__ready">
            <CheckCircle size={15} /> Move Transition and the MCE OBS Bridge are active in OBS.
          </div>
        )}
      </section>
    </div>
  );
}
