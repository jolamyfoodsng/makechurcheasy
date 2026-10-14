/**
 * SlideCards.tsx — one card per slide (song section, note slide or picture/video).
 * Click = Preview, double-click = Live.
 */
import { Film } from "lucide-react";
import { toneStyle, type DeckSlide } from "../studioSlides";

interface SlideCardsProps {
  slides: DeckSlide[];
  previewIdx: number;
  liveIdx: number;
  /** Overlay-server address, to show media thumbnails. */
  base: string;
  empty: string;
  onSelect: (index: number) => void;
  onLive: (index: number) => void;
}

export default function SlideCards({ slides, previewIdx, liveIdx, base, empty, onSelect, onLive }: SlideCardsProps) {
  if (slides.length === 0) return <div className="sx-empty sx-empty--big">{empty}</div>;
  return (
    <div className="sx-cards">
      {slides.map((slide, index) => {
        const isLive = index === liveIdx;
        const isPreview = index === previewIdx && !isLive;
        const tone = toneStyle(slide.tone);
        const tag = slide.module === "media" ? slide.label.toUpperCase() : slide.module === "notes" ? slide.label.toUpperCase() : (slide.label || tone.name).toUpperCase();
        const tagStyle = isLive || isPreview ? undefined : { background: slide.module === "worship" ? tone.bg : "var(--surface-hover)", color: slide.module === "worship" ? tone.fg : "var(--text-secondary)" };
        return (
          <div
            key={slide.key}
            role="button"
            tabIndex={0}
            className={`sx-card${isLive ? " is-live" : ""}${isPreview ? " is-preview" : ""}`}
            onClick={() => onSelect(index)}
            onDoubleClick={() => onLive(index)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSelect(index);
            }}
          >
            <div className="sx-card__tag" style={tagStyle}>
              <span>{tag}</span>
              <span className="sx-card__state">{isLive ? "LIVE" : isPreview ? "NEXT" : String(index + 1)}</span>
            </div>
            {slide.module === "media" ? (
              <div className="sx-card__media">
                {slide.thumb ? (
                  <img src={/^(data:|https?:)/i.test(slide.thumb) ? slide.thumb : `${base}${slide.thumb}`} alt="" />
                ) : (
                  <Film size={26} />
                )}
                <span className="sx-card__name">{slide.itemTitle}</span>
              </div>
            ) : (
              <div className="sx-card__body">{slide.text}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
