import type { PresentationTickerDirection, PresentationTickerPosition, PresentationTickerRecord } from "../types";

interface TickerWorkspaceProps {
  tickers: PresentationTickerRecord[];
  selectedTickerId: string | null;
  onSelectTicker: (ticker: PresentationTickerRecord) => void;
  name: string;
  onNameChange: (value: string) => void;
  text: string;
  onTextChange: (value: string) => void;
  position: PresentationTickerPosition;
  onPositionChange: (value: PresentationTickerPosition) => void;
  direction: PresentationTickerDirection;
  onDirectionChange: (value: PresentationTickerDirection) => void;
  speed: number;
  onSpeedChange: (value: number) => void;
  textColor: string;
  onTextColorChange: (value: string) => void;
  backgroundColor: string;
  onBackgroundColorChange: (value: string) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onHide: () => void;
  onSave: () => void;
}

export function TickerWorkspace({
  tickers,
  selectedTickerId,
  onSelectTicker,
  name,
  onNameChange,
  text,
  onTextChange,
  position,
  onPositionChange,
  direction,
  onDirectionChange,
  speed,
  onSpeedChange,
  textColor,
  onTextColorChange,
  backgroundColor,
  onBackgroundColorChange,
  fontSize,
  onFontSizeChange,
  paused,
  onPause,
  onResume,
  onHide,
  onSave,
}: TickerWorkspaceProps) {
  return (
    <div className="presentation-workspace">
      <div className="presentation-workspace__split">
        <div className="presentation-library-panel">
          <div className="presentation-panel-title">Saved tickers</div>
          <div className="presentation-library-list">
            {tickers.map((ticker) => (
              <button
                key={ticker.id}
                type="button"
                className={`presentation-library-item${selectedTickerId === ticker.id ? " is-active" : ""}`}
                onClick={() => onSelectTicker(ticker)}
              >
                <strong>{ticker.name}</strong>
                <span>{ticker.text}</span>
              </button>
            ))}
            {tickers.length === 0 ? (
              <div className="presentation-library-empty">No saved tickers.</div>
            ) : null}
          </div>
        </div>

        <div className="presentation-settings-panel">
          <div className="presentation-settings-grid presentation-settings-grid--single">
            <label className="presentation-field">
              <span>Name</span>
              <input className="presentation-input" value={name} onChange={(event) => onNameChange(event.target.value)} />
            </label>
            <label className="presentation-field">
              <span>Ticker text</span>
              <textarea className="presentation-textarea" value={text} onChange={(event) => onTextChange(event.target.value)} />
            </label>
            <div className="presentation-settings-grid">
              <label className="presentation-field">
                <span>Position</span>
                <select value={position} className="presentation-input" onChange={(event) => onPositionChange(event.target.value as PresentationTickerPosition)}>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
              </label>
              <label className="presentation-field">
                <span>Direction</span>
                <select value={direction} className="presentation-input" onChange={(event) => onDirectionChange(event.target.value as PresentationTickerDirection)}>
                  <option value="rtl">Right to left</option>
                  <option value="ltr">Left to right</option>
                  <option value="static">Static</option>
                </select>
              </label>
              <label className="presentation-field">
                <span>Speed</span>
                <input type="range" min={0.25} max={4} step={0.25} value={speed} onChange={(event) => onSpeedChange(Number(event.target.value))} />
              </label>
              <label className="presentation-field">
                <span>Font size</span>
                <input type="range" min={18} max={72} value={fontSize} onChange={(event) => onFontSizeChange(Number(event.target.value))} />
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
              <button type="button" className="presentation-button" onClick={onSave}>Save</button>
              <button type="button" className="presentation-button" onClick={paused ? onResume : onPause}>
                {paused ? "Resume" : "Pause"}
              </button>
              <button type="button" className="presentation-button" onClick={onHide}>Hide</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
