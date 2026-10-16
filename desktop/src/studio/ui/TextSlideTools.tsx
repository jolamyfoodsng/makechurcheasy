/**
 * TextSlideTools.tsx — the "Lines per slide" row and the Translate button for songs and notes.
 *
 * The same two tools the Dock has. Lines: Original keeps the slides as written; 1–6 re-splits any
 * slide that is longer. Translate: the Dock's own translation panel (pick a language, show both or
 * only the translation, choose which comes first).
 */
import DockTranslationControls, { type DockTranslationValue } from "../../dock/components/DockTranslationControls";
import { MAX_STUDIO_LINES } from "../studioTextLayout";
import "./TextSlideTools.css";

interface Props {
  /** 0 = Original. */
  lines: number;
  onLines: (lines: number) => void;
  /** The slides as they will be translated (after lines are applied). */
  sections: { id: string; text: string }[];
  translation: DockTranslationValue | null;
  onTranslation: (value: DockTranslationValue | null) => void;
}

export default function TextSlideTools({ lines, onLines, sections, translation, onTranslation }: Props) {
  const counts = Array.from({ length: MAX_STUDIO_LINES }, (_, i) => i + 1);
  return (
    // "dock-root" makes the translation panel keep its pop-up menus inside this box (where the colours are defined).
    <div className="st-texttools dock-root" role="group" aria-label="Slide layout">
      <label className="st-minisel" title="How many lines go on each slide. Original keeps the slides as written.">
        <span className="st-minisel__long">Lines per slide</span><span className="st-minisel__short">Lines</span>
        <select value={lines} onChange={(e) => onLines(Number(e.target.value))} aria-label="Lines per slide">
          <option value={0}>Original</option>
          {counts.map((n) => <option key={n} value={n}>{n} line{n === 1 ? "" : "s"}</option>)}
        </select>
      </label>
      <DockTranslationControls compact compactLabel sections={sections} value={translation} onChange={onTranslation} />
    </div>
  );
}
