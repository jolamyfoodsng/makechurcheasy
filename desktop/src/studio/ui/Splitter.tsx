/**
 * Splitter.tsx — a thin drag handle on the edge of a panel. Drag to resize; double-click resets.
 * It reports the distance moved since the drag started, so the owner keeps the size.
 */
import { useRef, type PointerEvent as ReactPointerEvent } from "react";

interface SplitterProps {
  /** "x" = drag left/right (a vertical bar), "y" = drag up/down (a horizontal bar). */
  axis: "x" | "y";
  /** Where the bar sits on its panel. */
  edge: "left" | "right" | "top";
  onStart: () => void;
  onDrag: (delta: number) => void;
  onEnd?: () => void;
  onReset?: () => void;
  label: string;
}

export default function Splitter({ axis, edge, onStart, onDrag, onEnd, onReset, label }: SplitterProps) {
  const origin = useRef<number | null>(null);

  const down = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    origin.current = axis === "x" ? event.clientX : event.clientY;
    event.currentTarget.setPointerCapture(event.pointerId);
    document.documentElement.classList.add("st-resizing");
    onStart();
  };
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (origin.current === null) return;
    onDrag((axis === "x" ? event.clientX : event.clientY) - origin.current);
  };
  const up = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (origin.current === null) return;
    origin.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* already released */
    }
    document.documentElement.classList.remove("st-resizing");
    onEnd?.();
  };

  return (
    <div
      className={`st-split st-split--${axis} st-split--${edge}`}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      title={`${label} (drag; double-click to reset)`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onDoubleClick={onReset}
    />
  );
}
