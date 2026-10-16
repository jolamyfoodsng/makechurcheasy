/**
 * useNarrow.ts — true while the element is narrower than `limit` px. (A CSS container query would do
 * the same, but it makes pop-ups drawn inside the element position themselves wrongly.)
 */
import { useEffect, useState, type RefObject } from "react";

export function useNarrow(ref: RefObject<HTMLElement | null>, limit: number): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const check = () => setNarrow(el.clientWidth > 0 && el.clientWidth < limit);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, limit]);
  return narrow;
}
