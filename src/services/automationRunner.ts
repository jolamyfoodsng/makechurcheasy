import { obsService } from "./obsService";
import {
  appendAutomationLog,
  getAutomationRules,
  getMacros,
  markAutomationRuleExecuted,
  type AutomationStep,
  type StoredAutomationRule,
} from "./automationStore";

type RuntimeSnapshot = {
  scene: string;
  streaming: boolean;
  recording: boolean;
};

const sleep = (milliseconds: number) => new Promise<void>((resolve) => {
  window.setTimeout(resolve, Math.max(0, milliseconds));
});

class AutomationRunner {
  private timer: number | null = null;
  private tickInProgress = false;
  private previous: RuntimeSnapshot | null = null;
  private activeMacros = new Set<string>();
  private activeRules = new Set<string>();

  start(): void {
    if (this.timer !== null) return;
    this.timer = window.setInterval(() => void this.tick(), 2_000);
    void this.tick();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.previous = null;
  }

  async runMacro(macroId: string): Promise<void> {
    await this.runMacroInternal(macroId, []);
  }

  private async runMacroInternal(macroId: string, stack: string[]): Promise<void> {
    if (stack.includes(macroId) || this.activeMacros.has(macroId)) {
      throw new Error("This macro contains a circular macro reference.");
    }
    const macro = getMacros().find((candidate) => candidate.id === macroId);
    if (!macro) throw new Error("The selected macro is no longer available.");

    this.activeMacros.add(macroId);
    try {
      for (const step of macro.steps) {
        await this.runStep(step, [...stack, macroId]);
      }
      appendAutomationLog({ level: "info", message: `Ran macro: ${macro.name}`, macroId });
    } catch (error) {
      appendAutomationLog({
        level: "error",
        message: `Macro failed: ${macro.name} — ${error instanceof Error ? error.message : String(error)}`,
        macroId,
      });
      throw error;
    } finally {
      this.activeMacros.delete(macroId);
    }
  }

  private async runStep(step: AutomationStep, stack: string[]): Promise<void> {
    switch (step.type) {
      case "switch_scene":
        if (!step.scene_name?.trim()) throw new Error("Choose a scene for this step.");
        await obsService.setCurrentProgramScene(step.scene_name);
        return;
      case "set_preview_scene":
        if (!step.scene_name?.trim()) throw new Error("Choose a preview scene for this step.");
        await obsService.setCurrentPreviewScene(step.scene_name);
        return;
      case "start_stream":
        await obsService.call("StartStream");
        return;
      case "stop_stream":
        await obsService.call("StopStream");
        return;
      case "start_recording":
        await obsService.call("StartRecord");
        return;
      case "stop_recording":
        await obsService.call("StopRecord");
        return;
      case "enable_studio_mode":
        await obsService.setStudioModeEnabled(true);
        return;
      case "disable_studio_mode":
        await obsService.setStudioModeEnabled(false);
        return;
      case "delay":
        await sleep(Math.min(Math.max(step.delay_ms ?? 0, 0), 60_000));
        return;
      case "run_macro":
        if (!step.macro_id) throw new Error("Choose a macro for this step.");
        await this.runMacroInternal(step.macro_id, stack);
        return;
      case "toggle_mic":
      case "mute_mic":
      case "unmute_mic": {
        const inputs = await obsService.getInputList();
        const mic = inputs.find((input) => /mic|microphone/i.test(input.inputName));
        if (!mic) throw new Error("No OBS microphone input was found.");
        const current = await obsService.call("GetInputMute", { inputName: mic.inputName });
        const muted = Boolean(current.inputMuted);
        const next = step.type === "toggle_mic" ? !muted : step.type === "mute_mic";
        await obsService.call("SetInputMute", { inputName: mic.inputName, inputMuted: next });
        return;
      }
    }
  }

  private async readSnapshot(): Promise<RuntimeSnapshot> {
    const [sceneResponse, streamResponse, recordResponse] = await Promise.all([
      obsService.call("GetCurrentProgramScene"),
      obsService.call("GetStreamStatus"),
      obsService.call("GetRecordStatus"),
    ]);
    return {
      scene: String(sceneResponse.currentProgramSceneName ?? sceneResponse.sceneName ?? ""),
      streaming: Boolean(streamResponse.outputActive),
      recording: Boolean(recordResponse.outputActive),
    };
  }

  private triggerMatches(
    rule: StoredAutomationRule,
    previous: RuntimeSnapshot,
    current: RuntimeSnapshot,
  ): boolean {
    const trigger = rule.trigger;
    switch (trigger.type) {
      case "scene_changed":
        return current.scene !== previous.scene
          && (!trigger.scene_name || trigger.scene_name === current.scene);
      case "stream_started":
        return !previous.streaming && current.streaming;
      case "stream_stopped":
        return previous.streaming && !current.streaming;
      case "recording_started":
        return !previous.recording && current.recording;
      case "recording_stopped":
        return previous.recording && !current.recording;
      case "time_reached": {
        const [hours, minutes] = String(trigger.time ?? "").split(":").map(Number);
        const date = new Date();
        return Number.isFinite(hours) && Number.isFinite(minutes)
          && date.getHours() === hours && date.getMinutes() === minutes
          && (!trigger.days?.length || trigger.days.includes(date.getDay()));
      }
      case "manual":
      default:
        return false;
    }
  }

  private async runRule(rule: StoredAutomationRule): Promise<void> {
    if (this.activeRules.has(rule.id)) return;
    this.activeRules.add(rule.id);
    try {
      for (const action of rule.actions) await this.runStep(action, []);
      markAutomationRuleExecuted(rule.id);
      appendAutomationLog({ level: "info", message: `Ran automation: ${rule.name}`, ruleId: rule.id });
    } catch (error) {
      appendAutomationLog({
        level: "error",
        message: `Automation failed: ${rule.name} — ${error instanceof Error ? error.message : String(error)}`,
        ruleId: rule.id,
      });
    } finally {
      this.activeRules.delete(rule.id);
    }
  }

  private async tick(): Promise<void> {
    if (this.tickInProgress || obsService.status !== "connected") return;
    const rules = getAutomationRules().filter((rule) => rule.enabled && rule.actions.length > 0);
    if (rules.length === 0) return;

    this.tickInProgress = true;
    try {
      const current = await this.readSnapshot();
      const previous = this.previous;
      this.previous = current;
      if (!previous) return;

      const now = Date.now();
      for (const rule of rules) {
        const lastRun = rule.lastExecutedAt ? Date.parse(rule.lastExecutedAt) : 0;
        if (lastRun && now - lastRun < Math.max(rule.cooldown_ms, 0)) continue;
        if (this.triggerMatches(rule, previous, current)) void this.runRule(rule);
      }
    } catch {
      // OBS may disconnect between the status check and a request. The next
      // tick will retry after the normal OBS reconnect path settles.
    } finally {
      this.tickInProgress = false;
    }
  }
}

export const automationRunner = new AutomationRunner();
