/**
 * useOBS — React hook for OBS WebSocket state
 *
 * Integrates with store.ts for:
 * - Auto-connect on mount (if previously connected)
 * - Saving WebSocket URL/password
 * - Saving detected camera/scripture sources
 *
 * All OBS requests are SERIALIZED (no Promise.all) to prevent crashes.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
    obsService,
    type ConnectionStatus,
    type OBSScene,
    type OBSInput,
} from "../services/obsService";
import { loadData, updateData } from "../services/store";
import { SUNDAY_SCENE_NAMES } from "../services/layoutService";

export interface UseOBSReturn {
    connectionStatus: ConnectionStatus;
    error: string | null;
    connect: (url?: string, password?: string) => Promise<void>;
    disconnect: () => Promise<void>;
    scenes: OBSScene[];
    inputs: OBSInput[];
    currentScene: string | null;
    hasSundayScenes: boolean | null;
    refreshData: () => Promise<void>;
    switchScene: (sceneName: string) => Promise<void>;
    checkSundayScenes: () => Promise<boolean>;
}

export function useOBS(): UseOBSReturn {
    const [connectionStatus, setConnectionStatus] =
        useState<ConnectionStatus>("disconnected");
    const [error, setError] = useState<string | null>(null);
    const [scenes, setScenes] = useState<OBSScene[]>([]);
    const [inputs, setInputs] = useState<OBSInput[]>([]);
    const [currentScene, setCurrentScene] = useState<string | null>(null);
    const [hasSundayScenes, setHasSundayScenes] = useState<boolean | null>(null);
    const autoConnectAttempted = useRef(false);
    const lastUrlRef = useRef("");
    const lastPasswordRef = useRef<string | undefined>(undefined);

    // Subscribe to status changes from the service
    useEffect(() => {
        const unsubscribe = obsService.onStatusChange((status, err) => {
            setConnectionStatus(status);
            setError(err ?? null);
        });
        setConnectionStatus(obsService.status);
        setError(obsService.error);
        return unsubscribe;
    }, []);

    // ── Auto-connect on mount ──────────────────────────────────
    // If the user was previously connected (autoConnect=true in store),
    // reconnect automatically with a 500ms delay to avoid racing OBS startup.
    useEffect(() => {
        if (autoConnectAttempted.current) return;
        autoConnectAttempted.current = true;

        (async () => {
            try {
                const data = await loadData();
                if (!data.obsWebSocket.autoConnect) {
                    return;
                }

                const { url, password } = data.obsWebSocket;
                lastUrlRef.current = url;
                lastPasswordRef.current = password || undefined;
                await new Promise((r) => setTimeout(r, 500));

                await obsService.connect(url, password || undefined);

                // Stabilization delay
                await new Promise((r) => setTimeout(r, 200));

                // Refresh data (serialized)
                await refreshDataInner();
            } catch (err) {
                console.warn("[useOBS] Auto-connect failed (OBS may not be running):", err);
                // Not a fatal error — user can connect manually later
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Fetch scenes, inputs, and current program scene.
     * SERIALIZED — each request waits for the previous to finish.
     */
    const refreshDataInner = async () => {
        if (obsService.status !== "connected") return;
        try {
            const sceneList = await obsService.getSceneList();
            setScenes(sceneList);

            const inputList = await obsService.getInputList();
            setInputs(inputList);

            const programScene = await obsService.getCurrentProgramScene();
            setCurrentScene(programScene);

            // Check Sunday scenes using already-fetched list (no extra request)
            const sceneNames = new Set(sceneList.map((s) => s.sceneName));
            const sundayExists = SUNDAY_SCENE_NAMES.every((name) => sceneNames.has(name));
            setHasSundayScenes(sundayExists);
        } catch (err) {
            console.error("[useOBS] Failed to refresh data:", err);
        }
    };

    const refreshData = useCallback(async () => {
        await refreshDataInner();
    }, []);

    /**
     * Check if Sunday scenes already exist.
     * Uses already-fetched scene list from state.
     */
    const checkSundayScenes = useCallback(async (): Promise<boolean> => {
        try {
            let sceneNames: Set<string>;
            if (scenes.length > 0) {
                sceneNames = new Set(scenes.map((s) => s.sceneName));
            } else {
                const freshScenes = await obsService.getSceneList();
                setScenes(freshScenes);
                sceneNames = new Set(freshScenes.map((s) => s.sceneName));
            }
            const exists = SUNDAY_SCENE_NAMES.every((name) => sceneNames.has(name));
            setHasSundayScenes(exists);
            return exists;
        } catch (err) {
            console.error("[useOBS] Failed to check Sunday scenes:", err);
            setHasSundayScenes(false);
            return false;
        }
    }, [scenes]);

    /**
     * Connect to OBS and save settings to store.
     * Sets autoConnect=true so the app will reconnect on next launch.
     */
    const connect = useCallback(
        async (url?: string, password?: string) => {
            setError(null);
            try {
                const connectUrl = url || "ws://localhost:4455";
                lastUrlRef.current = connectUrl;
                lastPasswordRef.current = password;

                await obsService.connect(connectUrl, password);

                // Save connection settings + enable auto-connect
                await updateData({
                    obsWebSocket: {
                        url: connectUrl,
                        password: password || "",
                        autoConnect: true,
                    },
                });

                // Stabilization delay, then fetch data
                await new Promise((r) => setTimeout(r, 200));
                await refreshDataInner();
            } catch {
                // Error is already set by the service's status change callback
            }
        },
        []
    );

    /**
     * Disconnect and disable auto-connect.
     */
    const disconnect = useCallback(async () => {
        await obsService.disconnect();
        setScenes([]);
        setInputs([]);
        setCurrentScene(null);
        setHasSundayScenes(null);

        // Disable auto-connect so the app doesn't reconnect on next launch
        await updateData({
            obsWebSocket: { autoConnect: false },
        });
    }, []);

    const switchScene = useCallback(async (sceneName: string) => {
        try {
            await obsService.setCurrentProgramScene(sceneName);
            setCurrentScene(sceneName);
        } catch (err) {
            const message =
                err instanceof Error ? err.message : "Failed to switch scene";
            console.error("[useOBS] switchScene error:", message);
            setError(message);
        }
    }, []);

    return {
        connectionStatus,
        error,
        connect,
        disconnect,
        scenes,
        inputs,
        currentScene,
        hasSundayScenes,
        refreshData,
        switchScene,
        checkSundayScenes,
    };
}
