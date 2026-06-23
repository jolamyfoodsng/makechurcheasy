/**
 * PreviewProgramPanel — Center column
 *
 * Single active content monitor showing what's currently on air.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useBroadcastStore } from "../hooks/useBroadcastStore";
import { obsService } from "../services/obsService";
import Icon from "./Icon";

export function PreviewProgramPanel() {
    const {
        state,
        clearActiveContent,
    } = useBroadcastStore();

    const [activeImg, setActiveImg] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const pollScreenshot = useCallback(async () => {
        try {
            if (state.system.obsScene) {
                const shot = await obsService.getSourceScreenshot(
                    state.system.obsScene,
                    480
                );
                if (shot) setActiveImg(shot);
            }
        } catch {
            // Ignore — will retry
        }
    }, [state.system.obsScene]);

    useEffect(() => {
        pollScreenshot();
        pollRef.current = setInterval(pollScreenshot, 800);
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [pollScreenshot]);

    return (
        <div className="preview-program-panel">
            <div className="monitor-row">
                <div className="monitor monitor-program">
                    <div className="monitor-label monitor-label-live">
                        <Icon name="cast" size={14} />
                        ACTIVE
                        {state.system.streaming && (
                            <span className="monitor-live-dot" />
                        )}
                    </div>
                    <div className="monitor-screen monitor-screen-live">
                        {activeImg ? (
                            <img
                                src={activeImg}
                                alt="Active"
                                className="monitor-img"
                                draggable={false}
                            />
                        ) : state.activeContent ? (
                            <div className="monitor-placeholder">
                                <Icon name={state.activeContent.icon} size={20} className="monitor-placeholder-icon" />
                                <span className="monitor-placeholder-text">
                                    {state.activeContent.title}
                                </span>
                            </div>
                        ) : (
                            <div className="monitor-empty">
                                <Icon name="live_tv" size={32} style={{ opacity: 0.3 }} />
                                <span className="monitor-empty-text">No Active Content</span>
                            </div>
                        )}
                    </div>
                    {state.activeContent && (
                        <div className="monitor-info monitor-info-live">
                            <Icon name={state.activeContent.icon} size={14} />
                            <span className="monitor-info-title">{state.activeContent.title}</span>
                            <button
                                className="monitor-clear-btn"
                                onClick={clearActiveContent}
                                title="Clear active content"
                            >
                                <Icon name="close" size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
