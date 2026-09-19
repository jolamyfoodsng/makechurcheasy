import { useCallback, useEffect, useState } from "react";
import { Play, RefreshCw, Zap } from "lucide-react";
import {
  getAutomationRules,
  getMacros,
  setAutomationRuleEnabled,
  type StoredAutomationRule,
  type StoredMacro,
} from "../../services/automationStore";
import { automationRunner } from "../../services/automationRunner";

function describeStep(step: StoredMacro["steps"][number]): string {
  switch (step.type) {
    case "switch_scene": return `Switch to ${step.scene_name || "scene"}`;
    case "set_preview_scene": return `Preview ${step.scene_name || "scene"}`;
    case "start_stream": return "Start stream";
    case "stop_stream": return "Stop stream";
    case "start_recording": return "Start recording";
    case "stop_recording": return "Stop recording";
    case "toggle_mic": return "Toggle mic";
    case "mute_mic": return "Mute mic";
    case "unmute_mic": return "Unmute mic";
    case "enable_studio_mode": return "Studio Mode on";
    case "disable_studio_mode": return "Studio Mode off";
    case "delay": return `Wait ${step.delay_ms ?? 1000}ms`;
    case "run_macro": return "Run another macro";
  }
}

function describeTrigger(rule: StoredAutomationRule): string {
  const scene = rule.trigger.scene_name;
  switch (rule.trigger.type) {
    case "scene_changed": return scene ? `Scene changes to ${scene}` : "Any scene changes";
    case "stream_started": return "Streaming starts";
    case "stream_stopped": return "Streaming stops";
    case "recording_started": return "Recording starts";
    case "recording_stopped": return "Recording stops";
    case "time_reached": return `At ${rule.trigger.time || "the scheduled time"}`;
    case "manual": return "Manual only";
  }
}

export function AutomationSettingsPanel() {
  const [macros, setMacros] = useState<StoredMacro[]>([]);
  const [rules, setRules] = useState<StoredAutomationRule[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setMacros(getMacros());
    setRules(getAutomationRules());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runMacro = async (macro: StoredMacro) => {
    setStatus(`Running ${macro.name}…`);
    try {
      await automationRunner.runMacro(macro.id);
      setStatus(`${macro.name} completed.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="settings-section">
      <div className="section-header">
        <h3 className="section-title">Automation library</h3>
        <p className="section-desc">
          Macros and rules are stored on this desktop and continue to work when the phone is disconnected.
        </p>
      </div>

      <div className="settings-card">
        <div className="switch-row">
          <div className="switch-left">
            <span className="switch-title">Desktop automation runner</span>
            <span className="switch-subtitle">Enabled rules watch OBS while MakeChurchEasy is running.</span>
          </div>
          <span className="mr-status-badge mr-status-on">Ready</span>
        </div>
        {status && <p className="form-hint" style={{ margin: "12px 0 0" }}>{status}</p>}
        <div className="mr-status-actions" style={{ marginTop: 16 }}>
          <button className="action-btn secondary" onClick={refresh} type="button">
            <RefreshCw size={14} /> Refresh library
          </button>
        </div>
      </div>

      <div className="section-header" style={{ marginTop: 24 }}>
        <h3 className="section-title">Macros ({macros.length})</h3>
      </div>
      <div className="settings-card">
        {macros.length === 0 ? (
          <p className="mr-empty-state">Create the first macro from the mobile app.</p>
        ) : macros.map((macro) => (
          <div className="mr-device-item" key={macro.id}>
            <div className="mr-device-info">
              <Play size={16} className="mr-device-icon" />
              <span className="mr-device-name">{macro.name}</span>
              <span className="mr-device-last">{macro.steps.map(describeStep).join(" → ")}</span>
            </div>
            <div className="mr-device-actions">
              <button className="action-btn small primary" onClick={() => void runMacro(macro)} type="button">
                <Play size={13} /> Run
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="section-header" style={{ marginTop: 24 }}>
        <h3 className="section-title">Automations ({rules.length})</h3>
      </div>
      <div className="settings-card">
        {rules.length === 0 ? (
          <p className="mr-empty-state">Create an automation from the mobile app, then manage it here.</p>
        ) : rules.map((rule) => (
          <div className="mr-device-item" key={rule.id}>
            <div className="mr-device-info">
              <Zap size={16} className="mr-device-icon" />
              <span className="mr-device-name">{rule.name}</span>
              <span className="mr-device-last">{describeTrigger(rule)}</span>
            </div>
            <div className="mr-device-actions">
              <label className="switch-toggle-label" title={rule.enabled ? "Disable automation" : "Enable automation"}>
                <input
                  type="checkbox"
                  checked={rule.enabled}
                  onChange={(event) => {
                    setAutomationRuleEnabled(rule.id, event.target.checked);
                    refresh();
                  }}
                />
                <span className="switch-slider"></span>
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
