/**
 * useBroadcastStore — React Context + useReducer for broadcast state.
 *
 * Wraps broadcastStore.ts reducer in a React provider.
 * All broadcast components use this hook to read state and dispatch actions.
 */

import {
    createContext,
    useContext,
    useReducer,
    useCallback,
    useRef,
    type ReactNode,
    type Dispatch,
} from "react";
import {
    broadcastReducer,
    INITIAL_BROADCAST_STATE,
    type BroadcastState,
    type BroadcastAction,
    type ContentItem,
    type SystemStatus,
    type ContentType,
} from "../services/broadcastStore";
import { obsService } from "../services/obsService";
import {
    applyPreset,
    type PresetId,
    DEFAULT_PRESET_OPTIONS,
} from "../services/presetService";
import type { GenerationConfig } from "../services/layoutService";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface BroadcastContextValue {
    state: BroadcastState;
    dispatch: Dispatch<BroadcastAction>;
    /** Set the active content */
    setActiveContent: (item: ContentItem) => Promise<void>;
    /** Clear the active content */
    clearActiveContent: () => void;
    /** Add item to service queue */
    addToQueue: (item: ContentItem) => void;
    /** Advance to next queue item */
    nextInQueue: () => void;
    /** Update system status */
    updateSystem: (s: Partial<SystemStatus>) => void;
    /** Set library tab filter */
    setLibraryTab: (tab: ContentType | "all") => void;
    /** Set library search query */
    setLibrarySearch: (query: string) => void;
}

const BroadcastContext = createContext<BroadcastContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface BroadcastProviderProps {
    children: ReactNode;
    config: GenerationConfig | null;
}

export function BroadcastProvider({ children, config }: BroadcastProviderProps) {
    const [state, dispatch] = useReducer(broadcastReducer, INITIAL_BROADCAST_STATE);
    const configRef = useRef(config);
    configRef.current = config;

    const setActiveContent = useCallback(async (item: ContentItem) => {
        dispatch({ type: "SET_ACTIVE_CONTENT", item });

        const sceneName = item.sceneName;
        if (sceneName) {
            try {
                if (item.presetId && configRef.current) {
                    await applyPreset(
                        item.presetId as PresetId,
                        configRef.current.cameraSource,
                        configRef.current.scriptureSource,
                        DEFAULT_PRESET_OPTIONS
                    );
                } else {
                    await obsService.setCurrentProgramScene(sceneName);
                }
            } catch (err) {
                console.warn("[Broadcast] Failed to set active content:", err);
            }
        }
    }, []);

    const clearActiveContent = useCallback(() => {
        dispatch({ type: "CLEAR_ACTIVE_CONTENT" });
    }, []);

    const addToQueue = useCallback((item: ContentItem) => {
        dispatch({ type: "QUEUE_ADD", item });
    }, []);

    const nextInQueue = useCallback(() => {
        dispatch({ type: "QUEUE_NEXT" });
    }, []);

    const updateSystem = useCallback((s: Partial<SystemStatus>) => {
        dispatch({ type: "UPDATE_SYSTEM", status: s });
    }, []);

    const setLibraryTab = useCallback((tab: ContentType | "all") => {
        dispatch({ type: "SET_LIBRARY_TAB", tab });
    }, []);

    const setLibrarySearch = useCallback((query: string) => {
        dispatch({ type: "SET_LIBRARY_SEARCH", query });
    }, []);

    return (
        <BroadcastContext.Provider
            value={{
                state,
                dispatch,
                setActiveContent,
                clearActiveContent,
                addToQueue,
                nextInQueue,
                updateSystem,
                setLibraryTab,
                setLibrarySearch,
            }}
        >
            {children}
        </BroadcastContext.Provider>
    );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBroadcastStore(): BroadcastContextValue {
    const ctx = useContext(BroadcastContext);
    if (!ctx) {
        throw new Error("useBroadcastStore must be used inside <BroadcastProvider>");
    }
    return ctx;
}
