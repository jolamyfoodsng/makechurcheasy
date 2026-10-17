/**
 * QuickText.tsx — quick text buttons for what is on the screen, like the Dock's quick actions:
 * smaller / bigger, bold, italic, and back to the theme's own look. They work on top of any theme.
 */
import { Bold, Italic, Minus, Plus, RotateCcw } from "../../components/icons/NativeIcons";

export const TEXT_SCALE_MIN = 70;
export const TEXT_SCALE_MAX = 160;

interface Props {
  textScale: number;
  bold: boolean;
  italic: boolean;
  onTextScale: (percent: number) => void;
  onBold: (on: boolean) => void;
  onItalic: (on: boolean) => void;
  /** Also show the "back to the theme's look" button (always when something was changed). */
  className?: string;
}

export default function QuickText({ textScale, bold, italic, onTextScale, onBold, onItalic, className }: Props) {
  const changed = textScale !== 100 || bold || italic;
  return (
    <div className={`st-quicktext${className ? ` ${className}` : ""}`} role="group" aria-label="Quick text">
      <button type="button" onClick={() => onTextScale(Math.max(TEXT_SCALE_MIN, textScale - 5))} disabled={textScale <= TEXT_SCALE_MIN} aria-label="Smaller text" title="Smaller text (Ctrl/Cmd -)"><Minus size={13} /></button>
      <span className="st-quicktext__pct" title="Text size compared to the theme">{textScale}%</span>
      <button type="button" onClick={() => onTextScale(Math.min(TEXT_SCALE_MAX, textScale + 5))} disabled={textScale >= TEXT_SCALE_MAX} aria-label="Bigger text" title="Bigger text (Ctrl/Cmd +)"><Plus size={13} /></button>
      <button type="button" className={bold ? "is-on" : ""} onClick={() => onBold(!bold)} aria-pressed={bold} aria-label="Bold" title="Bolder text"><Bold size={13} /></button>
      <button type="button" className={italic ? "is-on" : ""} onClick={() => onItalic(!italic)} aria-pressed={italic} aria-label="Italic" title="Italic text"><Italic size={13} /></button>
      <button type="button" onClick={() => { onTextScale(100); onBold(false); onItalic(false); }} disabled={!changed} aria-label="Back to the theme's look" title="Back to the theme's own size and style"><RotateCcw size={12} /></button>
    </div>
  );
}
