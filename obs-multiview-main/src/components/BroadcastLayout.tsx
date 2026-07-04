/**
 * BroadcastLayout — 3-column broadcast control interface
 *
 * Layout: Content Library (25%) | Preview + Program (50%) | Service Queue (25%)
 *
 * ProPresenter / vMix / ATEM inspired.
 * Nothing goes live without an explicit TAKE.
 */

import { useEffect, useRef, useCallback, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useBroadcastStore } from "../hooks/useBroadcastStore";
import { ContentLibraryPanel } from "./ContentLibraryPanel";
import { PreviewProgramPanel } from "./PreviewProgramPanel";
import { ServiceQueuePanel } from "./ServiceQueuePanel";
import { obsService } from "../services/obsService";
import { buildContentLibrary, type ContentItem } from "../services/broadcastStore";
import "./BroadcastLayout.css";
import Icon from "./Icon";

interface Props {
    onDisconnect: () => Promise<void>;
}

// Column width constraints (px)
const MIN_SIDE = 200;
const MAX_SIDE = 500;
const MIN_CENTER = 400;

export function BroadcastLayout({ onDisconnect }: Props) {
    const { state, updateSystem } = useBroadcastStore();
    const navigate = useNavigate();
    const [library, setLibrary] = useState<ContentItem[]>([]);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Resizable columns ──
    const [leftWidth, setLeftWidth] = useState(280);
    const [rightWidth, setRightWidth] = useState(280);
    const bodyRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef<"left" | "right" | null>(null);
    const startXRef = useRef(0);
    const startWidthRef = useRef(0);

    const onDividerPointerDown = useCallback(
        (side: "left" | "right", e: ReactPointerEvent<HTMLDivElement>) => {
            e.preventDefault();
            draggingRef.current = side;
            startXRef.current = e.clientX;
            startWidthRef.current = side === "left" ? leftWidth : rightWidth;
            (e.target as HTMLDivElement).setPointerCapture(e.pointerId);
        },
        [leftWidth, rightWidth]
    );

    const onDividerPointerMove = useCallback(
        (e: ReactPointerEvent<HTMLDivElement>) => {
            if (!draggingRef.current || !bodyRef.current) return;
            const totalWidth = bodyRef.current.clientWidth;
            const delta = e.clientX - startXRef.current;

            if (draggingRef.current === "left") {
                const newLeft = Math.max(MIN_SIDE, Math.min(MAX_SIDE, startWidthRef.current + delta));
                // Ensure center doesn't get too small
                if (totalWidth - newLeft - rightWidth >= MIN_CENTER) {
                    setLeftWidth(newLeft);
                }
            } else {
                // Right divider: dragging right makes it smaller, left makes it bigger
                const newRight = Math.max(MIN_SIDE, Math.min(MAX_SIDE, startWidthRef.current - delta));
                if (totalWidth - leftWidth - newRight >= MIN_CENTER) {
                    setRightWidth(newRight);
                }
            }
        },
        [leftWidth, rightWidth]
    );

    const onDividerPointerUp = useCallback(() => {
        draggingRef.current = null;
    }, []);

    // ── Build content library from OBS scenes ──
    const refreshLibrary = useCallback(async () => {
        try {
            const scenes = await obsService.getSceneList();
            setLibrary(buildContentLibrary(scenes));
        } catch {
            // Silently ignore — will retry on next poll
        }
    }, []);

    useEffect(() => {
        refreshLibrary();
    }, [refreshLibrary]);

    // ── Poll system stats every 2s ──
    useEffect(() => {
        const poll = async () => {
            try {
                const stats = await obsService.call("GetStats", {}) as {
                    activeFps: number;
                    renderSkippedFrames: number;
                    cpuUsage: number;
                };
                const streamStatus = await obsService.call("GetStreamStatus", {}).catch(() => null) as {
                    outputActive: boolean;
                    outputSkippedFrames: number;
                } | null;
                const recordStatus = await obsService.call("GetRecordStatus", {}).catch(() => null) as {
                    outputActive: boolean;
                } | null;

                const scene = await obsService.getCurrentProgramScene().catch(() => null);

                const fps = Math.round(stats?.activeFps ?? 0);
                const dropped = streamStatus?.outputSkippedFrames ?? 0;
                const streaming = streamStatus?.outputActive ?? false;
                const recording = recordStatus?.outputActive ?? false;

                let streamHealth: "good" | "warning" | "critical" | "offline" = "offline";
                if (streaming) {
                    if (dropped > 100) streamHealth = "critical";
                    else if (dropped > 20) streamHealth = "warning";
                    else streamHealth = "good";
                }

                updateSystem({
                    obsConnected: true,
                    obsScene: scene,
                    streaming,
                    recording,
                    droppedFrames: dropped,
                    fps,
                    cpuUsage: stats?.cpuUsage ?? 0,
                    streamHealth,
                });
            } catch {
                updateSystem({ obsConnected: false, streamHealth: "offline" });
            }
        };

        poll();
        pollRef.current = setInterval(poll, 2000);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [updateSystem]);

    // ── Filter library based on tab + search ──
    const filteredLibrary = library.filter((item) => {
        if (state.libraryTab !== "all" && item.type !== state.libraryTab) return false;
        if (state.librarySearch) {
            const q = state.librarySearch.toLowerCase();
            return (
                item.title.toLowerCase().includes(q) ||
                item.subtitle?.toLowerCase().includes(q) ||
                item.type.toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className="broadcast-layout">
            {/* Header bar */}
            <header className="broadcast-header">
                <div className="broadcast-header-brand">
                    <Icon name="cameraswitch" size={20} className="broadcast-logo-icon" />
                    <span className="broadcast-header-title">OBS Church Studio</span>
                </div>

                <div className="broadcast-header-center">
                    {state.system.streaming && (
                        <span className="broadcast-live-badge">
                            <span className="broadcast-live-dot" />
                            LIVE
                        </span>
                    )}
                    {state.system.recording && (
                        <span className="broadcast-rec-badge">
                            <Icon name="fiber_manual_record" size={14} />
                            REC
                        </span>
                    )}
                    {!state.system.streaming && !state.system.recording && (
                        <span className="broadcast-idle-badge">STANDBY</span>
                    )}
                </div>

                <div className="broadcast-header-right">
                    <span className="broadcast-stat">
                        <Icon name="speed" size={14} />
                        {state.system.fps} FPS
                    </span>
                    {state.system.streaming && (
                        <span className={`broadcast-stat broadcast-health-${state.system.streamHealth}`}>
                            <Icon name="cell_tower" size={14} />
                            {state.system.streamHealth.toUpperCase()}
                        </span>
                    )}
                    <button
                        className="broadcast-mv-btn"
                        onClick={() => navigate("/")}
                        title="Open Multi-View Editor"
                    >
                        <Icon name="grid_view" size={16} />
                    </button>
                    <button
                        className="broadcast-disconnect-btn"
                        onClick={onDisconnect}
                        title="Disconnect from OBS"
                    >
                        <Icon name="power_settings_new" size={16} />
                    </button>
                </div>
            </header>

            {/* 3-column body with draggable dividers */}
            <div className="broadcast-body" ref={bodyRef}>
                <div className="broadcast-col broadcast-col-left" style={{ width: leftWidth, minWidth: MIN_SIDE, maxWidth: MAX_SIDE }}>
                    <ContentLibraryPanel items={filteredLibrary} />
                </div>

                {/* Left divider */}
                <div
                    className={`broadcast-divider ${draggingRef.current === "left" ? "broadcast-divider-active" : ""}`}
                    onPointerDown={(e) => onDividerPointerDown("left", e)}
                    onPointerMove={onDividerPointerMove}
                    onPointerUp={onDividerPointerUp}
                >
                    <div className="broadcast-divider-line" />
                </div>

                <div className="broadcast-col broadcast-col-center" style={{ flex: 1, minWidth: MIN_CENTER }}>
                    <PreviewProgramPanel />
                </div>

                {/* Right divider */}
                <div
                    className={`broadcast-divider ${draggingRef.current === "right" ? "broadcast-divider-active" : ""}`}
                    onPointerDown={(e) => onDividerPointerDown("right", e)}
                    onPointerMove={onDividerPointerMove}
                    onPointerUp={onDividerPointerUp}
                >
                    <div className="broadcast-divider-line" />
                </div>

                <div className="broadcast-col broadcast-col-right" style={{ width: rightWidth, minWidth: MIN_SIDE, maxWidth: MAX_SIDE }}>
                    <ServiceQueuePanel onRefreshLibrary={refreshLibrary} />
                </div>
            </div>
        </div>
    );
}
