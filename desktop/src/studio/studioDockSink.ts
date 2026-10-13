/**
 * studioDockSink.ts — lets the Presentation Studio follow the Dock.
 *
 * The Studio shows the real Dock (the same component as /dock.html in OBS) on
 * the left. Whatever the Dock puts on screen is reported here, and the Studio
 * turns it into Program (or Preview). Nothing is reported while the Studio
 * isn't open, so the Dock in OBS and the Presentation link are unaffected.
 */
import type { DockStagedItem } from "../dock/dockTypes";
import type { MediaItem } from "../library/libraryTypes";

export type StudioDockEvent =
  | { kind: "stage"; item: DockStagedItem | null }
  | { kind: "media"; media: MediaItem; fit?: string }
  | { kind: "clear" };

type Sink = (event: StudioDockEvent) => void;

let sink: Sink | null = null;

/** The Studio registers itself while it is open. Returns a function that unregisters it. */
export function setStudioDockSink(next: Sink): () => void {
  sink = next;
  return () => {
    if (sink === next) sink = null;
  };
}

export function isStudioDockActive(): boolean {
  return sink !== null;
}

export function emitStudioDockEvent(event: StudioDockEvent): void {
  if (!sink) return;
  try {
    sink(event);
  } catch (error) {
    console.warn("[Studio] Dock event failed:", error);
  }
}
