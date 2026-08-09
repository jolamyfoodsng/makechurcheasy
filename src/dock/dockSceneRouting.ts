import { useCallback, useState } from "react";
import { getUserScopedKey } from "../services/userScopedStorage";

export type DockSceneRouteModule =
  | "bible"
  | "worship"
  | "notes"
  | "ticker"
  | "lower-third"
  | "countdown";

export interface DockSceneRoute {
  enabled: boolean;
  sceneName: string;
  syncPresentation: boolean;
}

const SCENE_ROUTING_STORAGE_KEY = "dock-scene-routing-v1";

const DEFAULT_SCENE_ROUTE: DockSceneRoute = {
  enabled: false,
  sceneName: "",
  syncPresentation: false,
};

type StoredSceneRoutes = Partial<Record<DockSceneRouteModule, Partial<DockSceneRoute>>>;

function normalizeRoute(value: unknown): DockSceneRoute {
  if (!value || typeof value !== "object") return { ...DEFAULT_SCENE_ROUTE };
  const candidate = value as Partial<DockSceneRoute>;
  return {
    enabled: candidate.enabled === true,
    sceneName: typeof candidate.sceneName === "string" ? candidate.sceneName.trim() : "",
    syncPresentation: candidate.syncPresentation === true,
  };
}

function readStoredRoutes(): StoredSceneRoutes {
  try {
    const raw = localStorage.getItem(getUserScopedKey(SCENE_ROUTING_STORAGE_KEY));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as StoredSceneRoutes;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStoredRoutes(routes: StoredSceneRoutes): void {
  try {
    localStorage.setItem(getUserScopedKey(SCENE_ROUTING_STORAGE_KEY), JSON.stringify(routes));
  } catch {
    // OBS CEF storage may be unavailable briefly; keep the in-memory setting.
  }
}

export function loadDockSceneRoute(module: DockSceneRouteModule): DockSceneRoute {
  return normalizeRoute(readStoredRoutes()[module]);
}

export function saveDockSceneRoute(module: DockSceneRouteModule, route: DockSceneRoute): void {
  const stored = readStoredRoutes();
  stored[module] = normalizeRoute(route);
  writeStoredRoutes(stored);
}

export function useDockSceneRoute(module: DockSceneRouteModule): [DockSceneRoute, (patch: Partial<DockSceneRoute>) => void] {
  const [route, setRoute] = useState<DockSceneRoute>(() => loadDockSceneRoute(module));

  const updateRoute = useCallback((patch: Partial<DockSceneRoute>) => {
    setRoute((current) => {
      const next = normalizeRoute({ ...current, ...patch });
      saveDockSceneRoute(module, next);
      return next;
    });
  }, [module]);

  return [route, updateRoute];
}
