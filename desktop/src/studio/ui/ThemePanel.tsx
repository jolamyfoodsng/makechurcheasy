/**
 * ThemePanel.tsx — the themes, right under the Layers card.
 *
 *  A line of small cards: one click picks a theme. Preview changes at once; the screen follows
 *  when you press Send to Screen (or at once in Straight to screen mode).
 */
import { useMemo, useState } from "react";
import { Check, Palette, Pencil } from "../../components/icons/NativeIcons";
import type { BibleTheme } from "../../bible/types";
import type { StudioMode } from "../studioEngine";
import ThemeLayoutPreview, { SAMPLE_THEME_CONTENT } from "../../themes/layout/ThemeLayoutPreview";
import type { ThemeContent } from "../../themes/layout/types";
import { layoutOf, themeSwatch } from "./ThemeModal";

interface ThemePanelProps {
  themes: BibleTheme[];
  /** The theme in use now. */
  currentId: string;
  mode: StudioMode;
  /** "Bible", "Worship" or "Notes": what the theme is for. */
  forLabel: string;
  /** What the previews show (the verse or slide that is open); a sample verse when empty. */
  sample?: { text: string; reference: string } | null;
  onApply: (id: string) => Promise<void> | void;
  /** Edit a theme in a window inside the Studio (null = make a new one). */
  onEdit: (theme: BibleTheme | null) => void;
}

function ThemePic({ theme, mode, content, plain }: { theme: BibleTheme; mode: StudioMode; content: ThemeContent; plain: string }) {
  const look = themeSwatch(theme, mode);
  const layout = layoutOf(theme, mode);
  return (
    <span className="st-tp__pic" style={layout ? undefined : look.box}>
      {layout ? (
        <span className="st-themecard__live"><ThemeLayoutPreview layout={layout} content={content} /></span>
      ) : (
        <span className="st-theme__sample" style={look.text}>{plain}</span>
      )}
    </span>
  );
}

export default function ThemePanel({ themes, currentId, mode, forLabel, sample, onApply, onEdit }: ThemePanelProps) {
  const [busy, setBusy] = useState(false);
  const sampleText = sample?.text ?? "";
  const sampleRef = sample?.reference ?? "";
  const content = useMemo<ThemeContent>(
    () => (sampleText.trim() ? { text: sampleText, reference: sampleRef } : SAMPLE_THEME_CONTENT),
    [sampleText, sampleRef],
  );
  const plain = content.text.replace(/\[\d+\]\s*/g, "").replace(/\s+/g, " ").trim();
  const lookName = mode === "lower-third" ? "Lower Third" : "Full Screen";

  // One click picks it. Preview shows it at once; the screen follows when you press Send to Screen.
  const pick = async (id: string) => {
    if (busy || id === currentId) return;
    setBusy(true);
    try {
      await onApply(id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="st-tp" aria-label="Themes">
      <div className="st-tp__head">
        <strong>Theme</strong>
        <span className="st-tp__for">{forLabel} · {lookName}</span>
        <button type="button" className="st-chip" onClick={() => onEdit(themes.find((t) => t.id === currentId) ?? null)} disabled={!themes.some((t) => t.id === currentId)} title="Edit the theme in use"><Pencil size={12} /> <span className="st-chip__lbl">Edit Theme</span></button>
      </div>

      {themes.length === 0 ? (
        <div className="st-empty">No themes for this look yet. Press Custom to make one.</div>
      ) : (
        <div className="st-tp__strip" role="listbox" aria-label="Pick a theme">
          {themes.map((t) => {
            const isCurrent = t.id === currentId;
            return (
              <div key={t.id} className="st-tp__item">
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  className={`st-tp__card${isCurrent ? " is-picked is-current" : ""}`}
                  onClick={() => void pick(t.id)}
                  title={t.name}
                >
                  <ThemePic theme={t} mode={mode} content={content} plain={plain} />
                  <span className="st-tp__cardname">{t.name}</span>
                  {isCurrent && <span className="st-tp__badge"><Check size={10} /></span>}
                </button>
                <button type="button" className="st-tp__edit" onClick={() => onEdit(t)} title={`Edit ${t.name}`} aria-label={`Edit ${t.name}`}><Pencil size={12} /></button>
              </div>
            );
          })}
          <div className="st-tp__item">
            <button type="button" className="st-tp__card st-tp__card--add" onClick={() => onEdit(null)} title="Make a new theme">
              <span className="st-tp__pic"><Palette size={18} /></span>
              <span className="st-tp__cardname">Custom</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
