import type { PresentationTextAlign, PresentationTextSlideRecord } from "../types";

interface ThemeOption {
  id: string;
  name: string;
}

interface TextWorkspaceProps {
  slides: PresentationTextSlideRecord[];
  selectedSlideId: string | null;
  onSelectSlide: (slide: PresentationTextSlideRecord) => void;
  draftTitle: string;
  onDraftTitleChange: (value: string) => void;
  draftSubtitle: string;
  onDraftSubtitleChange: (value: string) => void;
  draftBody: string;
  onDraftBodyChange: (value: string) => void;
  themeOptions: ThemeOption[];
  selectedThemeId: string;
  onThemeChange: (value: string) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  textAlign: PresentationTextAlign;
  onTextAlignChange: (value: PresentationTextAlign) => void;
  textColor: string;
  onTextColorChange: (value: string) => void;
  backgroundColor: string;
  onBackgroundColorChange: (value: string) => void;
  onSave: () => void;
}

export function TextWorkspace({
  slides,
  selectedSlideId,
  onSelectSlide,
  draftTitle,
  onDraftTitleChange,
  draftSubtitle,
  onDraftSubtitleChange,
  draftBody,
  onDraftBodyChange,
  themeOptions,
  selectedThemeId,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  textAlign,
  onTextAlignChange,
  textColor,
  onTextColorChange,
  backgroundColor,
  onBackgroundColorChange,
  onSave,
}: TextWorkspaceProps) {
  return (
    <div className="presentation-workspace">
      <div className="presentation-workspace__split">
        <div className="presentation-library-panel">
          <div className="presentation-panel-title">Saved slides</div>
          <div className="presentation-library-list">
            {slides.map((slide) => (
              <button
                key={slide.id}
                type="button"
                className={`presentation-library-item${selectedSlideId === slide.id ? " is-active" : ""}`}
                onClick={() => onSelectSlide(slide)}
              >
                <strong>{slide.title}</strong>
                <span>{slide.body}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="presentation-settings-panel">
          <div className="presentation-settings-grid presentation-settings-grid--single">
            <label className="presentation-field">
              <span>Title</span>
              <input className="presentation-input" value={draftTitle} onChange={(event) => onDraftTitleChange(event.target.value)} />
            </label>
            <label className="presentation-field">
              <span>Subtitle</span>
              <input className="presentation-input" value={draftSubtitle} onChange={(event) => onDraftSubtitleChange(event.target.value)} />
            </label>
            <label className="presentation-field">
              <span>Main text</span>
              <textarea className="presentation-textarea" value={draftBody} onChange={(event) => onDraftBodyChange(event.target.value)} />
            </label>
            <div className="presentation-settings-grid">
              <label className="presentation-field">
                <span>Theme</span>
                <select value={selectedThemeId} className="presentation-input" onChange={(event) => onThemeChange(event.target.value)}>
                  {themeOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="presentation-field">
                <span>Font size</span>
                <input type="range" min={24} max={120} value={fontSize} onChange={(event) => onFontSizeChange(Number(event.target.value))} />
              </label>
              <label className="presentation-field">
                <span>Alignment</span>
                <select value={textAlign} className="presentation-input" onChange={(event) => onTextAlignChange(event.target.value as PresentationTextAlign)}>
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
