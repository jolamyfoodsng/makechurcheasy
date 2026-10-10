/**
 * React wrapper around ThemeRenderer for in-app previews (Create Theme preview,
 * theme cards). Uses the same renderer as the OBS overlays, so what you see
 * here is what goes to OBS.
 */
import { useEffect, useRef, type CSSProperties } from "react";
import { ThemeRenderer } from "./renderer";
import type { ThemeContent, ThemeLayout } from "./types";

export const SAMPLE_THEME_CONTENT: ThemeContent = {
  text: "[16] For God so loved the world that He gave His only begotten Son, that whoever believes in Him should not perish but have everlasting life.",
  reference: "John 3:16 (NKJV)",
};

interface Props {
  layout: ThemeLayout;
  content?: ThemeContent;
  /** Play the in-animation (and loops). Off = still frame, for cards. */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

export default function ThemeLayoutPreview({ layout, content = SAMPLE_THEME_CONTENT, animate = false, className, style }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<ThemeRenderer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const renderer = new ThemeRenderer(host, { static: !animate });
    rendererRef.current = renderer;
    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [animate]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    renderer.setLayout(layout);
    if (animate) {
      void renderer.hide().then(() => renderer.show(content));
    } else {
      renderer.renderStatic(content);
    }
  }, [layout, content, animate]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none", ...style }}
    />
  );
}
