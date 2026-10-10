import { useEffect, useRef, useState } from "react";

/**
 * A preview iframe that only exists while it is on (or near) the screen.
 *
 * The Broadcast Graphics library shows dozens of animated previews. Starting
 * them all at once froze the page the first time it opened. This frame:
 *  - builds its preview page only when it first scrolls near the screen,
 *  - starts frames one at a time with a short gap, so the page stays responsive,
 *  - removes the iframe again when it scrolls far away, to keep memory low.
 */

interface LazyPreviewFrameProps {
  /** Builds the preview page. Called when the frame is first needed. */
  buildHtml: () => string;
  /** Build the page again when this changes (for example a saved graphic was edited). */
  cacheKey: string;
  className?: string;
  sandbox?: string;
  title: string;
}

/** Gap between two frames starting up. */
const MOUNT_GAP_MS = 90;
/** How far outside the screen a frame is already prepared. */
const PRELOAD_MARGIN = "500px 0px";

let nextMountAt = 0;

/** Milliseconds from now at which the next frame may start. */
function reserveMountSlot(): number {
  const now = Date.now();
  nextMountAt = Math.max(nextMountAt, now) + MOUNT_GAP_MS;
  return nextMountAt - now - MOUNT_GAP_MS;
}

export default function LazyPreviewFrame({
  buildHtml,
  cacheKey,
  className,
  sandbox,
  title,
}: LazyPreviewFrameProps) {
  const holderRef = useRef<HTMLDivElement | null>(null);
  const cacheRef = useRef<{ key: string; html: string } | null>(null);
  const [near, setNear] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const holder = holderRef.current;
    if (!holder) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setNear(entry.isIntersecting);
      },
      { rootMargin: PRELOAD_MARGIN },
    );
    observer.observe(holder);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!near) {
      setReady(false);
      return;
    }
    const timer = window.setTimeout(() => setReady(true), reserveMountSlot());
    return () => window.clearTimeout(timer);
  }, [near]);

  let html = "";
  if (ready) {
    if (!cacheRef.current || cacheRef.current.key !== cacheKey) {
      cacheRef.current = { key: cacheKey, html: buildHtml() };
    }
    html = cacheRef.current.html;
  }

  return (
    <div ref={holderRef} style={{ width: "100%", aspectRatio: "16 / 9" }}>
      {ready && <iframe className={className} srcDoc={html} sandbox={sandbox} title={title} />}
    </div>
  );
}
