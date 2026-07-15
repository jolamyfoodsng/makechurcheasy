import type { CountdownConfig } from "../../countdowns/types";

interface CountdownWorkspaceProps {
  countdowns: CountdownConfig[];
  selectedCountdownId: string | null;
  onSelectCountdown: (countdown: CountdownConfig) => void;
  title: string;
  onTitleChange: (value: string) => void;
  mode: "duration" | "time";
  onModeChange: (value: "duration" | "time") => void;
  durationHours: number;
  onDurationHoursChange: (value: number) => void;
  durationMinutes: number;
  onDurationMinutesChange: (value: number) => void;
  durationSeconds: number;
  onDurationSecondsChange: (value: number) => void;
  targetTime: string;
  onTargetTimeChange: (value: string) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  textColor: string;
  onTextColorChange: (value: string) => void;
  backgroundColor: string;
  onBackgroundColorChange: (value: string) => void;
  showTitle: boolean;
  onShowTitleChange: (value: boolean) => void;
  showSeconds: boolean;
  onShowSecondsChange: (value: boolean) => void;
  completionMessage: string;
  onCompletionMessageChange: (value: string) => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onAddMinute: () => void;
  onSubtractMinute: () => void;
}

export function CountdownWorkspace({
  countdowns,
  selectedCountdownId,
  onSelectCountdown,
  title,
  onTitleChange,
  mode,
  onModeChange,
  durationHours,
  onDurationHoursChange,
  durationMinutes,
  onDurationMinutesChange,
  durationSeconds,
  onDurationSecondsChange,
  targetTime,
  onTargetTimeChange,
  fontSize,
  onFontSizeChange,
  textColor,
  onTextColorChange,
  backgroundColor,
  onBackgroundColorChange,
  showTitle,
  onShowTitleChange,
  showSeconds,
  onShowSecondsChange,
  completionMessage,
  onCompletionMessageChange,
  onStart,
  onPause,
  onResume,
  onReset,
  onAddMinute,
  onSubtractMinute,
}: CountdownWorkspaceProps) {
  return (
    <div className="presentation-workspace">
      <div className="presentation-workspace__split">
        <div className="presentation-library-panel">
          <div className="presentation-panel-title">Saved countdowns</div>
          <div className="presentation-library-list">
            {countdowns.map((countdown) => (
              <button
                key={countdown.id}
                type="button"
                className={`presentation-library-item${selectedCountdownId === countdown.id ? " is-active" : ""}`}
                onClick={() => onSelectCountdown(countdown)}
              >
                <strong>{countdown.title}</strong>
                <span>{countdown.timer.mode === "fixed-duration" ? "Duration" : "End time"}</span>
              </button>
            ))}
            {countdowns.length === 0 ? (
              <div className="presentation-library-empty">No saved countdowns found.</div>
            ) : null}
          </div>
        </div>

        <div className="presentation-settings-panel">
          <div className="presentation-settings-grid presentation-settings-grid--single">
            <label className="presentation-field">
              <span>Countdown title</span>
              <input className="presentation-input" value={title} onChange={(event) => onTitleChange(event.target.value)} />
            </label>
            <label className="presentation-field">
              <span>Mode</span>
              <select value={mode} className="presentation-input" onChange={(event) => onModeChange(event.target.value as "duration" | "time")}>
                <option value="duration">Countdown from duration</option>
                <option value="time">Countdown to a time</option>
              </select>
            </label>

            {mode === "duration" ? (
              <div className="presentation-settings-grid">
                <label className="presentation-field">
                  <span>Hours</span>
                  <input type="number" className="presentation-input" min={0} value={durationHours} onChange={(event) => onDurationHoursChange(Number(event.target.value) || 0)} />
                </label>
                <label className="presentation-field">
                  <span>Minutes</span>
                  <input type="number" className="presentation-input" min={0} max={59} value={durationMinutes} onChange={(event) => onDurationMinutesChange(Number(event.target.value) || 0)} />
                </label>
                <label className="presentation-field">
                  <span>Seconds</span>
                  <input type="number" className="presentation-input" min={0} max={59} value={durationSeconds} onChange={(event) => onDurationSecondsChange(Number(event.target.value) || 0)} />
                </label>
              </div>
            ) : (
              <label className="presentation-field">
                <span>Target time</span>
                <input type="datetime-local" className="presentation-input" value={targetTime} onChange={(event) => onTargetTimeChange(event.target.value)} />
              </label>
            )}

            <div className="presentation-settings-grid">
              <label className="presentation-field">
                <span>Font size</span>
                <input type="range" min={28} max={180} value={fontSize} onChange={(event) => onFontSizeChange(Number(event.target.value))} />
              </label>
              <label className="presentation-field">
                <span>Text colour</span>
                <input type="color" value={textColor} onChange={(event) => onTextColorChange(event.target.value)} />
              </label>
              <label className="presentation-field">
                <span>Background</span>
                <input type="color" value={backgroundColor} onChange={(event) => onBackgroundColorChange(event.target.value)} />
              </label>
            </div>

            <div className="presentation-inline-actions">
              <label className="presentation-toggle">
                <input type="checkbox" checked={showTitle} onChange={(event) => onShowTitleChange(event.target.checked)} />
                <span>Show title</span>
              </label>
              <label className="presentation-toggle">
                <input type="checkbox" checked={showSeconds} onChange={(event) => onShowSecondsChange(event.target.checked)} />
                <span>Show seconds</span>
              </label>
            </div>

            <label className="presentation-field">
              <span>Completion message</span>
              <input className="presentation-input" value={completionMessage} onChange={(event) => onCompletionMessageChange(event.target.value)} />
            </label>

            <div className="presentation-inline-actions">
              <button type="button" className="presentation-button" onClick={onStart}>Start</button>
              <button type="button" className="presentation-button" onClick={onPause}>Pause</button>
              <button type="button" className="presentation-button" onClick={onResume}>Resume</button>
              <button type="button" className="presentation-button" onClick={onReset}>Reset</button>
              <button type="button" className="presentation-button" onClick={onAddMinute}>Add one minute</button>
              <button type="button" className="presentation-button" onClick={onSubtractMinute}>Subtract one minute</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
