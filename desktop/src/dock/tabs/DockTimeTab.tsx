import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DockSceneRoutingControl from "../components/DockSceneRoutingControl";
import Icon from "../DockIcon";
import { dockObsClient } from "../dockObsClient";
import { isPresentationLinkTarget, type DockPresentationOutputTarget } from "../dockPresentationTarget";
import { useDockSceneRoute } from "../dockSceneRouting";
import { ensureObsConnected } from "../obsConnectionGuard";
import { readNativeDockSetting, writeNativeDockSetting } from "../../services/localDockSettings";
import DockCountdownsTab from "./DockCountdownsTab";
import {
  DOCK_TIME_LOWER_THIRD_SOURCE_NAME,
  DOCK_TIME_SOURCE_NAME,
  formatTimeDuration,
  getDockTimeSourceName,
  getTimerElapsedSeconds,
  type DockClockOverlayState,
  type DockTimeDisplayMode,
  type DockTimeOverlayData,
  type DockTimePlacement,
  type DockTimeTool,
  type DockTimerOverlayState,
} from "../timeOverlay";
import { DOCK_PRESENTATION_SCENE_NAME } from "./dockCountdownScene";

type TimeSubTab = "countdown" | "timer" | "clock";

interface TimerSettings extends DockTimerOverlayState {
  label: string;
  mode: DockTimeDisplayMode;
  placement: DockTimePlacement;
}

interface ClockSettings extends DockClockOverlayState {
  label: string;
  mode: DockTimeDisplayMode;
  placement: DockTimePlacement;
}

interface TimeSettings {
  timer: TimerSettings;
  clock: ClockSettings;
}

interface TimeOutputTarget {
  sceneName: string;
  sourceName: string;
  mode: DockTimeDisplayMode;
}

const TIME_SETTINGS_KEY = "dock-time-tools-v1";

const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  label: "Elapsed time",
  mode: "lower-third",
  placement: "left",
  elapsedSeconds: 0,
  startedAt: null,
  running: false,
};

const DEFAULT_CLOCK_SETTINGS: ClockSettings = {
  label: "Current time",
  mode: "lower-third",
  placement: "right",
  hour12: false,
  showSeconds: true,
  showDate: false,
};

function isDisplayMode(value: unknown): value is DockTimeDisplayMode {
  return value === "fullscreen" || value === "lower-third";
}

function isPlacement(value: unknown): value is DockTimePlacement {
  return value === "left" || value === "right";
}

function getStoredTimer(value: unknown): TimerSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_TIMER_SETTINGS };
  const raw = value as Partial<TimerSettings>;
  return {
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : DEFAULT_TIMER_SETTINGS.label,
    mode: isDisplayMode(raw.mode) ? raw.mode : DEFAULT_TIMER_SETTINGS.mode,
    placement: isPlacement(raw.placement) ? raw.placement : DEFAULT_TIMER_SETTINGS.placement,
    elapsedSeconds: Math.max(0, Math.floor(Number(raw.elapsedSeconds) || 0)),
    startedAt: typeof raw.startedAt === "number" && Number.isFinite(raw.startedAt) ? raw.startedAt : null,
    running: raw.running === true,
  };
}

function getStoredClock(value: unknown): ClockSettings {
  if (!value || typeof value !== "object") return { ...DEFAULT_CLOCK_SETTINGS };
  const raw = value as Partial<ClockSettings>;
  return {
    label: typeof raw.label === "string" ? raw.label.slice(0, 80) : DEFAULT_CLOCK_SETTINGS.label,
    mode: isDisplayMode(raw.mode) ? raw.mode : DEFAULT_CLOCK_SETTINGS.mode,
    placement: isPlacement(raw.placement) ? raw.placement : DEFAULT_CLOCK_SETTINGS.placement,
    hour12: raw.hour12 === true,
    showSeconds: raw.showSeconds !== false,
    showDate: raw.showDate === true,
  };
}

function loadTimeSettings(): TimeSettings {
  try {
    const raw = readNativeDockSetting<unknown>(TIME_SETTINGS_KEY);
    if (!raw || typeof raw !== "object") {
      return { timer: { ...DEFAULT_TIMER_SETTINGS }, clock: { ...DEFAULT_CLOCK_SETTINGS } };
    }
    const value = raw as { timer?: unknown; clock?: unknown };
    return { timer: getStoredTimer(value.timer), clock: getStoredClock(value.clock) };
  } catch {
    return { timer: { ...DEFAULT_TIMER_SETTINGS }, clock: { ...DEFAULT_CLOCK_SETTINGS } };
  }
}

function formatClock(now: number, clock: ClockSettings): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    hour12: clock.hour12,
  };
  if (clock.showSeconds) options.second = "2-digit";
  return new Intl.DateTimeFormat(undefined, options).format(new Date(now));
}

function formatClockDate(now: number): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(now));
}

function displayModeLabel(mode: DockTimeDisplayMode): string {
  return mode === "fullscreen" ? "Full screen" : "Lower third";
}

function TimePreview({
  tool,
  mode,
  placement,
  label,
  value,
  date,
}: {
  tool: DockTimeTool;
  mode: DockTimeDisplayMode;
  placement: DockTimePlacement;
  label: string;
  value: string;
  date?: string;
}) {
  return (
    <div
      className={`dock-time-preview dock-time-preview--${mode} dock-time-preview--${placement}`}
      aria-label={`${tool === "timer" ? "Timer" : "Clock"} preview`}
    >
      <div className="dock-time-preview__card">
        <span className="dock-time-preview__accent" aria-hidden="true" />
        <div className="dock-time-preview__content">
          <span className="dock-time-preview__label">{label || (tool === "clock" ? "Current time" : "Timer")}</span>
          <strong className="dock-time-preview__value">{value}</strong>
          {date ? <span className="dock-time-preview__date">{date}</span> : null}
        </div>
      </div>
    </div>
  );
}

function DisplayModeControl({
  value,
  onChange,
}: {
  value: DockTimeDisplayMode;
  onChange: (value: DockTimeDisplayMode) => void;
}) {
  return (
    <div className="dock-time-field">
      <span className="dock-time-field__label">Display</span>
      <div className="dock-time-segmented" role="group" aria-label="Time display format">
        <button
          type="button"
          className={value === "fullscreen" ? "dock-time-segmented__button dock-time-segmented__button--active" : "dock-time-segmented__button"}
          onClick={() => onChange("fullscreen")}
        >
          <Icon name="fullscreen" size={12} />
          <span>Full screen</span>
        </button>
        <button
          type="button"
          className={value === "lower-third" ? "dock-time-segmented__button dock-time-segmented__button--active" : "dock-time-segmented__button"}
          onClick={() => onChange("lower-third")}
        >
          <Icon name="subtitles" size={12} />
          <span>Lower third</span>
        </button>
      </div>
    </div>
  );
}

function PlacementControl({
  value,
  onChange,
}: {
  value: DockTimePlacement;
  onChange: (value: DockTimePlacement) => void;
}) {
  return (
    <div className="dock-time-field">
      <span className="dock-time-field__label">Card position</span>
      <div className="dock-time-segmented" role="group" aria-label="Lower-third card position">
        <button
          type="button"
          className={value === "left" ? "dock-time-segmented__button dock-time-segmented__button--active" : "dock-time-segmented__button"}
          onClick={() => onChange("left")}
        >
          <Icon name="arrow_back" size={12} />
          <span>Left</span>
        </button>
        <button
          type="button"
          className={value === "right" ? "dock-time-segmented__button dock-time-segmented__button--active" : "dock-time-segmented__button"}
          onClick={() => onChange("right")}
        >
          <Icon name="arrow_forward" size={12} />
          <span>Right</span>
        </button>
      </div>
    </div>
  );
}

export default function DockTimeTab({
  presentationOutputTarget = "obs",
}: {
  presentationOutputTarget?: DockPresentationOutputTarget;
} = {}) {
  const { t } = useTranslation();
  const presentationLinkMode = isPresentationLinkTarget(presentationOutputTarget);
  const [activeTab, setActiveTab] = useState<TimeSubTab>("countdown");
  const [settings, setSettings] = useState<TimeSettings>(loadTimeSettings);
  const [now, setNow] = useState(() => Date.now());
  const [liveTool, setLiveTool] = useState<DockTimeTool | null>(null);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [sceneRoute, updateSceneRoute] = useDockSceneRoute("time");
  const hasSceneRoute = sceneRoute.enabled && sceneRoute.targets.length > 0;

  const timerElapsed = useMemo(
    () => getTimerElapsedSeconds(settings.timer, now),
    [now, settings.timer],
  );
  const clockValue = useMemo(() => formatClock(now, settings.clock), [now, settings.clock]);
  const clockDate = useMemo(
    () => settings.clock.showDate ? formatClockDate(now) : "",
    [now, settings.clock.showDate],
  );

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    writeNativeDockSetting(TIME_SETTINGS_KEY, settings);
  }, [settings]);

  const updateTimer = useCallback((patch: Partial<TimerSettings>) => {
    setSettings((current) => ({
      ...current,
      timer: { ...current.timer, ...patch },
    }));
  }, []);

  const updateClock = useCallback((patch: Partial<ClockSettings>) => {
    setSettings((current) => ({
      ...current,
      clock: { ...current.clock, ...patch },
    }));
  }, []);

  const getOutputTargets = useCallback((mode: DockTimeDisplayMode): TimeOutputTarget[] => {
    const result: TimeOutputTarget[] = [];
    const addTarget = (target: TimeOutputTarget) => {
      if (!result.some((item) => item.sceneName === target.sceneName && item.sourceName === target.sourceName)) {
        result.push(target);
      }
    };

    if (hasSceneRoute) {
      for (const target of sceneRoute.targets) {
        if (!target.sceneName.trim()) continue;
        addTarget({
          sceneName: target.sceneName,
          sourceName: dockObsClient.getSceneRouteSourceName("time", target.sceneName),
          mode: target.mode === "fullscreen" || target.mode === "lower-third" ? target.mode : mode,
        });
      }
    }

    if (!hasSceneRoute || sceneRoute.syncPresentation) {
      addTarget({
        sceneName: DOCK_PRESENTATION_SCENE_NAME,
        sourceName: getDockTimeSourceName(mode),
        mode,
      });
    }

    return result;
  }, [hasSceneRoute, sceneRoute.syncPresentation, sceneRoute.targets]);

  const buildPacket = useCallback((tool: DockTimeTool, timer = settings.timer, clock = settings.clock): DockTimeOverlayData => ({
    tool,
    mode: tool === "timer" ? timer.mode : clock.mode,
    placement: tool === "timer" ? timer.placement : clock.placement,
    label: tool === "timer" ? timer.label.trim() : clock.label.trim(),
    ...(tool === "timer" ? { timer } : { clock }),
    timestamp: Date.now(),
  }), [settings.clock, settings.timer]);

  const hideInactivePresentationTimeSource = useCallback(async (activeSourceName: string) => {
    const timeSources = [DOCK_TIME_SOURCE_NAME, DOCK_TIME_LOWER_THIRD_SOURCE_NAME];
    await Promise.all(timeSources
      .filter((sourceName) => sourceName !== activeSourceName)
      .map((sourceName) => dockObsClient.clearTimeOverlayFromScene(
        DOCK_PRESENTATION_SCENE_NAME,
        { sourceName },
      )));
  }, []);

  const publish = useCallback(async (
    tool: DockTimeTool,
    timerOverride?: TimerSettings,
    clockOverride?: ClockSettings,
  ) => {
    if (presentationLinkMode) {
      setError(t("time.obsRequired", "Time cards are available when the Dock is connected to OBS."));
      return;
    }

    const packet = buildPacket(tool, timerOverride ?? settings.timer, clockOverride ?? settings.clock);
    const targets = getOutputTargets(packet.mode);
    setSending(true);
    setError("");
    setNotice("");

    try {
      await ensureObsConnected();
      if (!dockObsClient.isConnected) throw new Error("OBS is not connected.");

      const presentationTarget = targets.find((target) => target.sceneName === DOCK_PRESENTATION_SCENE_NAME);
      if (presentationTarget) {
        await hideInactivePresentationTimeSource(presentationTarget.sourceName);
      }

      for (const target of targets) {
        const targetPacket = target.mode === packet.mode
          ? packet
          : { ...packet, mode: target.mode, timestamp: Date.now() };
        await dockObsClient.pushTimeOverlayToScene(targetPacket, target.sceneName, {
          sourceName: target.sourceName,
        });
      }

      setLiveTool(tool);
      setNotice(t("time.sent", "Time card is live in OBS."));
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : t("time.sendFailed", "Could not send the time card to OBS."));
    } finally {
      setSending(false);
    }
  }, [buildPacket, getOutputTargets, hideInactivePresentationTimeSource, presentationLinkMode, settings.clock, settings.timer, t]);

  const clearTime = useCallback(async () => {
    if (presentationLinkMode) return;
    setSending(true);
    setError("");
    setNotice("");

    try {
      await ensureObsConnected();
      if (!dockObsClient.isConnected) throw new Error("OBS is not connected.");

      const routeTargets = hasSceneRoute
        ? sceneRoute.targets.filter((target) => target.sceneName.trim())
        : [];
      await Promise.all([
        ...routeTargets.map((target) => dockObsClient.clearTimeOverlayFromScene(target.sceneName)),
        dockObsClient.clearTimeOverlayFromScene(DOCK_PRESENTATION_SCENE_NAME, { sourceName: DOCK_TIME_SOURCE_NAME }),
        dockObsClient.clearTimeOverlayFromScene(DOCK_PRESENTATION_SCENE_NAME, { sourceName: DOCK_TIME_LOWER_THIRD_SOURCE_NAME }),
      ]);

      setLiveTool(null);
      setNotice(t("time.cleared", "Time card cleared from OBS."));
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : t("time.clearFailed", "Could not clear the time card from OBS."));
    } finally {
      setSending(false);
    }
  }, [hasSceneRoute, presentationLinkMode, sceneRoute.targets, t]);

  const startTimer = useCallback(() => {
    const startedAt = Date.now();
    const nextTimer: TimerSettings = {
      ...settings.timer,
      elapsedSeconds: getTimerElapsedSeconds(settings.timer, startedAt),
      startedAt,
      running: true,
    };
    updateTimer(nextTimer);
    void publish("timer", nextTimer);
  }, [publish, settings.timer, updateTimer]);

  const pauseTimer = useCallback(() => {
    const nextTimer: TimerSettings = {
      ...settings.timer,
      elapsedSeconds: getTimerElapsedSeconds(settings.timer),
      startedAt: null,
      running: false,
    };
    updateTimer(nextTimer);
    void publish("timer", nextTimer);
  }, [publish, settings.timer, updateTimer]);

  const resetTimer = useCallback(() => {
    const nextTimer: TimerSettings = {
      ...settings.timer,
      elapsedSeconds: 0,
      startedAt: null,
      running: false,
    };
    updateTimer(nextTimer);
    if (liveTool === "timer") void publish("timer", nextTimer);
  }, [liveTool, publish, settings.timer, updateTimer]);

  const renderToolPanel = () => {
    if (activeTab === "countdown") {
      return <DockCountdownsTab presentationOutputTarget={presentationOutputTarget} />;
    }

    const isTimer = activeTab === "timer";
    const tool = isTimer ? "timer" : "clock";
    const currentMode = isTimer ? settings.timer.mode : settings.clock.mode;
    const currentPlacement = isTimer ? settings.timer.placement : settings.clock.placement;
    const currentLabel = isTimer ? settings.timer.label : settings.clock.label;
    const previewValue = isTimer ? formatTimeDuration(timerElapsed) : clockValue;

    return (
      <div className="dock-time-panel">
        <div className="dock-time-panel__intro">
          <div>
            <div className="dock-time-panel__title">
              <Icon name={isTimer ? "timer" : "schedule"} size={15} />
              <span>{isTimer ? "Timer" : "Clock"}</span>
              {liveTool === tool ? <span className="dock-time-live">Live</span> : null}
            </div>
            <p>{isTimer
              ? "Run an elapsed timer that keeps counting in OBS."
              : "Show a live local clock that updates inside OBS."}</p>
          </div>
          <span className="dock-time-panel__format">{displayModeLabel(currentMode)}</span>
        </div>

        <TimePreview
          tool={tool}
          mode={currentMode}
          placement={currentPlacement}
          label={currentLabel}
          value={previewValue}
          date={!isTimer ? clockDate : ""}
        />

        <div className="dock-time-controls">
          <label className="dock-time-field">
            <span className="dock-time-field__label">{currentMode === "lower-third" ? "Card label" : "Label"}</span>
            <input
              type="text"
              maxLength={80}
              value={currentLabel}
              onChange={(event) => isTimer
                ? updateTimer({ label: event.target.value })
                : updateClock({ label: event.target.value })}
              placeholder={isTimer ? "Elapsed time" : "Current time"}
            />
          </label>

          <DisplayModeControl
            value={currentMode}
            onChange={(mode) => isTimer ? updateTimer({ mode }) : updateClock({ mode })}
          />

          {currentMode === "lower-third" ? (
            <PlacementControl
              value={currentPlacement}
              onChange={(placement) => isTimer ? updateTimer({ placement }) : updateClock({ placement })}
            />
          ) : null}

          {isTimer ? (
            <div className="dock-time-timer-readout">
              <span>Elapsed</span>
              <strong>{formatTimeDuration(timerElapsed)}</strong>
            </div>
          ) : (
            <div className="dock-time-switches">
              <label>
                <input
                  type="checkbox"
                  checked={settings.clock.hour12}
                  onChange={(event) => updateClock({ hour12: event.target.checked })}
                />
                <span>12-hour time</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.clock.showSeconds}
                  onChange={(event) => updateClock({ showSeconds: event.target.checked })}
                />
                <span>Show seconds</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.clock.showDate}
                  onChange={(event) => updateClock({ showDate: event.target.checked })}
                />
                <span>Show date</span>
              </label>
            </div>
          )}
        </div>

        {presentationLinkMode ? (
          <div className="dock-time-message dock-time-message--info">
            Time cards are available when this Dock is connected directly to OBS.
          </div>
        ) : null}
        {error ? <div className="dock-time-message dock-time-message--error">{error}</div> : null}
        {notice ? <div className="dock-time-message dock-time-message--success">{notice}</div> : null}

        <div className="dock-time-actions">
          {isTimer ? (
            <>
              <button
                type="button"
                className="dock-btn dock-btn--primary dock-btn--sm"
                onClick={settings.timer.running ? pauseTimer : startTimer}
                disabled={sending || presentationLinkMode}
              >
                <Icon name={settings.timer.running ? "pause" : "play_arrow"} size={13} />
                <span>{settings.timer.running ? "Pause" : "Start & show"}</span>
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--ghost dock-btn--sm"
                onClick={resetTimer}
                disabled={sending}
              >
                <Icon name="restart_alt" size={13} />
                <span>Reset</span>
              </button>
              <button
                type="button"
                className="dock-btn dock-btn--ghost dock-btn--sm"
                onClick={() => void publish("timer")}
                disabled={sending || presentationLinkMode}
              >
                <Icon name="visibility" size={13} />
                <span>{liveTool === "timer" ? "Update OBS" : "Show in OBS"}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className="dock-btn dock-btn--primary dock-btn--sm"
              onClick={() => void publish("clock")}
              disabled={sending || presentationLinkMode}
            >
              <Icon name="visibility" size={13} />
              <span>{liveTool === "clock" ? "Update OBS" : "Show in OBS"}</span>
            </button>
          )}
          <button
            type="button"
            className="dock-btn dock-btn--ghost dock-btn--sm"
            onClick={() => void clearTime()}
            disabled={sending || presentationLinkMode}
          >
            <Icon name="visibility_off" size={13} />
            <span>Clear</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="dock-time-shell">
      <div className="dock-time-shell__header">
        <div>
          <div className="dock-time-shell__title">
            <Icon name="schedule" size={15} />
            <span>{t("ministry.time", "Time")}</span>
          </div>
          <p>Countdowns, timers, and clocks for your screen.</p>
        </div>
        {activeTab !== "countdown" ? (
          <DockSceneRoutingControl
            module="time"
            route={sceneRoute}
            onRouteChange={updateSceneRoute}
            disabled={presentationLinkMode}
            title={t("sceneRouting.timeOutput", "Time output")}
          />
        ) : null}
      </div>

      <div className="dock-time-tabs" role="tablist" aria-label="Time tools">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "countdown"}
          className={activeTab === "countdown" ? "dock-time-tabs__button dock-time-tabs__button--active" : "dock-time-tabs__button"}
          onClick={() => setActiveTab("countdown")}
        >
          <Icon name="hourglass" size={12} />
          <span>Countdown</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "timer"}
          className={activeTab === "timer" ? "dock-time-tabs__button dock-time-tabs__button--active" : "dock-time-tabs__button"}
          onClick={() => setActiveTab("timer")}
        >
          <Icon name="timer" size={12} />
          <span>Timer</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "clock"}
          className={activeTab === "clock" ? "dock-time-tabs__button dock-time-tabs__button--active" : "dock-time-tabs__button"}
          onClick={() => setActiveTab("clock")}
        >
          <Icon name="schedule" size={12} />
          <span>Clock</span>
        </button>
      </div>

      <div className="dock-time-shell__body">
        {renderToolPanel()}
      </div>
    </div>
  );
}
