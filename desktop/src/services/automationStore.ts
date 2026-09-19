import { readUserScopedStorage, writeUserScopedStorage } from "./userScopedStorage";

export type AutomationStepType =
  | "switch_scene"
  | "set_preview_scene"
  | "start_stream"
  | "stop_stream"
  | "start_recording"
  | "stop_recording"
  | "toggle_mic"
  | "mute_mic"
  | "unmute_mic"
  | "enable_studio_mode"
  | "disable_studio_mode"
  | "delay"
  | "run_macro";

export interface AutomationStep {
  id: string;
  type: AutomationStepType;
  scene_name?: string;
  macro_id?: string;
  delay_ms?: number;
}

export type AutomationTriggerType =
  | "manual"
  | "scene_changed"
  | "stream_started"
  | "stream_stopped"
  | "recording_started"
  | "recording_stopped"
  | "time_reached";

export interface StoredMacro {
  id: string;
  name: string;
  icon: string;
  color: string;
  steps: AutomationStep[];
  createdAt: string;
  updatedAt: string;
}

export interface StoredAutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  trigger: {
    type: AutomationTriggerType;
    scene_name?: string;
    time?: string;
    days?: number[];
  };
  actions: AutomationStep[];
  cooldown_ms: number;
  createdAt: string;
  updatedAt: string;
  lastExecutedAt?: string;
}

export interface AutomationLogEntry {
  id: string;
  level: "info" | "error";
  message: string;
  timestamp: string;
  ruleId?: string;
  macroId?: string;
}

const MACROS_KEY = "mce-automation-macros-v1";
const RULES_KEY = "mce-automation-rules-v1";
const LOGS_KEY = "mce-automation-logs-v1";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const starterMacros = (): StoredMacro[] => {
  const timestamp = now();
  return [
    {
      id: "starter-start-service",
      name: "Start service",
      icon: "play_circle",
      color: "blue",
      steps: [
        { id: "start-stream", type: "start_stream" },
        { id: "start-recording", type: "start_recording" },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "starter-stop-service",
      name: "Stop service",
      icon: "stop_circle",
      color: "orange",
      steps: [
        { id: "stop-recording", type: "stop_recording" },
        { id: "stop-stream", type: "stop_stream" },
      ],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
};

function readList<T>(key: string, fallback: T[]): T[] {
  const raw = readUserScopedStorage(key);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}

function writeList<T>(key: string, value: T[]): void {
  writeUserScopedStorage(key, JSON.stringify(value));
}

export function getMacros(): StoredMacro[] {
  return readList<StoredMacro>(MACROS_KEY, starterMacros());
}

export function saveMacro(input: Partial<StoredMacro> & Pick<StoredMacro, "name" | "steps">): StoredMacro {
  const timestamp = now();
  const macros = getMacros();
  const existing = input.id ? macros.find((macro) => macro.id === input.id) : undefined;
  const saved: StoredMacro = {
    id: existing?.id ?? input.id ?? id("macro"),
    name: input.name.trim() || "Untitled macro",
    icon: input.icon ?? existing?.icon ?? "bolt",
    color: input.color ?? existing?.color ?? "blue",
    steps: input.steps,
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
  writeList(MACROS_KEY, existing
    ? macros.map((macro) => macro.id === saved.id ? saved : macro)
    : [...macros, saved]);
  return saved;
}

export function deleteMacro(macroId: string): void {
  if (macroId.startsWith("starter-")) return;
  writeList(MACROS_KEY, getMacros().filter((macro) => macro.id !== macroId));
}

export function getAutomationRules(): StoredAutomationRule[] {
  return readList<StoredAutomationRule>(RULES_KEY, []);
}

export function saveAutomationRule(
  input: Partial<StoredAutomationRule> & Pick<StoredAutomationRule, "name" | "trigger" | "actions">,
): StoredAutomationRule {
  const timestamp = now();
  const rules = getAutomationRules();
  const existing = input.id ? rules.find((rule) => rule.id === input.id) : undefined;
  const saved: StoredAutomationRule = {
    id: existing?.id ?? input.id ?? id("rule"),
    name: input.name.trim() || "Untitled automation",
    enabled: input.enabled ?? existing?.enabled ?? true,
    trigger: input.trigger,
    actions: input.actions,
    cooldown_ms: Math.max(0, input.cooldown_ms ?? existing?.cooldown_ms ?? 30_000),
    createdAt: existing?.createdAt ?? input.createdAt ?? timestamp,
    updatedAt: timestamp,
    ...(existing?.lastExecutedAt || input.lastExecutedAt
      ? { lastExecutedAt: input.lastExecutedAt ?? existing?.lastExecutedAt }
      : {}),
  };
  writeList(RULES_KEY, existing
    ? rules.map((rule) => rule.id === saved.id ? saved : rule)
    : [...rules, saved]);
  return saved;
}

export function deleteAutomationRule(ruleId: string): void {
  writeList(RULES_KEY, getAutomationRules().filter((rule) => rule.id !== ruleId));
}

export function setAutomationRuleEnabled(ruleId: string, enabled: boolean): StoredAutomationRule | null {
  const rule = getAutomationRules().find((candidate) => candidate.id === ruleId);
  if (!rule) return null;
  return saveAutomationRule({ ...rule, enabled });
}

export function markAutomationRuleExecuted(ruleId: string): void {
  const rule = getAutomationRules().find((candidate) => candidate.id === ruleId);
  if (rule) saveAutomationRule({ ...rule, lastExecutedAt: now() });
}

export function getAutomationLogs(): AutomationLogEntry[] {
  return readList<AutomationLogEntry>(LOGS_KEY, []);
}

export function appendAutomationLog(entry: Omit<AutomationLogEntry, "id" | "timestamp">): void {
  const logs = [
    ...getAutomationLogs(),
    { ...entry, id: id("log"), timestamp: now() },
  ].slice(-100);
  writeList(LOGS_KEY, logs);
}

export function clearAutomationLogs(): void {
  writeList(LOGS_KEY, []);
}
