import { useCallback, useState } from "react";
import { readNativeDockSetting, writeNativeDockSetting } from "../services/localDockSettings";

export type DockSceneRouteModule =
  | "bible"
  | "worship"
  | "notes"
  | "ticker"
  | "lower-third"
  | "countdown";

export type DockSceneOutputMode = "inherit" | "fullscreen" | "lower-third";

export interface DockSceneRouteTarget {
  sceneName: string;
  /** Inherit the tab's current format unless the operator chooses an override. */
  mode: DockSceneOutputMode;
}

export interface DockSceneRoute {
  enabled: boolean;
  /** The first target, retained for older callers and saved route versions. */
  sceneName: string;
  targets: DockSceneRouteTarget[];
  syncPresentation: boolean;
}

const SCENE_ROUTING_STORAGE_KEY = "dock-scene-routing-v1";

const DEFAULT_SCENE_ROUTE: DockSceneRoute = {
  enabled: false,
  sceneName: "",
  targets: [],
  syncPresentation: false,
};

type StoredSceneRoutes = Partial<Record<DockSceneRouteModule, Partial<DockSceneRoute>>>;

function normalizeMode(value: unknown): DockSceneOutputMode {
  return value === "fullscreen" || value === "lower-third" ? value : "inherit";
}

function normalizeTargets(value: unknown, legacySceneName: string): DockSceneRouteTarget[] {
  const rawTargets = Array.isArray(value)
    ? value
    : legacySceneName
      ? [{ sceneName: legacySceneName, mode: "inherit" }]
      : [];
  const seen = new Set<string>();
  const targets: DockSceneRouteTarget[] = [];

  for (const rawTarget of rawTargets) {
    if (!rawTarget || typeof rawTarget !== "object") continue;
    const candidate = rawTarget as { sceneName?: unknown; mode?: unknown };
    const sceneName = typeof candidate.sceneName === "string" ? candidate.sceneName.trim() : "";
    if (!sceneName || seen.has(sceneName)) continue;
    seen.add(sceneName);
    targets.push({ sceneName, mode: normalizeMode(candidate.mode) });
  }

  return targets;
}

export function normalizeDockSceneRoute(value: unknown): DockSceneRoute {
  if (!value || typeof value !== "object") return { ...DEFAULT_SCENE_ROUTE };
  const candidate = value as Partial<DockSceneRoute> & { targets?: unknown };
  const legacySceneName = typeof candidate.sceneName === "string" ? candidate.sceneName.trim() : "";
  const targets = normalizeTargets(candidate.targets, legacySceneName);
  return {
    enabled: candidate.enabled === true,
    sceneName: targets[0]?.sceneName ?? legacySceneName,
    targets,
    syncPresentation: candidate.syncPresentation === true,
  };
}

export function getDockSceneRouteTargets(route: DockSceneRoute): DockSceneRouteTarget[] {
  if (route.targets.length > 0) return route.targets;
  return route.sceneName
    ? [{ sceneName: route.sceneName, mode: "inherit" }]
    : [];
}

function readStoredRoutes(): StoredSceneRoutes {
  const parsed = readNativeDockSetting<StoredSceneRoutes>(SCENE_ROUTING_STORAGE_KEY);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function writeStoredRoutes(routes: StoredSceneRoutes): void {
  writeNativeDockSetting(SCENE_ROUTING_STORAGE_KEY, routes);
}

export function loadDockSceneRoute(module: DockSceneRouteModule): DockSceneRoute {
  return normalizeDockSceneRoute(readStoredRoutes()[module]);
}

export function saveDockSceneRoute(module: DockSceneRouteModule, route: DockSceneRoute): void {
  const stored = readStoredRoutes();
  stored[module] = normalizeDockSceneRoute(route);
  writeStoredRoutes(stored);
}

export function useDockSceneRoute(module: DockSceneRouteModule): [DockSceneRoute, (patch: Partial<DockSceneRoute>) => void] {
  const [route, setRoute] = useState<DockSceneRoute>(() => loadDockSceneRoute(module));

  const updateRoute = useCallback((patch: Partial<DockSceneRoute>) => {
    setRoute((current) => {
      const next = normalizeDockSceneRoute({ ...current, ...patch });
      saveDockSceneRoute(module, next);
      return next;
    });
  }, [module]);

  return [route, updateRoute];
}
